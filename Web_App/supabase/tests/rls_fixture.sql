-- Synthetic additions to catalog_routines_fixture.sql, ONLY in a disposable DB.
-- Model the reported hosted auth.users FK, not the older fixture's providers FK.
create role service_role bypassrls;
grant usage on schema public, auth to service_role;
insert into auth.users values ('00000000-0000-0000-0000-000000000004');
alter table public.provider_patient_profiles drop constraint provider_patient_profiles_provider_id_fkey;
alter table public.provider_patient_profiles add constraint provider_patient_profiles_provider_id_fkey
  foreign key (provider_id) references auth.users(id) on delete restrict;
alter table public.provider_patient_profiles alter column id set default gen_random_uuid();
alter table public.provider_patient_profiles alter column clinical_notes set default '';
alter table public.provider_patient_profiles add unique(provider_id, patient_id);
alter table public.patients alter column id set default gen_random_uuid();
alter table public.patients alter column care_status set default 'pending';
alter table public.patients add column created_at timestamptz default now();
alter table public.patients enable row level security;
create policy "Assigned providers view patients" on public.patients for select to authenticated
  using (exists (select 1 from public.provider_patient_profiles pp
    where pp.patient_id = patients.id and pp.provider_id = auth.uid()));
grant select on public.patients to authenticated;
create policy "Providers update own patient profiles" on public.provider_patient_profiles for update to authenticated
  using (provider_id = auth.uid()) with check (provider_id = auth.uid());
grant update(clinical_notes) on public.provider_patient_profiles to authenticated;

create table public.medical_practices(id uuid primary key default gen_random_uuid(), name text, description text);
insert into public.medical_practices values ('00000000-0000-0000-0000-000000000020', 'Synthetic practice', 'Synthetic');
alter table public.medical_practices enable row level security;
create policy "Anyone can view medical practices" on public.medical_practices for select to anon, authenticated using(true);
create table public.access_requests(id uuid primary key default gen_random_uuid(), name text not null,
  email text not null, department text not null, notes text, status text not null default 'pending',
  created_at timestamptz default now());
alter table public.access_requests enable row level security;
create policy access_requests_insert_anyone on public.access_requests for insert to anon, authenticated with check(true);

alter table public.providers
  add column initials text, add column contact_email text, add column phone text,
  add column bio text, add column avatar_url text, add column facility text,
  add column office_location text, add column work_phone text,
  add column work_phone_extension text, add column preferred_contact text,
  add column medical_practice_id uuid references public.medical_practices(id);
-- Deliberately retain duplicate equivalent policies, as reported on hosted.
create policy profiles_select_own on public.providers for select to authenticated using(id = auth.uid());
create policy profiles_update_own on public.providers for update to authenticated
  using(id = auth.uid()) with check(id = auth.uid());

create table public.patient_statuses(id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid references public.provider_patient_profiles(id), day_index integer, status text);
alter table public.patient_statuses enable row level security;
create policy "Providers manage own patient profile statuses" on public.patient_statuses for all to authenticated
  using (exists (select 1 from public.provider_patient_profiles pp
    where pp.id = patient_statuses.patient_profile_id and pp.provider_id = auth.uid()))
  with check (exists (select 1 from public.provider_patient_profiles pp
    where pp.id = patient_statuses.patient_profile_id and pp.provider_id = auth.uid()));
grant select, insert, update, delete on public.patient_statuses to authenticated;

alter table public.routine_assignments add column updated_at timestamptz default now();
alter table public.routine_follow_ups add column updated_at timestamptz default now();
alter table public.routine_follow_ups alter column id set default gen_random_uuid(), alter column status set default 'scheduled';
alter table public.routine_follow_ups add unique(routine_assignment_id);
alter table public.routine_assignments alter column patient_profile_id set not null, alter column routine_id set not null;
alter table public.routines alter column provider_id set not null;
alter table public.routine_exercises enable row level security;
alter table public.routine_follow_ups enable row level security;
create policy own_routine_exercises on public.routine_exercises for select to authenticated using(exists(
  select 1 from public.routines r where r.id = routine_id and r.provider_id = auth.uid()));
create policy own_follow_ups on public.routine_follow_ups for select to authenticated using(exists(
  select 1 from public.routine_assignments a join public.provider_patient_profiles pp on pp.id = a.patient_profile_id
  where a.id = routine_assignment_id and pp.provider_id = auth.uid()));
grant select on public.routine_exercises, public.routine_follow_ups to authenticated;

alter table public.messages add column source text not null default 'live', add column seed_key text;
alter table public.message_thread_state alter column starred set default false;
