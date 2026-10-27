-- Add patient inbox and realtime access without exposing clinical_notes.
begin;

create schema if not exists milestone_messaging;
revoke all on schema milestone_messaging from public, anon;
grant usage on schema milestone_messaging to authenticated;

create or replace function milestone_messaging.owns_thread(profile_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.provider_patient_profiles pp
    join public.patients p on p.id = pp.patient_id
    where pp.id = profile_id and p.auth_user_id = (select auth.uid())
  );
$$;
revoke all on function milestone_messaging.owns_thread(uuid) from public, anon;
grant execute on function milestone_messaging.owns_thread(uuid) to authenticated;

create policy "Patients read their conversation messages"
on public.messages for select to authenticated
using (milestone_messaging.owns_thread(patient_profile_id));

-- One bounded row per relationship; the full history is fetched on opening it.
create or replace function public.get_my_message_inbox()
returns table (
  patient_profile_id uuid, provider_name text, provider_professional_title text,
  last_body text, last_message_at timestamptz, unread_count bigint
)
language sql stable security definer set search_path = ''
as $$
  select pp.id, pr.name, pr.professional_title, latest.body, latest.created_at,
    (select count(*) from public.messages unread
     where unread.patient_profile_id = pp.id and unread.sender_kind = 'provider'
       and (state.last_read_at is null or unread.created_at > state.last_read_at))
  from public.provider_patient_profiles pp
  join public.patients p on p.id = pp.patient_id
  join public.providers pr on pr.id = pp.provider_id
  left join public.message_thread_state state
    on state.patient_profile_id = pp.id and state.participant_user_id = (select auth.uid())
  left join lateral (
    select m.body, m.created_at from public.messages m
    where m.patient_profile_id = pp.id order by m.created_at desc, m.id desc limit 1
  ) latest on true
  where p.auth_user_id = (select auth.uid())
  order by latest.created_at desc nulls last, pr.name, pp.id;
$$;

-- Advance only through the displayed message, never to a client clock or now().
create or replace function public.read_my_message_thread(p_patient_profile_id uuid, p_latest_message_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare displayed_at timestamptz;
begin
  if not milestone_messaging.owns_thread(p_patient_profile_id) then
    raise exception 'Conversation not found' using errcode = '42501';
  end if;
  select created_at into displayed_at from public.messages
    where id = p_latest_message_id and patient_profile_id = p_patient_profile_id;
  if displayed_at is null then
    raise exception 'Message not found' using errcode = '22023';
  end if;
  insert into public.message_thread_state (patient_profile_id, participant_user_id, last_read_at)
  values (p_patient_profile_id, auth.uid(), displayed_at)
  on conflict (patient_profile_id, participant_user_id) do update
    set last_read_at = greatest(public.message_thread_state.last_read_at, excluded.last_read_at);
end;
$$;

create or replace function public.send_my_message(p_patient_profile_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare message_id uuid;
begin
  if not milestone_messaging.owns_thread(p_patient_profile_id) then
    raise exception 'Care relationship not found' using errcode = '42501';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Enter a message between 1 and 4000 characters' using errcode = '22023';
  end if;
  insert into public.messages (patient_profile_id, sender_kind, body)
  values (p_patient_profile_id, 'patient', btrim(p_body)) returning id into message_id;
  return message_id;
end;
$$;

revoke all on function public.get_my_message_inbox(), public.read_my_message_thread(uuid, uuid), public.send_my_message(uuid, text) from public, anon;
grant execute on function public.get_my_message_inbox(), public.read_my_message_thread(uuid, uuid), public.send_my_message(uuid, text) to authenticated;

insert into public.message_thread_state (patient_profile_id, participant_user_id)
select pp.id, p.auth_user_id from public.provider_patient_profiles pp
join public.patients p on p.id = pp.patient_id where p.auth_user_id is not null
on conflict do nothing;

-- Remove only explicitly marked demo history. Preserve every live message.
delete from public.messages where source = 'demo_seed';

-- The mobile app now uses authenticated patient RPCs. Retire the temporary
-- anonymous access that exposed patient records and provider clinical notes.
drop policy if exists "Temporary mobile read patients" on public.patients;
drop policy if exists "Temporary mobile read provider patient profiles" on public.provider_patient_profiles;
drop policy if exists "Temporary mobile read routine assignments" on public.routine_assignments;
drop policy if exists "Temporary mobile read routines" on public.routines;

comment on function public.get_my_message_inbox() is 'Patient-owned inbox summaries; includes empty and discharged relationships, excludes provider clinical notes.';
comment on function public.read_my_message_thread(uuid, uuid) is 'Patient read cursor bounded by a message actually displayed in this conversation.';

commit;
