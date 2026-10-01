-- Offline edits are replayable and checked against the version each device saw.
-- Apply this migration BEFORE deploying the web client that uses these RPCs.
create table public.horizon_revisions (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('goal', 'task')),
  timeframe text not null check (timeframe in ('day', 'week', 'month')),
  revision bigint not null default 0,
  primary key (user_id, kind, timeframe)
);
alter table public.horizon_revisions enable row level security;
create policy horizon_revisions_own on public.horizon_revisions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.offline_receipts (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint,
  created_at timestamptz not null default now()
);
create index offline_receipts_user_idx on public.offline_receipts(user_id);
alter table public.offline_receipts enable row level security;
create policy offline_receipts_own on public.offline_receipts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.bump_horizon_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare g public.goals;
begin
  if tg_op = 'DELETE' then g := old; else g := new; end if;
  insert into public.horizon_revisions(user_id, kind, timeframe, revision)
    values (g.user_id, g.kind, g.timeframe, 1)
    on conflict (user_id, kind, timeframe)
    do update set revision = public.horizon_revisions.revision + 1;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger goals_revision after insert or update or delete on public.goals
  for each row execute function public.bump_horizon_revision();

-- Stable client IDs make a create safe to retry after a lost HTTP response.
create or replace function public.save_horizon(
  p_updates jsonb default '[]'::jsonb,
  p_creates jsonb default '[]'::jsonb,
  p_deletes uuid[] default '{}'::uuid[]
)
returns void language plpgsql as $$
declare uid uuid := auth.uid(); rec jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  for rec in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    update public.goals set title = rec->>'title', target = (rec->>'target')::numeric,
      weight = (rec->>'weight')::numeric, end_date = nullif(rec->>'endDate', '')::date
      where id = (rec->>'id')::uuid and user_id = uid;
    if not found then raise exception 'goal % not found or not owned', rec->>'id'; end if;
  end loop;
  if array_length(p_deletes, 1) is not null then
    delete from public.goals where id = any(p_deletes) and user_id = uid;
  end if;
  insert into public.goals(id, user_id, kind, title, timeframe, target, weight, start_date, end_date)
    select coalesce((c->>'id')::uuid, gen_random_uuid()), uid, c->>'kind', c->>'title', c->>'timeframe',
      (c->>'target')::numeric, (c->>'weight')::numeric, (c->>'startDate')::date,
      nullif(c->>'endDate', '')::date
    from jsonb_array_elements(coalesce(p_creates, '[]'::jsonb)) c;
end;
$$;

create or replace function public.apply_offline_horizon(
  p_operation_id uuid, p_kind text, p_timeframe text, p_expected_revision bigint,
  p_updates jsonb, p_creates jsonb, p_deletes uuid[]
)
returns bigint language plpgsql as $$
declare uid uuid := auth.uid(); current_revision bigint; recorded bigint; rec jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('goal', 'task') or p_timeframe not in ('day', 'week', 'month') then
    raise exception 'invalid horizon';
  end if;
  select revision into recorded from public.offline_receipts
    where operation_id = p_operation_id and user_id = uid;
  if found then return recorded; end if;
  insert into public.horizon_revisions(user_id, kind, timeframe, revision)
    values(uid, p_kind, p_timeframe, 0) on conflict do nothing;
  select revision into current_revision from public.horizon_revisions
    where user_id = uid and kind = p_kind and timeframe = p_timeframe for update;
  -- Check again after acquiring the lock: an earlier attempt may have committed.
  select revision into recorded from public.offline_receipts
    where operation_id = p_operation_id and user_id = uid;
  if found then return recorded; end if;
  if p_expected_revision is null or current_revision <> p_expected_revision then
    raise exception using message = 'offline_conflict', errcode = 'P0001';
  end if;
  if exists (select 1 from public.goals where user_id = uid and id in (
    select (x->>'id')::uuid from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) x
    union select unnest(coalesce(p_deletes, '{}'::uuid[]))
  ) and (kind <> p_kind or timeframe <> p_timeframe)) then
    raise exception 'horizon mismatch';
  end if;
  for rec in select * from jsonb_array_elements(coalesce(p_creates, '[]'::jsonb)) loop
    if rec->>'kind' <> p_kind or rec->>'timeframe' <> p_timeframe then
      raise exception 'horizon mismatch';
    end if;
  end loop;
  perform public.save_horizon(p_updates, p_creates, p_deletes);
  select revision into current_revision from public.horizon_revisions
    where user_id = uid and kind = p_kind and timeframe = p_timeframe;
  insert into public.offline_receipts(operation_id, user_id, revision)
    values(p_operation_id, uid, current_revision);
  return current_revision;
end;
$$;

create or replace function public.apply_offline_logs(p_operation_id uuid, p_changes jsonb)
returns void language plpgsql as $$
declare uid uuid := auth.uid(); rec jsonb; current_value numeric; desired numeric; expected numeric; gid uuid; g_start date; g_end date;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.offline_receipts where operation_id = p_operation_id and user_id = uid) then
    return;
  end if;
  for rec in select value from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb))
    order by value->>'goalId', value->>'date' loop
    gid := (rec->>'goalId')::uuid;
    select start_date, end_date into g_start, g_end from public.goals
      where id = gid and user_id = uid for update;
    if not found then raise exception using message = 'offline_conflict', errcode = 'P0001'; end if;
    if (rec->>'date')::date < g_start or (g_end is not null and (rec->>'date')::date > g_end) then
      raise exception using message = 'offline_conflict', errcode = 'P0001';
    end if;
    if exists (select 1 from public.offline_receipts where operation_id = p_operation_id and user_id = uid) then
      return;
    end if;
    select coalesce((select value from public.daily_logs where goal_id = gid
      and date = (rec->>'date')::date), 0) into current_value;
    desired := (rec->>'value')::numeric;
    expected := (rec->>'expectedValue')::numeric;
    if current_value <> expected and current_value <> desired then
      raise exception using message = 'offline_conflict', errcode = 'P0001';
    end if;
    insert into public.daily_logs(goal_id, date, value)
      values(gid, (rec->>'date')::date, desired)
      on conflict (goal_id, date) do update set value = excluded.value;
  end loop;
  insert into public.offline_receipts(operation_id, user_id) values(p_operation_id, uid);
end;
$$;

grant select, insert on public.horizon_revisions to authenticated;
grant select, insert on public.offline_receipts to authenticated;
grant execute on function public.apply_offline_horizon(uuid, text, text, bigint, jsonb, jsonb, uuid[]) to authenticated;
grant execute on function public.apply_offline_logs(uuid, jsonb) to authenticated;
