-- Hosted smoke test against an existing patient-owned historical snapshot.
-- ALL feedback and probe writes roll back. No exercise scores are seeded.
begin;
do $context$
declare target record;
begin
  select e.id as exercise, a.id as assignment, p.auth_user_id, pp.provider_id into target
    from public.routine_assignment_exercises e
    join public.routine_assignments a on a.id=e.routine_assignment_id
    join public.provider_patient_profiles pp on pp.id=a.patient_profile_id
    join public.patients p on p.id=a.patient_id
    where pp.id='8da61f8b-6980-4c7f-95e7-266ef26b4f48' and a.status<>'cancelled'
      and a.scheduled_date <= (milestone_scheduling.policy_at(now())->>'today')::date
      and p.auth_user_id is not null and pp.discharged_at is null order by a.scheduled_date,e.position limit 1;
  if target.exercise is null then raise exception 'No approved patient snapshot is available for this rollback test'; end if;
  perform set_config('test.feedback_exercise',target.exercise::text,true);
  perform set_config('test.feedback_assignment',target.assignment::text,true);
  perform set_config('test.feedback_provider',target.provider_id::text,true);
  perform set_config('request.jwt.claim.sub',target.auth_user_id::text,true);
end;
$context$;
set local role authenticated;
do $patient$
declare snapshot uuid:=current_setting('test.feedback_exercise')::uuid; result record;
begin
  perform public.save_my_routine_exercise_feedback(snapshot,1,'good','Discard this explanation');
  select * into result from public.save_my_routine_exercise_feedback(snapshot,10,'neutral','Rollback verification only');
  if result.pain_score<>10 or result.feeling<>'neutral' or result.reported_at is null then raise exception 'Saved feedback mismatch'; end if;
  if (select count(*) from public.get_my_routine_exercise_feedback(current_setting('test.feedback_assignment')::uuid) where routine_assignment_exercise_id=snapshot) <> 1 then raise exception 'Latest response was not readable'; end if;
  begin
    perform public.save_my_routine_exercise_feedback(snapshot,0,'good',null);
    raise exception 'Invalid score accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_my_routine_exercise_feedback(snapshot,5,'neutral',E'\n\t');
    raise exception 'Whitespace-only explanation accepted';
  exception when check_violation then null; end;
  begin
    perform public.save_my_routine_exercise_feedback(snapshot,5,'difficult','  ');
    raise exception 'Missing explanation accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_my_routine_exercise_feedback(snapshot,5,'neutral',repeat('x',4001));
    raise exception 'Oversize explanation accepted';
  exception when invalid_parameter_value then null; end;
end;
$patient$;
select set_config('request.jwt.claim.sub',current_setting('test.feedback_provider'),true);
do $provider$
begin
  if not exists(select 1 from public.routine_assignment_exercise_feedback where routine_assignment_exercise_id=current_setting('test.feedback_exercise')::uuid and pain_score=10) then raise exception 'Assigning provider cannot read response'; end if;
  if has_table_privilege('authenticated','public.routine_assignment_exercise_feedback','INSERT') or has_table_privilege('authenticated','public.routine_assignment_exercise_feedback','UPDATE') then raise exception 'Direct client writes must be forbidden'; end if;
end;
$provider$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $unrelated$
begin
  if exists(select 1 from public.routine_assignment_exercise_feedback where routine_assignment_exercise_id=current_setting('test.feedback_exercise')::uuid) then raise exception 'Unrelated provider can read response'; end if;
  begin
    perform public.save_my_routine_exercise_feedback(current_setting('test.feedback_exercise')::uuid,3,'good',null);
    raise exception 'Unrelated patient write accepted';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.save_my_routine_exercise_feedback(uuid,integer,text,text)','EXECUTE')
    or has_function_privilege('anon','public.get_my_routine_exercise_feedback(uuid)','EXECUTE') then raise exception 'Anonymous RPC execution is exposed'; end if;
end;
$unrelated$;
reset role;
rollback;
select 'Hosted save/read/upsert, validation, owner provider visibility and isolation passed; probe writes rolled back' as verification;
