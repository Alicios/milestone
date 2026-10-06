-- Run only through run-exercises.sh in its empty, disposable local cluster.
-- Minimal fixture for dependencies of migration 010, NOT a deployment baseline.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create table public.providers (id uuid primary key);
create table public.provider_patient_profiles (
  id uuid primary key,
  provider_id uuid not null references public.providers(id),
  patient_id uuid not null
);
alter table public.provider_patient_profiles enable row level security;
grant select on public.provider_patient_profiles to authenticated;
create policy fixture_own_profiles on public.provider_patient_profiles
  for select to authenticated using (provider_id = auth.uid());

insert into public.providers values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');
insert into public.provider_patient_profiles values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000021');

\ir ../migrations/20261004001000_routines_assignments_followups.sql
\ir ../migrations/20261004001100_seed_demo_routines.sql

-- Equal-name entries in an archived routine, plus a pre-migration assignment.
insert into public.routines (id, provider_id, name, archived_at)
values ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'Legacy', now());
insert into public.routine_exercises (routine_id, name, position) values
  ('00000000-0000-0000-0000-000000000031', 'Same name', 0),
  ('00000000-0000-0000-0000-000000000031', 'Same name', 1);
insert into public.routine_assignments (id, patient_profile_id, routine_id, scheduled_date, routine_name_snapshot)
values ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000031', '2026-10-01', 'Historical routine');
insert into public.routine_assignment_exercises (routine_assignment_id, name, position)
values ('00000000-0000-0000-0000-000000000041', 'Historical exercise', 0);
create temp table before_memberships as select * from public.routine_exercises;
create temp table before_snapshots as select * from public.routine_assignment_exercises;

\ir ../migrations/20261005000100_reusable_exercises.sql

do $$ begin
  assert (select count(*) from public.exercises) = (select count(*) from before_memberships), 'Backfill must not deduplicate';
  assert (select count(distinct exercise_id) from public.routine_exercises) = (select count(*) from before_memberships);
  assert not exists (
    select 1 from before_memberships old
    left join public.routine_exercises re on re.id = old.id
    left join public.exercises e on e.id = re.exercise_id
    left join public.routines r on r.id = re.routine_id
    where re.id is null or re.routine_id <> old.routine_id or re.position <> old.position
      or e.name <> old.name or e.provider_id <> r.provider_id or e.instructions <> ''
  ), 'Backfill changed existing entries';
  assert not exists (
    select 1 from before_snapshots old left join public.routine_assignment_exercises s on s.id = old.id
    where s.id is null or s.name <> old.name or s.position <> old.position
      or s.routine_assignment_id <> old.routine_assignment_id or s.instructions <> ''
  ), 'Historical snapshots changed';
  assert to_regprocedure('public.save_routine(uuid,text,text[])') is null, 'Legacy name-only writer remains';
  assert not has_table_privilege('authenticated', 'public.exercises', 'INSERT');
  assert not has_table_privilege('authenticated', 'public.exercises', 'UPDATE');
  assert not has_table_privilege('authenticated', 'public.exercises', 'DELETE');
  assert not has_table_privilege('authenticated', 'public.routine_exercises', 'INSERT');
  assert not has_table_privilege('authenticated', 'public.routine_assignment_exercises', 'UPDATE');
  assert not has_table_privilege('anon', 'public.exercises', 'SELECT');
  assert not has_function_privilege('anon', 'public.save_exercise(uuid,text,text)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.save_routine(uuid,text,uuid[])', 'EXECUTE');
end $$;
\echo Backfill, grants, and legacy-writer checks passed.

