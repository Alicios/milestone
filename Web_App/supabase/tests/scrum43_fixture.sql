-- Disposable local test fixture ONLY; not a provisioning or hosted migration.
-- Real upstream routine, rename, practice, compatibility, and messaging SQL is
-- exercised. Explicit fixture changes below model the supplied hosted drift.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table public.providers (
  id uuid primary key references auth.users(id), name text, role text, initials text,
  avatar_url text, contact_email text, phone text, specialty text, bio text,
  department text, facility text, office_location text, work_phone text,
  work_phone_extension text, preferred_contact text
);
alter table public.providers enable row level security;
grant select on public.providers to authenticated;
create policy own_provider on public.providers for select to authenticated using (id = auth.uid());
create table public.access_requests(id uuid primary key,name text,email text,department text,notes text,created_at timestamptz,status text);
create table public.patients(id uuid primary key,name text,created_at timestamptz,email text,phone text,primary_concern text,treatment_focus text,start_of_care date,care_status text);
create table public.provider_patient_profiles (
  id uuid primary key, provider_id uuid not null references public.providers(id),
  patient_id uuid not null references public.patients(id), created_at timestamptz,
  clinical_notes text, unique(provider_id,patient_id)
);
alter table public.provider_patient_profiles enable row level security;
grant select on public.provider_patient_profiles to authenticated;
create policy own_profile on public.provider_patient_profiles for select to authenticated using (provider_id = auth.uid());
create table public.patient_statuses(id uuid primary key,patient_profile_id uuid,day_index smallint,status text);
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into public.providers(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.patients(id) values ('00000000-0000-0000-0000-000000000021');
insert into public.provider_patient_profiles(id,provider_id,patient_id) values
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021'),
 ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000021');
\ir ../migrations/20261004001000_routines_assignments_followups.sql
\ir ../migrations/20261004001100_seed_demo_routines.sql
\ir ../migrations/20261006000100_clarify_schema_names.sql
\ir ../migrations/20261006000200_document_public_schema.sql
\ir ../migrations/20261007000100_medical_practices.sql
\ir ../migrations/20261007000400_restrict_trigger_function_execution.sql

-- These changes exist in hosted Supabase but have no matching repository migration.
alter table public.routines drop column archived_at, drop column updated_at,
  alter column created_at drop not null, alter column created_at drop default,
  alter column created_at type date using created_at::date,
  add column description text, add column exercise_list jsonb[];
create table public.exercises(id uuid primary key default gen_random_uuid(),name text not null,"desc" text,created_at timestamptz not null default now());
alter table public.exercises enable row level security;
grant all on public.exercises to anon,authenticated,service_role;
-- Include column grants too; table REVOKE alone must not leave a bypass.
grant update(name),select(name) on public.exercises to authenticated,anon;
\copy public.exercises(name,"desc") from '../exercises_seed.csv' with (format csv,header true)
\ir ../migrations/20261007000200_routines_exercise_list_compatibility.sql
create publication supabase_realtime;
\ir ../migrations/20261007000500_messages.sql

insert into public.routines(id,provider_id,name,exercise_list) values
 ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000001','Legacy object',
   array['{"exercise_id":"1234","sets":3,"reps":10,"timer":3000}'::jsonb,'"Leg Stretch"'::jsonb]),
 ('00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000001','Legacy null',null),
 ('00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000001','Legacy name',array['"Leg Stretch"'::jsonb]);
insert into public.routine_assignments(id,patient_profile_id,routine_id,scheduled_date,routine_name_snapshot)
values ('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000031','2026-10-01','Historical routine');
insert into public.routine_assignment_exercises(routine_assignment_id,exercise_name_snapshot,position)
values ('00000000-0000-0000-0000-000000000041','Historical name',0);
create table public.test_before_catalog as select * from public.exercises;
create table public.test_before_routines as select * from public.routines;
create table public.test_before_snapshots as select * from public.routine_assignment_exercises;
create table public.test_before_memberships as select * from public.routine_exercises;
create table public.test_before_functions as
select oid::regprocedure::text as signature,pg_get_functiondef(oid) as definition from pg_proc
where oid in ('public.archive_routine(uuid)'::regprocedure,'public.cancel_routine_assignment(uuid)'::regprocedure,
 'public.schedule_routine_follow_up(uuid,timestamptz)'::regprocedure,'public.handle_new_user()'::regprocedure);
