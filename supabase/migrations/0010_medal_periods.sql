-- Run in the production SQL Editor before publishing the Statistics tab.
-- Safe to re-run if an earlier attempt stopped partway through.
-- Results are immutable: later task edits/deletes cannot lower an earned record.
create table if not exists public.medal_config (
  id boolean primary key default true check (id),
  started_at timestamptz not null default now()
);
insert into public.medal_config(id) values (true) on conflict do nothing;
revoke all on public.medal_config from public, anon, authenticated;

create table if not exists public.medal_tracking (
  user_id uuid primary key references auth.users(id) on delete cascade,
  time_zone text not null,
  started_on date not null
);
alter table public.medal_tracking enable row level security;
revoke all on public.medal_tracking from public, anon, authenticated;

-- Preserve zone changes. A period uses the last zone observed before its end.
-- If the app was closed, that is the last zone we had saved.
create table if not exists public.medal_zone_observations (
  user_id uuid not null references auth.users(id) on delete cascade,
  observed_at timestamptz not null,
  time_zone text not null,
  primary key (user_id, observed_at)
);
alter table public.medal_zone_observations enable row level security;
revoke all on public.medal_zone_observations from public, anon, authenticated;

-- A deleted or moved task still existed in any earlier period. Retain its
-- completion logs so a user returning after several days can finalize them.
create table if not exists public.medal_task_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  timeframe text not null check (timeframe in ('day', 'week', 'month')),
  start_date date not null,
  end_date date,
  target numeric not null,
  archived_at timestamptz not null default now(),
  logs jsonb not null default '[]'::jsonb
);
create index if not exists medal_task_archive_user_idx on public.medal_task_archive(user_id, timeframe);
alter table public.medal_task_archive enable row level security;
drop policy if exists "medal_task_archive_select_own" on public.medal_task_archive;
create policy "medal_task_archive_select_own" on public.medal_task_archive for select
  using (auth.uid() = user_id);
revoke all on public.medal_task_archive from public, anon, authenticated;
grant select on public.medal_task_archive to authenticated;

create or replace function public.archive_task_for_medals()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.kind <> 'task' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if (old.timeframe, old.start_date, old.end_date, old.target)
        is not distinct from (new.timeframe, new.start_date, new.end_date, new.target) then
      return new;
    end if;
  end if;
  insert into public.medal_task_archive(user_id, task_id, timeframe, start_date, end_date, target, logs)
  values (old.user_id, old.id, old.timeframe, old.start_date, old.end_date, old.target,
    coalesce((select jsonb_agg(jsonb_build_object('date', l.date, 'value', l.value))
      from public.daily_logs l where l.goal_id = old.id), '[]'::jsonb));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.archive_task_for_medals() from public, anon, authenticated;
drop trigger if exists archive_task_for_medals on public.goals;
create trigger archive_task_for_medals before update or delete on public.goals
  for each row execute function public.archive_task_for_medals();

create table if not exists public.medal_period_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  timeframe text not null check (timeframe in ('day', 'week', 'month')),
  period_start date not null,
  period_end date not null,
  completed boolean not null,
  time_zone text not null,
  finalized_at timestamptz not null default now(),
  primary key(user_id, timeframe, period_start)
);
create index if not exists medal_period_results_user_end_idx on public.medal_period_results(user_id, timeframe, period_end);
alter table public.medal_period_results enable row level security;
drop policy if exists "medal_period_results_select_own" on public.medal_period_results;
create policy "medal_period_results_select_own" on public.medal_period_results for select
  using (auth.uid() = user_id);
revoke all on public.medal_period_results from public, anon, authenticated;
grant select on public.medal_period_results to authenticated;

-- Called after the offline write queue has synchronized. Finish outstanding
-- periods in the LAST observed device zone, then remember its current zone.
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
  all_done boolean;
  inserted_count integer;
  new_count integer := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'invalid time zone';
  end if;
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
      -- The existing editor remains open for 24 hours after midnight.
      exit when now() < (((v_end + 1)::timestamp at time zone period_zone) + interval '24 hours');
      -- A week/month already under way at launch is not a full tracked period.
      if v_start >= started and not exists (
        select 1 from public.medal_period_results r
        where r.user_id = uid and r.timeframe = tf and r.period_start = v_start
      ) then
        select count(*), bool_and(progress >= target) into task_count, all_done from (
          select g.target,
            coalesce((select sum(l.value) from public.daily_logs l
              where l.goal_id = g.id and l.date between v_start and v_end), 0) as progress
          from public.goals g
          where g.user_id = uid and g.kind = 'task' and g.timeframe = tf
            and g.start_date <= v_end and (g.end_date is null or g.end_date >= v_start)
            and not exists (select 1 from public.medal_task_archive later
              where later.task_id = g.id
                and later.archived_at >= (((v_end + 1)::timestamp at time zone period_zone) + interval '24 hours'))
          union all
          select a.target,
            coalesce((select sum((entry->>'value')::numeric)
              from jsonb_array_elements(a.logs) entry
              where (entry->>'date')::date between v_start and v_end), 0) as progress
          from (select distinct on (task_id) * from public.medal_task_archive
            where user_id = uid
              and archived_at >= (((v_end + 1)::timestamp at time zone period_zone) + interval '24 hours')
            order by task_id, archived_at) a
          where a.user_id = uid and a.timeframe = tf
            and a.start_date <= v_end and (a.end_date is null or a.end_date >= v_start)
        ) tasks;
        insert into public.medal_period_results(user_id, timeframe, period_start, period_end, completed, time_zone)
        values (uid, tf, v_start, v_end, task_count > 0 and coalesce(all_done, false), period_zone)
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
