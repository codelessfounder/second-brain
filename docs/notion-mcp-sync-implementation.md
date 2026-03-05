# Option 1 implementation: Feed Supabase from Notion MCP

This doc describes how to implement **Option 1**: keep Supabase as the RAG store for the Second Brain chat app, but populate it using data obtained via **Notion MCP** (and optionally a small sync script).

---

## 1. High-level flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP A: Discover & export (Notion MCP in Cursor, or Notion API later)   │
│  • List teamspaces (notion-get-teams)                                     │
│  • For each in-scope teamspace: notion-search / notion-fetch              │
│  • For each page/DB: fetch full content (notion-fetch)                     │
│  • Output: JSON export file (list of { page_id, page_url, title, content })│
└─────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP B: Chunk → Embed → Upsert (Node script or Edge Function)           │
│  • Read export JSON                                                      │
│  • Chunk long content (by paragraph or fixed size)                       │
│  • Call OpenAI text-embedding-3-small (1536 dims)                        │
│  • Supabase: upsert_notion_page + upsert_notion_content (per chunk)      │
└─────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  APP (unchanged)                                                         │
│  • User asks question → Edge Function "chat"                             │
│  • Embed query → match_notion_content → LLM → response + source pills    │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Step A** can be run by you in Cursor (using Notion MCP to fetch pages and produce the JSON), or later by a scheduled job that uses the Notion API with the same export shape.
- **Step B** is a deterministic script: same JSON in → same Supabase state. You run it after every export (manual or cron).

---

## 2. Step A: Using Notion MCP to produce the export

### 2.1 Decide scope

- Use **notion-get-teams** to list teamspaces.
- Choose which to include (e.g. "Me", "Harry's Odyssey"; exclude archived).
- Optionally restrict to certain page types (e.g. only top-level pages, or include children).

### 2.2 Collect page IDs

Two patterns:

**Pattern 1 – Search per teamspace**

- For each in-scope teamspace, call **notion-search** with `query_type: "internal"`, `teamspace_id: "<id>"`, and a broad query (e.g. `"notes"` or `"content"`).
- Collect unique `id` and `url` from results. For databases, the search returns DB entries; you may also want the DB view URL from **notion-fetch** on the database.

**Pattern 2 – Fetch known hubs**

- If you have a known "hub" page (e.g. "Databases", "Book Tracker"), **notion-fetch** it and parse `<database url="...">` / `<page url="...">` from the response to get child IDs, then recurse or fetch those.

### 2.3 Fetch full content

- For each collected page/database ID (or URL), call **notion-fetch** with `id: "<url-or-id>"`.
- From the response:
  - **Page:** extract title (e.g. from `<properties>` or first heading), body text from `<content>` (strip Notion XML/Markdown to plain text or keep Markdown for richer context).
  - **Database:** you get schema and data-source info; for "rows" you may need to fetch the database and then fetch each linked page, or use the database fetch output as one blob per DB (depending on how you want to search DBs).
- Build one object per *indexable unit* (usually one per page, or one per DB row if you want row-level retrieval):

```json
{
  "page_id": "uuid-with-or-without-dashes",
  "page_url": "https://www.notion.so/...",
  "title": "Page or DB title",
  "content": "Plain or Markdown text to embed",
  "teamspace_id": "optional",
  "object_type": "page | database"
}
```

### 2.4 Write the export file

- Save an array of those objects to a JSON file, e.g. `scripts/sync-notion-to-supabase/notion-export.json`.
- The sync script (Step B) will read this file.

**Important:** Notion MCP runs inside Cursor. So Step A is either:

- **Manual in Cursor:** You (or an agent) run MCP tools, assemble the JSON, and save the file; then you run the Node script locally or in CI.
- **Later automated:** A small service (e.g. Vercel cron or worker) uses the **Notion API** (not MCP) to do the same discovery/fetch and write the same JSON shape to storage; the same Step B script reads that file (or a URL) and runs chunk → embed → upsert.

---

## 3. Step B: Sync script (chunk → embed → Supabase)

The script in `scripts/sync-notion-to-supabase/` does the following:

