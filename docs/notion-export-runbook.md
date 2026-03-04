# Notion export and sync runbook

Repeatable process to export **every page in all in-scope teamspaces** (via Notion MCP) and sync them into the Second Brain Supabase RAG. Use this when you want to refresh what the chat app can search over.

The pipeline uses a **manifest** (list of pages), **page-NN.txt** files (raw Notion fetch response per page), and **build-export.js** to produce `notion-export.json`, which the sync script upserts into Supabase.

---

## 1. Scope

**Config:** `scripts/sync-notion-to-supabase/export-scope.json`

- **Teamspaces:** List of `id` and `name` to include. Export includes all pages discovered in these teamspaces. Current: **Me**, **Harry's Odyssey**, **Disco**, **Watchcrow**.
- **Exclusions:** Optional rules (e.g. `skip_archived`, `skip_databases`). Edit the JSON to change.

To add or change teamspaces:

1. In Cursor, call **notion-get-teams** (Notion MCP).
2. Copy the `id` and `name` for each teamspace you want.
3. Update `export-scope.json` → `teamspaces` array.

---

## 2. Export (build `notion-export.json`)

Do this in Cursor with Notion MCP enabled. **Goal:** a manifest of every page in scope, then raw fetch content in `page-NN.txt` files, then run the build script.

### 2.1 Get in-scope teamspaces

- Call **notion-get-teams**.
- Filter to the teamspaces listed in `export-scope.json` (by name or ID).

### 2.2 Collect every page ID (saturation search)

The Notion MCP has no "list all pages in teamspace" API. Use **multiple broad searches** per teamspace and merge unique IDs.

For **each** in-scope teamspace:

1. Call **notion-search** multiple times with:
   - `query_type`: `"internal"`
   - `teamspace_id`: `<teamspace id from scope>`
   - `query`: a different broad term each time, e.g. `"notes"`, `"page"`, `"doc"`, `"content"`, `" "`, `"a"`, `"the"`.
2. From each response, collect every **unique** `id` and `url` (and `object_type` if present). Merge across all searches for that teamspace.
3. When **several searches in a row** return no new IDs, treat that teamspace as saturated.

Merge all teamspaces into one **ordered list** of page entries. Each entry: `{ page_id, page_url, title, teamspace_id }` (title can come from the search result or be filled when fetching).

### 2.3 Build or update the manifest

- **manifest.json** is the single source of truth: a JSON array of objects `{ page_id, page_url, title, teamspace_id }`.
- **Index = page file number:** Entry at index `i` (0-based) corresponds to **page-{i+1}.txt** (e.g. index 0 → page-01.txt, index 87 → page-88.txt).
- To create or replace the manifest: build the array from your merged search results (dedupe by `page_id`), then write to `scripts/sync-notion-to-supabase/manifest.json`.
- To add new pages without re-fetching everything: append new entries to the manifest. Then run `node merge-saturation-results.js` after saving new page entries to `saturation-new-pages.json` (array of `{ page_id, page_url, title, teamspace_id }`), or manually append to `manifest.json` and renumber if you need a specific order.

### 2.4 Fetch full content into page-NN.txt

For each manifest entry (or for indices that don’t yet have a file):

1. Call **notion-fetch** with `id`: `<page_id or page_url>`.
2. Save the **entire response `text`** (the string starting with "Here is the result of...") to **page-NN.txt** in `scripts/sync-notion-to-supabase/`, where `NN` is the 1-based index zero-padded (01, 02, … 88).  
   - Example: manifest index 0 → page-01.txt, index 79 → page-80.txt.
3. If a page has no content (blank or database schema only), you can still write a minimal file with `<content>...</content>` so the build step can include or skip it consistently.

**Batching:** You can do a full refresh (fetch all) or **continue** with the next N pages (see Section 6). For large manifests, fetch in batches (e.g. 15–20 at a time) to avoid rate limits.

### 2.5 Build notion-export.json

From the script directory:

```bash
cd scripts/sync-notion-to-supabase
node build-export.js
```

- **Input:** If `notion-raw.json` exists, the script uses it; otherwise it reads **manifest.json** and each **page-NN.txt** (by index).
- **Behaviour:** For each entry, it strips Notion XML/tags from the raw text, extracts plain text (from `<content>...</content>`), truncates to the content length limit, and outputs one object per page with non-empty content.
- **Output:** `notion-export.json` (array of `{ page_id, page_url, title, content, teamspace_id?, object_type }`). Missing or empty page files are skipped (and a warning is logged).

