-- Remove only the current provider's relationship profile. The shared patient
-- identity remains available for another provider relationship.
begin;

create or replace function public.discharge_patient(patient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from public.provider_patient_profiles
  where provider_id = auth.uid()
    and provider_patient_profiles.patient_id = $1;
end;
$function$;

revoke all on function public.discharge_patient(uuid) from public, anon;
grant execute on function public.discharge_patient(uuid) to authenticated;

commit;
