-- Hosted regression: all synthetic rows and all feedback probes roll back.
begin;
set local lock_timeout = '5s';

do $setup$
declare target record; assignment_id uuid := gen_random_uuid(); empty_id uuid := gen_random_uuid();
  cancelled_id uuid := gen_random_uuid(); future_id uuid := gen_random_uuid();
  first_id uuid := gen_random_uuid(); second_id uuid := gen_random_uuid();
begin
  select a.patient_id, a.patient_profile_id, a.routine_id, pp.provider_id, p.auth_user_id into strict target
  from public.routine_assignments a
  join public.provider_patient_profiles pp on pp.id = a.patient_profile_id
  join public.patients p on p.id = a.patient_id
  where a.id = 'cb6fa5b0-9e62-4a6f-8cd7-8b1e668ce574' and pp.discharged_at is null;
  insert into public.routine_assignments(id,patient_id,patient_profile_id,routine_id,scheduled_date,status,routine_name_snapshot)
  values (assignment_id,target.patient_id,target.patient_profile_id,target.routine_id,'2000-01-01','scheduled','Rollback completion test'),
    (empty_id,target.patient_id,target.patient_profile_id,target.routine_id,'2000-01-02','scheduled','Rollback empty test'),
    (cancelled_id,target.patient_id,target.patient_profile_id,target.routine_id,'2000-01-03','cancelled','Rollback cancelled test'),
    (future_id,target.patient_id,target.patient_profile_id,target.routine_id,'2999-01-01','scheduled','Rollback future test');
  insert into public.routine_assignment_exercises(id,routine_assignment_id,exercise_name_snapshot,position)
  values(first_id,assignment_id,'Rollback exercise',0),(second_id,assignment_id,'Rollback exercise',1),
    (cancelled_id,cancelled_id,'Rollback cancelled exercise',0),(future_id,future_id,'Rollback future exercise',0);
  perform set_config('test.completion_assignment',assignment_id::text,true);
  perform set_config('test.completion_empty',empty_id::text,true);
  perform set_config('test.completion_cancelled',cancelled_id::text,true);
  perform set_config('test.completion_future',future_id::text,true);
  perform set_config('test.completion_first',first_id::text,true);
  perform set_config('test.completion_second',second_id::text,true);
  perform set_config('test.completion_provider',target.provider_id::text,true);
  perform set_config('request.jwt.claim.sub',target.auth_user_id::text,true);
end;
$setup$;

set local role authenticated;
select * from public.save_my_routine_exercise_feedback(current_setting('test.completion_first')::uuid,3,'good',null);
reset role;
do $partial$
begin
  if not exists(select 1 from public.routine_assignments where id=current_setting('test.completion_assignment')::uuid
    and status='scheduled' and patient_in_progress and patient_result_source='patient') then
    raise exception 'First response must persist partial progress';
  end if;
end;
$partial$;

set local role authenticated;
do $invalid$
begin
  begin
    perform public.save_my_routine_exercise_feedback(current_setting('test.completion_second')::uuid,0,'good',null);
    raise exception 'Invalid response was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_my_routine_exercise_feedback(current_setting('test.completion_cancelled')::uuid,3,'good',null);
    raise exception 'Cancelled routine accepted feedback';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_my_routine_exercise_feedback(current_setting('test.completion_future')::uuid,3,'good',null);
    raise exception 'Future routine accepted feedback';
  exception when invalid_parameter_value then null; end;
end;
$invalid$;
reset role;
do $still_partial$
begin
  if not exists(select 1 from public.routine_assignments where id=current_setting('test.completion_assignment')::uuid
    and status='scheduled' and patient_in_progress) then raise exception 'Invalid feedback changed progress'; end if;
end;
$still_partial$;

set local role authenticated;
select * from public.save_my_routine_exercise_feedback(current_setting('test.completion_second')::uuid,8,'difficult','Rollback verification only');
select * from public.save_my_routine_exercise_feedback(current_setting('test.completion_second')::uuid,8,'difficult','Rollback retry only');
reset role;
do $complete$
begin
  if not exists(select 1 from public.routine_assignments where id=current_setting('test.completion_assignment')::uuid
    and status='completed' and not patient_in_progress and patient_result_source='patient' and patient_issue_severity='none') then
    raise exception 'Final feedback must complete routine without inferring an issue from pain';
  end if;
  if (select count(*) from public.routine_assignment_exercise_feedback f join public.routine_assignment_exercises e
      on e.id=f.routine_assignment_exercise_id where e.routine_assignment_id=current_setting('test.completion_assignment')::uuid) <> 2 then
    raise exception 'Retry duplicated feedback';
  end if;
  if not exists(select 1 from public.routine_assignments where id=current_setting('test.completion_empty')::uuid
    and status='scheduled' and not patient_in_progress) then raise exception 'Empty routine marked complete'; end if;
end;
$complete$;

select set_config('request.jwt.claim.sub',current_setting('test.completion_provider'),true);
set local role authenticated;
do $provider$
begin
  if not exists(select 1 from public.routine_assignments where id=current_setting('test.completion_assignment')::uuid and status='completed') then
    raise exception 'Provider cannot read persisted completion';
  end if;
  if has_column_privilege('authenticated','public.routine_assignments','status','UPDATE') then
    raise exception 'Direct status writes must remain forbidden';
  end if;
end;
$provider$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $unrelated$
begin
  if exists(select 1 from public.routine_assignments where id=current_setting('test.completion_assignment')::uuid) then raise exception 'Unrelated provider can read completion'; end if;
  begin
    perform public.save_my_routine_exercise_feedback(current_setting('test.completion_first')::uuid,3,'good',null);
    raise exception 'Unrelated caller can change progress';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.save_my_routine_exercise_feedback(uuid,integer,text,text)','EXECUTE') then
    raise exception 'Anonymous feedback execution exposed';
  end if;
end;
$unrelated$;
reset role;
rollback;
select 'PASS: partial progress, atomic completion, retry, invalid/cancelled/future isolation, provider read, no direct writes; all probes rolled back' as verification;
