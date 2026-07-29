import "server-only";
import { env } from "@/lib/env";

/**
 * Attio REST client (commercial calls).
 * Docs: https://docs.attio.com/rest-api
 *
 * Enumeration model:
 *   list meetings  →  per meeting list call_recordings  →  fetch transcript
 * Meetings carry `linked_records` (companies / deals) used for categorization.
 *
 * NOTE: the REST API exposes only a `web_url` (deep link into Attio) for a
 * recording — there is no direct video file URL. Embeddable video is only
 * available for Google Meet (mp4 in Drive).
 */

const BASE = "https://api.attio.com";

async function attioFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.attio.apiKey}`,
      Accept: "application/json",
    },
    // sync jobs: never cache
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Attio ${res.status} ${res.statusText} on ${path}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

// ── Types (subset of the documented shapes) ───────────────────
export interface AttioActor {
  id: string | null;
  type: "api-token" | "workspace-member" | "system" | "app" | null;
}

export interface AttioMeetingParticipant {
  status: "accepted" | "tentative" | "declined" | "pending";
  is_organizer: boolean;
  email_address: string | null;
  name: string | null;
}

export interface AttioLinkedRecord {
  object_slug: string; // "companies" | "deals" | ...
  object_id: string;
  record_id: string;
}

export interface AttioMeeting {
  id: { workspace_id: string; meeting_id: string };
  title: string | null;
  description: string | null;
  is_all_day: boolean;
  start: { datetime: string; timezone: string | null };
  end: { datetime: string; timezone: string | null };
  participants: AttioMeetingParticipant[];
  linked_records: AttioLinkedRecord[];
  created_at: string;
  created_by_actor: AttioActor;
}

export interface AttioCallRecording {
  id: { workspace_id: string; meeting_id: string; call_recording_id: string };
  status: "processing" | "completed" | "failed";
  web_url: string;
  created_by_actor: AttioActor;
  created_at: string;
}

export interface AttioTranscriptSegment {
  speech: string;
  start_time: number;
  end_time: number;
  speaker: { name: string };
}

interface Paginated<T> {
  data: T[];
  pagination: { next_cursor: string | null };
}

// ── Meetings ──────────────────────────────────────────────────
export interface ListMeetingsOptions {
  /** ISO timestamp — only meetings ending on/after this (incremental sync). */
  endsFrom?: string;
  startsBefore?: string;
  sort?: "start_asc" | "start_desc";
  limit?: number;
}

/** Async generator over all meetings matching the filter (handles pagination). */
export async function* iterateMeetings(opts: ListMeetingsOptions = {}): AsyncGenerator<AttioMeeting> {
  let cursor: string | null | undefined;
  do {
    const page = await attioFetch<Paginated<AttioMeeting>>("/v2/meetings", {
      limit: opts.limit ?? 100,
      sort: opts.sort ?? "start_desc",
      ends_from: opts.endsFrom,
      starts_before: opts.startsBefore,
      cursor: cursor ?? undefined,
    });
    for (const m of page.data) yield m;
    cursor = page.pagination.next_cursor;
  } while (cursor);
}

// ── Recordings ────────────────────────────────────────────────
export async function listCallRecordings(meetingId: string): Promise<AttioCallRecording[]> {
  const out: AttioCallRecording[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await attioFetch<Paginated<AttioCallRecording>>(
      `/v2/meetings/${meetingId}/call_recordings`,
      { limit: 200, cursor: cursor ?? undefined }
    );
    out.push(...page.data);
    cursor = page.pagination.next_cursor;
  } while (cursor);
  return out;
}

// ── Transcript (paginated segments) ───────────────────────────
export async function getTranscript(
  meetingId: string,
  callRecordingId: string
): Promise<AttioTranscriptSegment[]> {
  const segments: AttioTranscriptSegment[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await attioFetch<{
      data: { transcript: AttioTranscriptSegment[] };
      pagination: { next_cursor: string | null };
    }>(`/v2/meetings/${meetingId}/call_recordings/${callRecordingId}/transcript`, {
      cursor: cursor ?? undefined,
    });
    if (page.data?.transcript) segments.push(...page.data.transcript);
    cursor = page.pagination?.next_cursor;
  } while (cursor);
  return segments;
}
