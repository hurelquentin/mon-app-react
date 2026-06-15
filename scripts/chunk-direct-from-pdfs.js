import fs from "fs";
import path from "path";
import pdfParse from "@cedrugs/pdf-parse";

const pdfsDir = path.join(process.cwd(), "pdfs");
const chunksDir = path.join(process.cwd(), "data", "chunks");

const CHUNK_SIZE = 900;
const OVERLAP = 150;

function chunkText(text, size = CHUNK_SIZE, overlap = OVERLAP) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > start + 100) end = lastSpace;
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

async function main() {
  if (!fs.existsSync(pdfsDir)) throw new Error(`Dossier introuvable: ${pdfsDir}`);
  if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir, { recursive: true });

  const files = fs.readdirSync(pdfsDir).filter(f => f.toLowerCase().endsWith(".pdf"));

  for (const file of files) {
    console.log(`➡️  ${file}`);

    const filePath = path.join(pdfsDir, file);
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    const text = (data.text || "").replace(/\s+/g, " ").trim();

    if (!text) {
      console.log(`⚠️  aucun texte exploitable`);
      continue;
    }

    const pieces = chunkText(text);
    const outName = safeName(file) + ".json";
    const outPath = path.join(chunksDir, outName);

    const out = fs.createWriteStream(outPath, { encoding: "utf-8" });
    out.write("[\n");

    for (let i = 0; i < pieces.length; i++) {
      const item = {
        filename: file,
        chunkIndex: i,
        text: pieces[i],
        length: pieces[i].length
      };

      if (i > 0) out.write(",\n");
      out.write(JSON.stringify(item, null, 2));

      if (i % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    out.write("\n]\n");
    out.end();

    console.log(`✅ ${pieces.length} chunks écrits dans ${outName}`);

    await new Promise(resolve => setImmediate(resolve));
  }

  console.log("✅ Terminé.");
}

main().catch(err => {
  console.error("❌", err);
  process.exit(1);
});