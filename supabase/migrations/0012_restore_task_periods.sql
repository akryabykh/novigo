-- Run once in the production SQL Editor after 0011 made old tasks recur.
-- 0011 kept each task in its original calendar period but removed its end date.
-- This restores one-period tasks without touching goals, logs or task IDs.
begin;

with task_periods as (
  select id,
    case timeframe
      when 'day' then start_date
      when 'week' then date_trunc('week', start_date::timestamp)::date
      else date_trunc('month', start_date::timestamp)::date end as period_start,
    case timeframe
      when 'day' then start_date
      when 'week' then date_trunc('week', start_date::timestamp)::date + 6
      else (date_trunc('month', start_date::timestamp) + interval '1 month')::date - 1 end as period_end
  from public.goals where kind = 'task'
)
update public.goals g
set start_date = p.period_start,
  end_date = least(coalesce(g.end_date, p.period_end), p.period_end)
from task_periods p
where g.id = p.id
  and (g.start_date is distinct from p.period_start
    or g.end_date is null or g.end_date > p.period_end);

-- Older cached clients may still submit tasks without an end date. Normalize
-- those writes on the server so the same problem cannot return after repair.
create or replace function public.bound_task_to_period()
returns trigger language plpgsql set search_path = '' as $$
declare
  period_end date;
begin
  if new.kind <> 'task' then return new; end if;
  new.start_date := case new.timeframe
    when 'day' then new.start_date
    when 'week' then date_trunc('week', new.start_date::timestamp)::date
    else date_trunc('month', new.start_date::timestamp)::date end;
  period_end := case new.timeframe
    when 'day' then new.start_date
    when 'week' then new.start_date + 6
    else (new.start_date + interval '1 month')::date - 1 end;
  if new.end_date is null or new.end_date > period_end then
    new.end_date := period_end;
  end if;
  return new;
end;
$$;
revoke all on function public.bound_task_to_period() from public, anon;
drop trigger if exists a_bound_task_to_period on public.goals;
create trigger a_bound_task_to_period before insert or update on public.goals
  for each row execute function public.bound_task_to_period();

commit;

-- Expected result: 0. Check this before reopening the app online.
select count(*) as task_period_errors
from public.goals
where kind = 'task' and (end_date is null
  or start_date <> case timeframe
    when 'day' then start_date
    when 'week' then date_trunc('week', start_date::timestamp)::date
    else date_trunc('month', start_date::timestamp)::date end
  or end_date > case timeframe
    when 'day' then start_date
    when 'week' then start_date + 6
    else (start_date + interval '1 month')::date - 1 end);
