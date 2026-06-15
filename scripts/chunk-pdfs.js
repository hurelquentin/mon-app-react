import fs from "fs";
import path from "path";

const inputPath = path.join(process.cwd(), "data", "pdfs.json");
const chunksDir = path.join(process.cwd(), "data", "chunks");

const CHUNK_SIZE = 1200;
const OVERLAP = 200;

function chunkText(text, size = CHUNK_SIZE, overlap = OVERLAP) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > start + 200) end = lastSpace;
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    start = end - overlap;
    if (start < 0) start = 0;
    if (start >= text.length) break;
  }

  return chunks;
}

function safeName(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function main() {
  if (!fs.existsSync(inputPath)) throw new Error(`Fichier introuvable: ${inputPath}`);
  if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir, { recursive: true });

  const raw = fs.readFileSync(inputPath, "utf-8");
  const docs = JSON.parse(raw);

  let totalDocs = 0;
  let totalChunks = 0;

  for (const doc of docs) {
    const text = (doc.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    const pieces = chunkText(text);
    const outName = safeName(doc.filename || `doc_${totalDocs + 1}`) + ".json";
    const outPath = path.join(chunksDir, outName);

    const items = pieces.map((piece, index) => ({
      filename: doc.filename,
      chunkIndex: index,
      text: piece,
      length: piece.length
    }));

    fs.writeFileSync(outPath, JSON.stringify(items, null, 2), "utf-8");

    console.log(`✅ ${doc.filename}: ${pieces.length} chunks -> ${outName}`);

    totalDocs++;
    totalChunks += pieces.length;
  }

  console.log(`✅ Terminé. Documents: ${totalDocs}, chunks: ${totalChunks}`);
}

main();