-- ════════════════════════════════════════════════════════════
-- Row Level Security — lock down the public anon key.
--
-- The app reads/writes exclusively via the service-role key on the server
-- (which bypasses RLS). Enabling RLS with NO policies means the public anon
-- key (shipped to the browser) cannot read or write any table via PostgREST.
-- ════════════════════════════════════════════════════════════

alter table clients        enable row level security;
alter table projects       enable row level security;
alter table calls          enable row level security;
alter table call_segments  enable row level security;
alter table call_chunks    enable row level security;
alter table call_summaries enable row level security;
alter table chat_threads   enable row level security;
alter table chat_messages  enable row level security;
alter table sync_runs      enable row level security;

-- No policies are defined on purpose: anon/authenticated get zero rows.
-- If you later expose data directly to the browser via the anon key, add
-- explicit `create policy ... for select to authenticated using (...)` here.
