-- ============================================================
-- Novigo — период действия у цели.
-- Цель действует с даты создания (start_date, нельзя задним числом) и либо
-- «навсегда» (end_date = null), либо до выбранной даты включительно.
-- Аддитивная миграция — данные НЕ сбрасываются.
-- ============================================================

alter table public.goals
  add column if not exists start_date date not null default current_date;

alter table public.goals
  add column if not exists end_date date; -- null = навсегда

-- Конец не раньше начала.
alter table public.goals
  drop constraint if exists goals_end_after_start;
alter table public.goals
  add constraint goals_end_after_start check (end_date is null or end_date >= start_date);
