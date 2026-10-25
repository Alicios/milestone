-- Lets "New Patient" collect an email instead of a phone number, so patient
-- creation and inviting them to the app (via api/invite-patient.ts) can happen
-- in one combined action from the browser. Replaces the CLI-based invite flow
-- (scripts/invite-patient.mjs, now removed) with a Vercel serverless function
-- that holds the service_role key server-side; this migration only extends
-- create_patient, since the invite step itself needs no new SQL (the
-- serverless function uses the service_role client directly, same as the
-- removed CLI script did).
begin;

-- Consolidate into one 3-arg signature rather than leaving a second overload;
-- our only caller (src/lib/supabaseData.ts) always passes all three.
drop function if exists public.create_patient(text, text);

create function public.create_patient(patient_name text, patient_phone text, patient_email text default null)
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
  insert into public.patients (name, phone, email, care_status)
  values (btrim(patient_name), nullif(btrim(patient_phone), ''), nullif(btrim(patient_email), ''), 'pending')
  returning id into new_patient_id;

  insert into public.provider_patient_profiles (provider_id, patient_id)
  values (current_provider, new_patient_id);
  return new_patient_id;
end;
$function$;

revoke all on function public.create_patient(text, text, text) from public, anon;
grant execute on function public.create_patient(text, text, text) to authenticated;

commit;
