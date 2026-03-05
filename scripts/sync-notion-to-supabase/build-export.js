#!/usr/bin/env node
/**
 * Build notion-export.json from raw Notion fetch responses.
 * Reads notion-raw.json (array of { page_id, title, teamspace_id, text, contentMaxLength }).
 * Strips Notion XML/tags and writes plain-text content; writes notion-export.json.
 */

import { readFileSync, writeFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_PATH = resolve(__dirname, "notion-raw.json")
const OUT_PATH = resolve(__dirname, "notion-export.json")
const MANIFEST_PATH = resolve(__dirname, "manifest.json")
const PAGES_DIR = __dirname

function formatPageId(id) {
  if (!id || typeof id !== "string") return id
  const cleaned = id.replace(/-/g, "").toLowerCase()
  if (cleaned.length !== 32) return id
  return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20, 32)}`
}

function stripNotionContent(rawText) {
  if (!rawText || typeof rawText !== "string") return ""
  let s = rawText
  // Drop intro line
  s = s.replace(/^Here is the result of[^\n]+\n/, "")
  // Extract <content>...</content>
  const contentMatch = s.match(/\n<content>\n([\s\S]*?)\n<\/content>\n/)
  if (contentMatch) s = contentMatch[1]
  // Strip Notion tags
  s = s.replace(/\n<empty-block\/>/g, "\n")
  s = s.replace(/<empty-block\/>/g, "\n")
  s = s.replace(/<page url="\{\{[^}]+\}\}">([^<]*)<\/page>/g, "$1")
  s = s.replace(/\{\{[^}]*\}\}/g, "")
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  s = s.replace(/<br\s*\/?>/gi, "\n")
  s = s.replace(/::: callout[^:]*:::/g, "")
  // Remove remaining XML-like tags but keep table structure as text
  s = s.replace(/<\/?(?:table|tr|td|th|colgroup|col)[^>]*>/gi, " ")
  s = s.replace(/<[^>]+>/g, " ")
  s = s.replace(/\s+/g, " ").replace(/\n /g, "\n").replace(/ \n/g, "\n")
  s = s.replace(/\n{3,}/g, "\n\n").trim()
  return s
}

function main() {
  let items
  try {
    const raw = readFileSync(RAW_PATH, "utf-8")
    items = JSON.parse(raw)
  } catch {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"))
    items = manifest.map((m, i) => {
      const n = String(i + 1).padStart(2, "0")
      const textPath = resolve(PAGES_DIR, `page-${n}.txt`)
      let text = ""
      try {
        text = readFileSync(textPath, "utf-8")
      } catch (e) {
        console.warn("Missing", textPath, "- run fetch and save page content first")
      }
      return { ...m, text }
    })
  }
  const MAX_CONTENT = 8000
  const out = items
    .map((item) => {
      const page_id = formatPageId(item.page_id)
      const page_url = item.page_url || `https://www.notion.so/${item.page_id.replace(/-/g, "")}`
      let content = stripNotionContent(item.text || "")
      const maxLen = item.contentMaxLength ?? MAX_CONTENT
      if (content.length > maxLen) content = content.slice(0, maxLen) + "\n[... truncated]"
      return {
        page_id,
        page_url,
        title: item.title || "Untitled",
        content,
        ...(item.teamspace_id && { teamspace_id: item.teamspace_id }),
        object_type: "page",
      }
    })
    .filter((e) => e.content.length > 0)
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf-8")
  console.log("Wrote", OUT_PATH, "with", out.length, "pages")
}

main()
