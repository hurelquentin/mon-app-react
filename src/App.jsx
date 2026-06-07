import { useState, useRef, useEffect } from "react";

// ─── PALETTE ──────────────────────────────────────────────────────────────────
// Aucune teinte bleue dans les textes.
// Texte primaire  : #f0ece6 (blanc chaud)
// Texte secondaire: #b8b4ae (gris neutre clair)
// Texte atténué   : #888480 (gris moyen)
// Texte faint     : #666260 (gris foncé)
// Accent or       : #c9a84c / #e0c060
// Fond principal  : #0c1018 (charbon)
// Fond carte      : #111118 (neutre sombre)

const CATEGORIES = [
  { icon: "🏛️", label: "Concessions funéraires",  query: "Quelles sont les règles applicables aux concessions funéraires : durée, renouvellement et procédure de reprise par la commune ?" },
  { icon: "🚐", label: "Transport de corps",       query: "Quelles sont les obligations légales pour le transport de corps avant et après mise en bière, notamment les autorisations requises ?" },
  { icon: "📋", label: "Habilitation funéraire",   query: "Quelles sont les conditions d'obtention, de renouvellement et de retrait de l'habilitation funéraire pour une entreprise ?" },
  { icon: "⚖️", label: "Police des funérailles",   query: "Qui détient la police des funérailles, quels sont ses pouvoirs et quelles sont les limites de son autorité en matière funéraire ?" },
  { icon: "🔥", label: "Crémation",                query: "Quelles sont les conditions légales, les autorisations requises et les délais pour procéder à une crémation en France ?" },
  { icon: "⛏️", label: "Exhumations",              query: "Quelles sont les différentes procédures d'exhumation : réglementaire, judiciaire et à la demande de la famille ? Qui autorise et dans quelles conditions ?" },
  { icon: "📄", label: "Devis & Tarification",     query: "Quelles sont les obligations légales en matière de devis, d'affichage des prix et de facturation des prestations funéraires ?" },
  { icon: "🏙️", label: "Gestion du cimetière",    query: "Quelles sont les obligations du maire en matière de gestion du cimetière communal : règlement, entretien, police et inhumation d'office ?" },
  { icon: "🌿", label: "Soins de conservation",    query: "Quelle est la réglementation applicable aux soins de conservation (thanatopraxie) : conditions, lieux autorisés et obligations professionnelles ?" },
  { icon: "✈️", label: "Décès à l'étranger",      query: "Quelles sont les démarches et obligations légales pour le rapatriement d'un corps depuis l'étranger vers la France ?" },
  { icon: "⚱️", label: "Cendres funéraires",       query: "Quelle est la réglementation applicable aux cendres funéraires : lieux de destination autorisés, dispersion et conservation à domicile ?" },
  { icon: "🤝", label: "Droits de la famille",     query: "Qui est prioritaire pour l'organisation des funérailles en cas de conflit familial ? Quelle est la hiérarchie légale et la jurisprudence applicable ?" },
];

