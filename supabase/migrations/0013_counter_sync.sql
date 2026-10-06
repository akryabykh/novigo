-- Run in the production SQL Editor before publishing the counter sync client.
-- Server applies each device action once; concurrent +1/-1 actions are serialized.
begin;

create table if not exists public.counter_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  value bigint not null default 0 check (value between 0 and 9007199254740991)
);
create table if not exists public.counter_snapshots (
  entry_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null,
  value bigint not null check (value between 0 and 9007199254740991),
  saved_at timestamptz not null,
  unique (user_id, operation_id)
);
create index if not exists counter_snapshots_user_entry_idx
  on public.counter_snapshots(user_id, entry_id desc);
create table if not exists public.counter_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null,
  primary key (user_id, operation_id)
);

alter table public.counter_states enable row level security;
alter table public.counter_snapshots enable row level security;
alter table public.counter_receipts enable row level security;
revoke all on public.counter_states, public.counter_snapshots, public.counter_receipts from public, anon, authenticated;

create or replace function public.get_counter_state()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  current_value bigint;
  history jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select value into current_value from public.counter_states where user_id = uid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', operation_id, 'value', value, 'savedAt', to_char(saved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) order by entry_id desc), '[]'::jsonb) into history
  from public.counter_snapshots where user_id = uid;
  return jsonb_build_object('value', coalesce(current_value, 0), 'snapshots', history);
end;
$$;

create or replace function public.apply_counter_operations(p_operations jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  op jsonb;
  op_id text;
  op_type text;
  current_value bigint;
  step bigint;
  history jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) > 100 then
    raise exception 'Expected an array of at most 100 operations';
  end if;
  insert into public.counter_states(user_id) values (uid) on conflict do nothing;
  select value into current_value from public.counter_states where user_id = uid for update;
  for op in select value from jsonb_array_elements(p_operations) loop
    op_id := op->>'id';
    op_type := op->>'type';
    if op_id is null or length(op_id) < 8 or length(op_id) > 128 then
      raise exception 'Invalid operation ID';
    end if;
    if exists (select 1 from public.counter_receipts
      where user_id = uid and operation_id = op_id) then continue; end if;
    if op_type = 'delta' then
      if (op->>'delta') !~ '^-?[0-9]+$' then raise exception 'Invalid delta'; end if;
      step := (op->>'delta')::bigint;
      if step = 0 or abs(step) > 9007199254740991 then raise exception 'Invalid delta'; end if;
      current_value := greatest(0, least(9007199254740991, current_value + step));
    elsif op_type = 'reset' then
      current_value := 0;
    elsif op_type = 'snapshot' then
      if (op->>'value') !~ '^[0-9]+$' then raise exception 'Invalid snapshot'; end if;
      step := (op->>'value')::bigint;
      if step > 9007199254740991 then raise exception 'Invalid snapshot'; end if;
      insert into public.counter_snapshots(user_id, operation_id, value, saved_at)
        values (uid, op_id, step, (op->>'savedAt')::timestamptz);
    elsif op_type = 'clear' then
      delete from public.counter_snapshots where user_id = uid;
    else
      raise exception 'Invalid counter operation';
    end if;
    insert into public.counter_receipts(user_id, operation_id) values (uid, op_id);
  end loop;
  update public.counter_states set value = current_value where user_id = uid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', operation_id, 'value', value, 'savedAt', to_char(saved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) order by entry_id desc), '[]'::jsonb) into history
  from public.counter_snapshots where user_id = uid;
  return jsonb_build_object('value', current_value, 'snapshots', history);
end;
$$;

revoke all on function public.get_counter_state() from public, anon;
revoke all on function public.apply_counter_operations(jsonb) from public, anon;
grant execute on function public.get_counter_state() to authenticated;
grant execute on function public.apply_counter_operations(jsonb) to authenticated;
commit;
