import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listActiveProjects } from "@/lib/integrations/airtable";

/**
 * Sync the client / project reference from the Airtable view (active projects:
 * "En cours" / "Finalisation") into our tables. Used for auto-categorization.
 */
export async function syncAirtableReference(): Promise<{ clients: number; projects: number }> {
  const db = supabaseAdmin();
  const projects = await listActiveProjects();

  // 1. distinct clients
  const clientByRec = new Map<string, string>();
  for (const p of projects) {
    if (p.clientRecId && p.clientName) clientByRec.set(p.clientRecId, p.clientName);
  }
  if (clientByRec.size) {
    await db.from("clients").upsert(
      [...clientByRec.entries()].map(([airtable_id, name]) => ({ airtable_id, name })),
      { onConflict: "airtable_id" }
    );
  }

  // 2. map Airtable client rec id → our uuid
  const { data: rows } = await db.from("clients").select("id, airtable_id");
  const clientMap = new Map<string, string>();
  for (const r of rows ?? []) if (r.airtable_id) clientMap.set(r.airtable_id, r.id);

  // 3. projects (all active — the view already filters status)
  if (projects.length) {
    await db.from("projects").upsert(
      projects.map((p) => ({
        airtable_id: p.recordId,
        code: p.code,
        name: p.name,
        client_id: p.clientRecId ? clientMap.get(p.clientRecId) ?? null : null,
        status: p.status,
        active: true,
      })),
      { onConflict: "airtable_id" }
    );
  }

  return { clients: clientByRec.size, projects: projects.length };
}
