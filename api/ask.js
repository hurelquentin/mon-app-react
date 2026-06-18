// api/ask.js — Fonction serverless Vercel
// Moteur IA : Mistral AI — mistral-small-latest
// Format API identique à Groq/OpenAI — aucune conversion nécessaire

import fs   from "fs";
import path from "path";

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
  const p = path.join(process.cwd(), "public", "data", "pdf-index.json");
  docs    = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  console.log(`[LEX] PDFs : ${docs.length} documents indexés`);
} catch (e) {
  console.error("[LEX] Erreur pdf-index.json :", e.message);
}

try {
  const p = path.join(process.cwd(), "public", "data", "jurisprudence.json");
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
    ? pdfMatches.map(d => `### ${d.title}\n${(d.content || "").slice(0, chars)}`).join("\n\n---\n\n")
    : "Aucun extrait PDF pertinent trouvé.";

  const juriBlock = juriMatches.length
    ? juriMatches.map(j =>
        `### ${j.juridiction} — ${j.date}\nSujet : ${j.sujet}\nPrincipe : ${j.principe}\nTextes : ${(j.textes_vises||[]).join(", ")}`
      ).join("\n\n---\n\n")
    : "Aucune décision jurisprudentielle dans la base.";

  return `Question : ${question}

=== EXTRAITS PDF (${pdfMatches.length} document${pdfMatches.length > 1 ? "s" : ""}) ===
${pdfBlock}

=== JURISPRUDENCE CONNEXE ===
${juriBlock}

=== SOURCES EXTERNES ===
${extSources.map(s => `- ${s.title} : ${s.url}`).join("\n")}`.trim();
}

const SYSTEM_PROMPT = `Tu es un assistant juridique expert en droit funéraire français, spécialisé dans le CGCT et les textes réglementaires funéraires.

Règles absolues :
1. Base-toi sur TOUS les extraits PDF fournis dans le message. Utilise chaque document pertinent.
2. Cite la jurisprudence connexe si elle est fournie, avec sa référence complète (juridiction, date, textes visés, principe).
3. N'invente aucune décision de justice, article ou référence. Si l'information est absente, dis-le clairement.
4. Signale toute incertitude avec ⚠️ et recommande de vérifier en préfecture si nécessaire.
5. Ne mentionne JAMAIS de numéro de page, pagination, sommaire, table des matières, chapitre ou structure documentaire.
6. Réponds toujours en français, avec rigueur et précision professionnelle.

Format de réponse :
**Réponse directe :** [2-3 phrases de synthèse]
**Base juridique :** [articles CGCT, décrets, circulaires DGCL avec références exactes]
**Analyse :** [développement structuré s'appuyant sur tous les documents fournis]
**Jurisprudence :** [si disponible : juridiction, date, principe retenu]
⚠️ **Points de vigilance :** [risques, nuances, cas particuliers]

Termine CHAQUE réponse par ce bloc exactement :
===SUGGESTIONS===
- [question de suivi 1 ?]
- [question de suivi 2 ?]
- [question de suivi 3 ?]
===FIN===`;

// ─── APPEL API MISTRAL ────────────────────────────────────────────────────────
// Format identique à Groq et OpenAI — aucune conversion nécessaire
async function callMistral(systemPrompt, history, userMessage, apiKey) {
  console.log("[LEX] Appel Mistral (mistral-small-latest)...");

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json"
    },
    body: JSON.stringify({
      model:       "mistral-small-latest",
      messages:    [
        { role: "system", content: systemPrompt },
        ...history.map(m => ({
          role:    m.role === "assistant" ? "assistant" : "user",
          content: String(m.content || "")
        })),
        { role: "user", content: userMessage }
      ],
      temperature: 0.2,
      max_tokens:  2000
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[LEX] Mistral HTTP ${response.status} :`, errText);
    throw new Error(`Mistral ${response.status} : ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || "";

  if (!text) {
    console.error("[LEX] Réponse Mistral vide :", JSON.stringify(data).slice(0, 300));
    throw new Error("Réponse Mistral vide");
  }

  console.log(`[LEX] Mistral OK — ${text.length} caractères`);
  return text;
}

// ─── PARSING DES SUGGESTIONS ─────────────────────────────────────────────────
function parseSuggestions(rawAnswer) {
  const match = rawAnswer.match(/===SUGGESTIONS===([\s\S]*?)===FIN===/);
  if (!match) return { answer: rawAnswer.trim(), suggestions: [] };
  const answer      = rawAnswer.slice(0, rawAnswer.indexOf("===SUGGESTIONS===")).trim();
  const suggestions = match[1].split("\n")
    .map(l => l.replace(/^[-•*\d.]\s*/, "").trim())
    .filter(l => l.length > 5 && l.endsWith("?"));
  return { answer, suggestions };
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const origin = process.env.FRONTEND_URL || "*";
  res.setHeader("Access-Control-Allow-Origin",  origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Méthode non autorisée" });

  const questionRaw = (req.body?.question || "").trim();
  if (!questionRaw)
    return res.status(400).json({ answer: "Merci de saisir une question." });
  if (questionRaw.length > 2000)
    return res.status(400).json({ answer: "La question est trop longue (max 2 000 caractères)." });

  const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
  if (!MISTRAL_API_KEY) {
    console.error("[LEX] ❌ MISTRAL_API_KEY manquante dans les variables d'environnement");
    return res.status(500).json({
      answer: "Configuration manquante : MISTRAL_API_KEY non définie. Vérifiez le fichier .env"
    });
  }

  const pdfMatches  = searchPDFs(questionRaw);
  const juriMatches = searchJurisprudence(questionRaw);
  const extSources  = buildExternalSources(questionRaw);

  if (pdfMatches.length === 0) {
    return res.json({
      answer:        "Je n'ai pas trouvé d'élément suffisamment précis dans les documents disponibles. Contactez contact@adefuneraire.fr.",
      suggestions:   [],
      sources:       extSources.map(s => ({ type: "web", title: s.title, url: s.url })),
      jurisprudence: juriMatches
    });
  }

  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-6).map(m => ({
        role:    m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "")
      }))
    : [];

  const userPrompt = buildUserPrompt(questionRaw, pdfMatches, juriMatches, extSources);

  try {
    const rawReply = await callMistral(SYSTEM_PROMPT, history, userPrompt, MISTRAL_API_KEY);
    const { answer, suggestions } = parseSuggestions(rawReply);

    return res.json({
      answer,
      suggestions,
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
    console.error("[LEX] ❌ Erreur :", error.message);
    return res.status(500).json({
      answer: `Erreur : ${error.message}`
    });
  }
}
