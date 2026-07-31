import Link from "next/link";
import { isToday, isThisWeek } from "date-fns";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { toAccessUser, visibleCallIdsFor } from "@/lib/access";
import CallFilters from "@/components/CallFilters";
import FavoriteToggle from "@/components/FavoriteToggle";
import Avatar from "@/components/Avatar";
import { formatDate, formatDuration, sourceLabel, sourceColor } from "@/lib/format";

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
  is_favorite: boolean;
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

const GRID_COLS = "grid-cols-[minmax(0,1fr)_200px_140px_140px_32px]";

function periodLabel(iso: string | null): string {
  if (!iso) return "Sans date";
  const d = new Date(iso);
  if (isToday(d)) return "Aujourd'hui";
  if (isThisWeek(d, { weekStartsOn: 1 })) return "Cette semaine";
  return "Plus ancien";
}

function groupByPeriod(rows: CallRow[]): { label: string; rows: CallRow[] }[] {
  const order = ["Aujourd'hui", "Cette semaine", "Plus ancien", "Sans date"];
  const buckets = new Map<string, CallRow[]>();
  for (const r of rows) {
    const label = periodLabel(r.started_at);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(r);
  }
  return order.filter((l) => buckets.has(l)).map((label) => ({ label, rows: buckets.get(label)! }));
}

function CallRowItem({ c }: { c: CallRow }) {
  return (
    <div className={`group relative grid ${GRID_COLS} items-center gap-4 px-5 py-3 transition hover:bg-[var(--surface-2)]`}>
      <Link href={`/calls/${c.id}`} className="absolute inset-0" aria-label={c.title ?? "Call"} />

      <div className="pointer-events-none flex min-w-0 items-center gap-3">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: sourceColor(c.source) }}
          title={sourceLabel(c.source)}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {c.title ?? "Sans titre"}
            <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
              {formatDuration(c.duration_seconds)}
            </span>
          </div>
          {c.recording_status === "failed" ? (
            <div className="mt-0.5 truncate text-xs text-red-600">{c.failure_reason ?? "Non admis"}</div>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none hidden truncate text-xs text-[var(--text-muted)] sm:block">
        {c.projects?.code ? `${c.projects.code} · ` : ""}
        {c.clients?.name ?? "Non catégorisé"}
      </div>

      <div className="pointer-events-none hidden -space-x-2 sm:flex">
        {(c.participants ?? []).slice(0, 4).map((p, i) => (
          <Avatar key={i} name={p} size={22} />
        ))}
        {(c.participants?.length ?? 0) > 4 && (
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] text-[var(--text-muted)] ring-2 ring-[var(--surface)]">
            +{c.participants.length - 4}
          </span>
        )}
      </div>

      <div className="pointer-events-none hidden truncate text-xs text-[var(--text-muted)] sm:block">
        {formatDate(c.started_at)}
      </div>

      <div className="relative z-10 flex justify-end">
        <FavoriteToggle callId={c.id} initialFavorite={c.is_favorite} size={16} showOnHoverOnly />
      </div>
    </div>
  );
}

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string; client?: string; calendar?: string }>;
}) {
  const sp = await searchParams;
  const db = supabaseAdmin();
  const calendarMsg = sp.calendar ? CALENDAR_MESSAGES[sp.calendar] : undefined;

  const accessUser = toAccessUser(await currentUser());
  const visibleIds = await visibleCallIdsFor(accessUser);

  let calls: unknown[] = [];
  if (!visibleIds || visibleIds.size > 0) {
    let query = db
      .from("calls")
      .select(
        "id, title, source, started_at, duration_seconds, participants, recording_status, failure_reason, is_favorite, clients(name), projects(code, name)"
      )
      .is("duplicate_of", null)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(100);

    if (visibleIds) query = query.in("id", [...visibleIds]);
    if (sp.source) query = query.eq("source", sp.source);
    if (sp.client) query = query.eq("client_id", sp.client);
    if (sp.q) query = query.or(`title.ilike.*${sp.q}*,transcript_text.ilike.*${sp.q}*`);

    const res = await query;
    calls = res.data ?? [];
  }

  // clients that appear on calls (for the filter dropdown) — scoped to what
  // this user can actually see, same as the list itself.
  let clientQuery = db.from("calls").select("client_id, clients(name)").not("client_id", "is", null).limit(2000);
  if (visibleIds) clientQuery = clientQuery.in("id", visibleIds.size > 0 ? [...visibleIds] : [""]);
  const { data: clientRows } = await clientQuery;
  const clientMap = new Map<string, string>();
  for (const r of (clientRows ?? []) as { client_id: string; clients: { name: string } | null }[]) {
    if (r.client_id && r.clients?.name) clientMap.set(r.client_id, r.clients.name);
  }
  const clients = [...clientMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows = calls as unknown as CallRow[];
  const favorites = rows.filter((r) => r.is_favorite);
  const groups = groupByPeriod(rows);

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-2xl font-semibold">Calls</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{rows.length} résultat(s)</p>

      {calendarMsg && (
        <div
          className={`mt-4 rounded-xl border p-3 text-sm ${
            calendarMsg.error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {calendarMsg.text}
        </div>
      )}

      <div className="mt-5">
        <CallFilters clients={clients} />
      </div>

      {favorites.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Favoris
          </div>
          <div className="divide-y divide-[var(--border)]">
            {favorites.map((c) => (
              <CallRowItem key={c.id} c={c} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div
          className={`hidden ${GRID_COLS} gap-4 border-b border-[var(--border)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] sm:grid`}
        >
          <span>Call</span>
          <span>Client · Projet</span>
          <span>Participants</span>
          <span>Date</span>
          <span />
        </div>

        {rows.length === 0 && (
          <p className="p-6 text-sm text-[var(--text-muted)]">Aucun call. Lance une synchro.</p>
        )}

        {groups.map((g) => (
          <div key={g.label}>
            <div className="border-b border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-1.5 text-xs font-medium text-[var(--text-muted)] first:border-t-0">
              {g.label} · {g.rows.length}
            </div>
            <div className="divide-y divide-[var(--border)]">
              {g.rows.map((c) => (
                <CallRowItem key={c.id} c={c} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
