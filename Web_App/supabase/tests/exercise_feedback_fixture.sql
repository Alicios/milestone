-- Disposable PostgreSQL fixture only. Auth is a test double; never deploy this.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table public.providers(id uuid primary key);
create table public.patients(id uuid primary key, auth_user_id uuid);
create table public.provider_patient_profiles(id uuid primary key, provider_id uuid, patient_id uuid references patients(id), discharged_at timestamptz);
create table public.routine_assignments(id uuid primary key, patient_id uuid references patients(id), patient_profile_id uuid references provider_patient_profiles(id), scheduled_date date, status text);
create table public.routine_assignment_exercises(id uuid primary key, routine_assignment_id uuid references routine_assignments(id), exercise_name_snapshot text, position integer);
create table public.routine_follow_ups(routine_assignment_id uuid, status text, updated_at timestamptz);
alter table public.routine_assignments add column updated_at timestamptz default now();
alter table public.routine_assignments enable row level security;
alter table public.routine_assignment_exercises enable row level security;
alter table public.provider_patient_profiles enable row level security;
grant select on public.providers, public.patients, public.provider_patient_profiles, public.routine_assignments, public.routine_assignment_exercises to authenticated;
create policy provider_profiles on public.provider_patient_profiles for select to authenticated using(provider_id=(select auth.uid()));
create policy provider_assignments on public.routine_assignments for select to authenticated using(exists(select 1 from public.provider_patient_profiles pp where pp.id=patient_profile_id and pp.provider_id=(select auth.uid())));
create policy provider_snapshots on public.routine_assignment_exercises for select to authenticated using(exists(select 1 from public.routine_assignments a where a.id=routine_assignment_id));
create schema milestone_scheduling;
create function milestone_scheduling.policy_at(p_instant timestamptz) returns jsonb language sql stable as $$ select jsonb_build_object('today',(p_instant at time zone 'America/Los_Angeles')::date) $$;
create function milestone_scheduling.provider() returns uuid language plpgsql stable set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.providers where id=auth.uid()) then raise exception 'Provider required' using errcode='42501'; end if;
  return auth.uid();
end; $$;
