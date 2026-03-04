# Notion → Supabase sync (from export JSON)

This script reads a **Notion export JSON** (produced e.g. by a Cursor agent using Notion MCP) and upserts into the Second Brain Supabase project: `notion_pages` and `notion_content` (with embeddings).

## Export JSON shape

The input file must be a JSON array of objects with at least:

```json
[
  {
    "page_id": "1ba348f4-3634-81f2-93d3-f1bcc0416e62",
    "page_url": "https://www.notion.so/1ba348f4363481f293d3f1bcc0416e62",
    "title": "Databases",
    "content": "Full plain text or Markdown body of the page..."
  }
]
```

Optional fields: `teamspace_id`, `object_type` (e.g. `"page"` | `"database"`). They are stored in `notion_content.metadata` if present.

- **page_id:** Notion UUID (with or without dashes; script normalises to a single form).
- **page_url:** Used for source pills in chat.
- **title:** Stored as `page_header` in `notion_pages`.
- **content:** Text to embed. Long content is truncated to stay under embedding token limits (see script).

## Env vars

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for `text-embedding-3-small`. |
| `SUPABASE_URL` | Yes | e.g. `https://sqegpdtxgarjtoajhqag.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (bypasses RLS for upserts). |

## Install and run

**From repo root (recommended):** Loads env from root `.env`.

```bash
npm run sync:notion
```

**From this directory:**

```bash
cd scripts/sync-notion-to-supabase
npm install
node sync-from-export.js notion-export.json
```

Env is loaded from the project root `.env` when the script runs (no need to `export` if `.env` is set). Default input path if no file argument: `./notion-export.json`.

## Options

- `--replace` – Before upserting, delete all rows in `notion_content` and `notion_pages` so only the export is present. Use with care.
- `--dry-run` – Log what would be done; no Supabase or OpenAI calls.

## Building `notion-export.json` from manifest + page files

1. **Manifest:** `manifest.json` is an array of `{ page_id, page_url, title, teamspace_id }`. Entry at index `i` (0-based) corresponds to `page-{i+1}.txt` (e.g. index 0 → page-01.txt). Optional per-entry `contentMaxLength` (e.g. 7500) is supported.
2. **Raw page text:** For each index, put the **full notion-fetch response `text`** (the whole string from the MCP) into `page-01.txt`, `page-02.txt`, … in this directory. Missing files are skipped with a warning; those pages are omitted from the export.
3. **Build:** Run `node build-export.js`. It reads `manifest.json` and each `page-NN.txt` (or `notion-raw.json` if present), strips Notion XML/tags, extracts plain text from `<content>`, and writes `notion-export.json`. Only entries with non-empty content after stripping are included.

**Runbook:** See `docs/notion-export-runbook.md` for the full repeatable process: scope (`export-scope.json`), saturation search, manifest, fetch into page-NN.txt, build, sync, and "continue" batches. Scope config: `export-scope.json` in this directory.
