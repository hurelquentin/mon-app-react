// backend/server.js — Serveur Express UNIQUEMENT pour le développement local
// En production, c'est api/ask.js (serverless Vercel) qui est utilisé.

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jsonPath = path.join(__dirname, "..", "public", "data", "pdf-index.json");

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
  const raw = fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "");
  docs = JSON.parse(raw);
  console.log(`✅ [API] Index chargé : ${docs.length} documents`);
} catch (e) {
  console.error(`❌ [API] Erreur chargement index : ${e.message}`);
  console.error(`   Vérifiez que le fichier existe : ${jsonPath}`);
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
      const score = keywords.reduce((acc, kw) => acc + (content.includes(kw) ? 1 : 0), 0);
      return { ...doc, score };
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
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
    ? pdfMatches.map((doc) => `### ${doc.title}\n${(doc.content || "").slice(0, 5000)}`).join("\n\n---\n\n")
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
- Priorise Légifrance pour les textes, codes, décrets et jurisprudence.
- Utilise les sources professionnelles seulement comme appui pratique.
- Ne mentionne jamais de pagination, de page ou de numéro de page.
- Ne donne pas de réponse trop courte si la question demande de la technique.

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

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Serveur LexFunéraire opérationnel",
    documents: docs.length,
    port: PORT
  });
});

app.post("/api/ask", async (req, res) => {
  try {
    const questionRaw = (req.body?.question || "").trim();

    if (!questionRaw) {
      return res.status(400).json({ answer: "Merci de saisir une question." });
    }
    if (questionRaw.length > 2000) {
      return res.status(400).json({ answer: "Question trop longue (max 2 000 caractères)." });
    }

    const matches = searchDocs(questionRaw);
    const externalMatches = await searchExternalSources(questionRaw);
    const prompt = buildFinalPrompt(questionRaw, matches, externalMatches);

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      console.error("❌ [API] GROQ_API_KEY manquante dans .env");
      return res.status(500).json({ answer: "Clé API Groq manquante. Vérifiez le fichier .env" });
    }

    const history = Array.isArray(req.body?.history)
      ? req.body.history.slice(-6).map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content || "")
        }))
      : [];

    const systemPrompt = `Tu es un assistant juridique spécialisé en droit funéraire français.

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
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 1800
      })
    });

    if (!response.ok) {
      const errTxt = await response.text();
      console.error(`❌ [API] Groq error ${response.status}:`, errTxt);
      throw new Error(`Groq ${response.status}`);
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || "";

    return res.json({
      answer,
      sources: [
        ...matches.map((d) => ({ title: d.title, filename: d.filename })),
        ...externalMatches.map((s) => ({ type: "web", title: s.title, url: s.url }))
      ]
    });
  } catch (error) {
    console.error("❌ [API] Erreur Groq :", error.message);
    return res.status(500).json({
      answer: "Erreur serveur. Contactez [contact@adefuneraire.fr](mailto:contact@adefuneraire.fr)."
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 [API] Serveur Express démarré`);
  console.log(`   Port   : http://localhost:${PORT}`);
  console.log(`   Santé  : http://localhost:${PORT}/api/health  ← testez ici`);
  console.log(`   Route  : POST http://localhost:${PORT}/api/ask`);
  console.log(`\n⚠️  Ne pas ouvrir /api/ask dans le navigateur (GET → erreur)`);
  console.log(`   Ouvrez l'interface sur : http://localhost:5173\n`);
});