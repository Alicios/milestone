-- All test assignments, receipts and template copies are rolled back.
begin;
do $checks$
declare
  v_profile public.provider_patient_profiles%rowtype; v_routine public.routines%rowtype;
  v_other uuid; v_date date; v_preview jsonb; v_receipt jsonb; v_replayed jsonb;
  v_original uuid; v_new uuid; v_request uuid:=gen_random_uuid(); v_remove uuid:=gen_random_uuid();
  v_version timestamptz; v_new_version timestamptz; v_token text; v_foreign uuid;
begin
  -- Select a valid saved template with an active relationship and an empty day.
  for v_routine in select r.* from public.routines r where archived_at is null order by id loop
    begin
      perform milestone_scheduling.prescription(v_routine.name,v_routine.exercise_list);
    exception when others then continue;
    end;
    select * into v_profile from public.provider_patient_profiles p where p.provider_id=v_routine.provider_id
      and p.discharged_at is null order by p.id limit 1;
    if not found then continue; end if;
    perform set_config('request.jwt.claim.sub',v_profile.provider_id::text,true);
    select d::date into v_date from generate_series(
      (milestone_scheduling.policy_at(clock_timestamp())->>'today')::date,
      (milestone_scheduling.policy_at(clock_timestamp())->>'lastDate')::date,'1 day') d
      where not exists(select 1 from public.routine_assignments a where a.patient_id=v_profile.patient_id
        and a.scheduled_date=d::date and a.status<>'cancelled') order by d limit 1;
    if v_date is not null then exit; end if;
  end loop;
  if v_date is null then raise exception 'No valid test template/profile/empty date'; end if;
  insert into public.routines(provider_id,name,description,exercise_list)
    values(v_profile.provider_id,'Atomic replacement verification',null,v_routine.exercise_list) returning id into v_other;
  select id into v_foreign from public.providers where id<>v_profile.provider_id order by id limit 1;
  if has_function_privilege('anon','public.change_patient_routine(uuid,uuid,uuid,text,timestamptz)','execute') then
    raise exception 'Anonymous role can call routine changes';
  end if;
  execute 'set local role authenticated';
  v_preview:=public.preview_routine_schedule(v_profile.id,jsonb_build_array(jsonb_build_object('date',v_date,'routineId',v_routine.id)));
  v_receipt:=public.assign_routine_schedule(v_profile.id,gen_random_uuid(),jsonb_build_array(jsonb_build_object('date',v_date,'routineId',v_routine.id,'token',v_preview->'entries'->0->>'token')));
  v_original:=(v_receipt->'assignments'->0->>'id')::uuid;
  select updated_at into v_version from public.routine_assignments where id=v_original;
  v_preview:=public.preview_routine_schedule(v_profile.id,jsonb_build_array(jsonb_build_object('date',v_date,'routineId',v_other)));
  v_token:=v_preview->'entries'->0->>'token';
  begin
    perform public.change_patient_routine(v_original,v_request,v_other,repeat('0',64),v_version);
    raise exception 'Stale preview accepted';
  exception when serialization_failure then null;
  end;
  if (select status from public.routine_assignments where id=v_original)<>'scheduled'
    or exists(select 1 from public.provider_assignment_change_requests where request_id=v_request) then
    raise exception 'Failed replacement did not roll back';
  end if;
  begin
    perform public.change_patient_routine(v_original,v_request,v_other,v_token,v_version-interval '1 second');
    raise exception 'Stale assignment accepted';
  exception when serialization_failure then null;
  end;
  v_receipt:=public.change_patient_routine(v_original,v_request,v_other,v_token,v_version);
  v_new:=(v_receipt->'assignments'->0->>'id')::uuid;
  if v_new is null or v_new=v_original or (select status from public.routine_assignments where id=v_original)<>'cancelled'
    or (select count(*) from public.routine_assignments where patient_id=v_profile.patient_id and scheduled_date=v_date and status<>'cancelled')<>1
    or not exists(select 1 from public.routine_assignment_exercises where routine_assignment_id=v_original) then
    raise exception 'Replacement or retained snapshots failed';
  end if;
  v_replayed:=public.change_patient_routine(v_original,v_request,v_other,v_token,v_version);
  if v_replayed<>v_receipt then raise exception 'Replacement replay was not idempotent'; end if;
  begin
    perform public.change_patient_routine(v_original,v_request,null,null,v_version);
    raise exception 'Reused request accepted a different payload';
  exception when invalid_parameter_value then null;
  end;
  select updated_at into v_new_version from public.routine_assignments where id=v_new;
  begin
    insert into public.provider_assignment_change_requests(provider_id,request_id,assignment_id,payload,result)
      values(v_profile.provider_id,gen_random_uuid(),v_new,'{}','{}');
    raise exception 'Forged receipt allowed';
  exception when insufficient_privilege then null;
  end;
  -- A different identity cannot see receipts or mutate the source assignment.
  perform set_config('request.jwt.claim.sub',coalesce(v_foreign,gen_random_uuid())::text,true);
  if exists(select 1 from public.provider_assignment_change_requests where request_id=v_request) then
    raise exception 'Foreign receipt visible';
  end if;
  begin
    perform public.change_patient_routine(v_new,gen_random_uuid(),null,null,v_new_version);
    raise exception 'Foreign identity removed routine';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',v_profile.provider_id::text,true);
  execute 'reset role';
  -- Simulate a patient starting, then confirm the backend protects that history.
  update public.routine_assignments set patient_in_progress=true where id=v_new;
  select updated_at into v_new_version from public.routine_assignments where id=v_new;
  execute 'set local role authenticated';
  begin
    perform public.change_patient_routine(v_new,v_remove,null,null,v_new_version);
    raise exception 'Started routine removed';
  exception when sqlstate '55000' then null;
  end;
  execute 'reset role';
  update public.routine_assignments set patient_in_progress=false where id=v_new;
  select updated_at into v_new_version from public.routine_assignments where id=v_new;
  execute 'set local role authenticated';
  v_receipt:=public.change_patient_routine(v_new,v_remove,null,null,v_new_version);
  if (select status from public.routine_assignments where id=v_new)<>'cancelled'
    or v_receipt->'assignments'<>'[]'::jsonb
    or v_receipt<>public.change_patient_routine(v_new,v_remove,null,null,v_new_version) then
    raise exception 'Removal/replay failed';
  end if;
end;
$checks$;
rollback;
