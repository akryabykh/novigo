-- Run once in the production SQL Editor before publishing the multi-counter client.
-- Existing counter value, title and saved history become the "default" counter.
begin;

create table if not exists public.counter_collections (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.counter_items (
  user_id uuid not null references public.counter_collections(user_id) on delete cascade,
  counter_id text not null check (length(counter_id) between 1 and 128),
  title text not null check (length(btrim(title)) between 1 and 60),
  value bigint not null default 0 check (value between 0 and 9007199254740991),
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, counter_id)
);

create table if not exists public.counter_item_snapshots (
  entry_id bigint generated always as identity primary key,
  user_id uuid not null,
  counter_id text not null,
  operation_id text not null,
  value bigint not null check (value between 0 and 9007199254740991),
  saved_at timestamptz not null,
  foreign key (user_id, counter_id) references public.counter_items(user_id, counter_id) on delete cascade,
  unique (user_id, operation_id)
);
create index if not exists counter_item_snapshots_counter_idx
  on public.counter_item_snapshots(user_id, counter_id, entry_id desc);

alter table public.counter_collections enable row level security;
alter table public.counter_items enable row level security;
alter table public.counter_item_snapshots enable row level security;
revoke all on public.counter_collections, public.counter_items, public.counter_item_snapshots
  from public, anon, authenticated;

insert into public.counter_collections(user_id)
  select user_id from public.counter_states where true on conflict do nothing;
insert into public.counter_items(user_id, counter_id, title, value)
  select user_id, 'default', title, value from public.counter_states where true on conflict do nothing;
insert into public.counter_item_snapshots(user_id, counter_id, operation_id, value, saved_at)
  select user_id, 'default', operation_id, value, saved_at from public.counter_snapshots where true
  order by entry_id
  on conflict do nothing;

create or replace function public.get_counters_state()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inserted integer;
  result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.counter_collections(user_id) values (uid) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    insert into public.counter_items(user_id, counter_id, title) values (uid, 'default', 'Счётчик');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.counter_id, 'title', c.title, 'value', c.value,
    'snapshots', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.operation_id, 'value', s.value,
      'savedAt', to_char(s.saved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) order by s.entry_id desc), '[]'::jsonb)
      from public.counter_item_snapshots s
      where s.user_id = c.user_id and s.counter_id = c.counter_id)
  ) order by c.created_at, c.counter_id), '[]'::jsonb) into result
  from public.counter_items c where c.user_id = uid;
  return jsonb_build_object('counters', result);
end;
$$;

create or replace function public.apply_counter_actions(p_actions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  action jsonb;
  op_id text;
  v_counter_id text;
  action_type text;
  cleaned_title text;
  step bigint;
  locked_value bigint;
  inserted integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_actions) is distinct from 'array' or jsonb_array_length(p_actions) > 100 then
    raise exception 'Expected an array of at most 100 counter actions';
  end if;
  insert into public.counter_collections(user_id) values (uid) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    insert into public.counter_items(user_id, counter_id, title) values (uid, 'default', 'Счётчик');
  end if;
  perform 1 from public.counter_collections where user_id = uid for update;

  for action in select value from jsonb_array_elements(p_actions) loop
    op_id := action->>'id';
    v_counter_id := action->>'counterId';
    action_type := action->>'type';
    if op_id is null or length(op_id) not between 8 and 128
      or v_counter_id is null or length(v_counter_id) not between 1 and 128 then
      raise exception 'Invalid counter action ID';
    end if;
    if exists (select 1 from public.counter_receipts
      where user_id = uid and operation_id = op_id) then continue; end if;

    if action_type = 'create' or action_type = 'rename' then
      cleaned_title := btrim(action->>'title');
      if cleaned_title is null or length(cleaned_title) not between 1 and 60 then
        raise exception 'Invalid counter title';
      end if;
      if action_type = 'create' then
        insert into public.counter_items(user_id, counter_id, title)
          values (uid, v_counter_id, cleaned_title) on conflict do nothing;
      else
        update public.counter_items set title = cleaned_title
          where user_id = uid and counter_id = v_counter_id;
      end if;
    elsif action_type = 'delete' then
      delete from public.counter_items where user_id = uid and counter_id = v_counter_id;
    elsif action_type = 'delta' then
      if (action->>'delta') !~ '^-?[0-9]+$' then raise exception 'Invalid counter change'; end if;
      step := (action->>'delta')::bigint;
      if step = 0 or abs(step) > 9007199254740991 then raise exception 'Invalid counter change'; end if;
      update public.counter_items set value = greatest(0, least(9007199254740991, value + step))
        where user_id = uid and counter_id = v_counter_id;
    elsif action_type = 'reset' then
      update public.counter_items set value = 0 where user_id = uid and counter_id = v_counter_id;
    elsif action_type = 'snapshot' then
      if (action->>'value') !~ '^[0-9]+$' then raise exception 'Invalid saved value'; end if;
      locked_value := (action->>'value')::bigint;
      if locked_value > 9007199254740991 then raise exception 'Invalid saved value'; end if;
      if exists (select 1 from public.counter_items where user_id = uid and counter_id = v_counter_id) then
        insert into public.counter_item_snapshots(user_id, counter_id, operation_id, value, saved_at)
          values (uid, v_counter_id, op_id, locked_value, (action->>'savedAt')::timestamptz);
      end if;
    elsif action_type = 'clear' then
      delete from public.counter_item_snapshots where user_id = uid and counter_id = v_counter_id;
    else
      raise exception 'Invalid counter action';
    end if;
    insert into public.counter_receipts(user_id, operation_id) values (uid, op_id);
  end loop;
  return public.get_counters_state();
end;
$$;

revoke all on function public.get_counters_state() from public, anon;
revoke all on function public.apply_counter_actions(jsonb) from public, anon;
grant execute on function public.get_counters_state() to authenticated;
grant execute on function public.apply_counter_actions(jsonb) to authenticated;

-- An older PWA tab can stay open during rollout. Route its single-counter RPCs
-- to the default counter so actions made between SQL and the new deploy survive.
create or replace function public.get_counter_state()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
begin
  select value into item from jsonb_array_elements((public.get_counters_state())->'counters')
    where value->>'id' = 'default' limit 1;
  return coalesce(item - 'id', jsonb_build_object('title', 'Счётчик', 'value', 0, 'snapshots', '[]'::jsonb));
end;
$$;

create or replace function public.apply_counter_operations(p_operations jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  converted jsonb;
begin
  select coalesce(jsonb_agg(value || jsonb_build_object('counterId', 'default')), '[]'::jsonb)
    into converted from jsonb_array_elements(p_operations);
  perform public.apply_counter_actions(converted);
  return public.get_counter_state();
end;
$$;

create or replace function public.set_counter_title(p_operation_id text, p_title text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.apply_counter_actions(jsonb_build_array(jsonb_build_object(
    'id', p_operation_id, 'type', 'rename', 'counterId', 'default', 'title', p_title
  )));
  return public.get_counter_state();
end;
$$;

revoke all on function public.get_counter_state() from public, anon;
revoke all on function public.apply_counter_operations(jsonb) from public, anon;
revoke all on function public.set_counter_title(text, text) from public, anon;
grant execute on function public.get_counter_state() to authenticated;
grant execute on function public.apply_counter_operations(jsonb) to authenticated;
grant execute on function public.set_counter_title(text, text) to authenticated;
commit;
