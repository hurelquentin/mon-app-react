import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";

// ─── CATÉGORIES ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { icon: "🏛️", label: "Concessions funéraires",  query: "Quelles sont les règles applicables aux concessions funéraires : durée, renouvellement et procédure de reprise par la commune ?" },
  { icon: "🚐", label: "Transport de corps",       query: "Quelles sont les obligations légales pour le transport de corps avant et après mise en bière, notamment les autorisations requises ?" },
  { icon: "📋", label: "Habilitation funéraire",   query: "Quelles sont les conditions d'obtention, de renouvellement et de retrait de l'habilitation funéraire pour une entreprise ?" },
  { icon: "⚖️", label: "Police des funérailles",   query: "Qui détient la police des funérailles, quels sont ses pouvoirs et quelles sont les limites de son autorité en matière funéraire ?" },
  { icon: "🔥", label: "Crémation",                query: "Quelles sont les conditions légales, les autorisations requises et les délais pour procéder à une crémation en France ?" },
  { icon: "⛏️", label: "Exhumations",              query: "Quelles sont les différentes procédures d'exhumation : réglementaire, judiciaire et à la demande de la famille ?" },
  { icon: "📄", label: "Devis & Tarification",     query: "Quelles sont les obligations légales en matière de devis, d'affichage des prix et de facturation des prestations funéraires ?" },
  { icon: "🏙️", label: "Gestion du cimetière",    query: "Quelles sont les obligations du maire en matière de gestion du cimetière communal : règlement, entretien et inhumation d'office ?" },
  { icon: "🌿", label: "Soins de conservation",    query: "Quelle est la réglementation applicable aux soins de conservation (thanatopraxie) : conditions, lieux autorisés et obligations ?" },
  { icon: "✈️", label: "Décès à l'étranger",      query: "Quelles sont les démarches et obligations légales pour le rapatriement d'un corps depuis l'étranger vers la France ?" },
  { icon: "⚱️", label: "Cendres funéraires",       query: "Quelle est la réglementation applicable aux cendres funéraires : lieux autorisés, dispersion et conservation à domicile ?" },
  { icon: "🤝", label: "Droits de la famille",     query: "Qui est prioritaire pour l'organisation des funérailles en cas de conflit familial ? Quelle est la hiérarchie légale applicable ?" },
];

// ─── RENDU DU CONTENU MESSAGE ─────────────────────────────────────────────────
function renderInline(text) {
  const combined = /(\*\*(.+?)\*\*|(Art\.\s[LR]\d{4}-\d+(?:-\d+)?|CGCT|DGCL|Circ\.\s[A-Z]+|Décret\sn°[\d-]+|loi\sdu\s[\d/]+|NOR\s?:\s?[\w]+|L\.\s2223-\d+|R\.\s2223-\d+))/g;
  const parts = []; let last = 0, k = 0, m;
  while ((m = combined.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={k++}>{text.slice(last, m.index)}</span>);
    if (m[0].startsWith("**"))
      parts.push(<span key={k++} className="msg-bold">{m[2]}</span>);
    else
      parts.push(<span key={k++} className="msg-ref">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>);
  return parts;
}

function MessageContent({ content }) {
  const lines = useMemo(() => String(content || "").split("\n"), [content]);
  return (
    <div className="message-content">
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="message-space" />;
        if (/^#{1,3}\s/.test(t))   return <div key={i} className="message-heading">{t.replace(/^#{1,3}\s/, "")}</div>;
        if (t.includes("⚠️"))       return <div key={i} className="message-warning">{renderInline(t)}</div>;
        if (/^[-•]\s/.test(t))     return <div key={i} className="message-bullet">{renderInline(t.replace(/^[-•]\s/, ""))}</div>;
        if (/^\d+\.\s/.test(t))    return <div key={i} className="message-number"><span>{renderInline(t)}</span></div>;
        return <div key={i} className="message-paragraph">{renderInline(line)}</div>;
      })}
    </div>
  );
}

