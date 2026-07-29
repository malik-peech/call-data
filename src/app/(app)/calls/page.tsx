import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import CallFilters from "@/components/CallFilters";
import { formatDate, formatDuration, sourceLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

interface CallRow {
  id: string;
  title: string | null;
  source: string;
  started_at: string | null;
  duration_seconds: number | null;
  participants: string[];
  recording_status: string;
  failure_reason: string | null;
  clients: { name: string } | null;
  projects: { code: string | null; name: string } | null;
}

const CALENDAR_MESSAGES: Record<string, { text: string; error?: boolean }> = {
  connected: { text: "Agenda connecté à Recall — les prochaines réunions seront planifiées automatiquement." },
  missing_code: { text: "Connexion agenda annulée.", error: true },
  exchange_failed: { text: "Échec de connexion à Google (réessaie).", error: true },
  no_refresh_token: { text: "Google n'a pas renvoyé d'autorisation persistante (réessaie).", error: true },
  recall_error: { text: "Google a autorisé l'accès, mais Recall a refusé la connexion (réessaie).", error: true },
};

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string; client?: string; calendar?: string }>;
}) {
  const sp = await searchParams;
  const db = supabaseAdmin();
  const calendarMsg = sp.calendar ? CALENDAR_MESSAGES[sp.calendar] : undefined;

  let query = db
    .from("calls")
    .select(
      "id, title, source, started_at, duration_seconds, participants, recording_status, failure_reason, clients(name), projects(code, name)"
    )
    .is("duplicate_of", null)
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (sp.source) query = query.eq("source", sp.source);
  if (sp.client) query = query.eq("client_id", sp.client);
  if (sp.q) query = query.or(`title.ilike.*${sp.q}*,transcript_text.ilike.*${sp.q}*`);

  const { data: calls } = await query;

  // clients that appear on calls (for the filter dropdown)
  const { data: clientRows } = await db
    .from("calls")
    .select("client_id, clients(name)")
    .not("client_id", "is", null)
    .limit(2000);
  const clientMap = new Map<string, string>();
  for (const r of (clientRows ?? []) as { client_id: string; clients: { name: string } | null }[]) {
    if (r.client_id && r.clients?.name) clientMap.set(r.client_id, r.clients.name);
  }
  const clients = [...clientMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows = (calls ?? []) as unknown as CallRow[];

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-2xl font-semibold">Calls</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{rows.length} résultat(s)</p>

      {calendarMsg && (
        <div
          className={`mt-4 rounded-xl border p-3 text-sm ${
            calendarMsg.error
              ? "border-red-500/30 bg-red-500/10 text-red-400"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {calendarMsg.text}
        </div>
      )}

      <div className="mt-5">
        <CallFilters clients={clients} />
      </div>

      <div className="mt-5 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {rows.length === 0 && (
          <p className="p-6 text-sm text-[var(--text-muted)]">Aucun call. Lance une synchro.</p>
        )}
        {rows.map((c) => (
          <Link
            key={c.id}
            href={`/calls/${c.id}`}
            className="flex items-center gap-4 px-5 py-4 transition hover:bg-[var(--surface-2)]"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.title ?? "Sans titre"}</div>
              <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                {c.recording_status === "failed"
                  ? c.failure_reason
                  : `${c.participants?.slice(0, 4).join(", ")}${c.participants?.length > 4 ? "…" : ""}`}
              </div>
            </div>
            <div className="hidden w-40 shrink-0 text-xs text-[var(--text-muted)] sm:block">
              {c.projects?.code ? `${c.projects.code} · ` : ""}
              {c.clients?.name ?? "Non catégorisé"}
            </div>
            <div className="w-28 shrink-0 text-right text-xs text-[var(--text-muted)]">
              {formatDuration(c.duration_seconds)}
            </div>
            <div className="w-36 shrink-0 text-right text-xs text-[var(--text-muted)]">
              {formatDate(c.started_at)}
            </div>
            {c.recording_status === "failed" && (
              <span className="w-24 shrink-0 rounded-full bg-red-500/10 px-2 py-1 text-center text-[10px] font-medium uppercase tracking-wide text-red-400">
                Non admis
              </span>
            )}
            <span className="w-16 shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-1 text-center text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {sourceLabel(c.source)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
