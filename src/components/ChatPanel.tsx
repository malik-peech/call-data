"use client";
import { useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import type { Citation, ChatScope } from "@/lib/types";

interface Msg {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

interface Props {
  scope: ChatScope;
  callId?: string;
  clientId?: string;
  projectId?: string;
  placeholder?: string;
}

export default function ChatPanel({ scope, callId, clientId, projectId, placeholder }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, scope, callId, clientId, projectId, threadId }),
      });
      const data = await res.json();
      setThreadId(data.threadId);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer ?? "…", citations: data.citations ?? [] },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Erreur lors de la requête." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--text-muted)]">
            {placeholder ?? "Pose une question sur ce call."}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-[var(--accent)] text-black"
                  : "bg-[var(--surface-2)] text-[var(--text)]"
              }`}
            >
              {m.content}
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/10 pt-2">
                  {m.citations.map((c, j) => (
                    <Link
                      key={j}
                      href={`/calls/${c.call_id}`}
                      className="rounded-full bg-black/20 px-2 py-0.5 text-[11px] hover:underline"
                    >
                      {c.title ?? "call"}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <p className="text-sm text-[var(--text-muted)]">Recherche…</p>}
      </div>

      <div className="mt-3 flex items-end gap-2 border-t border-[var(--border)] pt-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Écris ta question…"
          className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={send}
          disabled={loading}
          className="rounded-lg bg-[var(--accent)] p-2.5 text-black transition hover:opacity-90 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
