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
const __dirname  = path.dirname(__filename);
const jsonPath   = path.join(__dirname, "..", "public", "data", "pdf-index.json");

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

// ─── CHARGEMENT DE L'INDEX ───────────────────────────────────────────────────
let docs = [];
try {
  const raw = fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "");
  docs = JSON.parse(raw);
  console.log(`✅ [API] Index chargé : ${docs.length} documents`);
} catch (e) {
  console.error(`❌ [API] Erreur chargement index : ${e.message}`);
  console.error(`   Vérifiez que le fichier existe : ${jsonPath}`);
}

// ─── RECHERCHE PAR MOTS-CLÉS ─────────────────────────────────────────────────
function extractKeywords(text) {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
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
      const content = doc.content.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const score = keywords.reduce(
        (acc, kw) => acc + (content.includes(kw) ? 1 : 0), 0
      );
      return { ...doc, score };
    })
    .filter(doc => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ─── MIDDLEWARES ─────────────────────────────────────────────────────────────
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// ─── ROUTE SANTÉ (GET) ───────────────────────────────────────────────────────
// Permet de vérifier que l'API est bien démarrée sans ouvrir /api/ask
// Testez dans le navigateur : http://localhost:3001/api/health
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Serveur LexFunéraire opérationnel",
    documents: docs.length,
    port: PORT
  });
});

// ─── ROUTE PRINCIPALE (POST uniquement) ──────────────────────────────────────
app.post("/api/ask", async (req, res) => {
  const questionRaw = (req.body?.question || "").trim();

  if (!questionRaw) {
    return res.status(400).json({ answer: "Merci de saisir une question." });
  }
  if (questionRaw.length > 2000) {
    return res.status(400).json({ answer: "Question trop longue (max 2 000 caractères)." });
  }

  const matches = searchDocs(questionRaw);

  if (matches.length === 0) {
    return res.json({
      answer:
        "Je n'ai pas trouvé d'élément suffisamment précis dans les documents disponibles. " +
        "Vous pouvez contacter contact@adefuneraire.fr pour une réflexion approfondie.",
      sources: []
    });
  }

  const context = matches
    .map(doc => `### ${doc.title}\n${doc.content.slice(0, 2500)}`)
    .join("\n\n---\n\n");

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("❌ [API] GROQ_API_KEY manquante dans .env");
    return res.status(500).json({ answer: "Clé API Groq manquante. Vérifiez le fichier .env" });
  }

  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-6).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content)
      }))
    : [];

  const systemPrompt = `Tu es un assistant expert en droit funéraire français.
Tu réponds UNIQUEMENT à partir du contexte documentaire fourni.
Tu ne dois jamais inventer d'information.
Réponds toujours en français, avec rigueur professionnelle.`;

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
          { role: "user", content: `Contexte :\n${context}\n\nQuestion : ${questionRaw}` }
        ],
        temperature: 0.2,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errTxt = await response.text();
      console.error(`❌ [API] Groq error ${response.status}:`, errTxt);
      throw new Error(`Groq ${response.status}`);
    }

    const data   = await response.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || "";

    return res.json({
      answer,
      sources: matches.map(d => ({ title: d.title, filename: d.filename }))
    });

  } catch (error) {
    console.error("❌ [API] Erreur Groq :", error.message);
    return res.status(500).json({
      answer: "Erreur serveur. Contactez contact@adefuneraire.fr."
    });
  }
});

// ─── DÉMARRAGE ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 [API] Serveur Express démarré`);
  console.log(`   Port   : http://localhost:${PORT}`);
  console.log(`   Santé  : http://localhost:${PORT}/api/health  ← testez ici`);
  console.log(`   Route  : POST http://localhost:${PORT}/api/ask`);
  console.log(`\n⚠️  Ne pas ouvrir /api/ask dans le navigateur (GET → erreur)`);
  console.log(`   Ouvrez l'interface sur : http://localhost:5173\n`);
});
