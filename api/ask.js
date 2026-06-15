// api/ask.js — Fonction serverless Vercel
// Remplace backend/server.js + backend/claude.js
// La clé GROQ_API_KEY reste côté serveur, jamais exposée au navigateur.

import fs from "fs";
import path from "path";

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

let docs = [];
try {
  const jsonPath = path.join(process.cwd(), "public", "data", "pdf-index.json");
  const raw = fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "");
  docs = JSON.parse(raw);
  console.log(`[LexFunéraire] Index chargé : ${docs.length} documents`);
} catch (e) {
  console.error("[LexFunéraire] Erreur chargement pdf-index.json :", e.message);
}

function normalizeText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractKeywords(text = "") {
  return normalizeText(text)
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

function searchDocs(question) {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return [];

  return docs
    .filter((doc) => doc.content)
    .map((doc) => {
      const content = normalizeText(doc.content);
      const score = keywords.reduce(
        (acc, kw) => acc + (content.includes(kw) ? 1 : 0),
        0
      );
      return { ...doc, score };
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

async function searchExternalSources(question) {
  return [
    {
      title: "Légifrance",
      url: `https://www.legifrance.gouv.fr/search/all?query=${encodeURIComponent(question)}`
    },
    {
      title: "Résonance Funéraire",
      url: `https://www.resonance-funeraire.com/recherche?q=${encodeURIComponent(question)}`
    },
    {
      title: "Funéraire Magazine",
      url: `https://www.google.com/search?q=site%3Afuneraire-magazine.fr+${encodeURIComponent(question)}`
    }
  ];
}

function buildFinalPrompt(question, pdfMatches, externalMatches) {
  const pdfContext = pdfMatches.length
    ? pdfMatches
        .map((doc) => `### ${doc.title}\n${(doc.content || "").slice(0, 5000)}`)
        .join("\n\n---\n\n")
    : "Aucun extrait PDF pertinent trouvé.";

  const externalContext = externalMatches.length
    ? externalMatches.map((s) => `- ${s.title}: ${s.url}`).join("\n")
    : "Aucune source externe ajoutée.";

  return `
Tu es un assistant juridique spécialisé en droit funéraire français.

Consignes :
- Réponds de manière complète, technique et structurée.
- Base-toi d’abord sur les documents PDF fournis.
- Si nécessaire, complète avec des sources externes fiables.
- Priorise Légifrance pour les textes, codes, décrets, jurisprudence et références officielles.
- Utilise les sources professionnelles comme Résonance Funéraire ou Funéraire Magazine comme appui pratique.
- Ne mentionne jamais de pagination, de page ou de numéro de page.
- Ne donne pas de réponse trop courte si la question demande de la technique.
- Ne cite que des sources réelles et vérifiables.

Question de l'utilisateur :
${question}

Extraits PDF :
${pdfContext}

Sources externes :
${externalContext}

Format attendu :
1. Réponse directe.
2. Base juridique.
3. Analyse technique.
4. Points de vigilance.
5. Sources utilisées.
`.trim();
}

export default async function handler(req, res) {
  const allowedOrigin = process.env.FRONTEND_URL || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const questionRaw = (req.body?.question || "").trim();
  if (!questionRaw) {
    return res.status(400).json({ answer: "Merci de saisir une question." });
  }
  if (questionRaw.length > 2000) {
    return res.status(400).json({
      answer: "La question est trop longue (maximum 2 000 caractères)."
    });
  }

  const matches = searchDocs(questionRaw);
  const externalMatches = await searchExternalSources(questionRaw);

  const pdfContext = matches.length
    ? matches
        .map((doc) => `### ${doc.title}\n${(doc.content || "").slice(0, 5000)}`)
        .join("\n\n---\n\n")
    : "Aucun extrait PDF pertinent trouvé.";

  const externalContext = externalMatches.length
    ? externalMatches.map((s) => `- ${s.title}: ${s.url}`).join("\n")
    : "Aucune source externe ajoutée.";

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("[LexFunéraire] GROQ_API_KEY manquante dans les variables d'environnement");
    return res.status(500).json({ answer: "Erreur de configuration serveur." });
  }

  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-6).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "")
      }))
    : [];

  const systemPrompt = `Tu es un assistant expert en droit funéraire français, spécialisé dans le CGCT et les textes réglementaires funéraires.

Tu dois répondre en t'appuyant d'abord sur les extraits PDF fournis, puis compléter si nécessaire avec des sources externes fiables.

Priorité de réponse :
1. Utilise d’abord les documents PDF fournis.
2. Si les PDF ne suffisent pas, complète avec des sources externes fiables.
3. Priorise Légifrance pour les textes, articles, décrets, codes et jurisprudence.
4. Complète éventuellement avec des sources professionnelles reconnues du secteur funéraire comme Résonance Funéraire et Funéraire Magazine.
5. Ne mentionne jamais de paginage, de page, ou de numéro de page.
6. Réponds de façon complète, technique, structurée et nuancée.
7. Si une information vient d’une source PDF, cite seulement le document ou le titre, pas la page.
8. Si une information externe est utilisée, indique clairement la source.
9. N’invente jamais de règle juridique.
10. Si un point est incertain, précise qu’il doit être vérifié.

Tu ne dois jamais inventer d'information. Réponds toujours en français, avec rigueur professionnelle.`;

  const finalPrompt = buildFinalPrompt(questionRaw, matches, externalMatches);

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
            content: finalPrompt
          }
        ],
        temperature: 0.2,
        max_tokens: 1800
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
      sources: [
        ...matches.map((doc) => ({
          type: "pdf",
          title: doc.title,
          filename: doc.filename
        })),
        ...externalMatches.map((s) => ({
          type: "web",
          title: s.title,
          url: s.url
        }))
      ]
    });
  } catch (error) {
    console.error("[LexFunéraire] Erreur /api/ask :", error.message);
    return res.status(500).json({
      answer:
        "Une erreur est survenue lors du traitement de votre question. " +
        "Merci d'envoyer votre demande à [contact@adefuneraire.fr](mailto:contact@adefuneraire.fr) pour une réflexion approfondie."
    });
  }
}