/**
 * Domain + database types.
 *
 * The `Database` type is a pragmatic, hand-maintained shape (not fully
 * generated) covering the columns the app reads/writes. Regenerate with
 * `supabase gen types typescript` later if you want exhaustive coverage.
 */

export type CallSource = "attio" | "google_meet";
export type CategorySource = "none" | "auto" | "manual";
export type ProcessStatus = "pending" | "processing" | "done" | "error";
export type ChatScope = "call" | "client" | "project" | "global";

export interface Client {
  id: string;
  name: string;
  airtable_id: string | null;
  aliases: string[];
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  code: string | null;
  name: string;
  client_id: string | null;
  airtable_id: string | null;
  status: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Call {
  id: string;
  source: CallSource;
  external_id: string;
  meeting_external_id: string | null;
  title: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  participants: string[];
  video_url: string | null;
  video_source: string | null;
  transcript_text: string | null;
  raw: unknown;
  client_id: string | null;
  project_id: string | null;
  category_source: CategorySource;
  category_confidence: number | null;
  duplicate_of: string | null;
  summary_status: ProcessStatus;
  embed_status: ProcessStatus;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface CallSegment {
  id: number;
  call_id: string;
  idx: number;
  speaker: string | null;
  text: string;
  start_seconds: number | null;
  end_seconds: number | null;
}

export interface CallChunk {
  id: number;
  call_id: string;
  idx: number;
  content: string;
  start_seconds: number | null;
  end_seconds: number | null;
  embedding: number[] | null;
}

export interface ActionItem {
  owner: string | null;
  task: string;
}

export interface CallSummary {
  call_id: string;
  summary: string | null;
  key_points: string[] | null;
  action_items: ActionItem[] | null;
  decisions: string[] | null;
  model: string | null;
  created_at: string;
  updated_at: string;
}

export interface Citation {
  call_id: string;
  chunk_id: number;
  start_seconds: number | null;
  title: string | null;
}

export interface ChatMessage {
  id: number;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  created_at: string;
}

/** Result row from the match_call_chunks RPC. */
export interface ChunkMatch {
  chunk_id: number;
  call_id: string;
  title: string | null;
  content: string;
  start_seconds: number | null;
  started_at: string | null;
  similarity: number;
}

// ── Minimal Supabase Database type ────────────────────────────
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
};

export interface Database {
  public: {
    Tables: {
      clients: Table<Client>;
      projects: Table<Project>;
      calls: Table<Call>;
      call_segments: Table<CallSegment>;
      call_chunks: Table<CallChunk>;
      call_summaries: Table<CallSummary>;
      chat_threads: Table<{
        id: string;
        scope: ChatScope;
        call_id: string | null;
        client_id: string | null;
        project_id: string | null;
        title: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      chat_messages: Table<ChatMessage>;
      sync_runs: Table<{
        id: number;
        source: string;
        started_at: string;
        finished_at: string | null;
        status: string;
        stats: unknown;
        error: string | null;
      }>;
    };
    Functions: {
      match_call_chunks: {
        Args: {
          query_embedding: string;
          match_count?: number;
          filter_client?: string | null;
          filter_project?: string | null;
          filter_call?: string | null;
        };
        Returns: ChunkMatch[];
      };
    };
  };
}
