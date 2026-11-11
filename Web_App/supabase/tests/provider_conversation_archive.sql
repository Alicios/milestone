-- Reversible checks against an existing provider relationship. No messages are
-- created, edited, or deleted. The metadata UPDATEs are rolled back at the end.
begin;
do $checks$
declare
  own_state record;
  foreign_profile uuid;
  affected integer;
  after_state record;
begin
  select s.*, pp.provider_id into own_state
  from public.message_thread_state s
  join public.provider_patient_profiles pp on pp.id = s.patient_profile_id
  where s.participant_user_id = pp.provider_id
  order by pp.id limit 1;
  if not found then raise exception 'No provider thread state available for archive verification'; end if;
  select id into foreign_profile from public.provider_patient_profiles
    where provider_id <> own_state.provider_id order by id limit 1;
  if foreign_profile is null then raise exception 'A second provider relationship is required for isolation verification'; end if;

  perform set_config('request.jwt.claim.sub', own_state.provider_id::text, true);
  execute 'set local role authenticated';
  update public.message_thread_state
    set archived_through_at = '2026-01-01T00:00:00.123456Z'
    where patient_profile_id = own_state.patient_profile_id and participant_user_id = own_state.provider_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Own archive metadata was not writable'; end if;
  select * into after_state from public.message_thread_state
    where patient_profile_id = own_state.patient_profile_id and participant_user_id = own_state.provider_id;
  if after_state.archived_through_at <> '2026-01-01T00:00:00.123456Z'::timestamptz
    or after_state.last_read_at is distinct from own_state.last_read_at
    or after_state.starred is distinct from own_state.starred then
    raise exception 'Archive cursor failed to persist or changed unrelated state';
  end if;

  update public.message_thread_state set archived_through_at = now() where patient_profile_id = foreign_profile;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign provider archive metadata was writable'; end if;
  if exists(select 1 from public.message_thread_state where patient_profile_id = foreign_profile) then
    raise exception 'Foreign provider archive metadata was readable';
  end if;

  update public.message_thread_state set archived_through_at = null
    where patient_profile_id = own_state.patient_profile_id and participant_user_id = own_state.provider_id;
  if exists(select 1 from public.message_thread_state
    where patient_profile_id = own_state.patient_profile_id and participant_user_id = own_state.provider_id and archived_through_at is not null) then
    raise exception 'Restore did not clear the archive cursor';
  end if;

  -- A different authenticated identity cannot read or update this provider state.
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  update public.message_thread_state set archived_through_at = now() where patient_profile_id = own_state.patient_profile_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Unrelated identity changed provider archive metadata'; end if;
  if exists(select 1 from public.message_thread_state where patient_profile_id = own_state.patient_profile_id) then
    raise exception 'Unrelated identity read provider archive metadata';
  end if;
end;
$checks$;
rollback;
