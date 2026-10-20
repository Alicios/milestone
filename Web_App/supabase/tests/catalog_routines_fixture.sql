-- Synthetic disposable-local fixture, NOT a hosted schema export or deployment.
create role anon;
create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create table public.providers(id uuid primary key references auth.users, name text, professional_title text);
alter table public.providers enable row level security;
create policy own_provider on public.providers for select to authenticated using(id = auth.uid());
grant select on public.providers to authenticated;
create table public.patients(id uuid primary key, name text, email text, phone text, primary_concern text,
  treatment_focus text, start_of_care date, care_status text);
create table public.provider_patient_profiles(id uuid primary key, provider_id uuid references public.providers,
  patient_id uuid references public.patients, clinical_notes text, discharged_at timestamptz, created_at timestamptz default now());
alter table public.provider_patient_profiles enable row level security;
create policy own_profiles on public.provider_patient_profiles for select to authenticated using(provider_id = auth.uid());
grant select on public.provider_patient_profiles to authenticated;
create table public.exercises(id uuid primary key, name text, "desc" text, created_at timestamptz);
alter table public.exercises enable row level security;
-- Model the reported broad grants with no policies; the migration narrows them.
grant all on public.exercises to authenticated, anon;
create table public.routines(id uuid primary key default gen_random_uuid(), provider_id uuid references public.providers,
  name text not null check(btrim(name) <> ''), created_at date, description text, exercise_list jsonb[]);
create table public.routine_exercises(id uuid primary key default gen_random_uuid(), routine_id uuid references public.routines, name text, position integer);
create table public.routine_assignments(id uuid primary key default gen_random_uuid(), patient_profile_id uuid references public.provider_patient_profiles,
  routine_id uuid references public.routines, scheduled_date date not null, status text not null default 'scheduled',
  routine_name_snapshot text not null, created_at timestamptz default now());
create unique index routine_assignments_active_unique_idx on public.routine_assignments(patient_profile_id,routine_id,scheduled_date) where status <> 'cancelled';
create table public.routine_assignment_exercises(id uuid primary key default gen_random_uuid(), routine_assignment_id uuid references public.routine_assignments,
  exercise_name_snapshot text not null, position integer not null, unique(routine_assignment_id,position));
create table public.routine_follow_ups(id uuid primary key, routine_assignment_id uuid references public.routine_assignments, scheduled_at timestamptz, status text);
create table public.messages(id uuid primary key default gen_random_uuid(), patient_profile_id uuid references public.provider_patient_profiles,
  sender_kind text, body text, created_at timestamptz default now());
create table public.message_thread_state(patient_profile_id uuid references public.provider_patient_profiles,
  participant_user_id uuid, last_read_at timestamptz, starred boolean, unique(patient_profile_id,participant_user_id));
alter table public.routines enable row level security;
alter table public.routine_assignments enable row level security;
alter table public.routine_assignment_exercises enable row level security;
create policy own_routines on public.routines for select to authenticated using(provider_id = auth.uid());
create policy own_assignments on public.routine_assignments for select to authenticated using(exists(
 select 1 from public.provider_patient_profiles p where p.id = patient_profile_id and p.provider_id = auth.uid()));
create policy own_snapshots on public.routine_assignment_exercises for select to authenticated using(exists(
 select 1 from public.routine_assignments a join public.provider_patient_profiles p on p.id=a.patient_profile_id
 where a.id=routine_assignment_id and p.provider_id=auth.uid()));
grant select on public.routines,public.routine_assignments,public.routine_assignment_exercises to authenticated;
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into public.providers values ('00000000-0000-0000-0000-000000000001','Provider A','PT'),('00000000-0000-0000-0000-000000000002','Provider B','PT');
insert into public.patients(id,name) values('00000000-0000-0000-0000-000000000010','Patient');
insert into public.provider_patient_profiles(id,provider_id,patient_id) values
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010'),
 ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010');
-- The reference CSV is loaded ONLY into this disposable fixture. Synthetic IDs.
create temporary table catalog_import(name text, "desc" text);
\copy catalog_import(name,"desc") from 'supabase/exercises_seed.csv' with (format csv, header true)
insert into public.exercises select md5(row_number() over()::text)::uuid,name,"desc",now() from catalog_import;
