import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uploadFromUrl } from "@/lib/supabase/storage";
import {
  getBot,
  getBotMedia,
  fetchRecallTranscript,
  getAdmissionFailure,
  type RecallBot,
} from "@/lib/integrations/recall";
import { transcribeFromUrl, type TranscriptSegment } from "@/lib/ai/transcription";
import { env } from "@/lib/env";

/**
 * Ingest a completed Recall bot: store video in our bucket, get the transcript
 * (Recall native, or our STT fallback), and persist call + segments. Summary and
 * embeddings are left `pending` for the P4 processor.
 */
export async function ingestRecallBot(botId: string): Promise<{ callId: string }> {
  const db = supabaseAdmin();
  const bot = await getBot(botId);
  const { title, startedAt, endedAt } = extractMeta(bot);

  // 0. bot never actually captured the meeting (denied entry, waiting room
  // timeout, recording permission refused) — flag it, skip media/transcript.
  const failureReason = getAdmissionFailure(bot);
  if (failureReason) {
    const { data: call, error: upErr } = await db
      .from("calls")
      .upsert(
        {
          source: "recall",
          external_id: botId,
          recall_bot_id: botId,
          title,
          started_at: startedAt,
          ended_at: endedAt,
          recording_status: "failed",
          failure_reason: failureReason,
          summary_status: "error",
          embed_status: "error",
          raw: bot as unknown,
        },
        { onConflict: "source,external_id" }
      )
      .select("id")
      .single();
    if (upErr || !call) throw new Error(`Upsert failed-bot call failed: ${upErr?.message}`);
    return { callId: call.id };
  }

  const media = getBotMedia(bot);

  // 1. transcript — prefer Recall's native, fall back to our STT on the audio.
  let segments: TranscriptSegment[] = [];
  let provider = "recallai";
  if (media.transcriptUrl) {
    segments = await fetchRecallTranscript(media.transcriptUrl);
  } else if (media.audioUrl || media.videoUrl) {
    segments = await transcribeFromUrl((media.audioUrl ?? media.videoUrl)!);
    provider = env.transcription.provider;
  }
  const transcriptText = segments.map((s) => `${s.speaker ?? "?"}: ${s.text}`).join("\n");
  const participants = [...new Set(segments.map((s) => s.speaker).filter(Boolean))] as string[];

  // 2. upsert the call row (idempotent on source+external_id).
  const { data: call, error: upErr } = await db
    .from("calls")
    .upsert(
      {
        source: "recall",
        external_id: botId,
        recall_bot_id: botId,
        title,
        started_at: startedAt,
        ended_at: endedAt,
        participants,
        transcript_text: transcriptText,
        transcript_provider: provider,
        recording_status: "done",
        summary_status: "pending",
        embed_status: "pending",
        raw: bot as unknown,
      },
      { onConflict: "source,external_id" }
    )
    .select("id")
    .single();
  if (upErr || !call) throw new Error(`Upsert call failed: ${upErr?.message}`);
  const callId = call.id;

  // 3. store the video in our bucket (best-effort; media URLs expire).
  if (media.videoUrl) {
    try {
      const path = `recall/${botId}/video.mp4`;
      await uploadFromUrl(path, media.videoUrl, "video/mp4");
      await db.from("calls").update({ media_path: path, video_source: "storage" }).eq("id", callId);
    } catch (e) {
      console.error(`[ingest] video store failed for ${botId}:`, e);
    }
  }

  // 4. replace segments.
  await db.from("call_segments").delete().eq("call_id", callId);
  if (segments.length) {
    await db.from("call_segments").insert(
      segments.map((s, idx) => ({
        call_id: callId,
        idx,
        speaker: s.speaker,
        text: s.text,
        start_seconds: s.start,
        end_seconds: s.end,
      }))
    );
  }

  return { callId };
}

function extractMeta(bot: RecallBot): {
  title: string | null;
  startedAt: string | null;
  endedAt: string | null;
} {
  const meta = (bot.metadata ?? {}) as Record<string, unknown>;
  const changes = bot.status_changes ?? [];
  const at = (code: string) => changes.find((c) => c.code === code)?.created_at ?? null;
  return {
    title: (meta.title as string) ?? null,
    startedAt: at("in_call_recording") ?? at("in_call_not_recording"),
    endedAt: at("call_ended") ?? at("done"),
  };
}
