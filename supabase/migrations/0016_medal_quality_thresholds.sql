-- Run once in Supabase SQL Editor before publishing the new task rings/statistics.
-- Existing results keep their original 100%-only success/failure verdict.
begin;

alter table public.medal_config add column if not exists quality_threshold_started_at timestamptz;
update public.medal_config set quality_threshold_started_at = now()
  where id = true and quality_threshold_started_at is null;

alter table public.medal_period_results
  add column if not exists completion_percent smallint check (completion_percent between 0 and 100),
  add column if not exists perfect boolean;
update public.medal_period_results set perfect = completed where perfect is null;
alter table public.medal_period_results alter column perfect set default false;
alter table public.medal_period_results alter column perfect set not null;

create or replace function public.finalize_medal_periods(p_time_zone text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  zone text;
  period_zone text;
  started date;
  local_today date;
  tf text;
  v_start date;
  v_end date;
  task_count integer;
  done_count integer;
  quality_started_at timestamptz;
  inserted_count integer;
  new_count integer := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'invalid time zone';
  end if;
  select quality_threshold_started_at into quality_started_at
    from public.medal_config where id = true;
  insert into public.medal_tracking(user_id, time_zone, started_on)
    values (uid, p_time_zone,
      (select (started_at at time zone p_time_zone)::date from public.medal_config where id = true))
    on conflict do nothing;
  select time_zone, started_on into zone, started from public.medal_tracking where user_id = uid for update;
  if not exists (select 1 from public.medal_zone_observations where user_id = uid) then
    insert into public.medal_zone_observations(user_id, observed_at, time_zone)
      select uid, started_at, zone from public.medal_config where id = true;
  end if;
  if zone <> p_time_zone then
    insert into public.medal_zone_observations(user_id, observed_at, time_zone)
      values (uid, now(), p_time_zone) on conflict do nothing;
  end if;
  local_today := greatest((now() at time zone zone)::date, (now() at time zone p_time_zone)::date);

  foreach tf in array array['day', 'week', 'month'] loop
    v_start := case tf
      when 'day' then started
      when 'week' then date_trunc('week', started::timestamp)::date
      else date_trunc('month', started::timestamp)::date end;
    select max(r.period_start) into v_end from public.medal_period_results r
      where r.user_id = uid and r.timeframe = tf;
    if v_end is not null then
      v_start := case tf
        when 'day' then v_end + 1
        when 'week' then v_end + 7
        else (v_end + interval '1 month')::date end;
    end if;
    loop
      v_end := case tf
        when 'day' then v_start
        when 'week' then v_start + 6
        else (v_start + interval '1 month - 1 day')::date end;
      exit when v_start > local_today;
      select z.time_zone into period_zone from public.medal_zone_observations z
        where z.user_id = uid and z.observed_at < ((v_end + 1)::timestamp at time zone zone)
        order by z.observed_at desc limit 1;
      period_zone := coalesce(period_zone, zone);
      -- Finalize at the first local midnight after the period ends.
      exit when now() < (((v_end + 1)::timestamp at time zone period_zone));
      -- A week/month already under way at launch is not a full tracked period.
      if v_start >= started and not exists (
        select 1 from public.medal_period_results r
        where r.user_id = uid and r.timeframe = tf and r.period_start = v_start
      ) then
        select count(*), count(*) filter (where progress >= target)
          into task_count, done_count from (
          select g.target,
            coalesce((select sum(l.value) from public.daily_logs l
              where l.goal_id = g.id and l.date between v_start and v_end), 0) as progress
          from public.goals g
          where g.user_id = uid and g.kind = 'task' and g.timeframe = tf
            and g.start_date <= v_end and (g.end_date is null or g.end_date >= v_start)
            and not exists (select 1 from public.medal_task_archive later
              where later.task_id = g.id
                and later.archived_at >= (((v_end + 1)::timestamp at time zone period_zone)))
          union all
          select a.target,
            coalesce((select sum((entry->>'value')::numeric)
              from jsonb_array_elements(a.logs) entry
              where (entry->>'date')::date between v_start and v_end), 0) as progress
          from (select distinct on (task_id) * from public.medal_task_archive
            where user_id = uid
              and archived_at >= (((v_end + 1)::timestamp at time zone period_zone))
            order by task_id, archived_at) a
          where a.user_id = uid and a.timeframe = tf
            and a.start_date <= v_end and (a.end_date is null or a.end_date >= v_start)
        ) tasks;
        insert into public.medal_period_results
          (user_id, timeframe, period_start, period_end, completed, perfect, completion_percent, time_zone)
        values (uid, tf, v_start, v_end,
          task_count > 0 and case
            when (((v_end + 1)::timestamp) at time zone period_zone) >= quality_started_at
              then done_count * 5 >= task_count * 4
            else done_count = task_count end,
          task_count > 0 and done_count = task_count,
          case when task_count > 0 then round(100.0 * done_count / task_count)::smallint else null end,
          period_zone)
        on conflict do nothing;
        get diagnostics inserted_count = row_count;
        new_count := new_count + inserted_count;
      end if;
      v_start := case tf
        when 'day' then v_start + 1
        when 'week' then v_start + 7
        else (v_start + interval '1 month')::date end;
    end loop;
  end loop;
  update public.medal_tracking set time_zone = p_time_zone where user_id = uid;
  return new_count;
end;
$$;
revoke all on function public.finalize_medal_periods(text) from public, anon;
grant execute on function public.finalize_medal_periods(text) to authenticated;

commit;
