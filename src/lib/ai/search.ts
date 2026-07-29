import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { embedQuery, toVector } from "@/lib/ai/embeddings";
import type { ChunkMatch } from "@/lib/types";

/**
 * Semantic retrieval over call_chunks via the match_call_chunks RPC.
 * Scope the search to a single call, a client, or a project.
 */
export async function searchChunks(params: {
  query: string;
  callId?: string;
  clientId?: string;
  projectId?: string;
  limit?: number;
}): Promise<ChunkMatch[]> {
  const vector = await embedQuery(params.query);
  const { data, error } = await supabaseAdmin().rpc("match_call_chunks", {
    query_embedding: toVector(vector),
    match_count: params.limit ?? 12,
    filter_client: params.clientId ?? null,
    filter_project: params.projectId ?? null,
    filter_call: params.callId ?? null,
  });
  if (error) throw new Error(`match_call_chunks failed: ${error.message}`);
  return (data ?? []) as ChunkMatch[];
}