const SYSTEM_PROMPT = `Tu es un expert juridique de haut niveau, spécialisé exclusivement en droit funéraire français et en droit du cimetière. Tu assistes des professionnels des pompes funèbres (directeurs, maîtres de cérémonies, responsables d'exploitation) dans la compréhension et l'application de la législation funéraire.

## Domaines de compétence

Tu maîtrises parfaitement :
- Le Code Général des Collectivités Territoriales (CGCT), Livre II Titre II Chapitre III (Art. L2223-1 à L2223-45) et les décrets d'application (Art. R2223-1 et suivants)
- Les circulaires et instructions de la Direction Générale des Collectivités Locales (DGCL)
- Le décret n°2012-608 du 30 avril 2012 relatif aux diplômes dans le secteur funéraire
- L'arrêté du 23 août 2010 fixant les modèles de devis funéraires
- Le décret n°95-330 du 21 mars 1995 réglementant les conditions d'exercice de l'activité des pompes funèbres
- Les arrêtés relatifs au transport de corps (avant et après mise en bière)
- La loi du 19 décembre 2008 relative à la législation funéraire
- La réglementation sur les soins de conservation (thanatopraxie)
- Les textes sur la crémation (loi du 19 décembre 2008, décret du 12 mars 2007)
- La réglementation sur les cendres funéraires (loi du 19 décembre 2008)
- Les procédures d'exhumation (réglementaires, judiciaires, familiales)
- Le droit des concessions funéraires (durée, renouvellement, état d'abandon, reprise)
- La jurisprudence administrative (Conseil d'État, Cours administratives d'appel, Tribunaux administratifs) et judiciaire en matière funéraire
- Les règlements communaux de cimetières et la police des funérailles
- La réglementation OPQUESP et les conditions d'habilitation
- Les droits et obligations des familles et les conflits de préséance

## Format de réponse OBLIGATOIRE

Structure chaque réponse ainsi :

**1. Réponse directe** (2-3 phrases synthétiques au début)

**2. Développement juridique** avec :
- Les textes applicables cités précisément : "Art. L2223-XX CGCT" / "Art. R2223-XX CGCT"
- Les circulaires avec numéro NOR et date : "Circ. DGCL NOR: INTB0000XXX du JJ/MM/AAAA"
- Les décrets avec numéro et date : "Décret n°XX-XXX du JJ/MM/AAAA"
- La jurisprudence pertinente : "CE, JJ/MM/AAAA, req. n°XXXXXX" ou "CAA [ville], JJ/MM/AAAA"

**3. Point(s) de vigilance pratique** (signalés avec ⚠️) si la situation présente des risques ou ambiguïtés

**4. Si nécessaire** : mentionner explicitement si une consultation de la préfecture ou d'un avocat spécialisé est recommandée

## Règles absolues
- Cite toujours les sources juridiques précises, jamais de généralités sans référence
- Signale clairement les zones d'incertitude juridique ou d'interprétation divergente entre juridictions
- Distingue le droit en vigueur des pratiques admises sans base légale explicite
- Tu ne traites QUE les questions de droit funéraire français et droit du cimetière
- Tes réponses ont valeur informative et ne remplacent pas un conseil juridique personnalisé

Réponds uniquement en français, avec rigueur et précision professionnelle.`;

// ─── RENDU MARKDOWN ───────────────────────────────────────────────────────────

