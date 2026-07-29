import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RGPD retention: delete stored call videos older than RETENTION_MEDIA_DAYS.
 * Transcripts/summaries are kept (configure below if you also want to purge
 * them). Auth: Bearer SYNC_SECRET.
 */
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.app.syncSecret}` || !env.app.syncSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const days = env.app.retentionMediaDays;
  if (days <= 0) return NextResponse.json({ ok: true, skipped: "retention disabled" });

  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const db = supabaseAdmin();

  const { data: stale } = await db
    .from("calls")
    .select("id, media_path")
    .not("media_path", "is", null)
    .lt("started_at", cutoff)
    .limit(500);

  let purged = 0;
  for (const c of stale ?? []) {
    if (!c.media_path) continue;
    const { error } = await db.storage.from(env.supabase.mediaBucket).remove([c.media_path]);
    if (!error) {
      await db.from("calls").update({ media_path: null, video_source: null }).eq("id", c.id);
      purged++;
    }
  }
  return NextResponse.json({ ok: true, purged, cutoff });
}

export const GET = POST;
