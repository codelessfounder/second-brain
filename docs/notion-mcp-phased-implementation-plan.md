# Phased implementation plan: Notion MCP → Supabase RAG

This plan takes you from the current setup (patchy N8N sync, single table shape) to a clean flow where Notion MCP drives what gets synced into Supabase and the chat app uses that data. Phases are ordered so each builds on the previous one.

---

## Phase 0: Baseline (current state)

**Goal:** Agree on the starting point and what “done” looks like per phase.

**Current state**

- Supabase: `notion_pages` (87 rows), `notion_content` (87 rows, one per page), `workflow_state` (last sync timestamp). RPCs: `match_notion_content`, `upsert_notion_page`, `upsert_notion_content`.
- Chat: Edge Function `chat` embeds the query, calls `match_notion_content`, builds context, calls LLM, returns content + source pills.
- Data source: N8N Notion Knowledge Base workflow (patchy retrieval).

**Success criteria for full plan**

- RAG is fed from a Notion MCP–driven process (export → sync script).
- Optional: Richer metadata (teamspace, type) and chunk-level retrieval.
- Chat app unchanged except any minor source-label improvements.

**Deliverable:** None; this phase is documentation only. Optional: run the existing sync script with `example-export.json` in dry-run to confirm env and script path.

---

## Phase 1: One-off export and sync (validate the pipeline)

**Goal:** Produce a single Notion export using MCP, run the sync script, and confirm the app uses the new data.

**Steps**

1. **Scope**
   - In Cursor, call **notion-get-teams** and choose 1–2 teamspaces (e.g. “Me” and “Harry’s Odyssey”).
   - Note their IDs for later.

2. **Collect page IDs**
   - For each chosen teamspace, call **notion-search** with `query_type: "internal"`, `teamspace_id: "<id>"`, and a broad query (e.g. `"notes"` or `"content"`).
   - From the results, collect a small set (e.g. 10–20) of unique `id` and `url`. Prefer a mix of pages you care about for RAG.

3. **Fetch and build export**
   - For each collected ID, call **notion-fetch** with `id: "<url-or-id>"`.
   - From each response:
     - Derive **title** (e.g. from `<properties>` or first heading).
     - Derive **content**: strip Notion XML/Markdown to plain text, or keep Markdown (script accepts both). Concatenate the main body; avoid huge code blocks or binary.
   - Build a JSON array of `{ page_id, page_url, title, content }` and optionally `teamspace_id`, `object_type`.
   - Save as `scripts/sync-notion-to-supabase/notion-export.json`.

4. **Run sync (dry-run then real)**
   - From repo root or script dir:
     ```bash
     cd scripts/sync-notion-to-supabase
     npm install
     export OPENAI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
     node sync-from-export.js notion-export.json --dry-run
     ```
   - Fix any path/env errors, then run without `--dry-run`.
   - If you want this export to be the only source of truth, run with `--replace`.

5. **Verify in the app**
   - Open the Second Brain app and ask a question that should be answered from one of the synced pages.
   - Confirm the answer and that source pills open the correct Notion URLs.

**Success criteria**

- Export JSON exists and matches the format in `scripts/sync-notion-to-supabase/README.md`.
- Sync script completes without errors; `notion_pages` and `notion_content` reflect the export.
- Chat returns relevant answers and source pills point to the right Notion pages.

**Risks / mitigations**

- Rate limits (Notion MCP or OpenAI): reduce batch size or number of pages in Phase 1.
- Truncation: if answers feel cut off, consider chunking in a later phase.

**Deliverables**

- `notion-export.json` (local only; gitignored).
- Confirmation that the pipeline (MCP → export → script → Supabase → chat) works end-to-end.

---

## Phase 2: Reusable export process (checklist or agent) ✅

**Goal:** Turn the Phase 1 manual steps into a repeatable process so you can refresh the export without rethinking the flow.

**Steps**

1. **Document your scope**
   - Create a short doc or config (e.g. in `docs/` or `scripts/sync-notion-to-supabase/`) that lists:
     - Teamspace IDs (and names) to include.
     - Any exclusion rules (e.g. skip archived, skip DBs, or only certain top-level pages).

2. **Export runbook**
   - Write a step-by-step runbook (or Cursor instructions) that:
     - Calls **notion-get-teams** and filters to in-scope teamspaces.
     - For each, runs **notion-search** with a standard query and `teamspace_id`.
     - For each result, runs **notion-fetch** and extracts title + content.
     - Outputs the same JSON shape and saves to `notion-export.json`.
   - Optionally add a “validation” step: check that each `page_id` is valid and content is non-empty before saving.

3. **Sync runbook**
   - Document the exact commands and env vars to run the sync script (and when to use `--replace` vs incremental).
   - Optionally add a one-liner or `npm run sync` that reads from a fixed path.

**Success criteria**

- Someone (or you in a few weeks) can re-run the export and sync by following the runbook or Cursor instructions.
- No code changes to the sync script required for this phase.

**Deliverables**

- `docs/notion-export-runbook.md` (or equivalent) with scope + MCP steps + sync commands.
- Optional: Cursor rule or agent prompt that encodes the same steps for “refresh Notion export”.

---

## Phase 3: Richer metadata (optional schema and labels) ✅

**Goal:** Store teamspace and object type so you can filter and show better source labels, without changing to chunked retrieval yet.

**Done:**

