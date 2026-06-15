// api/ask.js — Fonction serverless Vercel
// Remplace backend/server.js + backend/claude.js
// La clé GROQ_API_KEY reste côté serveur, jamais exposée au navigateur.

import fs from "fs";
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
  "aussi","meme","comme","plus","moins","tres","selon","entre"
]);

// ─── CHARGEMENT DE L'INDEX AU DÉMARRAGE (cold start) ─────────────────────────
let docs = [];
try {
  const jsonPath = path.join(process.cwd(), "public", "data", "pdf-index.json");
  const raw = fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "");
  docs = JSON.parse(raw);
  console.log(`[LexFunéraire] Index chargé : ${docs.length} documents`);
} catch (e) {
  console.error("[LexFunéraire] Erreur chargement pdf-index.json :", e.message);
}

// ─── RECHERCHE PAR MOTS-CLÉS ──────────────────────────────────────────────────
function extractKeywords(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // supprime les accents pour le matching
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

function searchDocs(question) {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return [];

  return docs
    .filter(doc => doc.content)
    .map(doc => {
      const content = doc.content
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      // Score = nombre de mots-clés trouvés dans le document
      const score = keywords.reduce(
        (acc, kw) => acc + (content.includes(kw) ? 1 : 0),
        0
      );
      return { ...doc, score };
    })
    .filter(doc => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // ← Max 3 documents pour ne pas saturer le contexte IA
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — restreint à votre domaine en production
  const allowedOrigin = process.env.FRONTEND_URL || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  // Validation de la question
  const questionRaw = (req.body?.question || "").trim();
  if (!questionRaw) {
    return res.status(400).json({ answer: "Merci de saisir une question." });
  }
  if (questionRaw.length > 2000) {
    return res.status(400).json({
      answer: "La question est trop longue (maximum 2 000 caractères)."
    });
  }

  // Recherche par mots-clés dans l'index PDF
  const matches = searchDocs(questionRaw);

  // Aucun document pertinent trouvé → réponse de fallback sans appeler l'IA
  if (matches.length === 0) {
    return res.json({
      answer:
        "Je n'ai pas trouvé d'élément suffisamment précis dans les documents disponibles pour répondre avec certitude. " +
        "Vous pouvez envoyer votre demande à contact@adefuneraire.fr pour une réflexion approfondie.",
      sources: []
    });
  }

  // Construction du contexte — max 2 500 caractères par document
  const context = matches
    .map(doc => `### ${doc.title}\n${doc.content.slice(0, 2500)}`)
    .join("\n\n---\n\n");

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("[LexFunéraire] GROQ_API_KEY manquante dans les variables d'environnement");
    return res.status(500).json({ answer: "Erreur de configuration serveur." });
  }

  // Historique de conversation — max 6 messages précédents
  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-6).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content)
      }))
    : [];

  const systemPrompt = `Tu es un assistant expert en droit funéraire français, spécialisé dans le CGCT et les textes réglementaires funéraires.
Tu réponds UNIQUEMENT à partir du contexte documentaire fourni ci-dessous.
Tu ne dois jamais inventer d'information ni citer d'articles qui ne figurent pas dans le contexte.

Si le contexte permet de répondre clairement : donne une réponse structurée, précise et professionnelle.
Si le contexte est insuffisant ou ambigu : explique-le clairement et invite l'utilisateur à écrire à contact@adefuneraire.fr pour une réflexion approfondie.

Réponds toujours en français, avec rigueur et précision professionnelle.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          {
            role: "user",
            content: `Contexte documentaire :\n${context}\n\nQuestion : ${questionRaw}`
          }
        ],
        temperature: 0.2,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[LexFunéraire] Groq API error:", response.status, err);
      throw new Error(`Groq ${response.status}`);
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || "";

    return res.json({
      answer,
      sources: matches.map(doc => ({
        title: doc.title,
        filename: doc.filename
      }))
    });

  } catch (error) {
    console.error("[LexFunéraire] Erreur /api/ask :", error.message);
    return res.status(500).json({
      answer:
        "Une erreur est survenue lors du traitement de votre question. " +
        "Merci d'envoyer votre demande à contact@adefuneraire.fr pour une réflexion approfondie."
    });
  }
}
