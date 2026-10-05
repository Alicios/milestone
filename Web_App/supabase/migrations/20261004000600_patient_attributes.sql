-- Store the fields used by the provider prototype's patient records.
begin;

alter table public.patients
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists primary_concern text,
  add column if not exists treatment_focus text,
  add column if not exists start_of_care date,
  add column if not exists care_status text not null default 'pending';

alter table public.patients
  drop constraint if exists patients_care_status_check;

alter table public.patients
  add constraint patients_care_status_check
  check (care_status in ('active', 'pending'));

create or replace function public.create_patient(patient_name text, patient_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_provider uuid := auth.uid();
  new_patient_id uuid;
begin
  if current_provider is null then
    raise exception 'Sign in before creating a patient' using errcode = '42501';
  end if;
  if nullif(btrim(patient_name), '') is null then
    raise exception 'Patient name is required' using errcode = '22023';
  end if;
  insert into public.patients (name, phone, care_status)
  values (btrim(patient_name), nullif(btrim(patient_phone), ''), 'pending')
  returning id into new_patient_id;

  insert into public.provider_patient_profiles (provider_id, patient_id)
  values (current_provider, new_patient_id);
  return new_patient_id;
end;
$function$;

revoke all on function public.create_patient(text, text) from public, anon;
grant execute on function public.create_patient(text, text) to authenticated;

commit;
