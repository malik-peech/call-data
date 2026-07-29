-- ════════════════════════════════════════════════════════════
-- Call Data — initial schema
-- Run in Supabase SQL editor (or via `supabase db push`).
-- ════════════════════════════════════════════════════════════

create extension if not exists vector;      -- pgvector: embeddings
create extension if not exists pg_trgm;      -- fuzzy client/project matching

-- ── Reference: clients (synced from Airtable + manual) ────────
create table if not exists clients (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  airtable_id  text unique,               -- linked client record id in Airtable
  aliases      text[] not null default '{}',   -- alternate spellings for matching
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists clients_name_trgm on clients using gin (name gin_trgm_ops);

-- ── Reference: projects (synced from Airtable view) ───────────
create table if not exists projects (
  id           uuid primary key default gen_random_uuid(),
  code         text,                        -- Airtable project code, e.g. "1726"
  name         text not null,               -- project title
  client_id    uuid references clients(id) on delete set null,
  airtable_id  text unique,                 -- Airtable project record id
  status       text,                        -- "En cours" | "Finalisation" | ...
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists projects_code on projects (code);
create index if not exists projects_name_trgm on projects using gin (name gin_trgm_ops);

-- ── Calls (one row per de-duplicated meeting/recording) ───────
create table if not exists calls (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null check (source in ('recall','attio','google_meet')),
  external_id         text not null,        -- recall bot id | attio call_recording_id | google doc id
  meeting_external_id text,                 -- attio meeting_id
  title               text,
  started_at          timestamptz,
  ended_at            timestamptz,
  duration_seconds    int,
  participants        text[] not null default '{}',

  -- media
  video_url           text,                 -- external link (attio web_url, drive link)
  video_source        text,                 -- 'storage' | 'attio' | 'drive'
  media_path          text,                 -- Supabase Storage path for the video (recall)
  audio_path          text,                 -- Supabase Storage path for the extracted audio
  transcript_text     text,                 -- full plain text (fallback + full-text search)
  transcript_provider text,                 -- 'deepgram' | 'gladia' | 'whisper' | 'attio' | 'meet'
  raw                 jsonb,

  -- capture (recall + calendar)
  recall_bot_id       text,
  calendar_event_id   text,
  recording_status    text not null default 'none'
                        check (recording_status in ('none','scheduled','recording','done','failed')),

  -- categorization
  client_id           uuid references clients(id) on delete set null,
  project_id          uuid references projects(id) on delete set null,
  category_source     text not null default 'none' check (category_source in ('none','auto','manual')),
  category_confidence real,

  -- dedup: a google_meet row can point at its attio twin
  duplicate_of        uuid references calls(id) on delete set null,

  -- processing state
  summary_status      text not null default 'pending' check (summary_status in ('pending','processing','done','error')),
  embed_status        text not null default 'pending' check (embed_status in ('pending','processing','done','error')),

  synced_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists calls_started_at on calls (started_at desc);
create index if not exists calls_client on calls (client_id);
create index if not exists calls_project on calls (project_id);
create index if not exists calls_dup on calls (duplicate_of);
create index if not exists calls_transcript_fts
  on calls using gin (to_tsvector('french', coalesce(transcript_text, '')));

-- ── Transcript segments (speaker lines) ───────────────────────
create table if not exists call_segments (
  id            bigserial primary key,
  call_id       uuid not null references calls(id) on delete cascade,
  idx           int not null,
  speaker       text,
  text          text not null,
  start_seconds real,
  end_seconds   real
);
create index if not exists call_segments_call on call_segments (call_id, idx);

-- ── Chunks + embeddings (RAG) ─────────────────────────────────
-- voyage-3 / voyage-3-large output 1024-dim vectors.
create table if not exists call_chunks (
  id            bigserial primary key,
  call_id       uuid not null references calls(id) on delete cascade,
  idx           int not null,
  content       text not null,
  start_seconds real,
  end_seconds   real,
  embedding     vector(1024)
);
create index if not exists call_chunks_call on call_chunks (call_id);
create index if not exists call_chunks_embedding
  on call_chunks using hnsw (embedding vector_cosine_ops);

-- ── Summaries ─────────────────────────────────────────────────
create table if not exists call_summaries (
  call_id      uuid primary key references calls(id) on delete cascade,
  summary      text,
  key_points   jsonb,                 -- string[]
  action_items jsonb,                 -- {owner, task}[]
  decisions    jsonb,                 -- string[]
  model        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Chat (Q&A) ────────────────────────────────────────────────
create table if not exists chat_threads (
  id         uuid primary key default gen_random_uuid(),
  scope      text not null check (scope in ('call','client','project','global')),
  call_id    uuid references calls(id) on delete cascade,
  client_id  uuid references clients(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  title      text,
  created_by text,
  created_at timestamptz not null default now()
);
create table if not exists chat_messages (
  id         bigserial primary key,
  thread_id  uuid not null references chat_threads(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  citations  jsonb,                   -- [{call_id, chunk_id, start_seconds, title}]
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_thread on chat_messages (thread_id, id);

-- ── Sync bookkeeping ──────────────────────────────────────────
create table if not exists sync_runs (
  id          bigserial primary key,
  source      text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running',
  stats       jsonb,
  error       text
);

-- ── Vector search RPC ─────────────────────────────────────────
create or replace function match_call_chunks(
  query_embedding vector(1024),
  match_count int default 12,
  filter_client uuid default null,
  filter_project uuid default null,
  filter_call uuid default null
) returns table (
  chunk_id bigint,
  call_id uuid,
  title text,
  content text,
  start_seconds real,
  started_at timestamptz,
  similarity real
) language sql stable as $$
  select c.id, c.call_id, ca.title, c.content, c.start_seconds, ca.started_at,
         1 - (c.embedding <=> query_embedding) as similarity
  from call_chunks c
  join calls ca on ca.id = c.call_id
  where c.embedding is not null
    and (filter_call    is null or c.call_id   = filter_call)
    and (filter_client  is null or ca.client_id  = filter_client)
    and (filter_project is null or ca.project_id = filter_project)
    and ca.duplicate_of is null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ── updated_at trigger ────────────────────────────────────────
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$
declare t text;
begin
  foreach t in array array['clients','projects','calls','call_summaries']
  loop
    execute format(
      'drop trigger if exists trg_%1$s_updated on %1$s;
       create trigger trg_%1$s_updated before update on %1$s
       for each row execute function set_updated_at();', t);
  end loop;
end $$;
