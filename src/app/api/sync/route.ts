import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncAirtableReference } from "@/lib/ingest/airtable";
import { ingestAttioCalls } from "@/lib/ingest/attio";
import { ingestMeetTranscripts } from "@/lib/ingest/meet";
import { processPending } from "@/lib/ai/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * Cron sync (Bearer SYNC_SECRET). Query flags select what to run:
 *   ?airtable=1&attio=1&meet=1&process=1  (default: all).
 * `since` (ISO) scopes Attio/Meet incremental pulls.
 * Recall is push-based (webhook), so it is not pulled here.
 */
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.app.syncSecret}` || !env.app.syncSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const q = new URL(req.url).searchParams;
  const all = ![...q.keys()].some((k) => ["airtable", "attio", "meet", "process"].includes(k));
  const since = q.get("since") ?? undefined;
  const out: Record<string, unknown> = {};

  const run = async (name: string, on: boolean, fn: () => Promise<unknown>) => {
    if (!(all || on)) return;
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = { error: (e as Error).message };
    }
  };

  await run("airtable", q.get("airtable") === "1", () => syncAirtableReference());
  await run("attio", q.get("attio") === "1", () => ingestAttioCalls({ endsFrom: since }));
  await run("meet", q.get("meet") === "1", () => ingestMeetTranscripts({ modifiedSinceIso: since }));
  await run("process", q.get("process") === "1", () => processPending(25));

  return NextResponse.json({ ok: true, ...out });
}

export const GET = POST;
