#!/usr/bin/env node
/**
 * Notion export → Supabase sync
 *
 * Reads a JSON array of { page_id, page_url, title, content } (and optional
 * teamspace_id, object_type), embeds content with OpenAI text-embedding-3-small,
 * and upserts into notion_pages + notion_content.
 *
 * Env: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (from project root .env if present)
 * Usage: node sync-from-export.js [path/to/export.json] [--replace] [--dry-run]
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

// Load .env from project root (two levels up from scripts/sync-notion-to-supabase)
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, "../../.env") })

const EMBEDDING_MODEL = "text-embedding-3-small"
const MAX_CONTENT_LENGTH = 8000 // chars; keep under embedding token limit
const BATCH_SIZE = 100 // OpenAI recommends up to 2048 inputs per request; we batch by 100 for safety

function normalizePageId(id) {
  if (!id || typeof id !== "string") return null
  const cleaned = id.replace(/-/g, "").toLowerCase()
  if (cleaned.length !== 32) return null
  return cleaned.slice(0, 8) + "-" + cleaned.slice(8, 12) + "-" + cleaned.slice(12, 16) + "-" + cleaned.slice(16, 20) + "-" + cleaned.slice(20, 32)
}

function truncate(content) {
  if (!content || typeof content !== "string") return ""
  return content.length <= MAX_CONTENT_LENGTH ? content : content.slice(0, MAX_CONTENT_LENGTH) + "\n[... truncated]"
}

function parseArgs() {
  const args = process.argv.slice(2)
  const file = args.find((a) => !a.startsWith("--")) || "notion-export.json"
  const replace = args.includes("--replace")
  const dryRun = args.includes("--dry-run")
  return { file: resolve(process.cwd(), file), replace, dryRun }
}

async function main() {
  const { file, replace, dryRun } = parseArgs()

  if (dryRun) {
    console.log("[dry-run] No OpenAI or Supabase calls will be made.")
  }

  const raw = readFileSync(file, "utf-8")
  let items
  try {
    items = JSON.parse(raw)
  } catch (e) {
    console.error("Invalid JSON in", file, e.message)
    process.exit(1)
  }
  if (!Array.isArray(items)) {
    console.error("Export must be a JSON array.")
    process.exit(1)
  }

  const openaiKey = process.env.OPENAI_API_KEY
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!dryRun) {
    if (!openaiKey) {
      console.error("Missing OPENAI_API_KEY")
      process.exit(1)
    }
    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
      process.exit(1)
    }
  }

  const openai = dryRun ? null : new OpenAI({ apiKey: openaiKey })
  const supabase = dryRun ? null : createClient(supabaseUrl, supabaseKey)

  if (!dryRun && replace) {
    console.log("Replace mode: clearing notion_content and notion_pages...")
    await supabase.from("notion_content").delete().neq("id", "00000000-0000-0000-0000-000000000000")
    await supabase.from("notion_pages").delete().neq("page_id", "")
    console.log("Cleared.")
  }

  const normalized = []
  for (const it of items) {
    const pageId = normalizePageId(it.page_id)
    if (!pageId) {
      console.warn("Skipping invalid page_id:", it.page_id)
      continue
    }
    const pageUrl = it.page_url || `https://www.notion.so/${it.page_id.replace(/-/g, "")}`
    const title = it.title ?? ""
    const content = truncate(it.content ?? "")
    if (!content) {
      console.warn("Skipping empty content for page_id:", pageId)
      continue
    }
    normalized.push({
      page_id: pageId,
      page_url: pageUrl,
      title,
      content,
      metadata: {
        page_url: pageUrl,
        ...(it.teamspace_id && { teamspace_id: it.teamspace_id }),
        ...(it.object_type && { object_type: it.object_type }),
      },
    })
  }

  console.log("Pages to sync:", normalized.length)
  if (normalized.length === 0) {
    console.log("Nothing to do.")
    return
  }

  // Batch embed
  const texts = normalized.map((n) => n.content)
  let embeddings = []
  if (dryRun) {
    embeddings = texts.map(() => new Array(1536).fill(0))
    console.log("[dry-run] Would call OpenAI embeddings for", texts.length, "texts.")
  } else {
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE)
      const res = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      })
      const byIndex = res.data.slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      embeddings.push(...byIndex.map((d) => d.embedding))
      console.log("Embedded batch", Math.floor(i / BATCH_SIZE) + 1, "/", Math.ceil(texts.length / BATCH_SIZE))
    }
  }

  for (let i = 0; i < normalized.length; i++) {
    const row = normalized[i]
    const embedding = embeddings[i]
    if (dryRun) {
      console.log("[dry-run] Would upsert page:", row.page_id, row.title?.slice(0, 40))
      continue
    }
    await supabase.rpc("upsert_notion_page", {
      p_page_id: row.page_id,
      p_page_url: row.page_url,
      p_page_header: row.title || null,
      p_object_type: row.metadata?.object_type ?? "page",
      p_teamspace_id: row.metadata?.teamspace_id ?? null,
      p_parent_id: row.metadata?.parent_id ?? null,
      p_raw_metadata: row.metadata ? { ...row.metadata } : null,
    })
    await supabase.rpc("upsert_notion_content", {
      p_page_id: row.page_id,
      p_content: row.content,
      p_embedding: embedding,
      p_metadata: row.metadata,
    })
  }

  console.log("Done. Synced", normalized.length, "pages.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
