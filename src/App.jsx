import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";

// ─── CATÉGORIES ───────────────────────────────────────────────────────────────
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

// ─── RENDU DU CONTENU MESSAGE ─────────────────────────────────────────────────
function renderInline(text) {
  // Gras **...**  |  Références légales  |  texte normal
  const combined = /(\*\*(.+?)\*\*|(Art\.\s[LR]\d{4}-\d+(?:-\d+)?|CGCT|DGCL|Circ\.\s[A-Z]+|Décret\sn°[\d-]+|loi\sdu\s[\d/]+|NOR\s?:\s?[\w]+|L\.\s2223-\d+|R\.\s2223-\d+))/g;
  const parts = [];
  let last = 0, k = 0, m;
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
        if (/^#{1,3}\s/.test(t))
          return <div key={i} className="message-heading">{t.replace(/^#{1,3}\s/, "")}</div>;
        if (t.includes("⚠️"))
          return <div key={i} className="message-warning">{renderInline(t)}</div>;
        if (/^[-•]\s/.test(t))
          return <div key={i} className="message-bullet">{renderInline(t.replace(/^[-•]\s/, ""))}</div>;
        if (/^\d+\.\s/.test(t))
          return <div key={i} className="message-number"><span>{renderInline(t)}</span></div>;
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
              ? <><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a><span className="source-badge">web</span></>
              : <><span>{s.title}</span><span className="source-badge">PDF</span></>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MESSAGE ──────────────────────────────────────────────────────────────────
function ChatMessage({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`message ${isUser ? "user" : "assistant"}`}>
      <div className={`msg-avatar ${isUser ? "usr" : "ai"}`}>
        {isUser ? "Q" : "⚖"}
      </div>
      <div className="msg-body">
        <MessageContent content={message.content} />
        {!isUser && <Sources sources={message.sources} />}
      </div>
    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages]     = useState([{
    role: "assistant",
    content: "Assistant juridique spécialisé pour les professionnels du secteur funéraire.\nRéponses fondées sur le CGCT, les guides DGCL, les décrets et des sources externes vérifiées."
  }]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const endRef    = useRef(null);
  const textaRef  = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendQuestion = async (question) => {
    const q = String(question || "").trim();
    if (!q || loading) return;

    const userMsg   = { role: "user", content: q };
    const newMsgs   = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);
    if (textaRef.current) { textaRef.current.style.height = "auto"; }

    try {
      const res  = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: messages })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.answer || data?.error || "Erreur serveur");
      setMessages([...newMsgs, {
        role: "assistant",
        content: data.answer || "Réponse indisponible.",
        sources: data.sources || []
      }]);
    } catch {
      setMessages([...newMsgs, {
        role: "assistant",
        content: "Une erreur est survenue. Merci de réessayer ou de contacter contact@adefuneraire.fr."
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(input);
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    // Auto-resize
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  };

  const handleReset = () => {
    setMessages([{
      role: "assistant",
      content: "Nouvelle session démarrée. Posez votre question."
    }]);
    setInput("");
  };

  const hasConversation = messages.length > 1;

  return (
    <div className="app-shell">

      {/* ── HERO ── */}
      <header className="hero">
        <div className="hero-top">
          <div className="hero-badge">
            <div className="hero-badge-icon">⚖</div>
            LexFunéraire
          </div>
          {hasConversation && (
            <button className="btn-reset" onClick={handleReset}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>
              </svg>
              Nouvelle session
            </button>
          )}
        </div>
        <h1>Droit <em>Funéraire</em></h1>
        <div className="hero-rule" />
        <p>Assistant juridique spécialisé pour les professionnels du secteur.<br />
           Réponses fondées sur le CGCT, les guides DGCL, les décrets et des sources vérifiées.</p>
      </header>

      {/* ── CATÉGORIES ── */}
      <section className="topics-panel">
        <div className="panel-title">Sujets fréquents — cliquez pour pré-remplir</div>
        <div className="topics-grid">
          {CATEGORIES.map(cat => (
            <button
              key={cat.label}
              type="button"
              className="topic-card"
              onClick={() => sendQuestion(cat.query)}
              disabled={loading}
            >
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
            <div className="chat-subtitle">
              Réponses enrichies à partir des documents PDF et de sources externes vérifiées.
            </div>
          </div>
        </div>

        <div className="chat-list">
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))}

          {loading && (
            <div className="message assistant">
              <div className="msg-avatar ai">⚖</div>
              <div className="msg-body">
                <div className="loading-dots">
                  <span /><span /><span />
                </div>
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
          <button
            type="button"
            className="composer-send"
            onClick={() => sendQuestion(input)}
            disabled={loading || !input.trim()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            {loading ? "Envoi…" : "Envoyer"}
          </button>
        </div>
        <div className="composer-hint">
          <span className="hint-txt">Réponses à valeur informative · Ne remplace pas un avis juridique</span>
          <span className="hint-badge">CGCT</span>
          <span className="hint-badge">DGCL</span>
          <span className="hint-badge">Décrets</span>
          <span className="hint-badge">Légifrance</span>
        </div>
      </footer>

    </div>
  );
}
