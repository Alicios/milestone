-- Run only through run-exercises.sh in its empty, disposable local cluster.
-- Minimal pre-010 dependency fixture, NOT a full Supabase deployment baseline.
-- The REAL 010, 011, October 6 rename/documentation and SCRUM-43 migrations run
-- below in filename order. auth.uid() is a local test double, not Supabase Auth.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create table public.providers (
  id uuid primary key, name text, role text, initials text, avatar_url text,
  contact_email text, phone text, specialty text, bio text, department text,
  facility text, office_location text, work_phone text, work_phone_extension text,
  preferred_contact text
);
create table public.access_requests (
  id uuid primary key, name text, email text, department text, notes text,
  created_at timestamptz, status text
);
create table public.patients (
  id uuid primary key, name text, created_at timestamptz, email text, phone text,
  primary_concern text, treatment_focus text, start_of_care date, care_status text
);
create table public.provider_patient_profiles (
  id uuid primary key,
  provider_id uuid not null references public.providers(id),
  patient_id uuid not null references public.patients(id),
  created_at timestamptz default now(), clinical_notes text,
  unique (provider_id, patient_id)
);
create table public.patient_statuses (
  id uuid primary key, day_index smallint, status text,
  patient_profile_id uuid references public.provider_patient_profiles(id)
);
alter table public.provider_patient_profiles enable row level security;
grant select on public.provider_patient_profiles to authenticated;
create policy fixture_own_profiles on public.provider_patient_profiles
  for select to authenticated using (provider_id = auth.uid());

insert into public.providers (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');
insert into public.patients (id) values ('00000000-0000-0000-0000-000000000021');
insert into public.provider_patient_profiles (id, provider_id, patient_id) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000021');

\ir ../migrations/20261004001000_routines_assignments_followups.sql
\ir ../migrations/20261004001100_seed_demo_routines.sql
\ir ../migrations/20261006000100_clarify_schema_names.sql
\ir ../migrations/20261006000200_document_public_schema.sql

do $$ begin
  assert to_regclass('public.exercises') is null;
  assert to_regclass('public.routine_follow_ups') is not null;
  assert to_regclass('public.appointments') is null;
  assert exists (select 1 from information_schema.columns where table_name = 'providers' and column_name = 'professional_title');
  assert col_description('public.routine_exercises'::regclass, 3) is not null, 'October 6 documentation did not run';
end $$;

-- Equal-name entries in an archived routine, plus a pre-migration assignment.
insert into public.routines (id, provider_id, name, archived_at)
values ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'Legacy', now());
insert into public.routine_exercises (routine_id, name, position) values
  ('00000000-0000-0000-0000-000000000031', 'Same name', 0),
  ('00000000-0000-0000-0000-000000000031', 'Same name', 1);
insert into public.routine_assignments (id, patient_profile_id, routine_id, scheduled_date, routine_name_snapshot)
values ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000031', '2026-10-01', 'Historical routine');
insert into public.routine_assignment_exercises (routine_assignment_id, exercise_name_snapshot, position)
values ('00000000-0000-0000-0000-000000000041', 'Historical exercise', 0);
insert into public.routine_follow_ups (routine_assignment_id, scheduled_at)
values ('00000000-0000-0000-0000-000000000041', '2026-10-01 12:00:00+00');
create temp table before_routines as select * from public.routines;
create temp table before_assignments as select * from public.routine_assignments;
create temp table before_follow_ups as select * from public.routine_follow_ups;
create temp table before_policies as select * from pg_policies where schemaname = 'public';
create temp table before_memberships as select * from public.routine_exercises;
create temp table before_snapshots as select * from public.routine_assignment_exercises;

\ir ../migrations/20261007000100_reusable_exercises.sql

