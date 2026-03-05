# Second Brain

A **production-ready**, **RAG-based** app that lets users query a structured, proprietary data store in natural language and receive accurate, formatted outputs. Built with a **custom backend + SQL/vector data layer** exposed via a **REST-style API**, so any front end (React, Bubble, etc.) can integrate without touching the core logic.

**Architecture:** Natural language → embedding + vector search over structured content → LLM with strict context-only answering → formatted responses with source citations. Includes **safe fallback behavior** when no matching data exists (e.g. “There is nothing in your second brain that relates to your question”), **guardrails against hallucination**, and clear error handling. Designed for accuracy, reliability, and maintainability.

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 18, TypeScript (reference implementation; any HTTP client works) |
| **Backend API** | Supabase Edge Functions (REST), Postgres + pgvector for RAG retrieval |
| **LLM / Embeddings** | OpenAI (`text-embedding-3-small`, Responses API / o3-mini) |
| **Data pipeline** | Node.js, custom sync scripts (embed + upsert into SQL) |

---

## Live Demo

_Not in production yet._ Run the app locally (see [Installation](#installation)) to try it.

---

## Installation

### 1. Clone and install

```bash
git clone <your-repo-url>
cd second-brain
npm install
```

### 2. Environment variables

Copy the example env and fill in your values:

```bash
cp .env.example .env
```

- **Frontend (required for chat):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Notion → Supabase sync** (when you run the sync script): `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### 3. Supabase setup

- Create a Supabase project and run the schema/migrations so the RAG tables and `match_notion_content` RPC exist (see `docs/supabase-schema-migration.md` if present).
- Deploy the `chat` Edge Function (e.g. `supabase functions deploy chat`) and set secrets: `OPENAI_API_KEY`, plus any Supabase URL/key the function needs.

### 4. Run the app

```bash
npm run dev
```

Open the URL Vite prints (e.g. `http://localhost:5173`). The chat UI calls the Supabase `chat` function via `supabase.functions.invoke()`. Any front end (Bubble, React, etc.) can call the same REST endpoint with a `{ message, history? }` payload and receive `{ content, sources, reasoning? }` as JSON.

### 5. (Optional) Sync Notion into Supabase

To populate the RAG content from Notion:

1. Export Notion pages into `notion-export.json` (see `docs/notion-export-runbook.md` and the Notion MCP workflow in `.cursor/rules/notion-export-refresh.mdc`).
2. From the repo root:

   ```bash
   npm run sync:notion
   ```

   Use `npm run sync:notion -- --replace` to replace all RAG content with the current export.

---

## Key Features

- **RAG pattern over structured data** — Natural language → embedding (OpenAI `text-embedding-3-small`) → vector search in Postgres → LLM answers **only from retrieved context**. Same pattern transfers to proprietary databases (e.g. compensation benchmarks).
- **Custom backend + API** — SQL-backed RPC (`match_notion_content`) + Edge Function (`chat`) exposed as a REST-compatible API. Any front end (React, Bubble, etc.) can connect via simple HTTP; auth and gating handled at the app layer.
- **Guardrails against hallucination** — System prompt enforces “answer only from context.” When no relevant data is found, returns an explicit fallback message (e.g. “insufficient data”) instead of fabricating answers.
- **Formatted, client-ready outputs** — Structured responses with source citations (clickable links to source records). Streaming support; non-streaming fallback with retries for reliability.
- **Production-ready** — Clear error handling, retry logic on transient failures, maintainable TypeScript + Deno codebase, dry-run and replace options for data sync.
- **Data pipeline** — Scripts to ingest structured content (Notion here; same approach works for other proprietary sources), embed, and upsert into the SQL/vector layer.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript build + Vite production build |
| `npm run preview` | Preview production build locally |
| `npm run sync:notion` | Sync `scripts/sync-notion-to-supabase/notion-export.json` into Supabase (optional: `--replace`, `--dry-run`) |

---

## Docs

- **Notion export & sync:** `docs/notion-export-runbook.md`
- **Sync script details:** `scripts/sync-notion-to-supabase/README.md`
- **Supabase schema:** `docs/supabase-schema-migration.md` (if present)