// ─── SOURCES ─────────────────────────────────────────────────────────────────
function Sources({ sources }) {
  if (!sources?.length) return null;
  return (
    <div className="sources">
      <div className="sources-title">Documents consultés</div>
      <div className="sources-list">
        {sources.map((s, i) => (
          <div key={i} className="source-item">
            {s.type === "web" && s.url
              ? <><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a><span className="source-badge web">web</span></>
              : <><span>{s.title}</span><span className="source-badge pdf">PDF</span></>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── JURISPRUDENCE PANEL ──────────────────────────────────────────────────────
function JurisprudencePanel({ decisions }) {
  const [open, setOpen] = useState(false);
  if (!decisions?.length) return null;
  return (
    <div className="juri-panel">
      <button className="juri-toggle" onClick={() => setOpen(v => !v)}>
        <span className="juri-toggle-ico">⚖</span>
        {decisions.length} décision{decisions.length > 1 ? "s" : ""} jurisprudentielle{decisions.length > 1 ? "s" : ""} connexe{decisions.length > 1 ? "s" : ""}
        <span className="juri-chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="juri-list">
          {decisions.map((j, i) => (
            <div key={i} className="juri-card">
              <div className="juri-header">
                <span className="juri-juridiction">{j.juridiction}</span>
                <span className="juri-date">{j.date}</span>
                {j.a_verifier && <span className="juri-warning-badge">À vérifier</span>}
              </div>
              <div className="juri-sujet">{j.sujet}</div>
              <div className="juri-principe">{j.principe}</div>
              {j.textes_vises?.length > 0 && (
                <div className="juri-textes">
                  {j.textes_vises.map((t, ti) => (
                    <span key={ti} className="juri-texte-badge">{t}</span>
                  ))}
                </div>
              )}
              {j.url && (
                <a href={j.url} target="_blank" rel="noreferrer" className="juri-link">
                  Rechercher sur Légifrance →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── QUESTIONS CONNEXES ───────────────────────────────────────────────────────
function SuggestedQuestions({ suggestions, onSelect, loading }) {
  if (!suggestions?.length || loading) return null;
  return (
    <div className="suggestions">
      <div className="suggestions-title">Questions connexes</div>
      <div className="suggestions-list">
        {suggestions.map((s, i) => (
          <button key={i} className="suggestion-btn" onClick={() => onSelect(s)}>
            <span className="suggestion-arrow">→</span>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── BOUTON COPIER ────────────────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silencieux */ }
  };
  return (
    <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={handleCopy} title="Copier la réponse">
      {copied ? "✓ Copié" : "⎘ Copier"}
    </button>
  );
}

// ─── EXPORT PDF (print) ───────────────────────────────────────────────────────
function exportToPDF(messages) {
  const date    = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const content = messages
    .filter(m => m.role !== "system")
    .map(m => {
      const label  = m.role === "user" ? "Question" : "Réponse LexFunéraire";
      const classe = m.role === "user" ? "color:#c9a84c" : "color:#f0ece6";
      const texte  = String(m.content || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");
      return `<div style="margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #2e2e3a;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;${classe};margin-bottom:8px">${label}</div>
        <div style="font-size:14px;line-height:1.75;color:#d8d4d0">${texte}</div>
      </div>`;
    }).join("");

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8">
    <title>LexFunéraire — Export ${date}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Crimson+Pro:wght@400;500;600&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #0c1018; color: #d8d4d0; font-family: 'Crimson Pro', Georgia, serif; padding: 48px 60px; max-width: 860px; margin: 0 auto; }
      .header { border-bottom: 2px solid rgba(201,168,76,0.4); padding-bottom: 20px; margin-bottom: 32px; display: flex; align-items: center; justify-content: space-between; }
      .logo { font-family: 'Playfair Display', serif; font-size: 22px; color: #c9a84c; font-weight: 700; }
      .date { font-size: 12px; color: #686460; font-style: italic; }
      .disclaimer { margin-top: 40px; padding: 12px 16px; border: 1px solid rgba(201,168,76,0.2); border-radius: 8px; font-size: 12px; color: #686460; font-style: italic; }
      strong { color: #f0ece6; }
      @media print {
        body { background: white; color: #111; padding: 20px 30px; }
        .logo { color: #7a5c10; }
        strong { color: #111; }
        div[style*="color:#d8d4d0"] { color: #222 !important; }
        div[style*="color:#c9a84c"] { color: #7a5c10 !important; }
        div[style*="color:#f0ece6"] { color: #111 !important; }
        div[style*="border-bottom:1px solid #2e2e3a"] { border-color: #ccc !important; }
      }
    </style>
  </head><body>
    <div class="header">
      <div class="logo">⚖ LexFunéraire</div>
      <div class="date">Export du ${date}</div>
    </div>
    ${content}
    <div class="disclaimer">Les réponses de LexFunéraire ont valeur informative et ne remplacent pas un avis juridique personnalisé. Vérifiez les références jurisprudentielles sur Légifrance.</div>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [messages,     setMessages]     = useState([{
    role: "assistant",
    content: "Assistant juridique LexFunéraire — spécialisé pour les professionnels du secteur funéraire.\nRéponses fondées sur le CGCT, les guides DGCL, les décrets et la jurisprudence connexe.",
    sources: [], jurisprudence: [], suggestions: []
  }]);
  const [input,        setInput]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [lastSugg,     setLastSugg]     = useState([]);
  const endRef   = useRef(null);
  const textaRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendQuestion = async (question) => {
    const q = String(question || "").trim();
    if (!q || loading) return;

    setLastSugg([]);
    const userMsg  = { role: "user", content: q };
    const newMsgs  = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);
    if (textaRef.current) textaRef.current.style.height = "auto";

    try {
      const res  = await fetch("/api/ask", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ question: q, history: messages })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.answer || "Erreur serveur");

      const aiMsg = {
        role:          "assistant",
        content:       data.answer || "Réponse indisponible.",
        sources:       data.sources || [],
        jurisprudence: data.jurisprudence || [],
        suggestions:   data.suggestions  || []
      };
      setMessages([...newMsgs, aiMsg]);
      setLastSugg(data.suggestions || []);
    } catch {
      setMessages([...newMsgs, {
        role: "assistant",
        content: "Une erreur est survenue. Merci de réessayer ou de contacter contact@adefuneraire.fr.",
        sources: [], jurisprudence: [], suggestions: []
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuestion(input); }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  };

  const handleReset = () => {
    setMessages([{
      role: "assistant",
      content: "Nouvelle session démarrée. Posez votre question.",
      sources: [], jurisprudence: [], suggestions: []
    }]);
    setInput(""); setLastSugg([]);
  };

  const hasConversation = messages.length > 1;
  const allMessages     = messages.filter(m => m.role !== "system");

  return (
    <div className="app-shell">

      {/* ── HERO ── */}
      <header className="hero">
        <div className="hero-top">
          <div className="hero-badge">
            <div className="hero-badge-icon">⚖</div>
            LexFunéraire
          </div>
          <div className="hero-actions">
            {hasConversation && (
              <>
                <button className="btn-action" onClick={() => exportToPDF(allMessages)} title="Exporter en PDF">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Exporter PDF
                </button>
                <button className="btn-action" onClick={handleReset}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>
                  </svg>
                  Nouvelle session
                </button>
              </>
            )}
          </div>
        </div>
        <h1>Droit <em>Funéraire</em></h1>
        <div className="hero-rule" />
        <p>Assistant juridique spécialisé · CGCT · Guides DGCL · Décrets · Jurisprudence</p>
      </header>

      {/* ── CATÉGORIES ── */}
      <section className="topics-panel">
        <div className="panel-title">Sujets fréquents — cliquez pour interroger directement</div>
        <div className="topics-grid">
          {CATEGORIES.map(cat => (
            <button key={cat.label} type="button" className="topic-card"
              onClick={() => sendQuestion(cat.query)} disabled={loading}>
              <span className="topic-icon">{cat.icon}</span>
              <span className="topic-label">{cat.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── CHAT ── */}
      <main className="chat-panel">
        <div className="chat-header">
          <div>
            <div className="chat-title">Conversation</div>
            <div className="chat-subtitle">Réponses enrichies — PDFs de référence · Jurisprudence connexe · Sources vérifiées</div>
          </div>
        </div>

        <div className="chat-list">
          {allMessages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              <div className={`msg-avatar ${msg.role === "assistant" ? "ai" : "usr"}`}>
                {msg.role === "assistant" ? "⚖" : "Q"}
              </div>
              <div className="msg-body">
                <MessageContent content={msg.content} />

                {msg.role === "assistant" && (
                  <>
                    <JurisprudencePanel decisions={msg.jurisprudence} />
                    <Sources sources={msg.sources} />
                    {i === allMessages.length - 1 && !loading && (
                      <SuggestedQuestions
                        suggestions={msg.suggestions}
                        onSelect={sendQuestion}
                        loading={loading}
                      />
                    )}
                    {msg.content && msg.content.length > 100 && (
                      <div className="msg-actions">
                        <CopyButton text={msg.content} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="message assistant">
              <div className="msg-avatar ai">⚖</div>
              <div className="msg-body">
                <div className="loading-dots"><span /><span /><span /></div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      {/* ── COMPOSER ── */}
      <footer className="composer">
        <div className="composer-row">
          <textarea
            ref={textaRef}
            className="composer-textarea"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKey}
            placeholder="Posez votre question… (Entrée pour envoyer, Maj+Entrée pour saut de ligne)"
            rows={1}
            disabled={loading}
          />
          <button type="button" className="composer-send"
            onClick={() => sendQuestion(input)}
            disabled={loading || !input.trim()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            {loading ? "En cours…" : "Envoyer"}
          </button>
        </div>
        <div className="composer-hint">
          <span className="hint-txt">Réponses à valeur informative · Ne remplace pas un avis juridique</span>
          <span className="hint-badge">CGCT</span>
          <span className="hint-badge">DGCL</span>
          <span className="hint-badge">Décrets</span>
          <span className="hint-badge">Jurisprudence</span>
        </div>
      </footer>

    </div>
  );
}
