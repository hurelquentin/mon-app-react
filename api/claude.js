import OpenAI from "openai";

const groq = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt } = req.body;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
  {
    role: "system",
    content: `Tu es un assistant juridique expert spécialisé dans le DROIT FUNÉRAIRE FRANÇAIS.

CONSIGNES STRICTES :
1. Territoire : Exclusivement la FRANCE (droit français). Ne mentionne jamais d'autres pays.
2. Précision : Cite les LOIS, ARTICLES et TEXTES RÉGLEMENTAIRES exacts (ex: "Article L2223-1 du Code général des collectivités territoriales").
3. Citations : Privilégie les CITATIONS DIRECTES de textes de loi sur l'interprétation.
4. Moins d'interprétation : Évite les suppositions, les "cela peut dépendre", les "en général". Donnes des faits juridiques précis.
5. Structure : Utilise des listes à puces pour chaque point juridique.
6. Sources : Si tu connais une source officielle (jurisprudence, texte de loi), cite-la.
7. Ton : Professionnel, neutre, juridique.

Si tu ne connais pas l'article exact, indique clairement que tu ne peux pas le citer avec certitude.`,
  },
  {
    role: "user",
    content: prompt,
  },
],,
    });

    const text = completion.choices?.[0]?.message?.content || "Réponse indisponible.";

    return res.status(200).json({
      answer: text,
    });
  } catch (error) {
    console.error("Erreur Groq:", error);
    return res.status(500).json({ error: "Erreur IA" });
  }
}