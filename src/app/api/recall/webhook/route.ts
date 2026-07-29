import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/integrations/recall";
import { ingestRecallBot } from "@/lib/ingest/recall";
import { syncCalendar } from "@/lib/ingest/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recall webhook endpoint (configure this URL + secret in the Recall dashboard).
 *
 * We must return 2xx within 15s, so heavy work (media download, transcription,
 * bot scheduling) is fire-and-forget — the standalone Node server keeps running
 * it after the response. Failures are logged; Recall also retries on non-2xx.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();

  if (!verifyWebhook(req.headers, rawBody)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: { event?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const event = payload.event ?? "";
  const data = payload.data ?? {};

  switch (event) {
    case "bot.done": {
      const botId = (data.bot as { id?: string })?.id;
      if (botId) {
        void ingestRecallBot(botId).catch((e) =>
          console.error(`[webhook] ingest failed for bot ${botId}:`, e)
        );
      }
      break;
    }
    case "calendar.sync_events": {
      const calendarId = data.calendar_id as string | undefined;
      const updatedAt = data.last_updated_ts as string | undefined;
      if (calendarId) {
        void syncCalendar(calendarId, updatedAt).catch((e) =>
          console.error(`[webhook] calendar sync failed for ${calendarId}:`, e)
        );
      }
      break;
    }
    default:
      // Other bot lifecycle events (joining, recording, …) — accepted, no-op for now.
      break;
  }

  return NextResponse.json({ ok: true });
}
