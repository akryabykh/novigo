-- ============================================================
-- Novigo — переход на модель «сессия целей».
-- Сессия = 4 недели от момента создания. Цели горизонтов день/неделя/месяц,
-- веса внутри горизонта = 100%. Кольца считаются в приложении (core/logic).
-- Старые программы/задачи удаляем (реальных данных нет).
-- ============================================================

drop table if exists public.daily_logs cascade;
drop table if exists public.tasks cascade;
drop table if exists public.programs cascade;

-- ---------- GOAL_SESSIONS (отсчёт от создания) ----------
create table if not exists public.goal_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  start_date date not null default current_date,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists goal_sessions_user_idx on public.goal_sessions(user_id);

-- ---------- GOALS (цели сессии) ----------
create table if not exists public.goals (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.goal_sessions(id) on delete cascade,
  title      text not null,
  timeframe  text not null check (timeframe in ('day','week','month')),
  target     numeric not null check (target > 0),
  weight     numeric not null default 0 check (weight >= 0 and weight <= 100),
  created_at timestamptz not null default now()
  -- сумма weight по горизонту = 100% валидируется в приложении при сохранении.
);
create index if not exists goals_session_idx on public.goals(session_id);

-- ---------- DAILY_LOGS (факт по дням, по цели) ----------
create table if not exists public.daily_logs (
  id        uuid primary key default gen_random_uuid(),
  goal_id   uuid not null references public.goals(id) on delete cascade,
  date      date not null,
  value     numeric not null default 0 check (value >= 0),
  logged_at timestamptz not null default now(),
  unique (goal_id, date)
);
create index if not exists daily_logs_goal_date_idx on public.daily_logs(goal_id, date);

-- ============================================================
-- ROW LEVEL SECURITY — каждый видит и меняет только своё
-- ============================================================
alter table public.goal_sessions enable row level security;
alter table public.goals         enable row level security;
alter table public.daily_logs    enable row level security;

create policy "goal_sessions_all_own" on public.goal_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "goals_all_own" on public.goals for all
  using (exists (select 1 from public.goal_sessions s where s.id = goals.session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.goal_sessions s where s.id = goals.session_id and s.user_id = auth.uid()));

create policy "daily_logs_all_own" on public.daily_logs for all
  using (exists (
    select 1 from public.goals g join public.goal_sessions s on s.id = g.session_id
    where g.id = daily_logs.goal_id and s.user_id = auth.uid()))
  with check (exists (
    select 1 from public.goals g join public.goal_sessions s on s.id = g.session_id
    where g.id = daily_logs.goal_id and s.user_id = auth.uid()));
