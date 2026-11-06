-- Keep cross-service Auth edits recoverable and serialize them with code creation.
create schema if not exists milestone_profiles;
create table milestone_profiles.patient_onboarding_operations (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  token uuid,
  provider_id uuid,
  kind text check (kind in ('edit', 'invite')),
  expires_at timestamptz,
  needs_reconciliation boolean not null default false
);
alter table milestone_profiles.patient_onboarding_operations enable row level security;
revoke all on milestone_profiles.patient_onboarding_operations from public, anon, authenticated;

create function public.get_patient_onboarding_statuses()
returns table(patient_id uuid, name text, status text, needs_reconciliation boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name,
    case when nullif(btrim(p.email), '') is null then 'email_needed'
      when p.pending_otp_code is null then 'invitation_needed'
      when p.pending_otp_expires_at is null or p.pending_otp_expires_at <= now() then 'code_expired'
      else 'awaiting_code' end,
    coalesce(o.needs_reconciliation, false) or (p.auth_user_id is not null and lower(coalesce(u.email, '')) <> lower(coalesce(p.email, '')))
  from public.patients p
  join public.provider_patient_profiles pp on pp.patient_id = p.id
  join public.providers provider on provider.id = pp.provider_id
  left join auth.users u on u.id = p.auth_user_id
  left join milestone_profiles.patient_onboarding_operations o on o.patient_id = p.id
  where pp.provider_id = auth.uid() and pp.discharged_at is null
    and u.last_sign_in_at is null
  order by lower(p.name), p.id;
$$;

create function public.get_patient_onboarding_details(p_patient_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.patients; signed_in boolean; needs_sync boolean;
begin
  if not exists (select 1 from public.provider_patient_profiles pp
    join public.providers provider on provider.id = pp.provider_id
    where pp.patient_id = p_patient_id and pp.provider_id = auth.uid() and pp.discharged_at is null) then
    raise exception 'Active provider relationship required' using errcode = '42501';
  end if;
  select * into strict p from public.patients where id = p_patient_id;
  select last_sign_in_at is not null into signed_in from auth.users where id = p.auth_user_id;
  select needs_reconciliation into needs_sync from milestone_profiles.patient_onboarding_operations where patient_id = p.id;
  needs_sync := coalesce(needs_sync, false) or exists(select 1 from auth.users where id = p.auth_user_id and lower(coalesce(email, '')) <> lower(coalesce(p.email, '')));
  return jsonb_build_object('patientId', p.id, 'name', p.name, 'email', coalesce(p.email, ''),
    'setupComplete', coalesce(signed_in, false), 'needsReconciliation', coalesce(needs_sync, false),
    'status', case when signed_in then 'setup_complete'
      when nullif(btrim(p.email), '') is null then 'email_needed'
      when p.pending_otp_code is null then 'invitation_needed'
      when p.pending_otp_expires_at is null or p.pending_otp_expires_at <= now() then 'code_expired'
      else 'awaiting_code' end,
    'code', case when not coalesce(needs_sync, false) and p.pending_otp_expires_at > now() and not coalesce(signed_in, false) then p.pending_otp_code end,
    'codeExpiresAt', p.pending_otp_expires_at);
end $$;

-- Service-only operations: the endpoint derives provider_id from getUser(token).
create function public.begin_patient_onboarding_operation(p_patient_id uuid, p_provider_id uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.patients; operation milestone_profiles.patient_onboarding_operations; new_token uuid := gen_random_uuid();
begin
  if p_kind not in ('edit', 'invite') then raise exception 'Invalid operation' using errcode = '22023'; end if;
  perform 1 from public.provider_patient_profiles pp join public.providers provider on provider.id = pp.provider_id
    where pp.patient_id = p_patient_id and pp.provider_id = p_provider_id and pp.discharged_at is null for update of pp;
  if not found then raise exception 'Active provider relationship required' using errcode = '42501'; end if;
  insert into milestone_profiles.patient_onboarding_operations(patient_id) values (p_patient_id) on conflict do nothing;
  select * into operation from milestone_profiles.patient_onboarding_operations where patient_id = p_patient_id for update;
  if operation.token is not null and operation.expires_at > now() then
    raise exception 'An operation is already in progress' using errcode = '55P03';
  end if;
  select * into strict p from public.patients where id = p_patient_id for update;
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

create function public.complete_patient_onboarding_operation(p_patient_id uuid, p_token uuid, p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.patients; operation milestone_profiles.patient_onboarding_operations; email_changed boolean; auth_id uuid;
begin
  select * into operation from milestone_profiles.patient_onboarding_operations where patient_id = p_patient_id for update;
  if p_token is null or operation.token is null or operation.token is distinct from p_token or operation.expires_at <= now() then
    raise exception 'Operation expired' using errcode = '55P03';
  end if;
  perform 1 from public.provider_patient_profiles where patient_id = p_patient_id and provider_id = operation.provider_id
    and discharged_at is null for update;
  if not found then raise exception 'Active relationship required' using errcode = '42501'; end if;
  select * into strict p from public.patients where id = p_patient_id for update;
  if operation.kind = 'edit' then
    if exists (select 1 from auth.users where id = p.auth_user_id and last_sign_in_at is not null) then
      raise exception 'SETUP_COMPLETE' using errcode = 'P0001';
    end if;
    if p_result->>'name' is null or char_length(btrim(p_result->>'name')) not between 1 and 200 or
      p_result->>'email' is null or char_length(p_result->>'email') > 320 or
      p_result->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Invalid patient details' using errcode = '22023';
    end if;
    if p.auth_user_id is not null and not exists (select 1 from auth.users where id = p.auth_user_id
      and lower(email) = lower(p_result->>'email')) then
      raise exception 'RECONCILIATION_REQUIRED' using errcode = 'P0001';
    end if;
    if exists (select 1 from auth.users u where lower(u.email) = lower(p_result->>'email') and u.id is distinct from p.auth_user_id) then
      raise exception 'Account conflict' using errcode = '23505';
    end if;
    email_changed := lower(coalesce(p.email, '')) is distinct from lower(p_result->>'email');
    update public.patients set name = btrim(p_result->>'name'), email = lower(btrim(p_result->>'email')),
      pending_otp_code = case when email_changed then null else pending_otp_code end,
      pending_otp_expires_at = case when email_changed then null else pending_otp_expires_at end where id = p.id;
  else
    auth_id := (p_result->>'authUserId')::uuid;
    -- New accounts are linked by handle_new_user(). Never claim an existing account by email.
    if p.auth_user_id is null or p.auth_user_id <> auth_id then
      raise exception 'Account conflict' using errcode = '23505';
    end if;
    if exists(select 1 from public.providers where id = auth_id) or not exists (
      select 1 from auth.users where id = auth_id and lower(email) = lower(p.email)) then
      raise exception 'Account conflict' using errcode = '23505';
    end if;
    if p_result->>'code' is null or p_result->>'expiresAt' is null or p_result->>'code' !~ '^[0-9]+$' or (p_result->>'expiresAt')::timestamptz <= now() then
      raise exception 'Invalid code' using errcode = '22023';
    end if;
    update public.patients set auth_user_id = auth_id, pending_otp_code = p_result->>'code',
      pending_otp_expires_at = (p_result->>'expiresAt')::timestamptz where id = p.id;
  end if;
  update milestone_profiles.patient_onboarding_operations set token = null, expires_at = null, needs_reconciliation = false where patient_id = p.id;
end $$;

-- Prevent the first code verification from racing a cross-service email repair.
-- Existing signed-in accounts and ordinary subsequent sign-ins are unaffected.
create function milestone_profiles.guard_onboarding_first_sign_in()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.last_sign_in_at is null and new.last_sign_in_at is not null and exists (
    select 1 from public.patients p join milestone_profiles.patient_onboarding_operations o on o.patient_id = p.id
    where p.auth_user_id = new.id and o.needs_reconciliation
  ) then
    raise exception 'Patient details are being synchronized. Please retry shortly.' using errcode = '55P03';
  end if;
  return new;
end $$;
revoke all on function milestone_profiles.guard_onboarding_first_sign_in() from public, anon, authenticated;
create trigger guard_patient_onboarding_first_sign_in before update of last_sign_in_at on auth.users
for each row execute function milestone_profiles.guard_onboarding_first_sign_in();

create function public.release_patient_onboarding_operation(p_patient_id uuid, p_token uuid, p_reconciled boolean, p_clear_code boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update milestone_profiles.patient_onboarding_operations set token = null, expires_at = null,
    needs_reconciliation = not p_reconciled where patient_id = p_patient_id and token = p_token;
  if found and p_clear_code then
    update public.patients set pending_otp_code = null, pending_otp_expires_at = null where id = p_patient_id;
  end if;
end $$;

revoke all on function public.get_patient_onboarding_statuses(), public.get_patient_onboarding_details(uuid) from public, anon;
grant execute on function public.get_patient_onboarding_statuses(), public.get_patient_onboarding_details(uuid) to authenticated;
revoke all on function public.begin_patient_onboarding_operation(uuid,uuid,text), public.complete_patient_onboarding_operation(uuid,uuid,jsonb),
  public.release_patient_onboarding_operation(uuid,uuid,boolean,boolean) from public, anon, authenticated;
grant execute on function public.begin_patient_onboarding_operation(uuid,uuid,text), public.complete_patient_onboarding_operation(uuid,uuid,jsonb),
  public.release_patient_onboarding_operation(uuid,uuid,boolean,boolean) to service_role;