do $$ begin
  assert not exists ((select * from before_routines except select * from public.routines)
    union all (select * from public.routines except select * from before_routines)), 'Routine rows changed';
  assert not exists ((select * from before_assignments except select * from public.routine_assignments)
    union all (select * from public.routine_assignments except select * from before_assignments)), 'Assignments changed';
  assert not exists ((select * from before_follow_ups except select * from public.routine_follow_ups)
    union all (select * from public.routine_follow_ups except select * from before_follow_ups)), 'Follow-ups changed';
  assert not exists (select * from before_policies except select * from pg_policies where schemaname = 'public'), 'Existing RLS changed';
  assert (select count(*) from public.exercises) = (select count(*) from before_memberships), 'Backfill must not deduplicate';
  assert (select count(distinct exercise_id) from public.routine_exercises) = (select count(*) from before_memberships);
  assert (select count(*) from public.routine_exercises) = (select count(*) from before_memberships);
  assert (select count(*) from public.routine_assignment_exercises) = (select count(*) from before_snapshots);
  assert not exists (
    select 1 from before_memberships old
    left join public.routine_exercises re on re.id = old.id
    left join public.exercises e on e.id = re.exercise_id
    left join public.routines r on r.id = re.routine_id
    where re.id is null or re.routine_id <> old.routine_id or re.position <> old.position
      or re.name <> old.name or e.name <> old.name or e.provider_id <> r.provider_id or e.instructions <> ''
  ), 'Backfill changed existing entries';
  assert not exists (
    select 1 from before_snapshots old left join public.routine_assignment_exercises s on s.id = old.id
    where s.id is null or s.exercise_name_snapshot <> old.exercise_name_snapshot or s.position <> old.position
      or s.routine_assignment_id <> old.routine_assignment_id or s.instructions <> ''
  ), 'Historical snapshots changed';
  assert to_regprocedure('public.save_routine(uuid,text,text[])') is not null, 'Legacy API removed';
  assert to_regprocedure('public.save_routine(uuid,text,uuid[])') is null, 'Ambiguous overload introduced';
  assert to_regprocedure('public.save_routine_with_exercises(uuid,text,uuid[])') is not null;
  assert (select proargnames from pg_proc where oid = 'public.save_routine(uuid,text,text[])'::regprocedure)
    = array['p_routine_id', 'p_routine_name', 'p_exercise_names'];
  assert not exists (select 1 from information_schema.columns
    where table_name = 'routine_assignment_exercises' and column_name = 'exercise_id'), 'Snapshots depend on catalog';
  assert not has_table_privilege('authenticated', 'public.exercises', 'INSERT');
  assert not has_table_privilege('authenticated', 'public.exercises', 'UPDATE');
  assert not has_table_privilege('authenticated', 'public.exercises', 'DELETE');
  assert not has_table_privilege('authenticated', 'public.routine_exercises', 'INSERT');
  assert not has_table_privilege('authenticated', 'public.routine_assignment_exercises', 'UPDATE');
  assert not has_table_privilege('anon', 'public.exercises', 'SELECT');
  assert not has_function_privilege('anon', 'public.save_exercise(uuid,text,text)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.save_routine_with_exercises(uuid,text,uuid[])', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.save_routine(uuid,text,text[])', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.assign_routine(uuid,uuid,date)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.enforce_routine_exercise_catalog()', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.sync_exercise_membership_names()', 'EXECUTE');
  assert not exists (
    select 1 from pg_proc where oid in (
      'public.save_exercise(uuid,text,text)'::regprocedure,
      'public.save_routine_with_exercises(uuid,text,uuid[])'::regprocedure,
      'public.save_routine(uuid,text,text[])'::regprocedure,
      'public.assign_routine(uuid,uuid,date)'::regprocedure
    ) and (not prosecdef or not (proconfig @> array['search_path=""']))
  ), 'Write RPC security configuration changed';
  assert (select attnotnull from pg_attribute
    where attrelid = 'public.routine_exercises'::regclass and attname = 'exercise_id');
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
  legacy_routine uuid;
  legacy_exercise uuid;
  exercise_count bigint;
  second_assignment uuid;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  begin
    perform public.save_exercise(null, 'Denied', '');
    raise exception 'Unauthenticated creation was allowed';
  exception when insufficient_privilege then null; end;

  begin
    perform public.save_routine(null, 'Denied legacy save', array['Exercise']);
    raise exception 'Unauthenticated legacy save allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_routine_with_exercises(null, 'Denied ID save', array[]::uuid[]);
    raise exception 'Unauthenticated ID save allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000099', false);
  begin
    perform public.save_exercise(null, 'Missing provider', '');
    raise exception 'Catalog creation without provider allowed';
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

  routine_a := public.save_routine_with_exercises(null, 'Routine A', array[exercise_a, exercise_b, exercise_a]);
  routine_b := public.save_routine_with_exercises(null, 'Routine B', array[exercise_a]);
  assert (select count(*) from public.routine_exercises where exercise_id = exercise_a) = 3, 'Reuse/repetition failed';
  select id into slot_id from public.routine_exercises where routine_id = routine_a and position = 0;
  perform public.save_routine_with_exercises(routine_a, 'Routine A edited', array[exercise_b, exercise_a]);
  assert (select id from public.routine_exercises where routine_id = routine_a and position = 0) = slot_id, 'Retained position lost membership ID';
  assert (select array_agg(exercise_id order by position) from public.routine_exercises where routine_id = routine_a) = array[exercise_b, exercise_a], 'Order/removal failed';
  assert exists (select 1 from public.exercises where id = exercise_a), 'Removing membership deleted catalog entry';

  begin
    perform public.save_routine_with_exercises(routine_a, 'Should roll back', array[foreign_exercise]);
    raise exception 'Cross-provider membership allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_routine_with_exercises(null, 'Invalid reference', array[gen_random_uuid()]);
    raise exception 'Unknown exercise allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_routine_with_exercises(null, 'Null reference', array[null::uuid]);
    raise exception 'Null exercise allowed';
  exception when insufficient_privilege then null; end;
  assert (select name from public.routines where id = routine_a) = 'Routine A edited', 'Rejected save changed routine';

  assignment_id := public.assign_routine(patient_profile, routine_b, '2026-10-05');
  assert (select instructions from public.routine_assignment_exercises where routine_assignment_id = assignment_id) = 'Original instructions';
  perform public.save_exercise(exercise_a, 'Renamed stretch', 'Changed instructions');
  assert not exists (select 1 from public.routine_exercises where exercise_id = exercise_a and name <> 'Renamed stretch'), 'Legacy mirror is stale';
  second_assignment := public.assign_routine(patient_profile, routine_b, '2026-10-06');
  assert (select exercise_name_snapshot from public.routine_assignment_exercises where routine_assignment_id = second_assignment) = 'Renamed stretch';
  assert (select instructions from public.routine_assignment_exercises where routine_assignment_id = second_assignment) = 'Changed instructions';
  perform public.schedule_routine_follow_up(second_assignment, '2026-10-06 12:00:00+00');
  perform public.cancel_routine_assignment(second_assignment);
  assert (select status from public.routine_follow_ups where routine_assignment_id = second_assignment) = 'cancelled';
  assert (select exercise_name_snapshot from public.routine_assignment_exercises where routine_assignment_id = assignment_id) = 'Shared stretch', 'Snapshot name is mutable';
  assert (select instructions from public.routine_assignment_exercises where routine_assignment_id = assignment_id) = 'Original instructions', 'Snapshot instructions are mutable';
  -- Old clients still read names and send the exact named-argument RPC contract.
  legacy_routine := public.save_routine(p_routine_id => null, p_routine_name => ' Legacy client ',
    p_exercise_names => array['  Equal name  ', '', null, 'Equal name']);
  assert (select array_agg(position order by position) from public.routine_exercises where routine_id = legacy_routine) = array[0, 3], 'Legacy blank filtering/ordinality changed';
  assert (select count(distinct exercise_id) from public.routine_exercises where routine_id = legacy_routine) = 2, 'Legacy names deduplicated';
  select exercise_id, id into legacy_exercise, slot_id from public.routine_exercises where routine_id = legacy_routine and position = 0;
  perform public.save_exercise(legacy_exercise, 'Equal name', 'Keep these instructions');
  select count(*) into exercise_count from public.exercises;
  perform public.save_routine(legacy_routine, 'Rename routine only', array['Equal name', '', null, 'Equal name']);
  assert (select exercise_id from public.routine_exercises where id = slot_id) = legacy_exercise, 'Unchanged legacy slot lost identity';
  assert (select count(*) from public.exercises) = exercise_count, 'No-op legacy save created records';
  perform public.save_routine_with_exercises(routine_b, 'Shared with legacy', array[legacy_exercise]);
  -- Structural changes belong exclusively to the ID-based API.
  perform public.save_routine_with_exercises(legacy_routine, 'Empty via new client', array[]::uuid[]);
  assert not exists (select 1 from public.routine_exercises where routine_id = legacy_routine);
  assert exists (select 1 from public.exercises where id = legacy_exercise), 'Removing membership deleted catalog';
  begin
    insert into public.exercises(provider_id, name) values (provider_a, 'Bypass');
    raise exception 'Direct catalog insert allowed';
  exception when insufficient_privilege then null; end;

  perform public.save_routine_with_exercises(routine_b, 'Empty routine', array[]::uuid[]);
  assert not exists (select 1 from public.routine_exercises where routine_id = routine_b);
  assert exists (select 1 from public.routine_assignment_exercises where routine_assignment_id = assignment_id), 'Routine edit removed snapshot';
  perform public.archive_routine(routine_b);
  assert exists (select 1 from public.routine_assignment_exercises where routine_assignment_id = assignment_id), 'Archive removed snapshot';
  begin
    perform public.assign_routine(patient_profile, routine_b, '2026-10-07');
    raise exception 'Archived routine assignment allowed';
  exception when no_data_found then null; end;
  perform public.discharge_patient('00000000-0000-0000-0000-000000000021');
  begin
    perform public.assign_routine(patient_profile, routine_a, '2026-10-07');
    raise exception 'Discharged relationship assignment allowed';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub', provider_b::text, false);
  assert not exists (select 1 from public.exercises where id = exercise_a), 'Other provider sees catalog entry';
  assert not exists (select 1 from public.routine_exercises where routine_id = routine_a), 'Other provider sees membership';
  assert not exists (select 1 from public.routine_assignment_exercises where routine_assignment_id = assignment_id), 'Other provider sees snapshot';
  begin
    perform public.save_exercise(exercise_a, 'Unauthorized edit', '');
    raise exception 'Cross-provider exercise edit allowed';
  exception when no_data_found then null; end;
  begin
    perform public.save_routine_with_exercises(routine_a, 'Unauthorized routine', array[foreign_exercise]);
    raise exception 'Cross-provider routine edit allowed';
  exception when no_data_found then null; end;
  begin
    perform public.save_routine(routine_a, 'Unauthorized legacy routine', array['Other name']);
    raise exception 'Legacy cross-provider save allowed';
  exception when no_data_found then null; end;
  begin
    perform public.assign_routine(patient_profile, routine_a, '2026-10-06');
    raise exception 'Cross-provider assignment allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo Reuse, ordering, ownership, validation, and immutable snapshot checks passed.

