-- Run in the production SQL Editor before publishing the client using task tags or profile photos.
-- Tasks have zero or one of three built-in tags. Goals cannot have a tag.
alter table public.goals add column if not exists tag text;
alter table public.goals drop constraint if exists goals_task_tag_check;
alter table public.goals add constraint goals_task_tag_check
  check (tag is null or (kind = 'task' and tag in ('work', 'rest', 'home')));

-- Keep the existing atomic/offline horizon API. Older clients omit tag and preserve it on updates.
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
      weight = (rec->>'weight')::numeric, end_date = nullif(rec->>'endDate', '')::date,
      tag = case when rec ? 'tag' then nullif(rec->>'tag', '') else tag end
      where id = (rec->>'id')::uuid and user_id = uid;
    if not found then raise exception 'goal % not found or not owned', rec->>'id'; end if;
  end loop;
  if array_length(p_deletes, 1) is not null then
    delete from public.goals where id = any(p_deletes) and user_id = uid;
  end if;
  insert into public.goals(id, user_id, kind, title, timeframe, target, weight, start_date, end_date, tag)
    select coalesce((c->>'id')::uuid, gen_random_uuid()), uid, c->>'kind', c->>'title', c->>'timeframe',
      (c->>'target')::numeric, (c->>'weight')::numeric, (c->>'startDate')::date,
      nullif(c->>'endDate', '')::date, nullif(c->>'tag', '')
    from jsonb_array_elements(coalesce(p_creates, '[]'::jsonb)) c;
end;
$$;

-- Private, one photo per user. The browser uploads a resized JPEG to this fixed path.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values ('novigo-avatars', 'novigo-avatars', false, 5242880, array['image/jpeg'])
  on conflict (id) do nothing;

drop policy if exists novigo_avatar_select_own on storage.objects;
drop policy if exists novigo_avatar_insert_own on storage.objects;
drop policy if exists novigo_avatar_update_own on storage.objects;
drop policy if exists novigo_avatar_delete_own on storage.objects;
create policy novigo_avatar_select_own on storage.objects for select to authenticated
  using (bucket_id = 'novigo-avatars' and name = auth.uid()::text || '/avatar.jpg');
create policy novigo_avatar_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'novigo-avatars' and name = auth.uid()::text || '/avatar.jpg');
create policy novigo_avatar_update_own on storage.objects for update to authenticated
  using (bucket_id = 'novigo-avatars' and name = auth.uid()::text || '/avatar.jpg')
  with check (bucket_id = 'novigo-avatars' and name = auth.uid()::text || '/avatar.jpg');
create policy novigo_avatar_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'novigo-avatars' and name = auth.uid()::text || '/avatar.jpg');
