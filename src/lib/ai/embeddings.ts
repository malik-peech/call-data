import "server-only";
import { env } from "@/lib/env";

/**
 * Voyage AI embeddings. voyage-3 → 1024 dims (matches the `vector(1024)` column).
 * Use input_type "document" when indexing, "query" when searching.
 */

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MAX_BATCH = 128;

export async function embed(
  texts: string[],
  inputType: "document" | "query" = "document"
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.ai.voyageKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: batch, model: env.ai.voyageModel, input_type: inputType }),
    });
    if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    const sorted = json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    out.push(...sorted);
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embed([text], "query");
  return v;
}

/** pgvector literal — supabase-js sends vector columns as a string. */
export function toVector(v: number[]): string {
  return `[${v.join(",")}]`;
}
