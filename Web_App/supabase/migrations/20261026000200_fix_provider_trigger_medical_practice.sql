-- Fixes a regression introduced by 20261024000200 (and carried forward into
-- 20261026000100): that migration recreated handle_new_user() from a copy
-- that predates 20261007000100_medical_practices.sql, which dropped
-- providers.specialty/department in favor of medical_practice_id. The stale
-- insert into providers(..., specialty) therefore fails with
-- "column specialty does not exist" whenever a new auth user falls into the
-- provider branch (any signup/signInWithOtp call without patient_id
-- metadata), aborting the transaction and surfacing as a 500 from
-- /auth/v1/otp or /auth/v1/signup.
begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  full_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'New user'
  );
  provider_title text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'professional_title'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'role'), ''),
    'Physical Therapist'
  );
  selected_medical_practice_id uuid := nullif(
    btrim(new.raw_user_meta_data ->> 'medical_practice_id'), ''
  )::uuid;
begin
  if new.raw_user_meta_data ? 'patient_id' then
    update public.patients
    set auth_user_id = new.id
    where id = (new.raw_user_meta_data ->> 'patient_id')::uuid
      and auth_user_id is null;
    return new;
  end if;

  if selected_medical_practice_id is null then
    raise exception 'Select a medical practice before creating a provider account'
      using errcode = '22023';
  end if;

  insert into public.providers (
    id, name, professional_title, initials, contact_email, medical_practice_id
  )
  values (
    new.id,
    full_name,
    provider_title,
    upper(left(full_name, 1)) ||
      upper(coalesce(nullif(left(split_part(full_name, ' ', 2), 1), ''), '')),
    coalesce(new.email, ''),
    selected_medical_practice_id
  );
  return new;
end;
$function$;

commit;
