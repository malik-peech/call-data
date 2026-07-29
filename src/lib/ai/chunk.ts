import type { TranscriptSegment } from "@/lib/ai/transcription";

/**
 * Group transcript segments into chunks (~1500 chars) for embedding, keeping
 * speaker attribution and start/end timestamps for citations.
 */

export interface Chunk {
  content: string;
  start: number;
  end: number;
}

const MAX_CHARS = 1500;

export function chunkSegments(segments: TranscriptSegment[]): Chunk[] {
  const chunks: Chunk[] = [];
  let buf: string[] = [];
  let len = 0;
  let start = 0;
  let end = 0;

  const flush = () => {
    if (buf.length) chunks.push({ content: buf.join("\n"), start, end });
    buf = [];
    len = 0;
  };

  for (const s of segments) {
    const line = `${s.speaker ?? "?"}: ${s.text}`;
    if (buf.length === 0) start = s.start;
    buf.push(line);
    end = s.end;
    len += line.length;
    if (len >= MAX_CHARS) flush();
  }
  flush();
  return chunks;
}
