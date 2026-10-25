-- Fixes "Database error saving new user" during api/invite-patient.ts's
-- inviteUserByEmail call. on_auth_user_created's handle_new_user() trigger
-- unconditionally inserts a providers row for every new auth.users row; it
-- predates patient invites and was never taught that a patient invite is not
-- a provider signup, so it errors (or at best would wrongly create a
-- providers row for a patient). api/invite-patient.ts tags its invites with
-- a patient_id key in the new user's metadata, so that's what this checks.
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
