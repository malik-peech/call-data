import "server-only";
import { env } from "@/lib/env";

/**
 * Speech-to-text, done on our side (provider-abstracted). Input is a media URL
 * (the download URL from Recall). Output is speaker-diarized segments matching
 * the `call_segments` table.
 *
 * Default: Gladia (good French + diarization). Alternative: a self-hosted
 * Whisper endpoint. Swap via TRANSCRIPTION_PROVIDER.
 */

export interface TranscriptSegment {
  speaker: string | null;
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export async function transcribeFromUrl(mediaUrl: string, language = "fr"): Promise<TranscriptSegment[]> {
  switch (env.transcription.provider) {
    case "whisper":
      return transcribeWhisper(mediaUrl, language);
    case "gladia":
    default:
      return transcribeGladia(mediaUrl, language);
  }
}

// ── Gladia (async v2) ─────────────────────────────────────────
async function transcribeGladia(mediaUrl: string, language: string): Promise<TranscriptSegment[]> {
  const init = await fetch("https://api.gladia.io/v2/transcription", {
    method: "POST",
    headers: { "x-gladia-key": env.transcription.gladiaKey, "Content-Type": "application/json" },
    body: JSON.stringify({ audio_url: mediaUrl, diarization: true, language }),
  });
  if (!init.ok) throw new Error(`Gladia init ${init.status}: ${(await init.text()).slice(0, 300)}`);
  const { result_url } = (await init.json()) as { result_url: string };

  // Poll until done (bounded).
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(result_url, { headers: { "x-gladia-key": env.transcription.gladiaKey } });
    const data = (await poll.json()) as {
      status: string;
      result?: { transcription?: { utterances?: { speaker?: number; text: string; start: number; end: number }[] } };
    };
    if (data.status === "done") {
      const utts = data.result?.transcription?.utterances ?? [];
      return utts.map((u) => ({
        speaker: u.speaker != null ? `Speaker ${u.speaker}` : null,
        text: u.text,
        start: u.start,
        end: u.end,
      }));
    }
    if (data.status === "error") throw new Error("Gladia transcription error");
  }
  throw new Error("Gladia transcription timed out");
}

// ── Self-hosted Whisper (generic) ─────────────────────────────
async function transcribeWhisper(mediaUrl: string, language: string): Promise<TranscriptSegment[]> {
  if (!env.transcription.whisperUrl) throw new Error("WHISPER_URL is not set");
  const res = await fetch(env.transcription.whisperUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: mediaUrl, language, diarize: true }),
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    segments?: { speaker?: string | number | null; text: string; start: number; end: number }[];
  };
  return (json.segments ?? []).map((s) => ({
    speaker: s.speaker == null ? null : String(s.speaker),
    text: s.text,
    start: s.start,
    end: s.end,
  }));
}