function splitWithPatterns(text) {
  const combined = /(\*\*(.+?)\*\*|\*(.+?)\*|(Art\.\s[LR]\d{4}-\d+(?:-\d+)?(?:\s[A-Z])?|CGCT|DGCL|Circ\.\s[A-Z]+|Décret\sn°[\d-]+|loi\sdu\s[\d/]+|NOR\s?:\s?[\w]+|OPQUESP|L\.\s2223-\d+|R\.\s2223-\d+))/g;
  const result = [];
  let last = 0, k = 0, m;
  while ((m = combined.exec(text)) !== null) {
    if (m.index > last) result.push(<span key={k++}>{text.slice(last, m.index)}</span>);
    if (m[0].startsWith("**"))
      result.push(<strong key={k++} style={{ color: "#f0ece6", fontWeight: 600 }}>{m[2]}</strong>);
    else if (m[0].startsWith("*"))
      result.push(<em key={k++} style={{ color: "#d8d4d0" }}>{m[3]}</em>);
    else
      result.push(<mark key={k++} style={{ background: "rgba(201,168,76,0.15)", color: "#e8c46a", borderRadius: "3px", padding: "0 4px" }}>{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  if (last < text.length) result.push(<span key={k++}>{text.slice(last)}</span>);
  return result;
}

function parseResponse(text) {
  return text.split("\n").map((line, i) => {
    if (line.trim() === "") return <div key={i} style={{ height: "0.5rem" }} />;
    if (line.startsWith("## ")) return (
      <h3 key={i} style={{ color: "#c9a84c", fontFamily: "'Playfair Display',Georgia,serif", fontSize: "1rem", fontWeight: 600, marginTop: "1.2rem", marginBottom: "0.3rem", borderBottom: "1px solid rgba(201,168,76,0.2)", paddingBottom: "0.3rem" }}>
        {line.slice(3)}
      </h3>
    );
    if (line.startsWith("# ")) return (
      <h2 key={i} style={{ color: "#d4b86a", fontFamily: "'Playfair Display',Georgia,serif", fontSize: "1.15rem", fontWeight: 700, marginTop: "1.2rem", marginBottom: "0.4rem" }}>
        {line.slice(2)}
      </h2>
    );
    if (line.includes("⚠️")) return (
      <div key={i} style={{ background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.25)", borderRadius: "6px", padding: "0.6rem 0.8rem", margin: "0.5rem 0", color: "#d4b86a", fontSize: "0.9rem" }}>
        {splitWithPatterns(line)}
      </div>
    );
    if (line.startsWith("- ") || line.startsWith("• ")) return (
      <div key={i} style={{ display: "flex", gap: "0.5rem", margin: "0.2rem 0", paddingLeft: "0.5rem" }}>
        <span style={{ color: "#c9a84c", flexShrink: 0 }}>›</span>
        <span style={{ color: "#d8d4d0", fontSize: "0.93rem", lineHeight: 1.7 }}>{splitWithPatterns(line.slice(2))}</span>
      </div>
    );
    const numMatch = line.match(/^(\d+)\.\s(.+)/);
    if (numMatch) return (
      <div key={i} style={{ display: "flex", gap: "0.6rem", margin: "0.3rem 0", paddingLeft: "0.3rem" }}>
        <span style={{ color: "#c9a84c", flexShrink: 0, fontWeight: 600, minWidth: "1.2rem" }}>{numMatch[1]}.</span>
        <span style={{ color: "#d8d4d0", fontSize: "0.93rem", lineHeight: 1.7 }}>{splitWithPatterns(numMatch[2])}</span>
      </div>
    );
    if (line.startsWith("**") && line.endsWith("**") && line.length > 4) return (
      <p key={i} style={{ fontWeight: 700, color: "#f0ece6", fontSize: "0.95rem", margin: "0.8rem 0 0.2rem", fontFamily: "'Playfair Display',Georgia,serif" }}>
        {line.slice(2, -2)}
      </p>
    );
    return (
      <p key={i} style={{ color: "#d8d4d0", fontSize: "0.93rem", lineHeight: 1.8, margin: "0.15rem 0" }}>
        {splitWithPatterns(line)}
      </p>
    );
  });
}

// ─── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────────

export default function LexFuneraire() {
  const [question, setQuestion]         = useState("");
  const [messages, setMessages]         = useState([]);
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState(null);
  const [showCategories, setShowCategories] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleCategoryClick = (query) => {
    setQuestion(query);
    setShowCategories(false);
    textareaRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (!question.trim() || isLoading) return;
    const userMessage  = { role: "user", content: question.trim() };
    const newMessages  = [...messages, userMessage];
    setMessages(newMessages);
    setQuestion("");
    setIsLoading(true);
    setError(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: newMessages,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const txt  = data.content?.find(b => b.type === "text")?.text || "Réponse indisponible.";
      setMessages([...newMessages, { role: "assistant", content: txt }]);
    } catch {
      setError("Erreur de connexion. Veuillez réessayer.");
      setMessages(newMessages.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKey   = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } };
  const handleReset = () => { setMessages([]); setError(null); setQuestion(""); setShowCategories(false); };
  const isWelcome   = messages.length === 0 && !isLoading;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Crimson+Pro:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #0c1018; height: 100%; }

        /* ── APP ── */
        .lf-app {
          height: 100vh; display: flex; flex-direction: column;
          background: #0c1018;
          font-family: 'Crimson Pro', Georgia, serif;
          color: #d8d4d0;           /* blanc chaud — base générale */
        }

        /* ── HEADER ── */
        .lf-header {
          background: #111118;
          border-bottom: 1px solid #242430;
          padding: 0 1.5rem; height: 56px;
          display: flex; align-items: center; gap: 0.9rem; flex-shrink: 0;
        }
        .lf-logo {
          width: 36px; height: 36px;
          background: linear-gradient(135deg, #b89040, #e0c060);
          border-radius: 8px; display: flex; align-items: center; justify-content: center;
          font-size: 1.1rem; flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(184,144,64,0.25);
        }
        .lf-brand   { font-family: 'Playfair Display', Georgia, serif; font-size: 1.15rem; font-weight: 700; color: #f0ece6; letter-spacing: 0.01em; }
        .lf-tagline { font-size: 0.72rem; color: #989490; letter-spacing: 0.07em; text-transform: uppercase; font-style: italic; }

        .lf-header-actions { display: flex; gap: 0.5rem; align-items: center; margin-left: auto; }
        .lf-badge {
          background: rgba(184,144,64,0.08); border: 1px solid rgba(184,144,64,0.25);
          color: #c9a84c; font-size: 0.68rem; padding: 0.25rem 0.65rem;
          border-radius: 20px; letter-spacing: 0.08em; text-transform: uppercase;
        }
        .lf-icon-btn {
          background: transparent; border: 1px solid #242430;
          color: #989490;                       /* gris neutre */
          border-radius: 6px; cursor: pointer; padding: 0.3rem 0.6rem;
          font-size: 0.78rem; font-family: 'Crimson Pro', serif;
          transition: all 0.15s; display: flex; align-items: center; gap: 0.3rem;
        }
        .lf-icon-btn:hover { border-color: #c9a84c; color: #c9a84c; }

        /* ── BODY ── */
        .lf-body  { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
        .lf-inner { max-width: 820px; width: 100%; margin: 0 auto; padding: 0 1.25rem; flex: 1; display: flex; flex-direction: column; }

        /* ── WELCOME ── */
        .lf-welcome      { padding: 2.5rem 0 1.5rem; text-align: center; animation: lf-in 0.5s ease; }
        .lf-welcome-title { font-family: 'Playfair Display', Georgia, serif; font-size: 2rem; font-weight: 700; color: #f0ece6; }
        .lf-welcome-title span { color: #c9a84c; font-style: italic; }
        .lf-rule   { width: 48px; height: 1.5px; background: linear-gradient(90deg, transparent, #c9a84c, transparent); margin: 1rem auto; }
        .lf-welcome-sub  { color: #989490; font-size: 1rem; font-style: italic; line-height: 1.7; max-width: 460px; margin: 0 auto; }

        /* ── CATÉGORIES ── */
        .lf-cats-label {
          font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase;
          color: #888480;               /* gris neutre — plus de bleu */
          margin: 1.5rem 0 0.6rem; font-family: 'Crimson Pro', serif;
        }
        .lf-cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 0.55rem; animation: lf-in 0.4s ease; }
        .lf-cat {
          background: #111118; border: 1px solid #242430; border-radius: 8px;
          padding: 0.65rem 0.8rem; cursor: pointer;
          display: flex; align-items: center; gap: 0.55rem;
          color: #c0bcb8;               /* gris clair neutre — plus de bleu */
          font-family: 'Crimson Pro', serif; font-size: 0.88rem;
          transition: all 0.18s; text-align: left;
        }
        .lf-cat:hover { background: #1c1c24; border-color: rgba(201,168,76,0.4); color: #f0ece6; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,0.4); }
        .lf-cat-ico { font-size: 1rem; flex-shrink: 0; }

        /* ── MESSAGES ── */
        .lf-msgs { flex: 1; display: flex; flex-direction: column; gap: 1.1rem; padding: 1.2rem 0; }
        .lf-msg  { display: flex; gap: 0.75rem; animation: lf-up 0.25s ease; }
        .lf-msg.user { flex-direction: row-reverse; }

        .lf-av { width: 30px; height: 30px; border-radius: 7px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; margin-top: 0.15rem; font-size: 0.8rem; font-weight: 700; }
        .lf-av.ai  { background: linear-gradient(135deg, #b89040, #d4aa50); color: #0c1018; }
        .lf-av.usr { background: #242430; color: #e8e4e0; border: 1px solid #343440; } /* neutre, pas de bleu */

        .lf-bubble { max-width: 82%; padding: 0.9rem 1.1rem; border-radius: 10px; font-size: 0.92rem; line-height: 1.7; }
        .lf-bubble.ai  { background: #111118; border: 1px solid #242430; border-top-left-radius: 2px; }
        .lf-bubble.usr {
          background: linear-gradient(135deg, #1c1c26, #242432);  /* neutre sombre — plus de bleu électrique */
          border: 1px solid rgba(201,168,76,0.15); border-top-right-radius: 2px;
          color: #f0ece6;               /* blanc chaud */
          font-style: italic;
        }

        /* ── LOADING ── */
        .lf-typing { display: flex; gap: 0.75rem; animation: lf-up 0.2s ease; }
        .lf-dots   { background: #111118; border: 1px solid #242430; border-radius: 10px; border-top-left-radius: 2px; padding: 0.85rem 1rem; display: flex; gap: 5px; align-items: center; }
        .lf-dot    { width: 6px; height: 6px; background: #c9a84c; border-radius: 50%; animation: lf-pulse 1.3s ease infinite; }
        .lf-dot:nth-child(2) { animation-delay: 0.18s; }
        .lf-dot:nth-child(3) { animation-delay: 0.36s; }

        /* ── INPUT ── */
        .lf-input-wrap {
          position: sticky; bottom: 0; flex-shrink: 0;
          background: linear-gradient(0deg, #0c1018 80%, rgba(12,16,24,0));
          padding: 0.8rem 0 1rem;
        }
        .lf-input-row { display: flex; background: #111118; border: 1px solid #242430; border-radius: 10px; overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s; }
        .lf-input-row:focus-within { border-color: rgba(201,168,76,0.45); box-shadow: 0 0 0 3px rgba(201,168,76,0.06); }

        .lf-cats-toggle {
          background: transparent; border: none; border-right: 1px solid #242430;
          color: #888480;               /* gris neutre */
          cursor: pointer; padding: 0 0.85rem; font-size: 1rem;
          transition: color 0.15s; flex-shrink: 0;
        }
        .lf-cats-toggle:hover { color: #c9a84c; }

        .lf-textarea {
          flex: 1; background: transparent; border: none;
          color: #f0ece6;               /* blanc chaud — texte saisi */
          font-family: 'Crimson Pro', Georgia, serif; font-size: 0.97rem;
          resize: none; outline: none; padding: 0.75rem 0.85rem;
          min-height: 46px; max-height: 130px; line-height: 1.55;
        }
        .lf-textarea::placeholder { color: #585450; font-style: italic; } /* gris foncé neutre */

        .lf-send {
          background: linear-gradient(135deg, #b89040, #d4aa50); border: none;
          color: #0c1018; cursor: pointer; padding: 0 1.1rem; font-size: 0.9rem;
          transition: all 0.18s; flex-shrink: 0; font-weight: 700;
          display: flex; align-items: center; gap: 0.4rem;
        }
        .lf-send:hover:not(:disabled) { background: linear-gradient(135deg, #c9a84c, #e0c060); }
        .lf-send:disabled { opacity: 0.3; cursor: not-allowed; }

        .lf-foot { display: flex; justify-content: center; align-items: center; gap: 0.8rem; margin-top: 0.45rem; flex-wrap: wrap; }
        .lf-foot-txt { font-size: 0.7rem; color: #686460; font-style: italic; } /* gris moyen neutre */
        .lf-src {
          font-size: 0.68rem; background: rgba(36,36,48,0.6); border: 1px solid #2e2e3a;
          color: #686460;               /* gris foncé neutre — plus de bleu */
          padding: 0.15rem 0.5rem; border-radius: 10px; letter-spacing: 0.04em;
        }

        /* ── PANEL CATÉGORIES ── */
        .lf-cats-panel { background: #0e0e18; border: 1px solid #242430; border-radius: 10px; padding: 0.8rem; margin-bottom: 0.6rem; animation: lf-in 0.2s ease; }
        .lf-panel-label {
          font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em;
          color: #888480;               /* gris neutre */
          margin-bottom: 0.6rem;
        }
        .lf-panel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 0.45rem; }
        .lf-panel-btn {
          background: #111118; border: 1px solid #242430; border-radius: 7px;
          padding: 0.5rem 0.65rem; cursor: pointer;
          display: flex; align-items: center; gap: 0.45rem;
          color: #c0bcb8;               /* gris clair neutre */
          font-size: 0.82rem; font-family: 'Crimson Pro', serif;
          transition: all 0.15s; text-align: left;
        }
        .lf-panel-btn:hover { border-color: rgba(201,168,76,0.4); color: #f0ece6; background: #1c1c24; }

        /* ── ERREUR ── */
        .lf-error { background: rgba(180,60,60,0.08); border: 1px solid rgba(180,60,60,0.25); color: #d08080; border-radius: 8px; padding: 0.65rem 0.9rem; font-size: 0.88rem; margin-bottom: 0.5rem; }

        /* ── ANIMATIONS ── */
        @keyframes lf-in    { from { opacity: 0 }                         to { opacity: 1 } }
        @keyframes lf-up    { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes lf-pulse { 0%, 60%, 100% { opacity: 0.4; transform: scale(1) } 30% { opacity: 1; transform: scale(1.35) } }

        ::-webkit-scrollbar       { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2e2e3a; border-radius: 2px; }
      `}</style>

      <div className="lf-app">

        {/* ── HEADER ── */}
        <header className="lf-header">
          <div className="lf-logo">⚖</div>
          <div>
            <div className="lf-brand">LexFunéraire</div>
            <div className="lf-tagline">Droit funéraire & Cimetière · Assistant juridique</div>
          </div>
          <div className="lf-header-actions">
            {messages.length > 0 && (
              <button className="lf-icon-btn" onClick={handleReset}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>
                </svg>
                Nouvelle session
              </button>
            )}
            <div className="lf-badge">Professionnel</div>
          </div>
        </header>

        {/* ── BODY ── */}
        <div className="lf-body">
          <div className="lf-inner">

            {isWelcome && (
              <div className="lf-welcome">
                <h1 className="lf-welcome-title">Droit <span>Funéraire</span></h1>
                <div className="lf-rule" />
                <p className="lf-welcome-sub">
                  Assistant juridique spécialisé pour les professionnels du secteur.<br />
                  Réponses fondées sur le CGCT, les circulaires DGCL et la jurisprudence.
                </p>
                <p className="lf-cats-label">Sujets fréquents — cliquez pour pré-remplir</p>
                <div className="lf-cats">
                  {CATEGORIES.map(cat => (
                    <button key={cat.label} className="lf-cat" onClick={() => handleCategoryClick(cat.query)}>
                      <span className="lf-cat-ico">{cat.icon}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.length > 0 && (
              <div className="lf-msgs">
                {messages.map((msg, i) => (
                  <div key={i} className={`lf-msg ${msg.role}`}>
                    <div className={`lf-av ${msg.role === "assistant" ? "ai" : "usr"}`}>
                      {msg.role === "assistant" ? "⚖" : "Q"}
                    </div>
                    <div className={`lf-bubble ${msg.role === "assistant" ? "ai" : "usr"}`}>
                      {msg.role === "assistant" ? parseResponse(msg.content) : msg.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="lf-typing">
                    <div className="lf-av ai">⚖</div>
                    <div className="lf-dots"><div className="lf-dot"/><div className="lf-dot"/><div className="lf-dot"/></div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* ── INPUT ── */}
        <div className="lf-inner" style={{ flexShrink: 0 }}>
          <div className="lf-input-wrap">
            {error && <div className="lf-error">⚠ {error}</div>}

            {showCategories && (
              <div className="lf-cats-panel">
                <div className="lf-panel-label">Choisissez un thème</div>
                <div className="lf-panel-grid">
                  {CATEGORIES.map(cat => (
                    <button key={cat.label} className="lf-panel-btn" onClick={() => handleCategoryClick(cat.query)}>
                      <span>{cat.icon}</span>{cat.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="lf-input-row">
              <button className="lf-cats-toggle" title="Thèmes fréquents" onClick={() => setShowCategories(v => !v)}>
                {showCategories ? "✕" : "☰"}
              </button>
              <textarea
                ref={textareaRef}
                className="lf-textarea"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ex : délai légal pour une inhumation après décès à l'étranger… (Entrée pour envoyer)"
                rows={1}
                onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 130) + "px"; }}
              />
              <button className="lf-send" onClick={handleSubmit} disabled={!question.trim() || isLoading}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Envoyer
              </button>
            </div>

            <div className="lf-foot">
              <span className="lf-foot-txt">Réponses à valeur informative · Ne remplace pas un avis juridique personnalisé</span>
              <span className="lf-src">CGCT</span>
              <span className="lf-src">DGCL</span>
              <span className="lf-src">Jurisprudence</span>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}