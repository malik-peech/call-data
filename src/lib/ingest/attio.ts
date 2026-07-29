import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { iterateMeetings, listCallRecordings, getTranscript } from "@/lib/integrations/attio";

/**
 * Ingest Attio commercial calls (sales). No embeddable video via API — we keep
 * the transcript + Attio deep link (web_url). `linked_records` (companies/deals)
 * could later drive categorization.
 */
export async function ingestAttioCalls(opts: { endsFrom?: string; max?: number } = {}): Promise<{
  calls: number;
}> {
  const db = supabaseAdmin();
  let count = 0;
  const max = opts.max ?? 200;

  for await (const meeting of iterateMeetings({ endsFrom: opts.endsFrom, sort: "start_desc" })) {
    if (count >= max) break;
    const recordings = await listCallRecordings(meeting.id.meeting_id);
    for (const rec of recordings) {
      if (rec.status !== "completed") continue;
      const segments = await getTranscript(meeting.id.meeting_id, rec.id.call_recording_id);
      const participants = meeting.participants.map((p) => p.name ?? p.email_address ?? "").filter(Boolean);
      const transcriptText = segments.map((s) => `${s.speaker.name}: ${s.speech}`).join("\n");

      const { data: call } = await db
        .from("calls")
        .upsert(
          {
            source: "attio",
            external_id: rec.id.call_recording_id,
            meeting_external_id: meeting.id.meeting_id,
            title: meeting.title,
            started_at: meeting.start?.datetime ?? null,
            ended_at: meeting.end?.datetime ?? null,
            participants,
            video_url: rec.web_url,
            video_source: "attio",
            transcript_text: transcriptText,
            transcript_provider: "attio",
            recording_status: "done",
            summary_status: "pending",
            embed_status: "pending",
            raw: { meeting, recording: rec } as unknown,
          },
          { onConflict: "source,external_id" }
        )
        .select("id")
        .single();

      if (call) {
        await db.from("call_segments").delete().eq("call_id", call.id);
        if (segments.length) {
          await db.from("call_segments").insert(
            segments.map((s, idx) => ({
              call_id: call.id,
              idx,
              speaker: s.speaker.name,
              text: s.speech,
              start_seconds: s.start_time,
              end_seconds: s.end_time,
            }))
          );
        }
        count++;
      }
    }
  }
  return { calls: count };
}