1. **Read** the export JSON (path as CLI arg or default).
2. **Normalise** `page_id` (e.g. strip dashes if your DB uses one convention).
3. **Chunk** each item’s `content`:
   - **Current schema (one row per page):** one chunk = full content (optionally truncated to a max length to stay under embedding limits).
   - **Chunked schema (later):** split by paragraphs or by ~500 tokens (~2000 chars) with optional overlap; each chunk gets `chunk_index` and the same `page_id`.
4. **Embed** each chunk with OpenAI `text-embedding-3-small` (1536 dimensions). Batch requests (e.g. 100 texts per request) to respect rate limits.
5. **Upsert:**
   - Call `upsert_notion_page(page_id, page_url, title)` for each unique page.
   - Call `upsert_notion_content(page_id, content, embedding, metadata)` for each chunk. For current schema, one chunk per page; for chunked schema, multiple rows per page with `chunk_index` in metadata and a unique constraint `(page_id, chunk_index)`.

**Environment variables**

- `OPENAI_API_KEY` – for embeddings.
- `SUPABASE_URL` – project URL.
- `SUPABASE_SERVICE_ROLE_KEY` – so the script can upsert (bypass RLS). Do not use the anon key if RLS restricts inserts.

**Idempotency**

- Upserts are keyed by `page_id` (and `chunk_index` when chunked). Re-running with the same export overwrites existing rows for those pages; pages no longer in the export are left in the DB (optional: add a "full replace" mode that deletes notion_content/notion_pages not in the export).

---

## 4. Supabase schema (current vs recommended)

### 4.1 Current

- **notion_pages:** `page_id`, `page_url`, `page_header`, timestamps.
- **notion_content:** one row per page; `page_id`, `content`, `embedding` (vector 1536), `metadata` (e.g. `page_url`).
- **match_notion_content(query_embedding, match_count):** returns top-k by cosine distance.

The script works with this today: one chunk per page, one row in `notion_content` per page.

### 4.2 Recommended (chunked) evolution

- **notion_pages:** add `object_type` ('page' | 'database'), `teamspace_id`, `parent_id`, `raw_metadata` (jsonb) for better filtering and source labels.
- **notion_content:** add `chunk_index` (int), unique on `(page_id, chunk_index)`. Multiple rows per page. Keep `metadata` with `page_url`, `page_header`, `chunk_index`, optionally `teamspace_id`.
- **match_notion_content:** same signature; returns chunk rows; Edge Function continues to build context from chunk `content` and source pills from `metadata.page_url` + `page_header`.

See `docs/supabase-schema-migration.md` for concrete SQL and RPC changes.

---

## 5. Running the sync

1. **Export (Cursor + Notion MCP)**  
   - List teamspaces, search/fetch in-scope pages, build and save `notion-export.json` (see script README for exact shape).

2. **Sync (Node)**  
   ```bash
   cd scripts/sync-notion-to-supabase
   npm install
   export OPENAI_API_KEY=sk-...
   export SUPABASE_URL=https://sqegpdtxgarjtoajhqag.supabase.co
   export SUPABASE_SERVICE_ROLE_KEY=...
   node sync-from-export.js ../notion-export.json
   ```

3. **Optional: Full replace**  
   - To avoid stale pages, the script can accept a flag `--replace` that deletes all rows in `notion_content` / `notion_pages` before upserting (or deletes only pages not in the export). Use with care.

---

## 6. Scheduling (later)

- **Cron + export:** A job (e.g. GitHub Actions, Vercel Cron, or a worker) calls the Notion API, writes the same JSON shape to a file or object store.
- **Cron + sync:** The same Node script runs on a schedule, reading the latest export from disk or a URL.
- MCP remains the best way to *design* and *debug* what goes into the export (which teamspaces, which pages, how to parse fetch output); production can use the Notion API for the same contract.

---

## 7. Summary

| Piece | Responsibility |
|-------|----------------|
| **Notion MCP** | Discover teamspaces/pages, fetch full content, produce export JSON (or design the equivalent Notion API flow). |
| **Sync script** | Read export → chunk → embed (OpenAI) → upsert Supabase. |
| **Supabase** | Store pages + chunked content + embeddings; RAG = match_notion_content + LLM. |
| **Chat app** | Unchanged: embed query → match → LLM → response + sources. |

This gives you one source of truth (Supabase) for the app, with content sourced and shaped by Notion MCP (or a Notion API pipeline that matches the same export format).
