-- Run once in Supabase SQL Editor before publishing the family task screen.
-- Family tasks are separate from personal goals, logs, rings and medals.
begin;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  time_zone text not null,
  member_count integer not null default 1 check (member_count between 1 and 2),
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index if not exists family_members_family_idx on public.family_members(family_id);

create table if not exists public.family_tasks (
  id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  timeframe text not null check (timeframe in ('day', 'week', 'month')),
  period_start date not null,
  done boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists family_tasks_period_idx on public.family_tasks(family_id, timeframe, period_start);

create table if not exists public.family_task_receipts (
  operation_id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  applied_at timestamptz not null default now()
);

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_tasks enable row level security;
alter table public.family_task_receipts enable row level security;

drop policy if exists family_select_member on public.families;
create policy family_select_member on public.families for select to authenticated
  using (exists (select 1 from public.family_members m where m.family_id = id and m.user_id = auth.uid()));
drop policy if exists family_members_select_own on public.family_members;
create policy family_members_select_own on public.family_members for select to authenticated
  using (user_id = auth.uid());
drop policy if exists family_tasks_select_member on public.family_tasks;
create policy family_tasks_select_member on public.family_tasks for select to authenticated
  using (exists (select 1 from public.family_members m
    where m.family_id = family_tasks.family_id and m.user_id = auth.uid()));

revoke all on public.families, public.family_members, public.family_tasks, public.family_task_receipts
  from public, anon, authenticated;
grant select on public.families, public.family_members, public.family_tasks to authenticated;

create or replace function public.create_family(p_time_zone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); fid uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'invalid_time_zone';
  end if;
  if exists (select 1 from public.family_members where user_id = uid) then
    raise exception 'already_in_family';
  end if;
  insert into public.families(time_zone) values (p_time_zone) returning id into fid;
  insert into public.family_members(user_id, family_id) values (uid, fid);
  return fid;
end;
$$;

create or replace function public.join_family(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); fid uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.family_members where user_id = uid) then
    raise exception 'already_in_family';
  end if;
  select id into fid from public.families where invite_code = upper(btrim(p_code)) for update;
  if fid is null then raise exception 'invalid_invite_code'; end if;
  if (select count(*) from public.family_members where family_id = fid) >= 2 then
    raise exception 'family_full';
  end if;
  insert into public.family_members(user_id, family_id) values (uid, fid);
  update public.families set member_count = 2 where id = fid;
  return fid;
end;
$$;

create or replace function public.leave_family()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); fid uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select f.id into fid from public.families f
    join public.family_members m on m.family_id = f.id
    where m.user_id = uid for update of f;
  if fid is null then return; end if;
  delete from public.family_members where user_id = uid;
  if not exists (select 1 from public.family_members where family_id = fid) then
    delete from public.families where id = fid;
  else
    update public.families set member_count = 1,
      invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
      where id = fid;
  end if;
end;
$$;

-- The operation ID makes retries safe after a lost response. A queued checkbox
-- on a task already deleted by the partner is a no-op, never a recreation.
create or replace function public.apply_family_task_operation(
  p_operation_id uuid, p_family_id uuid, p_task_id uuid, p_action text,
  p_title text, p_timeframe text, p_period_start date, p_done boolean,
  p_requested_at timestamptz
)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); zone text; period_end date; task_start date;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select f.time_zone into zone from public.families f
    join public.family_members m on m.family_id = f.id
    where f.id = p_family_id and m.user_id = uid for update of f;
  if zone is null then raise exception 'not_family_member'; end if;
  if exists (select 1 from public.family_task_receipts
    where operation_id = p_operation_id and user_id = uid and family_id = p_family_id) then return; end if;
  if p_operation_id is null or p_task_id is null or p_requested_at is null
    or p_requested_at > now() + interval '5 minutes' then raise exception 'invalid_operation'; end if;

  if p_action = 'create' then
    if p_timeframe not in ('day', 'week', 'month') or p_period_start is null
      or length(btrim(coalesce(p_title, ''))) not between 1 and 200 then raise exception 'invalid_task'; end if;
    if (p_timeframe = 'week' and p_period_start <> date_trunc('week', p_period_start::timestamp)::date)
      or (p_timeframe = 'month' and p_period_start <> date_trunc('month', p_period_start::timestamp)::date) then
      raise exception 'invalid_period_start'; end if;
    period_end := case p_timeframe when 'day' then p_period_start
      when 'week' then p_period_start + 6
      else (p_period_start + interval '1 month')::date - 1 end;
    if p_requested_at >= ((period_end + 1)::timestamp at time zone zone) then
      raise exception 'period_closed'; end if;
    insert into public.family_tasks(id, family_id, title, timeframe, period_start, created_by)
      values (p_task_id, p_family_id, btrim(p_title), p_timeframe, p_period_start, uid)
      on conflict (id) do nothing;
  elsif p_action = 'toggle' then
    if p_done is null then raise exception 'invalid_operation'; end if;
    select case t.timeframe when 'day' then t.period_start
      when 'week' then t.period_start + 6
      else (t.period_start + interval '1 month')::date - 1 end, t.period_start
      into period_end, task_start
      from public.family_tasks t where t.id = p_task_id and t.family_id = p_family_id;
    if period_end is not null then
      if p_requested_at < (task_start::timestamp at time zone zone) or
        p_requested_at >= ((period_end + 1)::timestamp at time zone zone) then
        raise exception 'period_closed'; end if;
      update public.family_tasks set done = p_done, updated_at = now()
        where id = p_task_id and family_id = p_family_id;
    end if;
  elsif p_action = 'delete' then
    delete from public.family_tasks where id = p_task_id and family_id = p_family_id;
  else
    raise exception 'invalid_operation';
  end if;
  insert into public.family_task_receipts(operation_id, family_id, user_id)
    values (p_operation_id, p_family_id, uid);
end;
$$;

revoke all on function public.create_family(text), public.join_family(text), public.leave_family(),
  public.apply_family_task_operation(uuid, uuid, uuid, text, text, text, date, boolean, timestamptz)
  from public, anon;
grant execute on function public.create_family(text), public.join_family(text), public.leave_family(),
  public.apply_family_task_operation(uuid, uuid, uuid, text, text, text, date, boolean, timestamptz)
  to authenticated;

commit;