-- Even a privileged membership writer must satisfy the ownership guard.
do $$
declare own_routine uuid; foreign_exercise uuid;
begin
  select id into own_routine from public.routines where provider_id = '00000000-0000-0000-0000-000000000001' limit 1;
  select id into foreign_exercise from public.exercises where provider_id = '00000000-0000-0000-0000-000000000002' limit 1;
  begin
    insert into public.routine_exercises (routine_id, exercise_id, name, position)
    values (own_routine, foreign_exercise, 'Bad ownership', 999);
    raise exception 'Privileged cross-provider association allowed';
  exception when insufficient_privilege then null; end;
  assert not exists (
    select 1 from public.routine_exercises re join public.exercises e on e.id = re.exercise_id
    join public.routines r on r.id = re.routine_id
    where re.name <> e.name or r.provider_id <> e.provider_id
  ), 'Catalog/membership invariant failed';
  assert not exists (
    select 1 from before_snapshots old left join public.routine_assignment_exercises s on s.id = old.id
    where s.id is null or s.exercise_name_snapshot <> old.exercise_name_snapshot
      or s.position <> old.position or s.routine_assignment_id <> old.routine_assignment_id or s.instructions <> ''
  ), 'Pre-migration history changed during later edits';
end $$;
\echo Legacy creation/no-op saves, renamed follow-ups, and membership ownership checks passed.

