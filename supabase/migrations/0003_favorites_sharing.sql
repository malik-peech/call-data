-- ════════════════════════════════════════════════════════════
-- Favoris (partagés agence) + partage externe par lien (façon Attio).
-- ════════════════════════════════════════════════════════════

alter table calls
  add column if not exists is_favorite boolean not null default false,
  add column if not exists share_enabled boolean not null default false,
  add column if not exists share_token uuid unique default gen_random_uuid();

create index if not exists calls_favorite on calls (is_favorite) where is_favorite;
create index if not exists calls_share_token on calls (share_token) where share_enabled;
