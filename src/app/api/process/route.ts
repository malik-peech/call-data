import { NextResponse } from "next/server";
import { processPending } from "@/lib/ai/process";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Cron endpoint: summarize + embed pending calls. Auth: Bearer SYNC_SECRET. */
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? "10");
  const result = await processPending(limit);
  return NextResponse.json(result);
}

export const GET = POST;

function isAuthorized(req: Request): boolean {
  const secret = env.app.syncSecret;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
