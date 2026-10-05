-- Apply after 20261004000200_provider_patients.sql.
begin;

lock table public.patients, public.provider_patients, public.patient_statuses
  in access exclusive mode;

-- Shared historical statuses have no author/provider information. Never guess
-- their owner or copy them into another provider's private patient profile.
do $check$
begin
  if exists (
    select 1 from public.patient_statuses s
    where (select count(*) from public.provider_patients pp
           where pp.patient_id = s.patient_id) <> 1
  ) then
    raise exception 'Existing statuses need an explicit provider mapping: some patients have zero or multiple assignments. No changes applied.';
  end if;
end;
$check$;

alter table public.provider_patients rename to provider_patient_profiles;
alter table public.provider_patient_profiles
  add column id uuid not null default gen_random_uuid(),
  add column clinical_notes text not null default '';
alter table public.provider_patient_profiles drop constraint provider_patients_pkey;
alter table public.provider_patient_profiles
  add primary key (id),
  add constraint provider_patient_profiles_provider_patient_key
    unique (provider_id, patient_id);

-- Relationship IDs are immutable to clients; only the profile's content is editable.
grant update (clinical_notes) on public.provider_patient_profiles to authenticated;
create policy "Providers update own patient profiles"
on public.provider_patient_profiles for update to authenticated
using (provider_id = (select auth.uid()))
with check (provider_id = (select auth.uid()));

-- SELECT policy from migration 002 follows the renamed table and still limits
-- each provider to their own relationship profiles.
drop policy "Assigned providers update patients" on public.patients;
revoke update on public.patients from authenticated;

drop policy "Assigned providers manage patient statuses" on public.patient_statuses;
alter table public.patient_statuses add column patient_profile_id uuid;
update public.patient_statuses s
set patient_profile_id = pp.id
from public.provider_patient_profiles pp
where pp.patient_id = s.patient_id;

alter table public.patient_statuses
  alter column patient_profile_id set not null,
  add constraint patient_statuses_patient_profile_id_fkey
    foreign key (patient_profile_id)
    references public.provider_patient_profiles(id) on delete cascade,
  drop constraint patient_statuses_patient_id_day_index_key,
  drop column patient_id,
  add constraint patient_statuses_profile_day_key
    unique (patient_profile_id, day_index);

create policy "Providers manage own patient profile statuses"
on public.patient_statuses for all to authenticated
using (exists (
  select 1 from public.provider_patient_profiles pp
  where pp.id = patient_statuses.patient_profile_id
    and pp.provider_id = (select auth.uid())
))
with check (exists (
  select 1 from public.provider_patient_profiles pp
  where pp.id = patient_statuses.patient_profile_id
    and pp.provider_id = (select auth.uid())
));

-- Preserve the existing RPC signature and patient-ID return value.
create or replace function public.create_patient(patient_name text)
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
  insert into public.patients (name)
  values (btrim(patient_name)) returning id into new_patient_id;
  insert into public.provider_patient_profiles (provider_id, patient_id)
  values (current_provider, new_patient_id);
  return new_patient_id;
end;
$function$;

comment on table public.provider_patient_profiles is
  'One private clinical profile per provider-patient pair. Patients hold shared identity only.';
comment on column public.patient_statuses.patient_profile_id is
  'Progress belongs to a provider-specific patient profile, not the shared patient identity.';

commit;