set role authenticated;
do $$
declare
  provider_a uuid := '00000000-0000-0000-0000-000000000001';
  provider_b uuid := '00000000-0000-0000-0000-000000000002';
  patient_profile uuid := '00000000-0000-0000-0000-000000000011';
  exercise_a uuid;
  exercise_b uuid;
  foreign_exercise uuid;
  routine_a uuid;
  routine_b uuid;
  assignment_id uuid;
  slot_id uuid;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  begin
    perform public.save_exercise(null, 'Denied', '');
    raise exception 'Unauthenticated creation was allowed';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub', provider_b::text, false);
  foreign_exercise := public.save_exercise(null, 'Other provider exercise', 'Private');

  perform set_config('request.jwt.claim.sub', provider_a::text, false);
  assert not exists (select 1 from public.exercises where provider_id <> provider_a), 'Catalog RLS leaks rows';
  begin
    perform public.save_exercise(null, '   ', '');
    raise exception 'Blank name was allowed';
  exception when invalid_parameter_value then null; end;
  exercise_a := public.save_exercise(null, '  Shared stretch  ', 'Original instructions');
  exercise_b := public.save_exercise(null, 'Shared stretch', 'Different definition');
  assert exercise_a <> exercise_b, 'Equal names were deduplicated';
  assert (select name from public.exercises where id = exercise_a) = 'Shared stretch';
  assert (select created_at is not null and updated_at is not null from public.exercises where id = exercise_a);

  routine_a := public.save_routine(null, 'Routine A', array[exercise_a, exercise_b, exercise_a]);
  routine_b := public.save_routine(null, 'Routine B', array[exercise_a]);
  assert (select count(*) from public.routine_exercises where exercise_id = exercise_a) = 3, 'Reuse/repetition failed';
  select id into slot_id from public.routine_exercises where routine_id = routine_a and position = 0;
  perform public.save_routine(routine_a, 'Routine A edited', array[exercise_b, exercise_a]);
  assert (select id from public.routine_exercises where routine_id = routine_a and position = 0) = slot_id, 'Retained position lost membership ID';
  assert (select array_agg(exercise_id order by position) from public.routine_exercises where routine_id = routine_a) = array[exercise_b, exercise_a], 'Order/removal failed';
  assert exists (select 1 from public.exercises where id = exercise_a), 'Removing membership deleted catalog entry';

  begin
    perform public.save_routine(routine_a, 'Should roll back', array[foreign_exercise]);
    raise exception 'Cross-provider membership allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_routine(null, 'Invalid reference', array[gen_random_uuid()]);
    raise exception 'Unknown exercise allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_routine(null, 'Null reference', array[null::uuid]);
    raise exception 'Null exercise allowed';
  exception when insufficient_privilege then null; end;
  assert (select name from public.routines where id = routine_a) = 'Routine A edited', 'Rejected save changed routine';

  assignment_id := public.assign_routine(patient_profile, routine_b, '2026-10-05');
  assert (select instructions from public.routine_assignment_exercises where routine_assignment_id = assignment_id) = 'Original instructions';
  perform public.save_exercise(exercise_a, 'Renamed stretch', 'Changed instructions');
  assert (select name from public.routine_assignment_exercises where routine_assignment_id = assignment_id) = 'Shared stretch', 'Snapshot name is mutable';
  assert (select instructions from public.routine_assignment_exercises where routine_assignment_id = assignment_id) = 'Original instructions', 'Snapshot instructions are mutable';
  perform public.save_routine(routine_b, 'Empty routine', array[]::uuid[]);
  assert not exists (select 1 from public.routine_exercises where routine_id = routine_b);
  assert exists (select 1 from public.routine_assignment_exercises where routine_assignment_id = assignment_id), 'Routine edit removed snapshot';
  perform public.archive_routine(routine_b);
  assert exists (select 1 from public.routine_assignment_exercises where routine_assignment_id = assignment_id), 'Archive removed snapshot';

  perform set_config('request.jwt.claim.sub', provider_b::text, false);
  assert not exists (select 1 from public.exercises where id = exercise_a), 'Other provider sees catalog entry';
  assert not exists (select 1 from public.routine_exercises where routine_id = routine_a), 'Other provider sees membership';
  assert not exists (select 1 from public.routine_assignment_exercises where routine_assignment_id = assignment_id), 'Other provider sees snapshot';
  begin
    perform public.save_exercise(exercise_a, 'Unauthorized edit', '');
    raise exception 'Cross-provider exercise edit allowed';
  exception when no_data_found then null; end;
  begin
    perform public.save_routine(routine_a, 'Unauthorized routine', array[foreign_exercise]);
    raise exception 'Cross-provider routine edit allowed';
  exception when no_data_found then null; end;
  begin
    perform public.assign_routine(patient_profile, routine_a, '2026-10-06');
    raise exception 'Cross-provider assignment allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo Reuse, ordering, ownership, validation, and immutable snapshot checks passed.
