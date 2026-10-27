-- Run against the configured project. All test messages/state roll back.
begin;
create temporary table messaging_test as
select pp.id profile_id, pp.provider_id, p.auth_user_id patient_user_id,
  null::uuid provider_message_id, null::uuid patient_message_id
from public.provider_patient_profiles pp join public.patients p on p.id = pp.patient_id
where p.auth_user_id is not null order by pp.id limit 1;
grant select, update on messaging_test to authenticated;
do $$ begin
  if not exists (select 1 from messaging_test) then raise exception 'Test requires an invited patient with a provider'; end if;
  if exists (select 1 from public.messages where source='demo_seed') then raise exception 'Demo messages remain'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select provider_id::text from messaging_test), true);
do $$
declare message_id uuid;
begin
  insert into public.messages (patient_profile_id, sender_kind, body)
  select profile_id, 'provider', 'Messaging integration verification' from messaging_test
  returning id into message_id;
  update messaging_test set provider_message_id = message_id;
end $$;

select set_config('request.jwt.claim.sub', (select patient_user_id::text from messaging_test), true);
do $$
declare fixture record; reply uuid; unread bigint;
begin
  select * into fixture from messaging_test;
  if not exists (select 1 from public.messages where id = fixture.provider_message_id) then raise exception 'Patient realtime SELECT cannot see provider message'; end if;
  if not exists (select 1 from public.get_my_messages(fixture.profile_id) where id = fixture.provider_message_id) then raise exception 'Patient history is missing provider message'; end if;
  select unread_count into unread from public.get_my_message_inbox() where patient_profile_id=fixture.profile_id;
  if unread < 1 then raise exception 'Patient unread count is missing provider message'; end if;
  reply := public.send_my_message(fixture.profile_id, '  Patient reply verification  ');
  update messaging_test set patient_message_id=reply;
  if not exists (select 1 from public.messages where id=reply and body='Patient reply verification' and sender_kind='patient' and source='live') then raise exception 'Reply not persisted correctly'; end if;
  perform public.read_my_message_thread(fixture.profile_id, reply);
  select unread_count into unread from public.get_my_message_inbox() where patient_profile_id=fixture.profile_id;
  if unread <> 0 then raise exception 'Displayed messages remain unread'; end if;
  if exists (select 1 from public.provider_patient_profiles) then raise exception 'Patient can read provider clinical notes'; end if;
  begin
    perform public.send_my_message(fixture.profile_id, '   ');
    raise exception 'Blank message unexpectedly accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.send_my_message(fixture.profile_id, repeat('x',4001));
    raise exception 'Oversized message unexpectedly accepted';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.messages (patient_profile_id,sender_kind,body) values (fixture.profile_id,'provider','Impersonation');
    raise exception 'Patient impersonated provider';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', (select provider_id::text from messaging_test), true);
do $$ begin
  if not exists (select 1 from public.messages m join messaging_test t on t.patient_message_id=m.id) then raise exception 'Provider cannot see patient reply'; end if;
  if not exists (select 1 from public.message_thread_state state join messaging_test t on state.patient_profile_id=t.profile_id where state.participant_user_id=auth.uid() and state.last_read_at is null) then
    -- Existing providers may have a cursor; it must precede the new reply.
    if not exists (select 1 from public.messages m join messaging_test t on t.patient_message_id=m.id join public.message_thread_state state on state.patient_profile_id=t.profile_id where state.participant_user_id=auth.uid() and m.created_at>state.last_read_at) then raise exception 'Provider unread state was changed by patient read'; end if;
  end if;
end $$;

-- An unrelated authenticated identity cannot enumerate or write conversations.
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
do $$ declare fixture record; begin
  select * into fixture from messaging_test;
  if exists (select 1 from public.get_my_message_inbox()) then raise exception 'Outsider can read inbox'; end if;
  if exists (select 1 from public.get_my_messages(fixture.profile_id)) then raise exception 'Outsider can read history'; end if;
  if exists (select 1 from public.messages) then raise exception 'Outsider can SELECT messages'; end if;
  begin
    perform public.send_my_message(fixture.profile_id,'Unauthorized');
    raise exception 'Outsider can send';
  exception when insufficient_privilege then null; end;
  begin
    perform public.read_my_message_thread(fixture.profile_id,fixture.provider_message_id);
    raise exception 'Outsider can mark messages read';
  exception when insufficient_privilege then null; end;
end $$;

set local role anon;
do $$ begin
  if exists (select 1 from public.patients) then raise exception 'Anonymous patient read remains'; end if;
  if exists (select 1 from public.provider_patient_profiles) then raise exception 'Anonymous clinical notes read remains'; end if;
  begin
    perform public.get_my_message_inbox();
    raise exception 'Anonymous inbox call accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: provider send, patient read/reply, independent read state, validation, and participant isolation' as messaging_result;
rollback;
