"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Arma un plan para salir de mis tarjetas, mes a mes",
  "¿A qué deuda le meto la plata extra este mes?",
  "Plan de amortización solo para una de mis tarjetas",
  "¿Cuánto debo ahorrar para cumplir mis metas?",
];

/**
 * Chat with the advisor. The conversation stays in this browser tab; nothing is stored.
 * `panel`: inside the floating panel (computers), with its own scroll and the box fixed at the bottom.
 */
export function AdvisorChat({ panel = false, autoFocus = false }: { panel?: boolean; autoFocus?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The answer while it is still arriving. */
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // In the panel only the conversation scrolls; on the page, the page does.
    if (panel) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: draft ? "auto" : "smooth" });
    else end.current?.scrollIntoView({ behavior: draft ? "auto" : "smooth", block: "end" });
  }, [messages, busy, draft, panel]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next = [...messages, { role: "user" as const, content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    let answer = "";
    try {
      const res = await fetch("/api/asesor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next }) });
      if (res.ok && res.body && res.headers.get("content-type")?.includes("ndjson")) {
        // Streamed answer (Gemini): one JSON object per line, blank lines are heartbeats.
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const piece: { text?: string; error?: string } = JSON.parse(line);
            if (piece.error) throw new Error(piece.error);
            if (piece.text) {
              answer += piece.text;
              setDraft(answer);
            }
          }
        }
        if (!answer.trim()) throw new Error("El asesor no respondió. Intenta de nuevo.");
      } else {
        // A whole answer (Claude) or an error. A proxy timeout or crash answers with HTML, not our JSON.
        const data: { text?: string; error?: string } | null = await res.json().catch(() => null);
        if (!res.ok || !data?.text) {
          throw new Error(
            data?.error ??
              (res.status === 504 ? "El asesor tardó demasiado en responder. Intenta con una pregunta más concreta." : `El asesor no respondió (error ${res.status}). Intenta de nuevo.`),
          );
        }
        answer = data.text;
      }
      setMessages([...next, { role: "assistant", content: answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "El asesor no respondió.");
      if (answer.trim()) {
        // Keep the part that arrived; asking "sigue" continues it.
        setMessages([...next, { role: "assistant", content: answer }]);
      } else {
        setMessages(messages);
        setInput(question);
      }
    } finally {
      setDraft("");
      setBusy(false);
    }
  }

  return (
    <section className={panel ? "flex h-full min-h-0 flex-col" : "card flex flex-col gap-4"} aria-label="Chat con el asesor">
      <div ref={scroller} className={panel ? "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" : "contents"}>
      {messages.length === 0 && panel && (
        <p className="text-sm text-ink-2">
          Hola. Soy tu asesor con IA: miro tus saldos, tasas, pagos fijos, ingresos y metas para responderte con tus números. Pregúntame lo que quieras sobre tu plata.
        </p>
      )}
      {messages.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip text-left" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      ) : (
        <ol className="flex flex-col gap-3" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={`rise max-w-[92%] rounded-3xl px-4 py-3 ${m.role === "user" ? "self-end bg-brand text-white" : "self-start bg-surface/70"}`}>
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap">{m.content}</p>
              ) : (
                <div className="advisor-md text-[15px] leading-relaxed">
                  <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
                </div>
              )}
            </li>
          ))}
          {draft && (
            <li className="max-w-[92%] self-start rounded-3xl bg-surface/70 px-4 py-3">
              <div className="advisor-md text-[15px] leading-relaxed">
                <Markdown remarkPlugins={[remarkGfm]}>{draft}</Markdown>
              </div>
            </li>
          )}
          {busy && !draft && (
            <li className="self-start rounded-3xl bg-surface/70 px-4 py-3" role="status" aria-label="El asesor está pensando">
              <span className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-2 animate-bounce rounded-full bg-brand" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            </li>
          )}
        </ol>
      )}
      <div ref={end} />
      {error && <p role="alert" className="alert">{error}</p>}
      </div>
      <div className={panel ? "flex flex-col gap-2 border-t border-line p-3" : "contents"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2"
      >
        <textarea
          className="input min-h-12 resize-none"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Pregúntale a tu asesor…"
          aria-label="Tu pregunta"
          maxLength={4000}
          autoFocus={autoFocus}
        />
        <button className="btn h-12 shrink-0" disabled={busy || !input.trim()}>
          Enviar
        </button>
      </form>
      {messages.length > 0 && (
        <button type="button" className="self-start text-sm text-ink-3 hover:text-ink" onClick={() => setMessages([])}>
          Empezar de nuevo
        </button>
      )}
      </div>
    </section>
  );
}