1. **Schema:** `notion_pages` has `object_type`, `teamspace_id`, `parent_id`, `raw_metadata`. Old `upsert_notion_page` overloads dropped; single function now accepts `p_object_type`, `p_teamspace_id`, `p_parent_id`, `p_raw_metadata`.
2. **match_notion_content** now joins `notion_pages` and returns **page_header** and **page_url** so the chat Edge Function can show page titles in source pills.
3. **Sync script** passes `teamspace_id`, `object_type`, and optional `parent_id` / `raw_metadata` from the export into `upsert_notion_page`. Export and build already include `teamspace_id` and `object_type`.

**Reminder (Edge Function):** The chat Edge Function should use the new RPC return columns for source pills: **label** = `page_header`, **url** = `page_url`. See `docs/supabase-schema-migration.md` Phase 1 note.

**Success criteria**

- `notion_pages` has teamspace and type for new/updated rows. ✅
- Source pills in the app show page titles when the Edge Function uses `page_header`. (Update Edge Function in Supabase dashboard if not already using it.)

---

## Phase 4: Chunk-level retrieval (optional, larger change)

**Goal:** Store multiple chunks per page and retrieve by chunk so RAG context is more precise.

**Steps**

1. **Apply Phase 2 of schema migration**
   - Create **notion_content_chunks** (or equivalent) with `(page_id, chunk_index, content, embedding, metadata)` and the ivfflat index.
   - Add **match_notion_content_chunks** and **upsert_notion_content_chunk** as in `docs/supabase-schema-migration.md`.

2. **Chunking in the sync script**
   - Update the script to split each page’s `content` into chunks (e.g. by paragraph or ~500 tokens / ~2000 chars with overlap).
   - For each chunk, call the new chunk upsert RPC with `chunk_index` and the same `page_id`.

3. **Migrate existing data**
   - Copy current `notion_content` into the new chunk table with `chunk_index = 0`, or run a full export + sync with the new script to backfill.

4. **Point chat at chunks**
   - Change the Edge Function to call **match_notion_content_chunks** instead of **match_notion_content**.
   - Build context from the returned chunks; for source pills, de-dupe by `page_id` and use one link per page (e.g. first chunk’s URL).

5. **Optional: filter by teamspace**
   - Use the `filter_teamspace_id` parameter of **match_notion_content_chunks** if you add UI or logic to “search only in this space”.

**Success criteria**

- Chunk table is populated; multiple chunks per page where content is long.
- Chat answers are based on chunk-level context; source pills still open the right Notion page.

**Risks / mitigations**

- More rows and embedding calls: chunking increases sync time and storage; keep batch size and truncation sensible.
- Duplicate context: if several chunks from the same page are in the top-k, consider de-duping or limiting per-page chunks in the RPC.

**Deliverables**

- New table and RPCs; migration of existing data.
- Updated sync script (chunking + chunk upsert).
- Updated Edge Function (chunk match + context building and source labels).

---

## Phase 5: Automate export and sync (optional)

**Goal:** Run the export and sync on a schedule so the app stays up to date without manual steps.

**Steps**

1. **Export automation**
   - Option A: Use the **Notion API** (not MCP) in a small job (e.g. Vercel Cron, GitHub Actions, or a worker) that replicates the export shape (same JSON). The runbook from Phase 2 defines the contract.
   - Option B: Keep export manual or Cursor-triggered and only automate the sync: the job assumes a pre-written export file (e.g. in S3 or repo artifact) and runs the sync script.

2. **Sync automation**
   - Run the Node sync script in the same job or a separate step: read export from file/URL, then chunk → embed → upsert.
   - Use env vars (or secrets) for `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

3. **State and safety**
   - Decide whether each run is incremental (upsert only) or full replace (`--replace`). For replace, ensure the export job always runs before the sync so the DB isn’t wiped with stale data.
   - Optionally write `last_sync` (or similar) into `workflow_state` / `sync_state` after each run.

**Success criteria**

- Export (if automated) produces the same JSON shape as the MCP-driven export.
- Sync runs on a schedule and Supabase is updated; chat reflects recent Notion content.

**Deliverables**

- Cron job or workflow that runs export (optional) + sync.
- Brief doc on schedule, env, and replace vs incremental behaviour.

---

## Summary table

| Phase | Goal | Main deliverables | Depends on |
|-------|------|-------------------|------------|
| **0** | Baseline | Doc of current state and success criteria | — |
| **1** | One-off MCP export + sync | Export JSON, working pipeline, verified chat | 0 |
| **2** | Reusable export process | Runbook / agent instructions for export + sync | 1 |
| **3** | Richer metadata & labels | Schema migration (notion_pages), better source pills | 1, 2 |
| **4** | Chunk-level retrieval | Chunk table, new RPCs, script + Edge Function changes | 3 (or 2) |
| **5** | Automate export + sync | Scheduled job, env, and safety behaviour | 2, (3), (4) |

Phases 3 and 4 are optional; you can stop after Phase 2 and still have a solid MCP-driven RAG. Phase 5 can run with or without Phase 3/4.

---

## Suggested order of work

1. **Do Phase 1** so the pipeline is proven with real data.
2. **Do Phase 2** so you can repeat it without re-deriving the steps.
3. **Decide:** If source labels and teamspace metadata matter soon, do **Phase 3**. If retrieval quality is the priority, consider **Phase 4** (chunking) next.
4. **Automate** with **Phase 5** when you’re happy with the manual/runbook flow.

Use this doc as the single reference for the phased plan; update it as you complete each phase or change scope.
