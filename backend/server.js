// backend/server.js — Serveur Express pour développement local uniquement
// Moteur IA : Mistral AI — mistral-small-latest

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
function norm(t = "") {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function keywords(t = "") {
  return norm(t).replace(/[^a-z\s-]/g, " ").split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

// ─── RECHERCHE PDFs ───────────────────────────────────────────────────────────
function searchPDFs(question) {
  const kw = keywords(question);
  if (!kw.length) return [];
  const r = docs.filter(d => d.content).map(d => {
    const c = norm(d.content);
    return { ...d, score: kw.reduce((a, k) => a + (c.includes(k) ? 1 : 0), 0) };
  }).filter(d => d.score > 0).sort((a, b) => b.score - a.score);
  console.log(`[LEX] PDFs retenus : ${r.length}/${docs.length}`);
  return r;
}

// ─── RECHERCHE JURISPRUDENCE ──────────────────────────────────────────────────
function searchJurisprudence(question) {
  const kw = keywords(question);
  if (!kw.length) return [];
  return juriDB.map(j => {
    const m = (j.mots_cles||[]).map(x=>norm(x)).join(" ");
    const s = norm(j.sujet||""), p = norm(j.principe||"");
    const t = (j.textes_vises||[]).join(" ").toLowerCase();
    let score = 0;
    kw.forEach(k => {
      if (m.includes(k)) score+=3; if (s.includes(k)) score+=2;
      if (t.includes(k)) score+=2; if (p.includes(k)) score+=1;
    });
    return { ...j, score };
  }).filter(j => j.score > 0).sort((a,b) => b.score-a.score).slice(0,3);
}

// ─── SOURCES EXTERNES ─────────────────────────────────────────────────────────
function buildExternalSources(question) {
  const q = encodeURIComponent(question);
  return [
    { title: "Légifrance", url: `https://www.legifrance.gouv.fr/search/all?query=${q}` },
    { title: "Résonance Funéraire", url: `https://www.resonance-funeraire.com/recherche?q=${q}` }
  ];
}

// ─── PROMPT ───────────────────────────────────────────────────────────────────
function buildUserPrompt(question, pdfMatches, juriMatches, extSources) {
  const chars = pdfMatches.length > 0 ? Math.floor(30000 / pdfMatches.length) : 30000;
  const pdfBlock = pdfMatches.length
    ? pdfMatches.map(d => `### ${d.title}\n${(d.content||"").slice(0,chars)}`).join("\n\n---\n\n")
    : "Aucun extrait PDF pertinent.";
  const juriBlock = juriMatches.length
    ? juriMatches.map(j=>`### ${j.juridiction} — ${j.date}\nSujet : ${j.sujet}\nPrincipe : ${j.principe}\nTextes : ${(j.textes_vises||[]).join(", ")}`).join("\n\n---\n\n")
    : "Aucune jurisprudence trouvée.";
  return `Question : ${question}\n\n=== EXTRAITS PDF ===\n${pdfBlock}\n\n=== JURISPRUDENCE ===\n${juriBlock}\n\n=== SOURCES ===\n${extSources.map(s=>`- ${s.title} : ${s.url}`).join("\n")}`.trim();
}

const SYSTEM_PROMPT = `Tu es un assistant juridique expert en droit funéraire français (CGCT, textes réglementaires, jurisprudence).
Règles : utilise tous les PDFs fournis, cite la jurisprudence avec référence complète, n'invente aucun article, signale les incertitudes avec ⚠️, ne mentionne jamais de numéro de page ou de structure documentaire, réponds en français avec rigueur.
Format : **Réponse directe** → **Base juridique** → **Analyse** → **Jurisprudence** → ⚠️ **Points de vigilance**
Termine par :
===SUGGESTIONS===
- [question 1 ?]
- [question 2 ?]
- [question 3 ?]
===FIN===`;

// ─── APPEL MISTRAL ────────────────────────────────────────────────────────────
async function callMistral(systemPrompt, history, userMessage, apiKey) {
  console.log("[LEX] Appel Mistral (mistral-small-latest)...");
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content||"") })),
        { role: "user", content: userMessage }
      ],
      temperature: 0.2,
      max_tokens:  2000
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[LEX] Mistral HTTP ${response.status} :`, err);
    throw new Error(`Mistral ${response.status} : ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("Réponse Mistral vide");
  console.log(`[LEX] Mistral OK — ${text.length} caractères`);
  return text;
}

function parseSuggestions(raw) {
  const match = raw.match(/===SUGGESTIONS===([\s\S]*?)===FIN===/);
  if (!match) return { answer: raw.trim(), suggestions: [] };
  const answer = raw.slice(0, raw.indexOf("===SUGGESTIONS===")).trim();
  const suggestions = match[1].split("\n")
    .map(l => l.replace(/^[-•*\d.]\s*/, "").trim())
    .filter(l => l.length > 5 && l.endsWith("?"));
  return { answer, suggestions };
}

// ─── MIDDLEWARES ──────────────────────────────────────────────────────────────
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", ia: "Mistral mistral-small-latest", pdfs: docs.length, jurisprudence: juriDB.length });
});

app.post("/api/ask", async (req, res) => {
  const questionRaw = (req.body?.question || "").trim();
  if (!questionRaw) return res.status(400).json({ answer: "Question manquante." });

  const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
  if (!MISTRAL_API_KEY) {
    console.error("[LEX] ❌ MISTRAL_API_KEY manquante");
    return res.status(500).json({ answer: "MISTRAL_API_KEY manquante dans .env" });
  }

  const pdfMatches  = searchPDFs(questionRaw);
  const juriMatches = searchJurisprudence(questionRaw);
  const extSources  = buildExternalSources(questionRaw);

  if (pdfMatches.length === 0) {
    return res.json({ answer: "Aucun document pertinent. Contactez contact@adefuneraire.fr.", suggestions: [], sources: [], jurisprudence: [] });
  }

  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-6).map(m => ({ role: m.role, content: String(m.content||"") }))
    : [];

  try {
    const rawReply = await callMistral(SYSTEM_PROMPT, history, buildUserPrompt(questionRaw, pdfMatches, juriMatches, extSources), MISTRAL_API_KEY);
    const { answer, suggestions } = parseSuggestions(rawReply);
    return res.json({
      answer, suggestions,
      sources: [
        ...pdfMatches.map(d => ({ type:"pdf", title:d.title, filename:d.filename, score:d.score })),
        ...extSources.map(s  => ({ type:"web", title:s.title, url:s.url }))
      ],
      jurisprudence: juriMatches.map(j => ({ juridiction:j.juridiction, date:j.date, numero:j.numero, sujet:j.sujet, principe:j.principe, textes_vises:j.textes_vises, url:j.url, a_verifier:j.a_verifier }))
    });
  } catch (error) {
    console.error("[LEX] ❌ Erreur :", error.message);
    return res.status(500).json({ answer: `Erreur : ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 [LEX] Serveur Express : http://localhost:${PORT}`);
  console.log(`   IA      : Mistral AI (mistral-small-latest)`);
  console.log(`   Santé   : http://localhost:${PORT}/api/health`);
  console.log(`   PDFs    : ${docs.length} documents`);
  console.log(`   Juris.  : ${juriDB.length} décisions\n`);
});
