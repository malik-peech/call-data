"use client";
import { useState } from "react";
import ChatPanel from "@/components/ChatPanel";

export default function TransversalChat({ clients }: { clients: { id: string; name: string }[] }) {
  const [clientId, setClientId] = useState<string>("");

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        >
          <option value="">Tous les calls</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1">
        <ChatPanel
          key={clientId || "global"}
          scope={clientId ? "client" : "global"}
          clientId={clientId || undefined}
          placeholder={
            clientId
              ? "Ex : qu'a-t-on convenu avec ce client ces derniers mois ?"
              : "Ex : quels clients ont parlé de budget en septembre ?"
          }
        />
      </div>
    </div>
  );
}
