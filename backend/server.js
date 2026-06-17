// backend/server.js — Serveur Express UNIQUEMENT pour le développement local
// Moteur IA : Google Gemini 2.0 Flash

import express from "express";
import cors    from "cors";
import fs      from "fs";
import path    from "path";
import { fileURLToPath } from "url";
import dotenv  from "dotenv";
dotenv.config();

const app  = express();
const PORT = 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── MOTS VIDES ───────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  "le","la","les","de","du","des","un","une","et","est","en","que","qui",
  "dans","sur","pour","par","avec","sans","il","elle","ils","elles","je",
  "tu","nous","vous","se","ce","au","aux","son","sa","ses","mon","ma",
  "mes","ton","ta","tes","ne","pas","plus","tres","si","sont","ont",
  "etre","avoir","faire","quelles","quelle","quel","quels","comment",
  "pourquoi","quand","combien","lors","dont","leur","leurs","mais","or",
  "car","donc","cette","cet","ces","tout","tous","toute","toutes","bien",
  "aussi","meme","comme","moins","selon","entre"
]);

// ─── CHARGEMENT DES INDEX ─────────────────────────────────────────────────────
let docs   = [];
let juriDB = [];

try {
  const p = path.join(__dirname, "..", "public", "data", "pdf-index.json");
  docs    = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  console.log(`[LEX] PDFs : ${docs.length} documents indexés`);
} catch (e) {
  console.error("[LEX] Erreur pdf-index.json :", e.message);
}

try {
  const p = path.join(__dirname, "..", "public", "data", "jurisprudence.json");
  juriDB  = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  console.log(`[LEX] Jurisprudence : ${juriDB.length} décisions`);
} catch (e) {
  console.error("[LEX] Erreur jurisprudence.json :", e.message);
}

