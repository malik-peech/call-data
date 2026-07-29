"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface Props {
  clients: { id: string; name: string }[];
}

export default function CallFilters({ clients }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/calls?${next.toString()}`);
  };

  const inputCls =
    "rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParam("q", q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher (titre, transcript)…"
          className={`${inputCls} w-64`}
        />
      </form>
      <select
        value={params.get("source") ?? ""}
        onChange={(e) => setParam("source", e.target.value)}
        className={inputCls}
      >
        <option value="">Toutes sources</option>
        <option value="recall">Recall</option>
        <option value="attio">Attio</option>
        <option value="google_meet">Meet</option>
      </select>
      <select
        value={params.get("client") ?? ""}
        onChange={(e) => setParam("client", e.target.value)}
        className={inputCls}
      >
        <option value="">Tous clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
