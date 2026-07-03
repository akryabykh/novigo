-- ============================================================
-- Novigo — атомарное сохранение горизонта + серверные проверки целостности.
--
-- 1) RPC save_horizon(updates, creates, deletes) — обновления, удаления и
--    создания целей/задач в ОДНОЙ транзакции с проверкой принадлежности
--    auth.uid(). Раньше клиент слал N отдельных запросов и мог оставить
--    частично сохранённое состояние (сумма весов ≠ 100).
-- 2) CHECK-констрейнты: непустой title, у задачи target = 1.
-- 3) Триггер: лог принадлежит активному периоду цели (start_date..end_date).
--
-- Аддитивная миграция — данные НЕ сбрасываются и старые миграции НЕ переписываются.
-- Констрейнты добавляются как NOT VALID: применяются к новым/изменяемым строкам,
-- но не валят миграцию, если в базе вдруг остался легаси-ряд.
-- ============================================================

-- ---------- 2) Целостность целей/задач ----------
alter table public.goals
  drop constraint if exists goals_title_not_empty;
alter table public.goals
  add constraint goals_title_not_empty check (length(btrim(title)) > 0) not valid;

-- Задача — это всегда «одна галочка»: target ровно 1.
alter table public.goals
  drop constraint if exists goals_task_target_one;
alter table public.goals
  add constraint goals_task_target_one check (kind <> 'task' or target = 1) not valid;
-- (валидность дат end_date >= start_date уже гарантирует goals_end_after_start из 0004,
--  корректность kind — goals check из 0005.)

-- ---------- 3) Лог принадлежит активному периоду цели ----------
create or replace function public.enforce_log_in_goal_period()
returns trigger
language plpgsql
as $$
declare
  g_start date;
  g_end   date;
begin
  select start_date, end_date into g_start, g_end
  from public.goals where id = new.goal_id;

  if not found then
    raise exception 'goal % not found', new.goal_id;
  end if;
  if new.date < g_start then
    raise exception 'log date % is before goal start %', new.date, g_start;
  end if;
  if g_end is not null and new.date > g_end then
    raise exception 'log date % is after goal end %', new.date, g_end;
  end if;
  return new;
end;
$$;

drop trigger if exists daily_logs_in_period on public.daily_logs;
create trigger daily_logs_in_period
  before insert or update on public.daily_logs
  for each row execute function public.enforce_log_in_goal_period();

-- ---------- 1) Атомарное сохранение горизонта ----------
-- SECURITY INVOKER (по умолчанию): работает под правами вызывающего, значит RLS
-- по-прежнему в силе. Дополнительно проверяем user_id = auth.uid() и падаем с
-- ошибкой при попытке тронуть чужую строку (не молча пропускаем через RLS).
create or replace function public.save_horizon(
  p_updates jsonb default '[]'::jsonb,
  p_creates jsonb default '[]'::jsonb,
  p_deletes uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
as $$
declare
  uid uuid := auth.uid();
  rec jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- обновления
  for rec in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb))
  loop
    update public.goals set
      title    = rec->>'title',
      target   = (rec->>'target')::numeric,
      weight   = (rec->>'weight')::numeric,
      end_date = nullif(rec->>'endDate', '')::date
    where id = (rec->>'id')::uuid and user_id = uid;

    if not found then
      raise exception 'goal % not found or not owned', rec->>'id';
    end if;
  end loop;

  -- удаления
  if array_length(p_deletes, 1) is not null then
    delete from public.goals where id = any(p_deletes) and user_id = uid;
  end if;

  -- создания
  insert into public.goals (user_id, kind, title, timeframe, target, weight, start_date, end_date)
  select
    uid,
    c->>'kind',
    c->>'title',
    c->>'timeframe',
    (c->>'target')::numeric,
    (c->>'weight')::numeric,
    (c->>'startDate')::date,
    nullif(c->>'endDate', '')::date
  from jsonb_array_elements(coalesce(p_creates, '[]'::jsonb)) as c;
end;
$$;

grant execute on function public.save_horizon(jsonb, jsonb, uuid[]) to authenticated;
