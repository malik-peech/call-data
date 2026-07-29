import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listMeetTranscripts, getDocPlainText, findRecordingVideo } from "@/lib/integrations/google";
import { parseMeetTranscript } from "@/lib/transcript/meet-parser";

/**
 * Ingest historical Google Meet transcripts (Drive Docs) as a fallback source.
 * Attaches the recording mp4 (Drive webViewLink) when one exists.
 */
export async function ingestMeetTranscripts(opts: { modifiedSinceIso?: string; max?: number } = {}): Promise<{
  calls: number;
}> {
  const db = supabaseAdmin();
  const files = await listMeetTranscripts({ modifiedSinceIso: opts.modifiedSinceIso });
  let count = 0;

  for (const f of files.slice(0, opts.max ?? 500)) {
    const text = await getDocPlainText(f.id);
    const parsed = parseMeetTranscript(text);
    const transcriptText = parsed.segments.map((s) => `${s.speaker ?? "?"}: ${s.text}`).join("\n");

    // best-effort link to the recording video in the same folder
    const video = await findRecordingVideo(f.parentId, parsed.title ?? f.title).catch(() => null);

    const { data: call } = await db
      .from("calls")
      .upsert(
        {
          source: "google_meet",
          external_id: f.id,
          title: parsed.title ?? f.title.replace(/ - Transcript$/, ""),
          started_at: f.createdTime || null,
          participants: parsed.participants,
          video_url: video?.webViewLink ?? null,
          video_source: video ? "drive" : null,
          transcript_text: transcriptText,
          transcript_provider: "meet",
          recording_status: "done",
          summary_status: "pending",
          embed_status: "pending",
        },
        { onConflict: "source,external_id" }
      )
      .select("id")
      .single();

    if (call) {
      await db.from("call_segments").delete().eq("call_id", call.id);
      if (parsed.segments.length) {
        await db.from("call_segments").insert(
          parsed.segments.map((s, idx) => ({
            call_id: call.id,
            idx,
            speaker: s.speaker,
            text: s.text,
            start_seconds: s.start,
            end_seconds: s.end,
          }))
        );
      }
      count++;
    }
  }
  return { calls: count };
}
