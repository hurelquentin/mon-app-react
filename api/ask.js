// api/ask.js — Fonction serverless Vercel
// PDF-first RAG + sources externes · Clé API côté serveur uniquement

import fs   from "fs";
import path from "path";

// ─── MOTS VIDES FRANÇAIS ─────────────────────────────────────────────────────
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

// ─── CHARGEMENT INDEX PDF ─────────────────────────────────────────────────────
let docs = [];
try {
  const jsonPath = path.join(process.cwd(), "public", "data", "pdf-index.json");
  const raw      = fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "");
  docs           = JSON.parse(raw);
  console.log(`[LexFunéraire] Index chargé : ${docs.length} documents`);
} catch (e) {
  console.error("[LexFunéraire] Erreur chargement pdf-index.json :", e.message);
}

// ─── NORMALISATION ────────────────────────────────────────────────────────────
function normalize(text = "") {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function extractKeywords(text = "") {
  return normalize(text)
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

// ─── RECHERCHE DANS LES PDFs ──────────────────────────────────────────────────
function searchDocs(question) {
  const keywords = extractKeywords(question);
  if (!keywords.length) return [];

  return docs
    .filter(doc => doc.content)
    .map(doc => {
      const content = normalize(doc.content);
      const score   = keywords.reduce((acc, kw) => acc + (content.includes(kw) ? 1 : 0), 0);
      return { ...doc, score };
    })
    .filter(doc => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ─── SOURCES EXTERNES (liens de recherche ciblés) ─────────────────────────────
function buildExternalSources(question) {
  const q = encodeURIComponent(question);
  return [
    {
      title: "Légifrance — textes officiels",
      url:   `https://www.legifrance.gouv.fr/search/all?query=${q}`
    },
    {
      title: "Résonance Funéraire",
      url:   `https://www.resonance-funeraire.com/recherche?q=${q}`
    },
    {
      title: "Funéraire Magazine",
      url:   `https://www.google.com/search?q=site%3Afuneraire-magazine.fr+${q}`
    }
  ];
}

// ─── CONSTRUCTION DU PROMPT UTILISATEUR ──────────────────────────────────────
function buildUserPrompt(question, pdfMatches, externalSources) {
  const pdfBlock = pdfMatches.length
    ? pdfMatches
        .map(doc => `### ${doc.title}\n${(doc.content || "").slice(0, 5000)}`)
        .join("\n\n---\n\n")
    : "Aucun extrait PDF pertinent trouvé pour cette question.";

  const extBlock = externalSources
    .map(s => `- ${s.title} : ${s.url}`)
    .join("\n");

  return `Question : ${question}

Extraits PDF disponibles :
${pdfBlock}

Sources externes de référence (à mentionner si pertinent) :
${extBlock}`.trim();
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es un assistant juridique expert en droit funéraire français, spécialisé dans le CGCT et les textes réglementaires funéraires.

Règles absolues de réponse :
1. Base-toi en priorité sur les extraits PDF fournis dans le message utilisateur.
2. Si les PDF ne suffisent pas, complète avec des sources juridiques officielles (Légifrance, textes de loi).
3. Tu peux mentionner les sources professionnelles (Résonance Funéraire, Funéraire Magazine) comme appui pratique.
4. N'invente jamais de règle juridique, d'article ou de jurisprudence.
5. Si une information est incertaine, précise qu'elle doit être vérifiée auprès de la préfecture ou d'un juriste.

Règles de rédaction strictes :
- Ne mentionne JAMAIS de numéro de page, de pagination, de renvoi à un sommaire, de table des matières, de chapitre, de section documentaire ou de toute référence à la structure physique d'un document.
- Ne dis pas "voir page X", "cf. page X", "au chapitre X", "dans la partie X du document", "selon le sommaire", "en page X du guide", ni aucune formule équivalente.
- Cite uniquement le titre du document source ou le nom du texte législatif, jamais sa structure interne.
- Donne une réponse complète, technique et nuancée. Évite les réponses trop courtes sur des sujets techniques.
- Réponds toujours en français, avec rigueur et précision professionnelle.

Format de réponse attendu :
1. Réponse directe (2-3 phrases de synthèse)
2. Base juridique applicable (articles CGCT, décrets, circulaires DGCL)
3. Analyse technique détaillée
4. Points de vigilance (⚠️)
5. Sources utilisées (titres uniquement, sans référence de page)`;

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  const origin = process.env.FRONTEND_URL || "*";
  res.setHeader("Access-Control-Allow-Origin",  origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Méthode non autorisée" });

  // Validation
  const questionRaw = (req.body?.question || "").trim();
  if (!questionRaw)
    return res.status(400).json({ answer: "Merci de saisir une question." });
  if (questionRaw.length > 2000)
    return res.status(400).json({ answer: "La question est trop longue (max 2 000 caractères)." });

  // Clé API
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("[LexFunéraire] GROQ_API_KEY manquante");
    return res.status(500).json({ answer: "Erreur de configuration serveur." });
  }

  // Recherche
  const pdfMatches     = searchDocs(questionRaw);
  const externalSources = buildExternalSources(questionRaw);

  // Historique (max 6 messages précédents)
  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-6).map(m => ({
        role:    m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "")
      }))
    : [];

  // Construction du prompt utilisateur (une seule fois)
  const userPrompt = buildUserPrompt(questionRaw, pdfMatches, externalSources);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model:      "llama-3.3-70b-versatile",
        messages:   [
          { role: "system",    content: SYSTEM_PROMPT },
          ...history,
          { role: "user",      content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens:  1800
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[LexFunéraire] Groq error:", response.status, err);
      throw new Error(`Groq ${response.status}`);
    }

    const data   = await response.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || "";

    return res.json({
      answer,
      sources: [
        ...pdfMatches.map(doc => ({
          type:     "pdf",
          title:    doc.title,
          filename: doc.filename
        })),
        ...externalSources.map(s => ({
          type:  "web",
          title: s.title,
          url:   s.url
        }))
      ]
    });

  } catch (error) {
    console.error("[LexFunéraire] Erreur /api/ask :", error.message);
    return res.status(500).json({
      answer: "Une erreur est survenue lors du traitement de votre question. " +
              "Merci de contacter contact@adefuneraire.fr pour une réflexion approfondie."
    });
  }
}
