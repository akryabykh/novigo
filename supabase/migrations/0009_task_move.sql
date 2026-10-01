-- Move one task without deleting its identity. Both horizons are checked and
-- changed in one transaction, so offline replay cannot create duplicates.
alter table public.offline_receipts add column if not exists source_revision bigint;

create or replace function public.apply_offline_task_move(
  p_operation_id uuid, p_task_id uuid, p_from text, p_to text,
  p_start_date date, p_end_date date,
  p_expected_source_revision bigint, p_expected_destination_revision bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  source_revision bigint;
  destination_revision bigint;
  recorded public.offline_receipts%rowtype;
  current_timeframe text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_from not in ('day', 'week', 'month') or p_to not in ('day', 'week', 'month')
    or p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid task move';
  end if;
  select * into recorded from public.offline_receipts
    where operation_id = p_operation_id and user_id = uid;
  if found then return jsonb_build_object('source', recorded.source_revision, 'destination', recorded.revision); end if;

  insert into public.horizon_revisions(user_id, kind, timeframe, revision)
    values (uid, 'task', p_from, 0), (uid, 'task', p_to, 0)
    on conflict do nothing;
  perform 1 from public.horizon_revisions
    where user_id = uid and kind = 'task' and timeframe in (p_from, p_to)
    order by timeframe for update;
  select * into recorded from public.offline_receipts
    where operation_id = p_operation_id and user_id = uid;
  if found then return jsonb_build_object('source', recorded.source_revision, 'destination', recorded.revision); end if;

  select revision into source_revision from public.horizon_revisions
    where user_id = uid and kind = 'task' and timeframe = p_from;
  select revision into destination_revision from public.horizon_revisions
    where user_id = uid and kind = 'task' and timeframe = p_to;
  if source_revision <> p_expected_source_revision or destination_revision <> p_expected_destination_revision then
    raise exception using message = 'offline_conflict', errcode = 'P0001';
  end if;
  select timeframe into current_timeframe from public.goals
    where id = p_task_id and user_id = uid and kind = 'task' for update;
  if current_timeframe is distinct from p_from then
    raise exception using message = 'offline_conflict', errcode = 'P0001';
  end if;

  update public.goals set timeframe = p_to, start_date = p_start_date, end_date = p_end_date
    where id = p_task_id and user_id = uid;
  delete from public.daily_logs where goal_id = p_task_id;
  -- The existing trigger bumps the new horizon. It does not bump the old one.
  if p_from <> p_to then
    update public.horizon_revisions set revision = revision + 1
      where user_id = uid and kind = 'task' and timeframe = p_from;
  end if;
  select revision into source_revision from public.horizon_revisions
    where user_id = uid and kind = 'task' and timeframe = p_from;
  select revision into destination_revision from public.horizon_revisions
    where user_id = uid and kind = 'task' and timeframe = p_to;
  insert into public.offline_receipts(operation_id, user_id, source_revision, revision)
    values(p_operation_id, uid, source_revision, destination_revision);
  return jsonb_build_object('source', source_revision, 'destination', destination_revision);
end;
$$;

revoke all on function public.apply_offline_task_move(uuid, uuid, text, text, date, date, bigint, bigint) from public, anon;
grant execute on function public.apply_offline_task_move(uuid, uuid, text, text, date, date, bigint, bigint) to authenticated;
