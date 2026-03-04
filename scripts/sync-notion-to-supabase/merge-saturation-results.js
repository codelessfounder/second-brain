#!/usr/bin/env node
/**
 * Merge saturation search results into manifest.json.
 * Usage: node merge-saturation-results.js
 * Reads new pages from saturation-new-pages.json (array of { page_id, title, url, teamspace_id })
 * and merges into manifest.json by page_id, then writes manifest.json back.
 */
import { readFileSync, writeFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = resolve(__dirname, "manifest.json")
const NEW_PAGES_PATH = resolve(__dirname, "saturation-new-pages.json")

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
const existingIds = new Set(manifest.map((e) => e.page_id))

let newPages = []
try {
  newPages = JSON.parse(readFileSync(NEW_PAGES_PATH, "utf8"))
} catch (e) {
  console.error("No saturation-new-pages.json or invalid JSON; skipping merge.")
  process.exit(0)
}

let added = 0
for (const p of newPages) {
  const id = p.page_id || p.id
  if (!id || existingIds.has(id)) continue
  existingIds.add(id)
  manifest.push({
    page_id: id,
    page_url: p.page_url || p.url || `https://www.notion.so/${id.replace(/-/g, "")}`,
    title: p.title || "",
    teamspace_id: p.teamspace_id,
  })
  added++
}

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
console.log("Merged", added, "new pages into manifest. Total:", manifest.length)
