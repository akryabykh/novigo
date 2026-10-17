-- Run once in Supabase SQL Editor before publishing the Rest day controls.
-- Existing finalized medal results remain unchanged.
begin;

create table if not exists public.rest_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  time_zone text not null,
  requested_at timestamptz not null,
  primary key (user_id, day)
);
alter table public.rest_days enable row level security;
drop policy if exists rest_days_select_own on public.rest_days;
create policy rest_days_select_own on public.rest_days for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.rest_days from public, anon, authenticated;
grant select on public.rest_days to authenticated;

alter table public.medal_period_results add column if not exists rest_day boolean not null default false;

-- Idempotent writes allow the offline queue to retry after a lost response.
create or replace function public.set_rest_day(
  p_day date, p_enabled boolean, p_time_zone text, p_requested_at timestamptz,
  p_operation_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_operation_id is not null and exists (
    select 1 from public.offline_receipts where operation_id = p_operation_id and user_id = uid
  ) then return; end if;
  if p_day is null or p_enabled is null or p_requested_at is null or
      not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'invalid rest day request';
  end if;
  -- A queued offline tap may arrive after midnight. Its original local time
  -- determines whether it was made before that day's close.
  if p_requested_at > now() + interval '5 minutes' or
      p_requested_at >= ((p_day + 1)::timestamp at time zone p_time_zone) then
    raise exception 'day_closed';
  end if;
  if exists (select 1 from public.medal_period_results
      where user_id = uid and timeframe = 'day' and period_start = p_day) then
    raise exception 'offline_conflict: day already finalized';
  end if;
  insert into public.medal_zone_observations(user_id, observed_at, time_zone)
    values (uid, p_requested_at, p_time_zone) on conflict do nothing;
  if p_enabled then
    if exists (select 1 from public.goals
        where user_id = uid and kind = 'task' and timeframe = 'day'
          and start_date <= p_day and (end_date is null or end_date >= p_day))
      or exists (select 1 from public.medal_task_archive
        where user_id = uid and timeframe = 'day'
          and start_date <= p_day and (end_date is null or end_date >= p_day)) then
      raise exception 'offline_conflict: day has tasks';
    end if;
    insert into public.rest_days(user_id, day, time_zone, requested_at)
      values (uid, p_day, p_time_zone, p_requested_at)
      on conflict (user_id, day) do nothing;
  else
    delete from public.rest_days where user_id = uid and day = p_day;
  end if;
  if p_operation_id is not null then
    insert into public.offline_receipts(operation_id, user_id)
      values (p_operation_id, uid) on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.set_rest_day(date, boolean, text, timestamptz, uuid) from public, anon;
grant execute on function public.set_rest_day(date, boolean, text, timestamptz, uuid) to authenticated;

-- Adding a day task cancels a previously planned rest day, including changes
-- made from another device. Weekly and monthly tasks are independent.
create or replace function public.cancel_rest_day_for_task()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'task' and new.timeframe = 'day' then
    delete from public.rest_days
      where user_id = new.user_id and day >= new.start_date
        and (new.end_date is null or day <= new.end_date);
  end if;
  return new;
end;
$$;
revoke all on function public.cancel_rest_day_for_task() from public, anon, authenticated;
drop trigger if exists cancel_rest_day_for_task on public.goals;
create trigger cancel_rest_day_for_task after insert or update of kind, timeframe, start_date, end_date on public.goals
  for each row execute function public.cancel_rest_day_for_task();

-- The updated finalizer below records a neutral day when it ends with no
-- day tasks and a rest-day marker. It preserves the existing 80% thresholds.
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
  is_rest_day boolean;
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
        select tf = 'day' and task_count = 0 and exists (
          select 1 from public.rest_days rd where rd.user_id = uid and rd.day = v_start
        ) into is_rest_day;
        insert into public.medal_period_results
          (user_id, timeframe, period_start, period_end, completed, perfect, completion_percent, time_zone, rest_day)
        values (uid, tf, v_start, v_end,
          task_count > 0 and case
            when (((v_end + 1)::timestamp) at time zone period_zone) >= quality_started_at
              then done_count * 5 >= task_count * 4
            else done_count = task_count end,
          task_count > 0 and done_count = task_count,
          case when task_count > 0 then round(100.0 * done_count / task_count)::smallint else null end,
          period_zone, is_rest_day)
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