-- Compare full row contents, including timestamps and instructions, around each
-- rejected legacy request. Tests deliberately request a different routine name.
set role authenticated;
do $$
declare
  exercise_a uuid; exercise_b uuid; exercise_c uuid; duplicate_b uuid;
  regression_routine uuid; duplicate_routine uuid; empty_routine uuid;
  before_state jsonb; after_state jsonb; before_memberships jsonb;
  test_case record;
  provider_a uuid := '00000000-0000-0000-0000-000000000001';
begin
  perform set_config('request.jwt.claim.sub', provider_a::text, false);
  exercise_a := public.save_exercise(null, 'A', 'Instructions A');
  exercise_b := public.save_exercise(null, 'B', 'Instructions B');
  exercise_c := public.save_exercise(null, 'C', 'Instructions C');
  duplicate_b := public.save_exercise(null, 'A', 'Different instructions for equal name');
  regression_routine := public.save_routine_with_exercises(null, 'Regression routine', array[exercise_a, exercise_b, exercise_c]);
  duplicate_routine := public.save_routine_with_exercises(null, 'Duplicate names', array[exercise_a, duplicate_b]);
  empty_routine := public.save_routine(null, 'Empty legacy creation', null::text[]);
  perform public.save_routine(empty_routine, 'Empty renamed safely', array[]::text[]);

  select jsonb_agg(to_jsonb(re) order by re.id) into before_memberships from public.routine_exercises re;
  perform public.save_routine(regression_routine, 'Name-only edit', array['A', 'B', 'C']);
  assert (select name from public.routines where id = regression_routine) = 'Name-only edit';
  perform public.save_routine(regression_routine, 'Name-only edit', array['A', 'B', 'C']);
  perform public.save_routine(duplicate_routine, 'Duplicate names unchanged', array['A', 'A']);
  assert before_memberships = (select jsonb_agg(to_jsonb(re) order by re.id) from public.routine_exercises re), 'Safe legacy save changed membership identity/positions';
  assert (select instructions from public.exercises where id = duplicate_b) = 'Different instructions for equal name';

  for test_case in select * from (values
    ('remove first', regression_routine, array['B', 'C']),
    ('remove middle', regression_routine, array['A', 'C']),
    ('reorder', regression_routine, array['C', 'B', 'A']),
    ('duplicate-name removal', duplicate_routine, array['A']),
    ('remove all', regression_routine, array[]::text[]),
    ('add entry', regression_routine, array['A', 'B', 'C', 'D']),
    ('stale after rename', regression_routine, array['A', 'B', 'C'])
  ) as cases(label, target_id, names)
  loop
    if test_case.label = 'stale after rename' then
      perform public.save_exercise(exercise_b, 'B renamed', 'Updated B instructions');
    end if;
    select jsonb_build_object(
      'routines', (select jsonb_agg(to_jsonb(r) order by r.id) from public.routines r),
      'memberships', (select jsonb_agg(to_jsonb(re) order by re.id) from public.routine_exercises re),
      'definitions', (select jsonb_agg(to_jsonb(e) order by e.id) from public.exercises e)
    ) into before_state;
    begin
      perform public.save_routine(test_case.target_id, 'Must not persist', test_case.names);
      raise exception 'Unsafe legacy request succeeded: %', test_case.label;
    exception when sqlstate '55000' then
      assert sqlerrm = 'Legacy exercise-list changes are not supported. Use the catalog-aware routine editor.';
    end;
    select jsonb_build_object(
      'routines', (select jsonb_agg(to_jsonb(r) order by r.id) from public.routines r),
      'memberships', (select jsonb_agg(to_jsonb(re) order by re.id) from public.routine_exercises re),
      'definitions', (select jsonb_agg(to_jsonb(e) order by e.id) from public.exercises e)
    ) into after_state;
    assert before_state = after_state, 'Rejected legacy request mutated rows: ' || test_case.label;
  end loop;
  -- A fresh ordered-name submission works after the catalog rename.
  perform public.save_routine(regression_routine, 'Fresh rename', array['A', 'B renamed', 'C']);
  assert (select instructions from public.exercises where id = exercise_b) = 'Updated B instructions';
  -- New clients can still reorder/remove entries while preserving the chosen IDs.
  perform public.save_routine_with_exercises(regression_routine, 'ID edit works', array[exercise_c, exercise_b]);
  assert (select array_agg(exercise_id order by position) from public.routine_exercises where routine_id = regression_routine) = array[exercise_c, exercise_b];
end $$;
reset role;
\echo Conservative legacy edits and exact transactional preservation checks passed.

do $$
declare
  target_exercise uuid; target_routine uuid; old_owner uuid;
begin
  select re.exercise_id, re.routine_id, r.provider_id into target_exercise, target_routine, old_owner
  from public.routine_exercises re join public.routines r on r.id = re.routine_id
  where r.provider_id = '00000000-0000-0000-0000-000000000001' limit 1;
  begin
    update public.exercises set provider_id = '00000000-0000-0000-0000-000000000002' where id = target_exercise;
    raise exception 'Referenced exercise ownership transfer allowed';
  exception when check_violation then null; end;
  begin
    update public.routines set provider_id = '00000000-0000-0000-0000-000000000002' where id = target_routine;
    raise exception 'Routine ownership transfer allowed';
  exception when check_violation then null; end;
  assert (select provider_id from public.exercises where id = target_exercise) = old_owner;
  assert (select provider_id from public.routines where id = target_routine) = old_owner;
  assert not has_function_privilege('authenticated', 'public.prevent_exercise_provider_transfer()', 'EXECUTE');
end $$;
\echo Parent ownership immutability checks passed.
