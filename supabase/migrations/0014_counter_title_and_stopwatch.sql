-- Run after 0013_counter_sync.sql, before publishing the new client.
-- Safe to run again: policies are replaced and tables/column are created if absent.
begin;

alter table public.counter_states add column if not exists title text not null default 'Счётчик';

create or replace function public.get_counter_state()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  current_value bigint;
  current_title text;
  history jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select value, title into current_value, current_title from public.counter_states where user_id = uid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', operation_id, 'value', value, 'savedAt', to_char(saved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) order by entry_id desc), '[]'::jsonb) into history
  from public.counter_snapshots where user_id = uid;
  return jsonb_build_object('title', coalesce(current_title, 'Счётчик'),
    'value', coalesce(current_value, 0), 'snapshots', history);
end;
$$;

create or replace function public.set_counter_title(p_operation_id text, p_title text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cleaned text := btrim(p_title);
  locked_value bigint;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null or length(p_operation_id) < 8 or length(p_operation_id) > 128
    or cleaned is null or length(cleaned) < 1 or length(cleaned) > 60 then
    raise exception 'Invalid counter title or operation ID';
  end if;
  insert into public.counter_states(user_id) values (uid) on conflict do nothing;
  select value into locked_value from public.counter_states where user_id = uid for update;
  if not exists (select 1 from public.counter_receipts
    where user_id = uid and operation_id = p_operation_id) then
    update public.counter_states set title = cleaned where user_id = uid;
    insert into public.counter_receipts(user_id, operation_id) values (uid, p_operation_id);
  end if;
  return public.get_counter_state();
end;
$$;
revoke all on function public.set_counter_title(text, text) from public, anon;
grant execute on function public.set_counter_title(text, text) to authenticated;

create table if not exists public.work_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  task_id uuid,
  task_title text not null check (length(btrim(task_title)) between 1 and 120),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_ms bigint not null check (duration_ms between 0 and 9007199254740991),
  primary key (user_id, id)
);
create index if not exists work_sessions_user_ended_idx
  on public.work_sessions(user_id, ended_at desc);
alter table public.work_sessions enable row level security;
drop policy if exists work_sessions_select_own on public.work_sessions;
drop policy if exists work_sessions_insert_own on public.work_sessions;
drop policy if exists work_sessions_update_own on public.work_sessions;
create policy work_sessions_select_own on public.work_sessions for select to authenticated
  using (auth.uid() = user_id);
create policy work_sessions_insert_own on public.work_sessions for insert to authenticated
  with check (auth.uid() = user_id);
create policy work_sessions_update_own on public.work_sessions for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.work_sessions from public, anon, authenticated;
grant select, insert, update on public.work_sessions to authenticated;

commit;
