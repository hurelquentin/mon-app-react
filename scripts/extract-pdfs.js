import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";

const pdfsDir = path.join(process.cwd(), "pdfs");
const outputDir = path.join(process.cwd(), "data");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function extractAllPdfs() {
  const files = fs.readdirSync(pdfsDir).filter(f => f.toLowerCase().endsWith(".pdf"));
  const allTexts = [];

  for (const file of files) {
    const filePath = path.join(pdfsDir, file);
    const dataBuffer = fs.readFileSync(filePath);

    const parser = new PDFParse({ data: dataBuffer });
    const data = await parser.getText();

    const text = data.text || "";
    allTexts.push({
      filename: file,
      text,
      length: text.length
    });

    console.log(`✅ ${file}: ${text.length} caractères`);
  }

  const outputPath = path.join(outputDir, "pdfs.json");
  fs.writeFileSync(outputPath, JSON.stringify(allTexts, null, 2), "utf-8");
  console.log(`✅ Base générée : ${outputPath}`);
}

extractAllPdfs().catch(console.error);