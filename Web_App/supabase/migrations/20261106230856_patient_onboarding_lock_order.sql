-- Acquire operation, relationship, patient and Auth locks consistently.
create or replace function public.begin_patient_onboarding_operation(p_patient_id uuid, p_provider_id uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.patients; operation milestone_profiles.patient_onboarding_operations; new_token uuid := gen_random_uuid();
begin
  if p_kind not in ('edit', 'invite') then raise exception 'Invalid operation' using errcode = '22023'; end if;
  perform 1 from public.provider_patient_profiles pp join public.providers provider on provider.id = pp.provider_id
    where pp.patient_id = p_patient_id and pp.provider_id = p_provider_id and pp.discharged_at is null;
  if not found then raise exception 'Active provider relationship required' using errcode = '42501'; end if;
  insert into milestone_profiles.patient_onboarding_operations(patient_id) values (p_patient_id) on conflict do nothing;
  select * into operation from milestone_profiles.patient_onboarding_operations where patient_id = p_patient_id for update;
  if operation.token is not null and operation.expires_at > now() then
    raise exception 'An operation is already in progress' using errcode = '55P03';
  end if;
  perform 1 from public.provider_patient_profiles pp where pp.patient_id = p_patient_id
    and pp.provider_id = p_provider_id and pp.discharged_at is null for update;
  if not found then raise exception 'Active provider relationship required' using errcode = '42501'; end if;
  select * into strict p from public.patients where id = p_patient_id for update;
  -- Wait for an in-flight first sign-in before testing setup eligibility.
  perform 1 from auth.users where id = p.auth_user_id for update;

  if p_kind = 'edit' and exists (select 1 from auth.users where id = p.auth_user_id and last_sign_in_at is not null) then
    raise exception 'SETUP_COMPLETE' using errcode = 'P0001';
  end if;
  if p_kind = 'invite' and (operation.needs_reconciliation or exists (
    select 1 from auth.users where id = p.auth_user_id and lower(coalesce(email, '')) <> lower(coalesce(p.email, ''))
  )) then
    raise exception 'RECONCILIATION_REQUIRED' using errcode = 'P0001';
  end if;
  update milestone_profiles.patient_onboarding_operations set token = new_token, provider_id = p_provider_id,
    kind = p_kind, expires_at = now() + interval '2 minutes',
    needs_reconciliation = needs_reconciliation or p_kind = 'edit' where patient_id = p_patient_id;
  return jsonb_build_object('token', new_token, 'patient', to_jsonb(p), 'needsReconciliation', operation.needs_reconciliation);
end $$;
