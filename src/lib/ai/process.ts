import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { summarizeCall } from "@/lib/ai/anthropic";
import { chunkSegments } from "@/lib/ai/chunk";
import { embed, toVector } from "@/lib/ai/embeddings";
import { categorizeCall } from "@/lib/ai/categorize";
import { env } from "@/lib/env";
import type { TranscriptSegment } from "@/lib/ai/transcription";

/**
 * Post-ingestion processing: categorize, summarize (Claude), and embed (Voyage)
 * a call. Idempotent — driven by the `summary_status` / `embed_status` flags.
 */
export async function processCall(callId: string): Promise<void> {
  const db = supabaseAdmin();

  const { data: call } = await db
    .from("calls")
    .select("id, title, transcript_text, summary_status, embed_status")
    .eq("id", callId)
    .single();
  if (!call) return;

  await categorizeCall(callId).catch((e) => console.error(`[process] categorize ${callId}:`, e));

  const { data: segRows } = await db
    .from("call_segments")
    .select("speaker, text, start_seconds, end_seconds")
    .eq("call_id", callId)
    .order("idx");
  const segments: TranscriptSegment[] = (segRows ?? []).map((s) => ({
    speaker: s.speaker,
    text: s.text,
    start: s.start_seconds ?? 0,
    end: s.end_seconds ?? 0,
  }));

  // 1. summary
  if (call.summary_status !== "done") {
    try {
      const s = await summarizeCall(call.transcript_text ?? "", call.title ?? undefined);
      await db.from("call_summaries").upsert({
        call_id: callId,
        summary: s.summary,
        key_points: s.key_points,
        action_items: s.action_items,
        decisions: s.decisions,
        model: env.ai.anthropicModel,
      });
      await db.from("calls").update({ summary_status: "done" }).eq("id", callId);
    } catch (e) {
      console.error(`[process] summary ${callId}:`, e);
      await db.from("calls").update({ summary_status: "error" }).eq("id", callId);
    }
  }

  // 2. embeddings
  if (call.embed_status !== "done" && segments.length) {
    try {
      const chunks = chunkSegments(segments);
      const vectors = await embed(chunks.map((c) => c.content), "document");
      await db.from("call_chunks").delete().eq("call_id", callId);
      await db.from("call_chunks").insert(
        chunks.map((c, idx) => ({
          call_id: callId,
          idx,
          content: c.content,
          start_seconds: c.start,
          end_seconds: c.end,
          embedding: toVector(vectors[idx]),
        }))
      );
      await db.from("calls").update({ embed_status: "done" }).eq("id", callId);
    } catch (e) {
      console.error(`[process] embed ${callId}:`, e);
      await db.from("calls").update({ embed_status: "error" }).eq("id", callId);
    }
  }
}

/** Process a batch of calls still pending summary or embeddings. */
export async function processPending(limit = 10): Promise<{ processed: number }> {
  const db = supabaseAdmin();
  const { data: pending } = await db
    .from("calls")
    .select("id")
    .is("duplicate_of", null)
    .or("summary_status.eq.pending,embed_status.eq.pending")
    .limit(limit);

  let processed = 0;
  for (const c of pending ?? []) {
    await processCall(c.id);
    processed++;
  }
  return { processed };
}
