\set ON_ERROR_STOP on
-- Failures abort the runner. This database is the disposable fixture only.
do $$
declare before_row record;
begin
  assert (select count(*) from public.exercises) = 248;
  assert not exists ((select * from public.exercises except select * from public.test_before_catalog)
    union all (select * from public.test_before_catalog except select * from public.exercises));
  assert not exists (select 1 from public.routines r join public.test_before_routines b using(id)
    where (to_jsonb(r) - array['exercise_format_version','exercise_revision','legacy_exercise_list','legacy_preserved_at']) is distinct from to_jsonb(b));
  assert not exists (select 1 from public.routine_assignment_exercises r join public.test_before_snapshots b using(id)
    where (to_jsonb(r) - array['exercise_id_snapshot','description_snapshot','sets_snapshot','reps_snapshot','timer_seconds_snapshot']) is distinct from to_jsonb(b));
  assert not exists ((select * from public.routine_exercises except select * from public.test_before_memberships)
    union all (select * from public.test_before_memberships except select * from public.routine_exercises));
  for before_row in select * from public.test_before_functions loop
    assert before_row.definition = pg_get_functiondef(before_row.signature::regprocedure), 'Unrelated RPC changed';
  end loop;
  assert not has_table_privilege('anon','public.exercises','SELECT,INSERT,UPDATE,DELETE,TRUNCATE');
  assert not has_any_column_privilege('anon','public.exercises','SELECT,INSERT,UPDATE');
  assert not has_table_privilege('authenticated','public.exercises','INSERT,UPDATE,DELETE,TRUNCATE');
  assert not has_any_column_privilege('authenticated','public.exercises','INSERT,UPDATE');
  assert not has_function_privilege('anon','public.save_routine_with_prescriptions(uuid,text,jsonb,bigint)','EXECUTE');
  assert not has_function_privilege('anon','public.save_routine(uuid,text,text[])','EXECUTE');
  assert not has_function_privilege('anon','public.assign_routine(uuid,uuid,date)','EXECUTE');
  assert not has_schema_privilege('authenticated','exercise_prescriptions','USAGE');
  assert not exists (select 1 from pg_proc where pronamespace = 'exercise_prescriptions'::regnamespace
    and has_function_privilege('authenticated',oid,'EXECUTE'));
  assert not exists (select 1 from public.routine_assignment_exercises where description_snapshot is not null);
end;
$$;
\echo PASS: migration preserves catalog, routines, memberships, history, unrelated RPCs; effective ACLs are restricted.

-- Convenient local assertion helper, never installed by the migration.
create function public.test_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected then return; end if;
    raise exception 'Expected %, received %: % (SQL: %)',expected,sqlstate,sqlerrm,statement;
  end;
  raise exception 'Expected SQLSTATE % but statement succeeded: %',expected,statement;