### 2.6 Validation (optional)

- Ensure every `page_id` in the manifest is a valid UUID (with or without dashes).
- After build, check the console for "Missing page-XX.txt" and "Wrote notion-export.json with N pages" so you know how many pages are in the export.

---

## 3. Sync (export → Supabase)

Run the sync script so the app’s RAG uses the export.

### 3.1 Env vars

The script reads from the **project root** `.env`. Required:

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI key for `text-embedding-3-small`. |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (not the anon key). |

See `.env.example` in the repo root.

### 3.2 Commands

From the repo root:

```bash
npm run sync:notion
```

Or with options (pass after `--`):

```bash
npm run sync:notion -- --replace
npm run sync:notion -- --dry-run
```

From the script directory:

```bash
cd scripts/sync-notion-to-supabase
node sync-from-export.js notion-export.json
node sync-from-export.js notion-export.json --replace
node sync-from-export.js notion-export.json --dry-run
```

**Options:**

- **Default (no flags):** Incremental upsert. Adds/updates only the pages in the export; other rows in Supabase are left as-is.
- **`--replace`:** Before upserting, deletes all rows in `notion_content` and `notion_pages` so that **only** the current export exists. Use when you want the DB to exactly match the export (e.g. after removing pages from scope).
- **`--dry-run`:** Logs what would be done; no OpenAI or Supabase calls.

### 3.3 When to use `--replace` vs incremental

- **Incremental:** Normal refresh. You added or edited pages; you want to update those without touching other rows. Safe default.
- **`--replace`:** You removed teamspaces or pages from scope and want Supabase to no longer contain them. The export is the single source of truth.

---

## 4. Verify

1. Open the Second Brain app.
2. Ask a question that should be answered from a synced Notion page.
3. Confirm the answer and that **source pills** open the correct Notion URLs.

---

## 5. Progress tracking (optional)

**File:** `scripts/sync-notion-to-supabase/export-progress.json`

Use this to track which page files exist and how much of the manifest has been exported:

- **page_files_with_content:** List of `"page-NN"` that have been written (so you know what’s left to fetch).
- **export_page_count:** Number of pages in the last built `notion-export.json`.
- **saturation_note:** Short note, e.g. "Export complete" or "~N pages left (page-XX to page-YY). Say continue to fetch next batch."

Update this file after each batch (e.g. after writing new page-NN.txt files, running build, and sync) so the next "continue" run knows which pages to fetch next.

---

## 6. Continue with next N pages (batched refresh)

When the manifest has more pages than you’ve fetched, or `export-progress.json` says there are pages left:

1. **Identify the next batch:** e.g. the next 15 manifest indices that don’t yet have a corresponding `page-NN.txt`, or the range indicated in `saturation_note` (e.g. page-64–65, page-68–80).
2. **Fetch:** For each of those indices, get the page from the manifest (by index), call **notion-fetch** for that `page_id` (or URL), and write the response `text` to **page-NN.txt** (NN = 1-based index, zero-padded).
3. **Build:** Run `node build-export.js` in `scripts/sync-notion-to-supabase/`.
4. **Sync:** From repo root run `npm run sync:notion` (or with `--replace` if this export is now the only source of truth).
5. **Update progress:** Update `export-progress.json`: add the new page numbers to `page_files_with_content`, set `export_page_count` to the new export count, set `saturation_note` to the remaining range or "Export complete."

---

## 7. Cursor shortcut (optional)

You can trigger a refresh by asking Cursor (with Notion MCP):

- **Full refresh:** “Refresh the Notion export: follow the runbook in `docs/notion-export-runbook.md` — scope from `export-scope.json`, run saturation search per teamspace, update manifest, fetch all pages into page-NN.txt, run `node build-export.js`, then tell me to run `npm run sync:notion` (or with `--replace`).”
- **Continue batch:** “Continue the Notion export: fetch the next N pages (see `export-progress.json` or missing page-NN.txt), write them to page-NN.txt, run `node build-export.js`, run `npm run sync:notion`, update `export-progress.json`.”
- **Sync only:** “Run `npm run sync:notion`” (or “sync Notion to Supabase”) when `notion-export.json` already exists.

A Cursor rule in `.cursor/rules/notion-export-refresh.mdc` encodes these instructions for “refresh” and “continue” so the agent can follow the runbook automatically.
