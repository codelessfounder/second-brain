#!/usr/bin/env node
/**
 * Reads fetch-batch-49-63.json (array of { pageNum, text }) and writes
 * page-49.txt through page-63.txt with the full notion-fetch text field.
 *
 * Usage (from this directory):
 *   node write-pages-from-batch.js
 *
 * Expected JSON format:
 *   [ { pageNum: 49, text: "..." }, ... ]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scriptDir = __dirname;
const inputPath = path.join(scriptDir, "fetch-batch-49-63.json");

if (!fs.existsSync(inputPath)) {
  console.error("Missing fetch-batch-49-63.json. Create it with an array of { pageNum, text } (pageNum 49..63).");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (!Array.isArray(data) || data.length === 0) {
  console.error("fetch-batch-49-63.json must be a non-empty array of { pageNum, text }.");
  process.exit(1);
}

data.forEach(({ pageNum, text }) => {
  if (pageNum == null || text == null) {
    console.error("Each item must have pageNum and text.");
    process.exit(1);
  }
  const filename = "page-" + String(pageNum).padStart(2, "0") + ".txt";
  const outPath = path.join(scriptDir, filename);
  fs.writeFileSync(outPath, text, "utf8");
  console.log("Wrote", filename);
});

console.log("Done.");