end;
$$;
set role anon;
select public.test_error('select * from public.exercises','42501');
select public.test_error('select public.save_routine_with_prescriptions(null,''Denied'',''[]'',null)','42501');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$ begin assert (select count(*) from public.exercises) = 0; end $$;
select public.test_error('select public.save_routine_with_prescriptions(null,''Nonprovider'',''[]'',null)','42501');
select set_config('request.jwt.claim.sub','',false);
select public.test_error('select public.save_routine(null,''No session'',array[''Name''])','42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ begin assert (select count(*) from public.exercises) = 248; end $$;
select public.test_error('insert into public.exercises(name) values (''Bypass'')','42501');
select public.test_error('update public.exercises set name = ''Bypass''','42501');
select public.test_error('truncate public.exercises','42501');
select public.test_error('insert into public.routines(provider_id,name) values (auth.uid(),''Bypass'')','42501');

do $$
declare e1 uuid; e2 uuid; r uuid; empty_id uuid; a uuid; a2 uuid; legacy_id uuid;
  input jsonb; invalid jsonb; before_value jsonb; after_value jsonb; before_count integer;
begin
  select id into e1 from public.exercises order by id limit 1;
  select id into e2 from public.exercises order by id offset 1 limit 1;
  input := jsonb_build_array(jsonb_build_object('exercise_id',e1,'name','Untrusted label','sets',3,'reps',10,'timer_seconds',null),
    jsonb_build_object('exercise_id',e2,'sets',null,'reps',null,'timer_seconds',30),
    jsonb_build_object('exercise_id',e1,'sets',100,'reps',1000,'timer_seconds',86400));
  r := public.save_routine_with_prescriptions(null,'  Prescription  ',input,null);
  assert (select exercise_format_version = 1 and exercise_revision = 0 and name = 'Prescription' from public.routines where id=r);
  assert (select cardinality(exercise_list)=3 and exercise_list[1]->>'name' = (select name from public.exercises where id=e1) from public.routines where id=r);
  assert (select exercise_list[1]->>'exercise_id' = exercise_list[3]->>'exercise_id' from public.routines where id=r);
  a := public.assign_routine('00000000-0000-0000-0000-000000000011',r,'2030-01-01');
  assert (select count(*) from public.routine_assignment_exercises where routine_assignment_id=a) = 3;
  assert (select sets_snapshot=3 and reps_snapshot=10 and timer_seconds_snapshot is null
    and description_snapshot=(select "desc" from public.exercises where id=e1)
    from public.routine_assignment_exercises where routine_assignment_id=a and position=0);
  assert (select timer_seconds_snapshot=30 and sets_snapshot is null and reps_snapshot is null
    from public.routine_assignment_exercises where routine_assignment_id=a and position=1);
  perform public.test_error(format('select public.assign_routine(%L,%L,%L)','00000000-0000-0000-0000-000000000011',r,'2030-01-01'),'23505');
  perform public.schedule_routine_follow_up(a,'2030-01-02 12:00:00+00');
  perform public.cancel_routine_assignment(a);
  assert (select status='cancelled' from public.routine_follow_ups where routine_assignment_id=a);
  a2 := public.assign_routine('00000000-0000-0000-0000-000000000011',r,'2030-01-01');
  assert a2 <> a;
  assert (select count(*) from public.routine_assignment_exercises where routine_assignment_id=a) = 3;
  select jsonb_agg(to_jsonb(s) order by position) into before_value from public.routine_assignment_exercises s where routine_assignment_id=a2;
  perform public.save_routine_with_prescriptions(r,'Edited',jsonb_build_array(input->1,input->0),0);
  assert (select exercise_list[1]->>'exercise_id'=e2::text and cardinality(exercise_list)=2 from public.routines where id=r);
  select jsonb_agg(to_jsonb(s) order by position) into after_value from public.routine_assignment_exercises s where routine_assignment_id=a2;
  assert before_value = after_value;
  perform public.test_error(format('select public.save_routine_with_prescriptions(%L,''Stale'',%L,0)',r,input),'40001');
  select to_jsonb(t) into before_value from public.routines t where id=r;
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    'null'::jsonb,'{}'::jsonb,'["Name"]'::jsonb,'[null]'::jsonb,
    '[{"exercise_id":"1234"}]'::jsonb,
    '[{"exercise_id":"00000000-0000-0000-0000-000000009999"}]'::jsonb,
    jsonb_build_array(jsonb_build_object('exercise_id',e1,'sets',0)),
    jsonb_build_array(jsonb_build_object('exercise_id',e1,'sets',101)),
    jsonb_build_array(jsonb_build_object('exercise_id',e1,'reps',1001)),
    jsonb_build_array(jsonb_build_object('exercise_id',e1,'timer_seconds',86401)),
    jsonb_build_array(jsonb_build_object('exercise_id',e1,'reps',1.5)),
    jsonb_build_array(jsonb_build_object('exercise_id',e1,'sets','3')),
    jsonb_build_array(jsonb_build_object('exercise_id',e1,'sets',true)),
    jsonb_build_array(jsonb_build_object('exercise_id',e1,'timer',3000)),
    jsonb_build_array(jsonb_build_object('exercise_id',e1,'unknown','discard me'))
  )) loop
    perform public.test_error(format('select public.save_routine_with_prescriptions(%L,''Must not persist'',%L,1)',r,invalid),'22023');
    assert (select to_jsonb(t) from public.routines t where id=r) = before_value;
  end loop;
  perform public.test_error(format('select public.save_routine_with_prescriptions(null,%L,%L,null)',repeat('x',201),input),'22023');
  perform public.test_error(format('select public.save_routine_with_prescriptions(null,''Too many'',%L,null)',
    (select jsonb_agg(jsonb_build_object('exercise_id',e1)) from generate_series(1,101))),'22023');
  perform public.test_error(format('select public.save_routine(%L,''Must not persist'',array[''Changed''])',r),'55000');
  assert (select to_jsonb(t) from public.routines t where id=r) = before_value;
  perform public.save_routine(r,'Safe legacy rename',(select array_agg(x->>'name' order by n) from public.routines t, unnest(t.exercise_list) with ordinality items(x,n) where t.id=r));
  assert (select to_jsonb(t)->'exercise_list' from public.routines t where id=r) = before_value->'exercise_list';
  empty_id := public.save_routine_with_prescriptions(null,'Empty','[]',null);
  perform public.test_error(format('select public.assign_routine(%L,%L,%L)','00000000-0000-0000-0000-000000000011',empty_id,'2030-01-03'),'22023');
  perform public.test_error('select public.assign_routine(''00000000-0000-0000-0000-000000000011'',''00000000-0000-0000-0000-000000000031'',''2030-01-03'')','22023');
  perform public.test_error('select public.save_routine(''00000000-0000-0000-0000-000000000031'',''Flatten'',array[]::text[])','55000');
  perform public.save_routine_with_prescriptions('00000000-0000-0000-0000-000000000031','Explicit replacement',input,0);
  assert (select legacy_exercise_list = array['{"exercise_id":"1234","sets":3,"reps":10,"timer":3000}'::jsonb,'"Leg Stretch"'::jsonb]
    and legacy_preserved_at is not null from public.routines where id='00000000-0000-0000-0000-000000000031');
  perform public.save_routine_with_prescriptions('00000000-0000-0000-0000-000000000032','Null becomes draft','[]',0);
  assert (select legacy_exercise_list is null and legacy_preserved_at is not null from public.routines where id='00000000-0000-0000-0000-000000000032');
  perform public.save_routine('00000000-0000-0000-0000-000000000033','Legacy edit',array['New name']);
  assert (select legacy_exercise_list=array['"Leg Stretch"'::jsonb] from public.routines where id='00000000-0000-0000-0000-000000000033');
  legacy_id := public.save_routine(null,'Old client',array[' Name ','',null]);
  assert (select exercise_list=array['"Name"'::jsonb] and exercise_format_version=0 from public.routines where id=legacy_id);
  perform public.test_error(format('select public.assign_routine(%L,%L,%L)','00000000-0000-0000-0000-000000000012',r,'2030-01-03'),'42501');
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  assert (select count(*) from public.exercises)=248;
  assert not exists (select 1 from public.routines where id=r);
  assert not exists (select 1 from public.routine_assignment_exercises where routine_assignment_id=a);
  perform public.test_error(format('select public.save_routine_with_prescriptions(%L,''Foreign'',''[]'',2)',r),'P0002');
  perform public.test_error(format('select public.assign_routine(%L,%L,%L)','00000000-0000-0000-0000-000000000012',r,'2030-01-03'),'P0002');