// ─── NORMALISATION ────────────────────────────────────────────────────────────
function norm(text = "") {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function keywords(text = "") {
  return norm(text).replace(/[^a-z\s-]/g, " ").split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

// ─── RECHERCHE PDFs ───────────────────────────────────────────────────────────
function searchPDFs(question) {
  const kw = keywords(question);
  if (!kw.length) return [];
  const results = docs.filter(d => d.content).map(d => {
    const c = norm(d.content);
    return { ...d, score: kw.reduce((a, k) => a + (c.includes(k) ? 1 : 0), 0) };
  }).filter(d => d.score > 0).sort((a, b) => b.score - a.score);
  console.log(`[LEX] PDFs retenus : ${results.length}/${docs.length}`);
  return results;
}

// ─── RECHERCHE JURISPRUDENCE ──────────────────────────────────────────────────
function searchJurisprudence(question) {
  const kw = keywords(question);
  if (!kw.length) return [];
  return juriDB.map(j => {
    const m = (j.mots_cles || []).map(x => norm(x)).join(" ");
    const s = norm(j.sujet || "");
    const p = norm(j.principe || "");
    const t = (j.textes_vises || []).join(" ").toLowerCase();
    let score = 0;
    kw.forEach(k => {
      if (m.includes(k)) score += 3;
      if (s.includes(k)) score += 2;
      if (t.includes(k)) score += 2;
      if (p.includes(k)) score += 1;
    });
    return { ...j, score };
  }).filter(j => j.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}

// ─── SOURCES EXTERNES ─────────────────────────────────────────────────────────
function buildExternalSources(question) {
  const q = encodeURIComponent(question);
  return [
    { title: "Légifrance — textes officiels", url: `https://www.legifrance.gouv.fr/search/all?query=${q}` },
    { title: "Résonance Funéraire",           url: `https://www.resonance-funeraire.com/recherche?q=${q}` }
  ];
}

// ─── PROMPT ───────────────────────────────────────────────────────────────────
function buildUserPrompt(question, pdfMatches, juriMatches, extSources) {
  const BUDGET = 30000;
  const chars  = pdfMatches.length > 0 ? Math.floor(BUDGET / pdfMatches.length) : BUDGET;

  const pdfBlock = pdfMatches.length
    ? pdfMatches.map(d => `### ${d.title}\n${(d.content||"").slice(0, chars)}`).join("\n\n---\n\n")
    : "Aucun extrait PDF pertinent trouvé.";

  const juriBlock = juriMatches.length
    ? juriMatches.map(j =>
        `### ${j.juridiction} — ${j.date}\nSujet : ${j.sujet}\nPrincipe : ${j.principe}\nTextes : ${(j.textes_vises||[]).join(", ")}`
      ).join("\n\n---\n\n")
    : "Aucune décision jurisprudentielle dans la base.";

  return `Question : ${question}

=== EXTRAITS PDF (${pdfMatches.length} document${pdfMatches.length>1?"s":""}) ===
${pdfBlock}

=== JURISPRUDENCE CONNEXE ===
${juriBlock}

=== SOURCES EXTERNES ===
${extSources.map(s=>`- ${s.title} : ${s.url}`).join("\n")}`.trim();
}

const SYSTEM_PROMPT = `Tu es un assistant juridique expert en droit funéraire français (CGCT, textes réglementaires, jurisprudence).

Règles :
1. Base-toi sur TOUS les extraits PDF fournis.
2. Cite la jurisprudence connexe si fournie.
3. N'invente aucune référence. Signale les incertitudes avec ⚠️.
4. Ne mentionne JAMAIS de numéro de page, sommaire, table des matières ou structure documentaire.
5. Réponds en français avec rigueur professionnelle.

Format : **Réponse directe** → **Base juridique** → **Analyse** → **Jurisprudence** → ⚠️ **Points de vigilance**

Termine par :
===SUGGESTIONS===
- [question 1 ?]
- [question 2 ?]
- [question 3 ?]
===FIN===`;

// ─── APPEL GEMINI ─────────────────────────────────────────────────────────────
async function callGemini(systemPrompt, history, userMessage, apiKey) {
  const url  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [
      ...history.map(m => ({
        role:  m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content || "") }]
      })),
      { role: "user", parts: [{ text: userMessage }] }
    ],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2000, candidateCount: 1 },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };

  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[LEX] Gemini error:", response.status, err);
    throw new Error(`Gemini ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error("Réponse Gemini vide");
  return text;
}

function parseSuggestions(raw) {
  const match = raw.match(/===SUGGESTIONS===([\s\S]*?)===FIN===/);
  if (!match) return { answer: raw.trim(), suggestions: [] };
  const answer      = raw.slice(0, raw.indexOf("===SUGGESTIONS===")).trim();
  const suggestions = match[1].split("\n")
    .map(l => l.replace(/^[-•*\d.]\s*/, "").trim())
    .filter(l => l.length > 5 && l.endsWith("?"));
  return { answer, suggestions };
}

// ─── MIDDLEWARES ──────────────────────────────────────────────────────────────
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// ─── ROUTE SANTÉ ──────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", ia: "Gemini 2.0 Flash", pdfs: docs.length, jurisprudence: juriDB.length });
});

// ─── ROUTE PRINCIPALE ─────────────────────────────────────────────────────────
app.post("/api/ask", async (req, res) => {
  const questionRaw = (req.body?.question || "").trim();
  if (!questionRaw) return res.status(400).json({ answer: "Merci de saisir une question." });
  if (questionRaw.length > 2000) return res.status(400).json({ answer: "Question trop longue." });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ answer: "GEMINI_API_KEY manquante dans .env" });

  const pdfMatches  = searchPDFs(questionRaw);
  const juriMatches = searchJurisprudence(questionRaw);
  const extSources  = buildExternalSources(questionRaw);

  if (pdfMatches.length === 0) {
    return res.json({
      answer:        "Aucun document pertinent trouvé. Contactez contact@adefuneraire.fr.",
      suggestions:   [],
      sources:       extSources.map(s => ({ type: "web", title: s.title, url: s.url })),
      jurisprudence: juriMatches
    });
  }

  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-6).map(m => ({ role: m.role, content: String(m.content || "") }))
    : [];

  const userPrompt = buildUserPrompt(questionRaw, pdfMatches, juriMatches, extSources);

  try {
    const rawReply = await callGemini(SYSTEM_PROMPT, history, userPrompt, GEMINI_API_KEY);
    const { answer, suggestions } = parseSuggestions(rawReply);

    return res.json({
      answer, suggestions,
      sources: [
        ...pdfMatches.map(d => ({ type: "pdf", title: d.title, filename: d.filename, score: d.score })),
        ...extSources.map(s  => ({ type: "web", title: s.title, url: s.url }))
      ],
      jurisprudence: juriMatches.map(j => ({
        juridiction: j.juridiction, date: j.date, numero: j.numero,
        sujet: j.sujet, principe: j.principe, textes_vises: j.textes_vises,
        url: j.url, a_verifier: j.a_verifier
      }))
    });

  } catch (error) {
    console.error("[LEX] Erreur :", error.message);
    return res.status(500).json({ answer: "Erreur serveur. Contactez contact@adefuneraire.fr." });
  }
});

// ─── DÉMARRAGE ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 [LEX] Serveur Express : http://localhost:${PORT}`);
  console.log(`   IA      : Gemini 2.0 Flash`);
  console.log(`   Santé   : http://localhost:${PORT}/api/health`);
  console.log(`   PDFs    : ${docs.length} documents`);
  console.log(`   Juris.  : ${juriDB.length} décisions\n`);
});
