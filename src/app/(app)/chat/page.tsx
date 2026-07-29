import { supabaseAdmin } from "@/lib/supabase/admin";
import TransversalChat from "@/components/TransversalChat";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const db = supabaseAdmin();
  const { data: rows } = await db
    .from("calls")
    .select("client_id, clients(name)")
    .not("client_id", "is", null)
    .limit(2000);

  const map = new Map<string, string>();
  for (const r of (rows ?? []) as { client_id: string; clients: { name: string } | null }[]) {
    if (r.client_id && r.clients?.name) map.set(r.client_id, r.clients.name);
  }
  const clients = [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-8 py-8">
      <h1 className="text-2xl font-semibold">Recherche IA</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Interroge l&apos;ensemble des calls, ou filtre par client.
      </p>
      <div className="mt-6 min-h-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <TransversalChat clients={clients} />
      </div>
    </div>
  );
}
