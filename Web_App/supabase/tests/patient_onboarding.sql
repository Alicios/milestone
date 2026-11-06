-- Run inside a transaction and ROLLBACK. Uses only synthetic rows and makes no Auth HTTP calls.
do $$
declare
  test_provider_id uuid; test_patient_id uuid; empty_email_id uuid; uninvited_id uuid; auth_id uuid := gen_random_uuid();
  operation jsonb; check_token uuid; result jsonb;
begin
  select id into test_provider_id from public.providers limit 1;
  if test_provider_id is null then raise exception 'A provider is needed for this rollback-only test'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', test_provider_id, 'role', 'authenticated')::text, true);
  test_patient_id := public.create_patient('Synthetic onboarding check', null, 'onboarding-db-check@example.invalid');
  empty_email_id := public.create_patient('Synthetic missing email', null, null);
  uninvited_id := public.create_patient('Synthetic uninvited', null, 'onboarding-uninvited@example.invalid');
  insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data, aud, role)
    values(auth_id, 'onboarding-db-check@example.invalid', jsonb_build_object('patient_id', test_patient_id), '{}', 'authenticated', 'authenticated');
  if not exists(select 1 from public.get_patient_onboarding_statuses() s where s.patient_id = test_patient_id and status = 'invitation_needed') then raise exception 'Account creation incorrectly completed setup'; end if;
  if not exists(select 1 from public.get_patient_onboarding_statuses() s where s.patient_id = empty_email_id and status = 'email_needed') then raise exception 'Missing email status'; end if;
  if not exists(select 1 from public.get_patient_onboarding_statuses() s where s.patient_id = uninvited_id and status = 'invitation_needed') then raise exception 'Missing invitation status'; end if;
  update public.patients set pending_otp_code = '123456', pending_otp_expires_at = now() + interval '1 hour' where id = test_patient_id;
  if not exists(select 1 from public.get_patient_onboarding_statuses() s where s.patient_id = test_patient_id and status = 'awaiting_code') then raise exception 'Missing awaiting status'; end if;
  result := public.get_patient_onboarding_details(test_patient_id);
  if result->>'code' <> '123456' then raise exception 'Code missing in scoped details'; end if;
  operation := public.begin_patient_onboarding_operation(test_patient_id, test_provider_id, 'edit');
  check_token := (operation->>'token')::uuid;
  begin
    perform public.begin_patient_onboarding_operation(test_patient_id, test_provider_id, 'invite');
    raise exception 'Concurrent operation unexpectedly allowed';
  exception when lock_not_available then null; end;
  begin
    update auth.users set last_sign_in_at = now() where id = auth_id;
    raise exception 'Sign-in raced an email edit';
  exception when lock_not_available then null; end;
  perform public.complete_patient_onboarding_operation(test_patient_id, check_token,
    jsonb_build_object('name', 'Corrected synthetic name', 'email', 'onboarding-db-check@example.invalid'));
  if (select pending_otp_code from public.patients where id = test_patient_id) <> '123456' then raise exception 'Name change cleared code'; end if;
  operation := public.begin_patient_onboarding_operation(test_patient_id, test_provider_id, 'edit');
  -- Simulates the Auth Admin email write. HTTP Admin/OTP behavior needs a separate Auth integration test.
  update auth.users set email = 'onboarding-corrected@example.invalid' where id = auth_id;
  perform public.complete_patient_onboarding_operation(test_patient_id, (operation->>'token')::uuid,
    jsonb_build_object('name', 'Corrected synthetic name', 'email', 'onboarding-corrected@example.invalid'));
  if exists(select 1 from public.patients p where p.id = test_patient_id and (p.pending_otp_code is not null or p.pending_otp_expires_at is not null)) then raise exception 'Email change retained old code'; end if;
  operation := public.begin_patient_onboarding_operation(test_patient_id, test_provider_id, 'invite');
  perform public.complete_patient_onboarding_operation(test_patient_id, (operation->>'token')::uuid,
    jsonb_build_object('code', '654321', 'expiresAt', now() + interval '1 hour', 'authUserId', auth_id));
  update public.patients set pending_otp_expires_at = now() - interval '1 minute' where id = test_patient_id;
  if not exists(select 1 from public.get_patient_onboarding_statuses() s where s.patient_id = test_patient_id and status = 'code_expired') then raise exception 'Missing expiry status'; end if;
  operation := public.begin_patient_onboarding_operation(test_patient_id, test_provider_id, 'edit');
  perform public.release_patient_onboarding_operation(test_patient_id, (operation->>'token')::uuid, false, true);
  begin
    perform public.begin_patient_onboarding_operation(test_patient_id, test_provider_id, 'invite');
    raise exception 'Unreconciled account allowed code generation';
  exception when raise_exception then if sqlerrm <> 'RECONCILIATION_REQUIRED' then raise; end if; end;
  if not (public.get_patient_onboarding_details(test_patient_id)->>'needsReconciliation')::boolean then raise exception 'Recovery flag not persisted'; end if;
  operation := public.begin_patient_onboarding_operation(test_patient_id, test_provider_id, 'edit');
  perform public.complete_patient_onboarding_operation(test_patient_id, (operation->>'token')::uuid,
    jsonb_build_object('name', 'Corrected synthetic name', 'email', 'onboarding-corrected@example.invalid'));
  update auth.users set last_sign_in_at = now() where id = auth_id;
  if exists(select 1 from public.get_patient_onboarding_statuses() s where s.patient_id = test_patient_id) then raise exception 'Signed-in patient remains pending'; end if;
  begin
    perform public.begin_patient_onboarding_operation(test_patient_id, test_provider_id, 'edit');
    raise exception 'Signed-in patient remained editable';
  exception when raise_exception then if sqlerrm <> 'SETUP_COMPLETE' then raise; end if; end;
  update public.provider_patient_profiles pp set discharged_at = now() where pp.patient_id = empty_email_id and pp.provider_id = test_provider_id;
  if exists(select 1 from public.get_patient_onboarding_statuses() s where s.patient_id = empty_email_id) then raise exception 'Discharged patient remains pending'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  if exists(select 1 from public.get_patient_onboarding_statuses()) then raise exception 'Foreign provider status leak'; end if;
  begin
    perform public.get_patient_onboarding_details(test_patient_id);
    raise exception 'Foreign provider details leak';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon', 'public.get_patient_onboarding_statuses()', 'EXECUTE') or
     has_function_privilege('authenticated', 'public.begin_patient_onboarding_operation(uuid,uuid,text)', 'EXECUTE') then raise exception 'Invalid function grants'; end if;
end $$;
select 'PASS: statuses, first-sign-in, correction, expiry, serialization, recovery, discharge, isolation and grants' as result;
