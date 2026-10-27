-- Provider-managed shared patient details. No additional table grants or anon writes.
create schema if not exists milestone_profiles;
revoke all on schema milestone_profiles from public, anon;
grant usage on schema milestone_profiles to authenticated;

create or replace function milestone_profiles.update_patient_details(
  p_patient_id uuid, p_name text, p_email text, p_phone text,
  p_primary_concern text, p_treatment_focus text, p_start_of_care date, p_care_status text
)
returns table(id uuid, name text, email text, phone text, primary_concern text,
  treatment_focus text, start_of_care date, care_status text)
language plpgsql security definer set search_path = '' as $function$
declare
  provider uuid := auth.uid();
begin
  if provider is null then
    raise exception 'Sign in before editing a patient.' using errcode = '42501';
  end if;
  -- Lock the relationship so discharge cannot race an authorized save.
  perform 1 from public.provider_patient_profiles pp
    where pp.patient_id = p_patient_id and pp.provider_id = provider
      and pp.discharged_at is null for update;
  if not found then
    raise exception 'An active provider-patient relationship is required.' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 200 then
    raise exception 'Enter a name of 1 to 200 characters.' using errcode = '22023';
  end if;
  if nullif(btrim(p_email), '') is not null and
    (char_length(btrim(p_email)) > 320 or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if nullif(btrim(p_phone), '') is not null and
    (char_length(btrim(p_phone)) > 64 or btrim(p_phone) !~ '^\+?[0-9 ().-]+$'
     or regexp_replace(p_phone, '[^0-9]', '', 'g') !~ '^[0-9]{7,15}$') then
    raise exception 'Enter a phone number with 7 to 15 digits.' using errcode = '22023';
  end if;
  if char_length(btrim(p_primary_concern)) > 4000 or char_length(btrim(p_treatment_focus)) > 4000 then
    raise exception 'Care details must contain 4000 characters or fewer.' using errcode = '22023';
  end if;
  if p_start_of_care is not null and not isfinite(p_start_of_care) then
    raise exception 'Enter a valid date.' using errcode = '22023';
  end if;
  if p_care_status is null or p_care_status not in ('active', 'pending') then
    raise exception 'Choose Active or Pending.' using errcode = '22023';
  end if;
  return query update public.patients p set
    name = btrim(p_name), email = nullif(btrim(p_email), ''), phone = nullif(btrim(p_phone), ''),
    primary_concern = nullif(btrim(p_primary_concern), ''), treatment_focus = nullif(btrim(p_treatment_focus), ''),
    start_of_care = p_start_of_care, care_status = p_care_status
    where p.id = p_patient_id
    returning p.id, p.name, p.email, p.phone, p.primary_concern, p.treatment_focus, p.start_of_care, p.care_status;
  if not found then
    raise exception 'Patient not found.' using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function milestone_profiles.update_patient_details(uuid,text,text,text,text,text,date,text) from public, anon;
grant execute on function milestone_profiles.update_patient_details(uuid,text,text,text,text,text,date,text) to authenticated;

create or replace function public.update_patient_details(
  p_patient_id uuid, p_name text, p_email text, p_phone text,
  p_primary_concern text, p_treatment_focus text, p_start_of_care date, p_care_status text
)
returns table(id uuid, name text, email text, phone text, primary_concern text,
  treatment_focus text, start_of_care date, care_status text)
language sql security invoker set search_path = '' as $function$
  select * from milestone_profiles.update_patient_details(
    p_patient_id, p_name, p_email, p_phone, p_primary_concern, p_treatment_focus, p_start_of_care, p_care_status);
$function$;
revoke all on function public.update_patient_details(uuid,text,text,text,text,text,date,text) from public, anon;
grant execute on function public.update_patient_details(uuid,text,text,text,text,text,date,text) to authenticated;