end;
$$;
reset role;
\echo PASS: provider isolation, validation, rollback, revision conflicts, ordering, snapshots, legacy preservation, duplicate assignments and follow-ups.

-- Database guards apply even to trusted direct writers.
select public.test_error('delete from public.exercises','23514');
select public.test_error('truncate public.exercises','23514');
select public.test_error('update public.exercises set id=gen_random_uuid()','23514');
select public.test_error('update public.routine_assignment_exercises set exercise_name_snapshot=''Corrupted''','23514');
select public.test_error('delete from public.routine_assignment_exercises','23514');
select public.test_error('truncate public.routine_assignment_exercises','23514');
select public.test_error('update public.routines set provider_id=''00000000-0000-0000-0000-000000000002'' where id=''00000000-0000-0000-0000-000000000031''','23514');
select public.test_error('update public.routines set legacy_exercise_list=array[]::jsonb[] where id=''00000000-0000-0000-0000-000000000031''','23514');
select public.test_error('update public.routines set exercise_format_version=0 where id=''00000000-0000-0000-0000-000000000031''','23514');
select public.test_error('update public.routines set exercise_list=array[''{"exercise_id":"1234"}''::jsonb] where id=''00000000-0000-0000-0000-000000000031''','22023');
do $$
declare before_snapshots jsonb;
begin
  select jsonb_agg(to_jsonb(s) order by id) into before_snapshots from public.routine_assignment_exercises s;
  update public.exercises set name='Administrative rename',"desc"='Administrative description' where id=(select id from public.exercises order by id limit 1);
  assert before_snapshots=(select jsonb_agg(to_jsonb(s) order by id) from public.routine_assignment_exercises s);
  assert (select count(*) from public.exercises)=248;
end;
$$;
-- Messaging functionality and trigger-created state survive the expansion.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
insert into public.messages(patient_profile_id,sender_kind,body) values ('00000000-0000-0000-0000-000000000011','provider','SCRUM-43 regression');
update public.message_thread_state set starred=true where patient_profile_id='00000000-0000-0000-0000-000000000011';
select public.test_error('insert into public.messages(patient_profile_id,sender_kind,body) values (''00000000-0000-0000-0000-000000000012'',''provider'',''Foreign'')','42501');
select public.test_error('insert into public.messages(patient_profile_id,sender_kind,body) values (''00000000-0000-0000-0000-000000000011'',''patient'',''Spoof'')','42501');
do $$ begin assert (select count(*) from public.medical_practices)=7; end $$;
reset role;
\echo PASS: direct SQL guards, catalog edit snapshot independence, messaging isolation, medical-practice reads.
