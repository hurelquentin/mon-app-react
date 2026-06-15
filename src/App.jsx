import { useEffect, useMemo, useRef, useState } from "react";

const CATEGORIES = [
  {
    icon: "🏛️",
    label: "Concessions funéraires",
    query: "Quelles sont les règles applicables aux concessions funéraires : durée, renouvellement et procédure de reprise par la commune ?"
  },
  {
    icon: "🚐",
    label: "Transport de corps",
    query: "Quelles sont les obligations légales pour le transport de corps avant et après mise en bière, notamment les autorisations requises ?"
  },
  {
    icon: "📋",
    label: "Habilitation funéraire",
    query: "Quelles sont les conditions d'obtention, de renouvellement et de retrait de l'habilitation funéraire pour une entreprise ?"
  },
  {
    icon: "⚖️",
    label: "Police des funérailles",
    query: "Qui détient la police des funérailles, quels sont ses pouvoirs et quelles sont les limites de son autorité en matière funéraire ?"
  },
  {
    icon: "🔥",
    label: "Crémation",
    query: "Quelles sont les conditions légales, les autorisations requises et les délais pour procéder à une crémation en France ?"
  },
  {
    icon: "⛏️",
    label: "Exhumations",
    query: "Quelles sont les différentes procédures d'exhumation : réglementaire, judiciaire et à la demande de la famille ? Qui autorise et dans quelles conditions ?"
  },
  {
    icon: "📄",
    label: "Devis & Tarification",
    query: "Quelles sont les obligations légales en matière de devis, d'affichage des prix et de facturation des prestations funéraires ?"
  },
  {
    icon: "🏙️",
    label: "Gestion du cimetière",
    query: "Quelles sont les obligations du maire en matière de gestion du cimetière communal : règlement, entretien, police et inhumation d'office ?"
  },
  {
    icon: "🌿",
    label: "Soins de conservation",
    query: "Quelle est la réglementation applicable aux soins de conservation (thanatopraxie) : conditions, lieux autorisés et obligations professionnelles ?"
  },
  {
    icon: "✈️",
    label: "Décès à l'étranger",
    query: "Quelles sont les démarches et obligations légales pour le rapatriement d'un corps depuis l'étranger vers la France ?"
  },
  {
    icon: "⚱️",
    label: "Cendres funéraires",
    query: "Quelle est la réglementation applicable aux cendres funéraires : lieux de destination autorisés, dispersion et conservation à domicile ?"
  },
  {
    icon: "🤝",
    label: "Droits de la famille",
    query: "Qui est prioritaire pour l'organisation des funérailles en cas de conflit familial ? Quelle est la hiérarchie légale et la jurisprudence applicable ?"
  }
];

function Sources({ sources }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="sources">
      <div className="sources-title">Sources</div>
      <div className="sources-list">
        {sources.map((source, index) => (
          <div key={index} className="source-item">
            {source.type === "web" && source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
            ) : (
              <span>{source.title}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageContent({ content }) {
  const blocks = useMemo(() => {
    const text = String(content || "");
    return text.split("\n").map((line, index) => ({
      index,
      line,
      trimmed: line.trim()
    }));
  }, [content]);

  return (
    <div className="message-content">
      {blocks.map(({ index, line, trimmed }) => {
        if (!trimmed) return <div key={index} className="message-space" />;

        if (/^(#{1,3})\s/.test(trimmed)) {
          return (
            <div key={index} className="message-heading">
              {trimmed.replace(/^#{1,3}\s/, "")}
            </div>
          );
        }

        if (/^[-•]\s/.test(trimmed)) {
          return (
            <div key={index} className="message-bullet">
              {trimmed.replace(/^[-•]\s/, "• ")}
            </div>
          );
        }

        if (/^\d+\.\s/.test(trimmed)) {
          return (
            <div key={index} className="message-number">
              {trimmed}
            </div>
          );
        }

        return (
          <div key={index} className="message-paragraph">
            {line}
          </div>
        );
      })}
    </div>
  );
}

function ChatMessage({ message }) {
  return (
    <div className={`message ${message.role === "user" ? "user" : "assistant"}`}>
      <MessageContent content={message.content} />
      {message.sources && message.sources.length > 0 && (
        <Sources sources={message.sources} />
      )}
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Assistant juridique spécialisé pour les professionnels du secteur.\nRéponses fondées sur vos documents de référence (CGCT, guides DGCL, décrets)."
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendQuestion = async (question) => {
    const q = String(question || "").trim();
    if (!q || loading) return;

    const userMessage = { role: "user", content: q };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          history: newMessages
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.answer || data?.error || "Erreur serveur");
      }

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: data.answer || "Réponse indisponible.",
          sources: data.sources || []
        }
      ]);
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content:
            "Une erreur est survenue pendant le traitement. Merci de réessayer."
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const intro = useMemo(
    () =>
      "Réponses structurées, sources affichées, et lecture optimisée pour les professionnels du funéraire.",
    []
  );

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-badge">LexFunéraire</div>
        <h1>Assistant juridique pour le secteur funéraire</h1>
        <p>{intro}</p>
      </header>

      <section className="topics-panel">
        <div className="panel-title">Sujets fréquents</div>
        <div className="topics-grid">
          {CATEGORIES.map((cat) => (
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

      <main className="chat-panel">
        <div className="chat-header">
          <div>
            <div className="chat-title">Conversation</div>
            <div className="chat-subtitle">
              Réponses enrichies à partir des documents et des sources externes.
            </div>
          </div>
        </div>

        <div className="chat-list">
          {messages.map((message, index) => (
            <ChatMessage key={index} message={message} />
          ))}

          {loading && (
            <div className="message assistant">
              <div className="message-paragraph">Recherche en cours...</div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </main>

      <footer className="composer">
        <div className="composer-inner">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Posez votre question ici..."
            rows={4}
          />
          <button
            type="button"
            onClick={() => sendQuestion(input)}
            disabled={loading}
          >
            {loading ? "Envoi..." : "Envoyer"}
          </button>
        </div>
      </footer>
    </div>
  );
}