-- Switches patient activation from an emailed magic-link + password
-- (inviteUserByEmail, patient-setup.html) to an emailed one-time passcode
-- entered directly in Mobile_App (signInWithOtp + verifyOtp). No separate
-- web landing page exists anymore, so linking patients.auth_user_id can no
-- longer happen as a follow-up step in api/invite-patient.ts after an
-- inviteUserByEmail call returns a user id synchronously — it now happens
-- here, in the trigger, matching on the same patient_id metadata tag
-- api/invite-patient.ts still sets. This also makes linking work no matter
-- which Auth API call actually created the row.
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
begin
  if new.raw_user_meta_data ? 'patient_id' then
    update public.patients
    set auth_user_id = new.id
    where id = (new.raw_user_meta_data ->> 'patient_id')::uuid
      and auth_user_id is null;
    return new;
  end if;

  insert into public.providers (
    id, name, professional_title, initials, contact_email, specialty
  )
  values (
    new.id,
    full_name,
    provider_title,
    upper(left(full_name, 1)) ||
      upper(coalesce(nullif(left(split_part(full_name, ' ', 2), 1), ''), '')),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'specialty', '')
  );
  return new;
end;
$function$;

commit;
