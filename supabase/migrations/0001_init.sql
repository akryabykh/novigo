-- ============================================================
-- TRUSTO-style goal/habit tracker — Supabase schema (Postgres)
-- Запускать в Supabase SQL Editor. Email хранится в auth.users.
-- Прогресс/стрики/XP считаются в приложении (core/logic), тут — только хранение + доступ.
-- ============================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------- PROFILES (имя + игровая статистика; 1:1 с auth.users) ----------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  first_name     text not null,
  last_name      text,
  middle_name    text,
  xp             integer not null default 0,
  level          integer not null default 1,
  current_streak integer not null default 0,
  best_streak    integer not null default 0,
  created_at     timestamptz not null default now()
);

-- ---------- PROGRAMS (программы достижения целей) ----------
create table if not exists public.programs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  period     text not null check (period in ('1w','2w','1m')),
  start_date date not null default current_date,
  end_date   date not null,                -- проставляется триггером из period
  status     text not null default 'active' check (status in ('active','completed','archived')),
  created_at timestamptz not null default now()
);
create index if not exists programs_user_idx on public.programs(user_id);

-- ---------- TASKS (задачи внутри программы) ----------
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  title      text not null,
  goal_type  text not null check (goal_type in ('daily','period')),
  target     numeric not null check (target > 0),     -- daily: цель/день; period: цель/период
  unit       text,                                     -- отжимания / страницы / минуты
  weight     numeric not null check (weight >= 0 and weight <= 100),
  created_at timestamptz not null default now()
  -- ВНИМАНИЕ: сумма weight по программе = 100% валидируется в приложении при сохранении,
  -- а НЕ хард-констрейнтом в БД (иначе нельзя добавлять задачи по одной).
);
create index if not exists tasks_program_idx on public.tasks(program_id);

-- ---------- DAILY_LOGS (фактическое выполнение по дням) ----------
create table if not exists public.daily_logs (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null references public.tasks(id) on delete cascade,
  date      date not null,
  value     numeric not null default 0 check (value >= 0),   -- частичное допускается
  logged_at timestamptz not null default now(),
  unique (task_id, date)
);
create index if not exists daily_logs_task_date_idx on public.daily_logs(task_id, date);

-- ---------- ACHIEVEMENTS (разблокированные достижения) ----------
create table if not exists public.achievements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code        text not null,                 -- 'first_step' | 'week_streak' | ...
  unlocked_at timestamptz not null default now(),
  unique (user_id, code)
);
create index if not exists achievements_user_idx on public.achievements(user_id);

-- ============================================================
-- Триггер: end_date из period
-- ============================================================
create or replace function public.set_program_end_date()
returns trigger language plpgsql as $$
begin
  new.end_date := case new.period
    when '1w' then (new.start_date + interval '7 days')::date
    when '2w' then (new.start_date + interval '14 days')::date
    when '1m' then (new.start_date + interval '1 month')::date
  end;
  return new;
end; $$;

drop trigger if exists trg_program_end_date on public.programs;
create trigger trg_program_end_date
  before insert or update of period, start_date on public.programs
  for each row execute function public.set_program_end_date();

-- ============================================================
-- ROW LEVEL SECURITY — каждый видит и меняет только своё
-- ============================================================
alter table public.profiles     enable row level security;
alter table public.programs     enable row level security;
alter table public.tasks        enable row level security;
alter table public.daily_logs   enable row level security;
alter table public.achievements enable row level security;

-- profiles
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_upsert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- programs
create policy "programs_all_own" on public.programs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- tasks (владение через программу)
create policy "tasks_all_own" on public.tasks for all
  using (exists (select 1 from public.programs p where p.id = tasks.program_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.programs p where p.id = tasks.program_id and p.user_id = auth.uid()));

-- daily_logs (владение через tasks -> programs)
create policy "daily_logs_all_own" on public.daily_logs for all
  using (exists (
    select 1 from public.tasks t join public.programs p on p.id = t.program_id
    where t.id = daily_logs.task_id and p.user_id = auth.uid()))
  with check (exists (
    select 1 from public.tasks t join public.programs p on p.id = t.program_id
    where t.id = daily_logs.task_id and p.user_id = auth.uid()));

-- achievements
create policy "achievements_all_own" on public.achievements for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
