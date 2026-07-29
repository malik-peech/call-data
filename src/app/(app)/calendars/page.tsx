import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

interface ConnectedCalendar {
  id: string;
  email: string;
  platform: string;
  connected_at: string;
  updated_at: string;
}

export default async function CalendarsPage() {
  const db = supabaseAdmin();
  const { data } = await db
    .from("connected_calendars")
    .select("id, email, platform, connected_at, updated_at")
    .order("connected_at", { ascending: false });

  const rows = (data ?? []) as ConnectedCalendar[];

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="text-2xl font-semibold">Agendas connectés</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {rows.length} personne{rows.length > 1 ? "s ont" : " a"} connecté son agenda à Recall.
      </p>

      <div className="mt-5 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {rows.length === 0 && (
          <p className="p-6 text-sm text-[var(--text-muted)]">
            Personne n&apos;a encore connecté son agenda. Chacun peut le faire via « Connecter mon
            agenda » dans le menu.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <span className="truncate text-sm font-medium">{r.email}</span>
            <span className="shrink-0 text-xs text-[var(--text-muted)]">
              Connecté le {formatDate(r.connected_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
