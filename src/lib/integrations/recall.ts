import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import type { TranscriptSegment } from "@/lib/ai/transcription";

/**
 * Transcript comes from the meeting platform's own live captions (free, no
 * separate polling step). Google Meet defaults its caption engine to English,
 * so language_code must be forced to "fr" — otherwise it silently produces
 * garbled English words for French speech (status stays "done" either way).
 * Our own STT (lib/ai/transcription) is a fallback for sources without one.
 */
const RECORDING_CONFIG = {
  video_mixed: {},
  audio_mixed: {},
  transcript: { provider: { meeting_captions: { language_code: "fr" } } },
} as const;

/**
 * Recall.ai client — primary capture layer (everyone except sales).
 * Docs: https://docs.recall.ai
 *
 * - Bots: POST /api/v1/bot/ (scheduled via `join_at`), GET /api/v1/bot/{id}/
 * - Calendar V2: /api/v2/calendars/, /api/v2/calendar-events/, .../bot
 * - Webhooks: Svix-signed; key events `bot.done`, `calendar.sync_events`.
 *
 * We use Recall ONLY for capture. Transcription + long-term storage are done
 * on our side (see lib/ai/transcription.ts and Supabase Storage).
 */

function host(): string {
  return `https://${env.recall.region}.recall.ai`;
}

