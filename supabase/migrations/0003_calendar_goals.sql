-- ============================================================
-- Novigo — переход на КАЛЕНДАРНУЮ модель.
-- Цели — повторяющиеся шаблоны пользователя по горизонтам (день/неделя/месяц).
-- Прогресс считается по календарным периодам выбранной даты.
-- «Сессия» удалена. Данные ОБНУЛЯЮТСЯ (по решению пользователя).
-- Математика колец не меняется — меняется только привязка периодов к календарю.
-- ============================================================

-- Полный сброс старой модели (сессии + цели + логи).
drop table if exists public.daily_logs cascade;
drop table if exists public.goals cascade;
drop table if exists public.goal_sessions cascade;

-- ---------- GOALS (повторяющиеся цели пользователя) ----------
create table public.goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  timeframe  text not null check (timeframe in ('day','week','month')),
  target     numeric not null check (target > 0),
  weight     numeric not null default 0 check (weight >= 0 and weight <= 100),
  archived   boolean not null default false,
  created_at timestamptz not null default now()
  -- сумма weight внутри горизонта = 100% валидируется в приложении при сохранении.
);
create index goals_user_idx on public.goals(user_id);

-- ---------- DAILY_LOGS (факт по дням, по цели) ----------
create table public.daily_logs (
  id        uuid primary key default gen_random_uuid(),
  goal_id   uuid not null references public.goals(id) on delete cascade,
  date      date not null,
  value     numeric not null default 0 check (value >= 0),
  logged_at timestamptz not null default now(),
  unique (goal_id, date)
);
create index daily_logs_goal_date_idx on public.daily_logs(goal_id, date);

-- ============================================================
-- ROW LEVEL SECURITY — каждый видит и меняет только своё
-- ============================================================
alter table public.goals      enable row level security;
alter table public.daily_logs enable row level security;

create policy "goals_all_own" on public.goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "daily_logs_all_own" on public.daily_logs for all
  using (exists (
    select 1 from public.goals g where g.id = daily_logs.goal_id and g.user_id = auth.uid()))
  with check (exists (
    select 1 from public.goals g where g.id = daily_logs.goal_id and g.user_id = auth.uid()));
