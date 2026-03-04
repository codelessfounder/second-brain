#!/usr/bin/env node
/**
 * One-off: build notion-export.json from an array of notion-fetch style responses.
 * Each item: { title, url, text } (metadata + text from Notion MCP fetch).
 * Output: array of { page_id, page_url, title, content, teamspace_id?, object_type? }.
 */
import { writeFileSync } from "fs"

function extractContent(text) {
  const start = text.indexOf("<content>")
  const end = text.indexOf("</content>")
  if (start === -1 || end === -1) return ""
  let content = text.slice(start + 9, end)
  content = content.replace(/<empty-block\/>/g, "\n")
  content = content.replace(/\{\{[^}]*\}\}/g, "")
  content = content.replace(/<page url="[^"]*">([^<]*)<\/page>/g, "$1")
  content = content.replace(/<[^>]+>/g, " ")
  content = content.replace(/\s+/g, " ").trim()
  return content
}

function pageIdFromUrl(url) {
  const match = url.match(/notion\.so\/([a-f0-9]{32})/i)
  if (!match) return null
  const hex = match[1].toLowerCase()
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

// Paste or require fetch results here; for Phase 1 we write the export from the data below.
const fetches = [
  {
    title: "Dump",
    url: "https://www.notion.so/63e19b096357436c8e94f3d267004c35",
    text: "",
    teamspace_id: "af339680-2a72-4fc5-93db-32bd941218b5",
    object_type: "page",
  },
  // ... more entries
]

const out = fetches
  .filter((f) => f.url && f.text)
  .map((f) => ({
    page_id: pageIdFromUrl(f.url),
    page_url: f.url,
    title: f.title || "",
    content: extractContent(f.text),
    ...(f.teamspace_id && { teamspace_id: f.teamspace_id }),
    ...(f.object_type && { object_type: f.object_type }),
  }))
  .filter((e) => e.page_id && e.content.length > 0)

writeFileSync("notion-export.json", JSON.stringify(out, null, 2))
console.log("Wrote notion-export.json with", out.length, "pages")
process.exit(0)
