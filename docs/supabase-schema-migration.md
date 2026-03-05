# Supabase schema migration: chunked content and richer metadata

This doc describes **optional** schema changes to support chunk-level retrieval and better metadata (teamspace, object type). The sync script in `scripts/sync-notion-to-supabase/` works with the **current** schema (one row per page). After you apply this migration, you can extend the script to output multiple chunks per page and use the new columns.

---

## Current schema (no change required for initial Option 1)

- **notion_pages:** `page_id` (PK), `page_url`, `page_header`, `created_at`, `updated_at`
- **notion_content:** `id` (PK), `page_id` (unique FK), `content`, `embedding` (vector 1536), `metadata` (jsonb), timestamps
- **match_notion_content(query_embedding, match_count)** returns top-k rows by cosine distance

---

## Phase 1: Add columns to notion_pages (optional)

Run in Supabase SQL editor (project: second-brain).

```sql
-- Add optional columns for filtering and display
ALTER TABLE notion_pages
  ADD COLUMN IF NOT EXISTS object_type text,
  ADD COLUMN IF NOT EXISTS teamspace_id text,
  ADD COLUMN IF NOT EXISTS parent_id text,
  ADD COLUMN IF NOT EXISTS raw_metadata jsonb DEFAULT '{}';

COMMENT ON COLUMN notion_pages.object_type IS 'page | database | database_row';
COMMENT ON COLUMN notion_pages.teamspace_id IS 'From notion-get-teams';
```

Update **upsert_notion_page** to accept and set these (add parameters and include in INSERT/UPDATE). The sync script can then pass `teamspace_id` and `object_type` from the export.

**Applied:** Columns and extended `upsert_notion_page` are in place. **match_notion_content** has been extended to return **page_header** and **page_url** (via join on `notion_pages`) so the chat Edge Function can show human-readable source labels.

**Edge Function (chat):** When building source pills from `match_notion_content` results, use **page_header** as the source label (e.g. `label: row.page_header ?? "Source"`) and **page_url** as the link (`url: row.page_url ?? row.metadata?.page_url`). The RPC now returns these columns; no need to rely only on `metadata`.

---

## Phase 2: Chunk-level notion_content (optional, breaking change)

This changes the meaning of `notion_content`: multiple rows per `page_id`, keyed by `chunk_index`.

### 2.1 New table (recommended: new table then swap)

Create a new table so you can migrate data and test before dropping the old one.

```sql
-- Chunk-level content table
CREATE TABLE IF NOT EXISTS notion_content_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL REFERENCES notion_pages(page_id) ON DELETE CASCADE,
  chunk_index int NOT NULL DEFAULT 0,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(page_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_notion_content_chunks_embedding
  ON notion_content_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

COMMENT ON TABLE notion_content_chunks IS 'One row per chunk; multiple chunks per page for finer RAG retrieval.';
```

### 2.2 New RPC for chunk search

```sql
CREATE OR REPLACE FUNCTION match_notion_content_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 10,
  filter_teamspace_id text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  page_id text,
  chunk_index int,
  content text,
  metadata jsonb
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    nc.id,
    nc.page_id,
    nc.chunk_index,
    nc.content,
    nc.metadata
  FROM notion_content_chunks nc
  JOIN notion_pages np ON np.page_id = nc.page_id
  WHERE (filter_teamspace_id IS NULL OR np.teamspace_id = filter_teamspace_id)
  ORDER BY nc.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### 2.3 Chunk upsert

```sql
CREATE OR REPLACE FUNCTION upsert_notion_content_chunk(
  p_page_id text,
  p_chunk_index int,
  p_content text,
  p_embedding vector(1536),
  p_metadata jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO notion_content_chunks (page_id, chunk_index, content, embedding, metadata)
  VALUES (p_page_id, p_chunk_index, p_content, p_embedding, p_metadata)
  ON CONFLICT (page_id, chunk_index) DO UPDATE SET
    content = EXCLUDED.content,
    embedding = EXCLUDED.embedding,
    metadata = EXCLUDED.metadata,
    updated_at = now();
END;
$$;
```

### 2.4 Migrate existing data and switch

- Copy from `notion_content` into `notion_content_chunks` with `chunk_index = 0`.
- Point the Edge Function at `match_notion_content_chunks` and build context from returned chunks (de-dupe by page for source pills).
- When satisfied, drop `notion_content` and rename `notion_content_chunks` to `notion_content`, or keep both and use the new name in the app.

---

## Summary

| Phase | Purpose |
|-------|---------|
| **None** | Keep current schema; sync script works as-is (one row per page). |
| **Phase 1** | Richer notion_pages (teamspace, type) for filtering and labels. |
| **Phase 2** | Chunk-level storage and search for better retrieval; requires script and Edge Function updates. |

You can implement Option 1 (Notion MCP → export → sync script → Supabase) with the **current** schema; Phase 1 and 2 are optional improvements.
