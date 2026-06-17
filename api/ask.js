// api/ask.js — Fonction serverless Vercel
// PDF-first RAG · TOUS les PDFs correspondants · Jurisprudence · Questions connexes

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
  return norm(text)
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

// ─── RECHERCHE PDFs — TOUS LES DOCUMENTS PERTINENTS ──────────────────────────
// Plus de limite à 3 : tous les PDFs avec au moins 1 mot-clé sont retournés,
// triés par score décroissant.
function searchPDFs(question) {
  const kw = keywords(question);
  if (!kw.length) return [];

  const results = docs
    .filter(d => d.content)
    .map(d => {
      const c = norm(d.content);
      const score = kw.reduce((acc, k) => acc + (c.includes(k) ? 1 : 0), 0);
      return { ...d, score };
    })
    .filter(d => d.score > 0)           // au moins 1 mot-clé trouvé
    .sort((a, b) => b.score - a.score); // meilleurs en premier

  console.log(`[LEX] PDFs retenus : ${results.length}/${docs.length} (question : "${question.slice(0, 60)}...")`);
  return results;
}

// ─── RECHERCHE JURISPRUDENCE ──────────────────────────────────────────────────
function searchJurisprudence(question) {
  const kw = keywords(question);
  if (!kw.length) return [];

  return juriDB
    .map(j => {
      const motsCles  = (j.mots_cles || []).map(m => norm(m)).join(" ");
      const sujetStr  = norm(j.sujet    || "");
      const princStr  = norm(j.principe || "");
      const textesStr = (j.textes_vises || []).join(" ").toLowerCase();

      let score = 0;
      kw.forEach(k => {
        if (motsCles.includes(k))  score += 3;
        if (sujetStr.includes(k))  score += 2;
        if (textesStr.includes(k)) score += 2;
        if (princStr.includes(k))  score += 1;
      });
      return { ...j, score };
    })
    .filter(j => j.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ─── SOURCES EXTERNES ─────────────────────────────────────────────────────────
function buildExternalSources(question) {
  const q = encodeURIComponent(question);
  return [
    { title: "Légifrance — textes officiels",  url: `https://www.legifrance.gouv.fr/search/all?query=${q}` },
    { title: "Résonance Funéraire",             url: `https://www.resonance-funeraire.com/recherche?q=${q}` }
  ];
}

// ─── CONSTRUCTION DU PROMPT — ALLOCATION DYNAMIQUE DU CONTENU ────────────────
// Budget total : 30 000 caractères pour les PDFs.
// Ce budget est réparti équitablement entre tous les documents retenus :
//   1 doc  → 30 000 chars      4 docs → 7 500 chars chacun
//   2 docs → 15 000 chars      6 docs → 5 000 chars chacun
//   3 docs → 10 000 chars      8 docs → 3 750 chars chacun
function buildUserPrompt(question, pdfMatches, juriMatches, extSources) {
  const BUDGET_TOTAL = 30000;
  const charsPerDoc  = pdfMatches.length > 0
    ? Math.floor(BUDGET_TOTAL / pdfMatches.length)
    : BUDGET_TOTAL;

  const pdfBlock = pdfMatches.length
    ? pdfMatches
        .map(d => `### ${d.title} (score: ${d.score})\n${(d.content || "").slice(0, charsPerDoc)}`)
        .join("\n\n---\n\n")
    : "Aucun extrait PDF pertinent trouvé.";

  const juriBlock = juriMatches.length
    ? juriMatches.map(j =>
        `### ${j.juridiction} — ${j.date}\n` +
        `Sujet : ${j.sujet}\n` +
        `Principe : ${j.principe}\n` +
        `Textes visés : ${(j.textes_vises || []).join(", ")}`
      ).join("\n\n---\n\n")
    : "Aucune décision jurisprudentielle dans la base.";

  const extBlock = extSources.map(s => `- ${s.title} : ${s.url}`).join("\n");

  return `Question : ${question}

=== EXTRAITS PDF (${pdfMatches.length} document${pdfMatches.length > 1 ? "s" : ""} · ${charsPerDoc} car. max chacun) ===
${pdfBlock}

=== JURISPRUDENCE CONNEXE ===
${juriBlock}

=== SOURCES EXTERNES ===
${extBlock}`.trim();
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es un assistant juridique expert en droit funéraire français (CGCT, textes réglementaires, jurisprudence).

Règles de contenu :
1. Base-toi en priorité sur les extraits PDF fournis dans le message. Tous les documents fournis sont pertinents, utilise-les tous.
2. Cite la jurisprudence connexe si elle est fournie, avec sa référence complète.
3. N'invente aucune décision de justice, article ou référence.
4. Si une information est incertaine, signale-le avec ⚠️.

Règles de rédaction :
- Ne mentionne JAMAIS de numéro de page, de pagination, de sommaire, de table des matières, de chapitre ou de renvoi à la structure d'un document.
- Cite uniquement le titre du texte ou de la décision, jamais sa structure interne.
- Réponds toujours en français, avec rigueur et précision professionnelle.

Format de réponse (respecter rigoureusement) :
**Réponse directe :** [2-3 phrases de synthèse]

**Base juridique :** [articles CGCT, décrets, circulaires]

**Analyse :** [développement structuré en s'appuyant sur TOUS les documents fournis]

**Jurisprudence :** [si disponible : juridiction, date, principe retenu]

⚠️ **Points de vigilance :** [risques, nuances, cas particuliers]

---
Termine CHAQUE réponse par ce bloc exactement, sans exception :

===SUGGESTIONS===
- [question de suivi pertinente 1 ?]
- [question de suivi pertinente 2 ?]
- [question de suivi pertinente 3 ?]
===FIN===`;

// ─── PARSING DES SUGGESTIONS ─────────────────────────────────────────────────
function parseSuggestions(rawAnswer) {
  const match = rawAnswer.match(/===SUGGESTIONS===([\s\S]*?)===FIN===/);
  if (!match) return { answer: rawAnswer.trim(), suggestions: [] };

  const answer      = rawAnswer.slice(0, rawAnswer.indexOf("===SUGGESTIONS===")).trim();
  const suggestions = match[1]
    .split("\n")
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

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("[LEX] GROQ_API_KEY manquante");
    return res.status(500).json({ answer: "Erreur de configuration serveur." });
  }

  const pdfMatches   = searchPDFs(questionRaw);
  const juriMatches  = searchJurisprudence(questionRaw);
  const extSources   = buildExternalSources(questionRaw);

  // Fallback si aucun PDF ne correspond
  if (pdfMatches.length === 0) {
    return res.json({
      answer:        "Je n'ai pas trouvé d'élément suffisamment précis dans les documents disponibles. Vous pouvez contacter contact@adefuneraire.fr pour une réflexion approfondie.",
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
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model:       "llama-3.3-70b-versatile",
        messages:    [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user",   content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens:  2000
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[LEX] Groq error:", response.status, err);
      throw new Error(`Groq ${response.status}`);
    }

    const data     = await response.json();
    const rawReply = data?.choices?.[0]?.message?.content?.trim() || "";
    const { answer, suggestions } = parseSuggestions(rawReply);

    return res.json({
      answer,
      suggestions,
      sources: [
        ...pdfMatches.map(d => ({ type: "pdf",  title: d.title,    filename: d.filename, score: d.score })),
        ...extSources.map(s  => ({ type: "web",  title: s.title,    url: s.url }))
      ],
      jurisprudence: juriMatches.map(j => ({
        juridiction:  j.juridiction,
        date:         j.date,
        numero:       j.numero,
        sujet:        j.sujet,
        principe:     j.principe,
        textes_vises: j.textes_vises,
        url:          j.url,
        a_verifier:   j.a_verifier
      }))
    });

  } catch (error) {
    console.error("[LEX] Erreur :", error.message);
    return res.status(500).json({
      answer: "Une erreur est survenue. Merci de contacter contact@adefuneraire.fr."
    });
  }
}
