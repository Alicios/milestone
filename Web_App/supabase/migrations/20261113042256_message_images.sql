begin;

-- A message may contain text, one image, or both. Objects are private and
-- immutable; a failed message insert may leave an unreferenced upload.
alter table public.messages add column image_path text;
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_content_check check (
  char_length(body) <= 4000 and
  (char_length(btrim(body)) > 0 or image_path is not null)
);
alter table public.messages add constraint messages_image_path_check check (
  image_path is null or image_path ~ ('^' || patient_profile_id::text || '/[0-9a-f-]{36}/[a-z0-9-]{12,64}\.(jpg|png|webp)$')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-images', 'message-images', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The first folder is the care relationship; the second is the uploader.
create function milestone_messaging.can_access_image(p_path text, p_uploader_only boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z0-9-]{12,64}\.(jpg|png|webp)$'
    and (not p_uploader_only or split_part(p_path, '/', 2) = (select auth.uid())::text)
    and exists (
      select 1 from public.provider_patient_profiles pp
      join public.patients p on p.id = pp.patient_id
      where pp.id::text = split_part(p_path, '/', 1)
        and (pp.provider_id = (select auth.uid()) or p.auth_user_id = (select auth.uid()))
    );
$$;
revoke all on function milestone_messaging.can_access_image(text, boolean) from public, anon;
grant execute on function milestone_messaging.can_access_image(text, boolean) to authenticated;

create policy message_images_read on storage.objects for select to authenticated
using (bucket_id = 'message-images' and milestone_messaging.can_access_image(name, false));
create policy message_images_insert on storage.objects for insert to authenticated
with check (bucket_id = 'message-images' and milestone_messaging.can_access_image(name, true));

-- Prevent a sender from attaching an object they cannot upload themselves.
create function public.validate_message_image()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.image_path is not null and (
    not milestone_messaging.can_access_image(new.image_path, true)
    or not exists (select 1 from storage.objects o
      where o.bucket_id = 'message-images' and o.name = new.image_path)
  ) then
    raise exception 'Message image is unavailable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_message_image() from public, anon, authenticated;
create trigger validate_message_image before insert on public.messages
for each row execute function public.validate_message_image();

-- The existing provider INSERT policy already checks relationship ownership.
grant insert (image_path) on public.messages to authenticated;

drop function public.get_my_messages(uuid);
create function public.get_my_messages(p_patient_profile_id uuid)
returns table (id uuid, sender_kind text, body text, created_at timestamptz, image_path text)
language sql security definer stable set search_path = '' as $$
  select m.id, m.sender_kind, m.body, m.created_at, m.image_path
  from public.messages m
  join public.provider_patient_profiles pp on pp.id = m.patient_profile_id
  join public.patients p on p.id = pp.patient_id
  where pp.id = p_patient_profile_id and p.auth_user_id = (select auth.uid())
  order by m.created_at, m.id;
$$;
revoke all on function public.get_my_messages(uuid) from public, anon;
grant execute on function public.get_my_messages(uuid) to authenticated;

create function public.send_my_image_message(p_patient_profile_id uuid, p_body text, p_image_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare message_id uuid;
begin
  if not milestone_messaging.owns_thread(p_patient_profile_id) then
    raise exception 'Care relationship not found' using errcode = '42501';
  end if;
  if p_image_path is null or not milestone_messaging.can_access_image(p_image_path, true)
    or split_part(p_image_path, '/', 1) <> p_patient_profile_id::text
    or not exists (select 1 from storage.objects o where o.bucket_id = 'message-images' and o.name = p_image_path) then
    raise exception 'Message image is unavailable' using errcode = '42501';
  end if;
  if p_body is null or char_length(p_body) > 4000 then
    raise exception 'Message is too long' using errcode = '22023';
  end if;
  insert into public.messages (patient_profile_id, sender_kind, body, image_path)
  values (p_patient_profile_id, 'patient', btrim(p_body), p_image_path)
  returning id into message_id;
  return message_id;
end;
$$;
revoke all on function public.send_my_image_message(uuid, text, text) from public, anon;
grant execute on function public.send_my_image_message(uuid, text, text) to authenticated;

-- Inbox previews remain useful when an image has no caption.
create or replace function public.get_provider_message_inbox()
returns table (patient_profile_id uuid, patient_name text, last_body text,
  last_message_at timestamptz, unread_count bigint, starred boolean)
language sql stable security invoker set search_path = '' as $$
  select pp.id, p.name, latest.body, latest.created_at,
    (select count(*) from public.messages unread
      where unread.patient_profile_id = pp.id and unread.sender_kind = 'patient'
        and (state.last_read_at is null or unread.created_at > state.last_read_at)),
    coalesce(state.starred, false)
  from public.provider_patient_profiles pp
  join public.patients p on p.id = pp.patient_id
  left join public.message_thread_state state
    on state.patient_profile_id = pp.id and state.participant_user_id = (select auth.uid())
  left join lateral (select coalesce(nullif(m.body, ''), 'Image') as body, m.created_at
    from public.messages m where m.patient_profile_id = pp.id
    order by m.created_at desc, m.id desc limit 1) latest on true
  where pp.provider_id = (select auth.uid())
  order by latest.created_at desc nulls last, p.name, pp.id;
$$;

create or replace function public.get_my_message_inbox()
returns table (patient_profile_id uuid, provider_name text, provider_professional_title text,
  last_body text, last_message_at timestamptz, unread_count bigint, provider_avatar_url text)
language sql stable security definer set search_path = '' as $$
  select pp.id, pr.name, pr.professional_title, latest.body, latest.created_at,
    (select count(*) from public.messages unread
      where unread.patient_profile_id = pp.id and unread.sender_kind = 'provider'
        and (state.last_read_at is null or unread.created_at > state.last_read_at)), pr.avatar_url
  from public.provider_patient_profiles pp
  join public.patients p on p.id = pp.patient_id
  join public.providers pr on pr.id = pp.provider_id
  left join public.message_thread_state state
    on state.patient_profile_id = pp.id and state.participant_user_id = (select auth.uid())
  left join lateral (select coalesce(nullif(m.body, ''), 'Image') as body, m.created_at
    from public.messages m where m.patient_profile_id = pp.id
    order by m.created_at desc, m.id desc limit 1) latest on true
  where p.auth_user_id = (select auth.uid())
  order by latest.created_at desc nulls last, pr.name, pp.id;
$$;
notify pgrst, 'reload schema';
commit;
