import type { TranscriptSegment } from "@/lib/ai/transcription";

/**
 * Parse a Google Meet transcript Doc (exported as plain text) into segments.
 * Handles the two observed layouts:
 *   A)  "## Title" / "# Participants" / "# Transcription" then "Speaker: text"
 *   B)  "[0:03] Speaker Name: text"
 */
export interface ParsedMeet {
  title: string | null;
  participants: string[];
  segments: TranscriptSegment[];
}

const tsToSeconds = (m: string, s: string) => Number(m) * 60 + Number(s);

export function parseMeetTranscript(text: string): ParsedMeet {
  const lines = text.split(/\r?\n/);
  let title: string | null = null;
  let participants: string[] = [];
  const segments: TranscriptSegment[] = [];

  // sections (layout A)
  let section: "none" | "participants" | "transcription" = "none";

  const withTs = /^\[(\d+):(\d{1,2})\]\s*([^:]+?):\s*(.*)$/; // layout B
  const noTs = /^([A-Za-zÀ-ÿ][^:]{0,60}?):\s*(.*)$/; // layout A "Speaker: text"

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("##")) {
      title = title ?? line.replace(/^#+\s*/, "").trim();
      continue;
    }
    if (/^#\s*participants/i.test(line)) { section = "participants"; continue; }
    if (/^#\s*transcription/i.test(line)) { section = "transcription"; continue; }
    if (line.startsWith("#")) { section = "none"; continue; }

    if (section === "participants") {
      participants = line.split(",").map((p) => p.trim()).filter(Boolean);
      continue;
    }

    const b = line.match(withTs);
    if (b) {
      segments.push({ speaker: b[3].trim(), text: b[4].trim(), start: tsToSeconds(b[1], b[2]), end: tsToSeconds(b[1], b[2]) });
      continue;
    }
    const a = line.match(noTs);
    if (a) {
      segments.push({ speaker: a[1].trim(), text: a[2].trim(), start: 0, end: 0 });
      continue;
    }
    // continuation of previous speaker
    if (segments.length) segments[segments.length - 1].text += " " + line;
  }

  if (!participants.length) {
    participants = [...new Set(segments.map((s) => s.speaker).filter(Boolean))] as string[];
  }
  return { title, participants, segments };
}