async function recallFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {}
): Promise<T> {
  const url = new URL(host() + path);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) if (v) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Token ${env.recall.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Recall ${res.status} on ${path}: ${t.slice(0, 500)}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// ── Bots ──────────────────────────────────────────────────────
export interface RecallBot {
  id: string;
  status_changes?: { code: string; created_at: string }[];
  meeting_url?: unknown;
  recordings?: RecallRecording[];
  [k: string]: unknown;
}

export interface RecallRecording {
  id: string;
  media_shortcuts?: {
    video_mixed?: { data?: { download_url?: string } };
    audio_mixed?: { data?: { download_url?: string } };
    transcript?: { data?: { download_url?: string } };
  };
  [k: string]: unknown;
}

/**
 * Schedule a bot to join a meeting. Recall recommends `join_at` ≥ 10 min ahead
 * for production (scheduled bots). We record video + audio; transcription is ours.
 */
export function createScheduledBot(params: {
  meetingUrl: string;
  joinAt?: string; // ISO 8601
  botName?: string;
  metadata?: Record<string, string>;
}): Promise<RecallBot> {
  return recallFetch<RecallBot>("/api/v1/bot/", {
    method: "POST",
    body: {
      meeting_url: params.meetingUrl,
      bot_name: params.botName ?? "Peech Notetaker",
      join_at: params.joinAt,
      metadata: params.metadata,
      recording_config: RECORDING_CONFIG,
    },
  });
}

export function getBot(botId: string): Promise<RecallBot> {
  return recallFetch<RecallBot>(`/api/v1/bot/${botId}/`);
}

/** Extract downloadable media URLs from a completed bot (defensive across API shapes). */
export function getBotMedia(bot: RecallBot): {
  videoUrl?: string;
  audioUrl?: string;
  transcriptUrl?: string;
} {
  const rec = bot.recordings?.[0];
  const s = rec?.media_shortcuts;
  return {
    videoUrl: s?.video_mixed?.data?.download_url ?? (bot.video_url as string | undefined),
    audioUrl: s?.audio_mixed?.data?.download_url,
    transcriptUrl: s?.transcript?.data?.download_url,
  };
}

export function latestStatus(bot: RecallBot): string | undefined {
  return bot.status_changes?.at(-1)?.code;
}

/**
 * Download and parse Recall's native transcript into diarized segments.
 * Defensive across shapes: timestamps may be plain numbers or {relative}.
 */
export async function fetchRecallTranscript(transcriptUrl: string): Promise<TranscriptSegment[]> {
  const res = await fetch(transcriptUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Recall transcript ${res.status}`);
  const raw = (await res.json()) as unknown;

  const num = (v: unknown): number => {
    if (typeof v === "number") return v;
    if (v && typeof v === "object" && "relative" in v) return Number((v as { relative: number }).relative);
    return 0;
  };

  const entries = Array.isArray(raw) ? raw : [];
  const segments: TranscriptSegment[] = [];
  for (const e of entries as Array<Record<string, unknown>>) {
    const words = (e.words as Array<Record<string, unknown>>) ?? [];
    if (words.length === 0) continue;
    const speaker =
      (e.speaker as string) ??
      ((e.participant as { name?: string })?.name) ??
      (e.speaker_id != null ? `Speaker ${e.speaker_id}` : null);
    segments.push({
      speaker: speaker ?? null,
      text: words.map((w) => String(w.text ?? "")).join(" ").replace(/\s+/g, " ").trim(),
      start: num(words[0].start_timestamp ?? words[0].start),
      end: num(words[words.length - 1].end_timestamp ?? words[words.length - 1].end),
    });
  }
  return segments;
}

// ── Calendar V2 (auto-scheduling) ─────────────────────────────
export interface RecallCalendarEvent {
  id: string;
  start_time: string;
  end_time: string;
  meeting_url: string | null;
  raw?: { summary?: string };
  attendees?: { email?: string }[];
  bots?: { bot_id: string }[];
  [k: string]: unknown;
}

export function listCalendarEvents(params: {
  calendarId: string;
  updatedAtGte?: string;
}): Promise<{ results: RecallCalendarEvent[]; next?: string | null }> {
  return recallFetch("/api/v2/calendar-events/", {
    query: { calendar_id: params.calendarId, updated_at__gte: params.updatedAtGte },
  });
}

export function scheduleBotForEvent(eventId: string, botName = "Peech Notetaker"): Promise<unknown> {
  return recallFetch("/api/v2/calendar-events/bot/", {
    method: "POST",
    body: {
      calendar_event: eventId,
      bot_config: { bot_name: botName, recording_config: RECORDING_CONFIG },
    },
  });
}

export function unscheduleBotForEvent(eventId: string): Promise<unknown> {
  return recallFetch("/api/v2/calendar-events/bot/", {
    method: "DELETE",
    body: { calendar_event: eventId },
  });
}

/**
 * Anti-double-bot rule: skip meetings the sales team owns/attends (they run Attio).
 * Returns false if any attendee matches an excluded email or domain.
 */
export function shouldRecordEvent(ev: RecallCalendarEvent): boolean {
  if (!ev.meeting_url) return false; // no video link → nothing to record
  const excl = env.recall.exclude;
  if (excl.length === 0) return true;
  const emails = (ev.attendees ?? []).map((a) => (a.email ?? "").toLowerCase()).filter(Boolean);
  const blocked = emails.some((e) =>
    excl.some((x) => (x.includes("@") ? e === x : e.endsWith("@" + x) || e.endsWith("." + x)))
  );
  return !blocked;
}

// ── Webhook verification (Standard Webhooks / Svix scheme) ────
/**
 * Verify a Recall webhook signed per the Standard Webhooks spec (Svix).
 * Signed content = `${id}.${timestamp}.${rawBody}`, HMAC-SHA256 with
 * the base64 secret (strip the `whsec_` prefix). The signature header is a
 * space-separated list of `v1,<base64sig>`. Recall sends `webhook-*` headers;
 * accept the legacy `svix-*` names too in case that ever changes back.
 */
export function verifyWebhook(headers: Headers, rawBody: string): boolean {
  const secret = env.recall.webhookSecret;
  if (!secret) return false;
  const id = headers.get("webhook-id") ?? headers.get("svix-id");
  const ts = headers.get("webhook-timestamp") ?? headers.get("svix-timestamp");
  const sigHeader = headers.get("webhook-signature") ?? headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest("base64");
  const expectedBuf = Buffer.from(expected);

  return sigHeader.split(" ").some((part) => {
    const sig = part.split(",")[1] ?? part;
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}
