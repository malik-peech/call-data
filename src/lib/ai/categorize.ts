import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Heuristic auto-categorization: match a call to a client / project from its
 * title + participants. Best-effort — the UI allows manual override
 * (category_source = 'manual' is never overwritten).
 *
 * Signals, strongest first:
 *   1. a project code token present in the title (e.g. "N3851", "4237")
 *   2. a client name (or alias) appearing in the title/participants
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export async function categorizeCall(callId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: call } = await db
    .from("calls")
    .select("id, title, participants, category_source")
    .eq("id", callId)
    .single();
  if (!call || call.category_source === "manual") return;

  const haystack = norm([call.title ?? "", ...(call.participants ?? [])].join(" "));
  if (!haystack) return;

  let clientId: string | null = null;
  let projectId: string | null = null;
  let confidence = 0;

  // 1. project code in the title (e.g. "N3851", "4237")
  const codeTokens = (call.title ?? "").match(/\b[A-Z]?\d{3,6}\b/g) ?? [];
  if (codeTokens.length) {
    const { data: projByCode } = await db
      .from("projects")
      .select("id, client_id, code")
      .in("code", codeTokens)
      .limit(1);
    if (projByCode?.[0]) {
      projectId = projByCode[0].id;
      clientId = projByCode[0].client_id;
      confidence = 0.9;
    }
  }

  // 2. client name / alias appearing in the text
  if (!clientId) {
    const { data: clients } = await db.from("clients").select("id, name, aliases");
    for (const c of clients ?? []) {
      const names = [c.name, ...(c.aliases ?? [])].map(norm).filter((n) => n.length >= 3);
      if (names.some((n) => haystack.includes(n))) {
        clientId = c.id;
        confidence = Math.max(confidence, 0.6);
        break;
      }
    }
  }

  if (!clientId && !projectId) return;

  await db
    .from("calls")
    .update({
      client_id: clientId,
      project_id: projectId,
      category_source: "auto",
      category_confidence: confidence,
    })
    .eq("id", callId);
}
