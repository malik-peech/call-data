-- ════════════════════════════════════════════════════════════
-- Call Data — track why a Recall bot never captured a meeting
-- (denied entry, stuck in waiting room, recording permission refused).
-- ════════════════════════════════════════════════════════════

alter table calls add column if not exists failure_reason text;
