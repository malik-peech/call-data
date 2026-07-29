-- ════════════════════════════════════════════════════════════
-- Call Data — track which team members connected their Google
-- Calendar to Recall (per-user OAuth, see /auth/calendar/connect).
-- ════════════════════════════════════════════════════════════

create table if not exists connected_calendars (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique,
  recall_calendar_id  text not null,
  platform            text not null default 'google_calendar',
  connected_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table connected_calendars enable row level security;
-- No policies on purpose (see 0002_rls.sql): only the server-side
-- service-role client reads/writes this table.
