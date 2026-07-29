import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import type { ActionItem } from "@/lib/types";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.ai.anthropicKey });
  return _client;
}

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Extract the first JSON object/array from a model response. */
function parseJson<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

export interface CallSummary {
  summary: string;
  key_points: string[];
  action_items: ActionItem[];
  decisions: string[];
}

export async function summarizeCall(transcript: string, title?: string): Promise<CallSummary> {
  const clipped = transcript.slice(0, 120_000);
  const msg = await client().messages.create({
    model: env.ai.anthropicModel,
    max_tokens: 2000,
    system:
      "Tu es un assistant qui résume des réunions professionnelles en français. " +
      "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format : " +
      '{"summary": string, "key_points": string[], "action_items": [{"owner": string|null, "task": string}], "decisions": string[]}. ' +
      "Le résumé fait 4-8 phrases. Sois factuel et concis.",
    messages: [
      {
        role: "user",
        content: `Titre : ${title ?? "(sans titre)"}\n\nTranscript :\n${clipped}`,
      },
    ],
  });
  const parsed = parseJson<CallSummary>(textOf(msg));
  return (
    parsed ?? { summary: textOf(msg).slice(0, 2000), key_points: [], action_items: [], decisions: [] }
  );
}

export interface AnswerSource {
  index: number;
  callId: string;
  chunkId: number;
  title: string | null;
  start: number | null;
  content: string;
}

export async function answerQuestion(params: {
  question: string;
  sources: AnswerSource[];
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<{ answer: string; usedIndices: number[] }> {
  const context = params.sources
    .map((s) => `[${s.index}] (${s.title ?? "call"}) ${s.content}`)
    .join("\n\n");

  const msg = await client().messages.create({
    model: env.ai.anthropicModel,
    max_tokens: 1500,
    system:
      "Tu réponds en français à des questions sur des calls (réunions/appels commerciaux) " +
      "à partir d'extraits de transcripts fournis. Appuie-toi UNIQUEMENT sur ces extraits. " +
      "Si l'info n'y est pas, dis-le. Cite tes sources avec leurs numéros [n]. " +
      'Termine ta réponse par une ligne JSON : {"used": [numéros des extraits utilisés]}.',
    messages: [
      ...(params.history ?? []),
      { role: "user", content: `Extraits :\n${context}\n\nQuestion : ${params.question}` },
    ],
  });

  const raw = textOf(msg);
  const used = parseJson<{ used: number[] }>(raw)?.used ?? [];
  const answer = raw.replace(/\{[\s\S]*"used"[\s\S]*\}\s*$/, "").trim();
  return { answer, usedIndices: used };
}
