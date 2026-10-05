-- Run once after reviewing against the existing hosted schema.
begin;

-- Prevent assignments changing while existing relationships are copied.
lock table public.patients in access exclusive mode;

create table public.provider_patients (
  provider_id uuid not null references auth.users(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider_id, patient_id)
);

create index provider_patients_patient_id_idx
  on public.provider_patients (patient_id);

insert into public.provider_patients (provider_id, patient_id)
select provider_id, id from public.patients;

alter table public.provider_patients enable row level security;
revoke all on public.provider_patients from public, anon, authenticated;
grant select on public.provider_patients to authenticated;
grant all on public.provider_patients to service_role;

-- No client-side assignment writes: knowing a patient ID cannot grant access.
create policy "Providers view own patient assignments"
on public.provider_patients for select to authenticated
using (provider_id = (select auth.uid()));

drop policy "Providers manage own patients" on public.patients;
drop policy "Providers manage statuses for own patients" on public.patient_statuses;

-- Fail rather than silently discard any unreported dependent database objects.
alter table public.patients drop column provider_id;

alter table public.patients enable row level security;
alter table public.patient_statuses enable row level security;

revoke all on public.patients from public, anon, authenticated;
grant select, update on public.patients to authenticated;

create policy "Assigned providers view patients"
on public.patients for select to authenticated
using (exists (
  select 1 from public.provider_patients pp
  where pp.patient_id = patients.id and pp.provider_id = (select auth.uid())
));

create policy "Assigned providers update patients"
on public.patients for update to authenticated
using (exists (
  select 1 from public.provider_patients pp
  where pp.patient_id = patients.id and pp.provider_id = (select auth.uid())
))
with check (exists (
  select 1 from public.provider_patients pp
  where pp.patient_id = patients.id and pp.provider_id = (select auth.uid())
));

revoke all on public.patient_statuses from public, anon, authenticated;
grant select, insert, update, delete on public.patient_statuses to authenticated;

create policy "Assigned providers manage patient statuses"
on public.patient_statuses for all to authenticated
using (exists (
  select 1 from public.provider_patients pp
  where pp.patient_id = patient_statuses.patient_id
    and pp.provider_id = (select auth.uid())
))
with check (exists (
  select 1 from public.provider_patients pp
  where pp.patient_id = patient_statuses.patient_id
    and pp.provider_id = (select auth.uid())
));

-- Create the patient and first assignment atomically. Direct client inserts are
-- disabled, so the app cannot accidentally create a patient without a provider.
create function public.create_patient(patient_name text)
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
  values (btrim(patient_name))
  returning id into new_patient_id;

  insert into public.provider_patients (provider_id, patient_id)
  values (current_provider, new_patient_id);
  return new_patient_id;
end;
$function$;

revoke all on function public.create_patient(text) from public, anon;
grant execute on function public.create_patient(text) to authenticated;

comment on table public.provider_patients is
  'Provider-patient assignments. Additional assignments are managed by trusted backend/admin operations.';

commit;
