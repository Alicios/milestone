-- Rollback-only synthetic integration test; run after the retention migration.
do $$
declare
  provider uuid; other_provider uuid; retained uuid; expired uuid; shared uuid;
  retained_profile uuid; expired_profile uuid; shared_profile uuid;
  routine uuid; assignment uuid; snapshot uuid; deadline timestamptz;
begin
  select id into strict provider from public.providers order by id limit 1;
  select id into other_provider from public.providers where id <> provider order by id limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', provider, 'role', 'authenticated')::text, true);
  retained := public.create_patient('Synthetic retained discharge', null, null);
  expired := public.create_patient('Synthetic expired discharge', null, null);
  shared := public.create_patient('Synthetic shared discharge', null, null);
  select id into retained_profile from public.provider_patient_profiles where patient_id = retained;
  select id into expired_profile from public.provider_patient_profiles where patient_id = expired;
  select id into shared_profile from public.provider_patient_profiles where patient_id = shared;
  insert into public.routines(provider_id, name) values(provider, 'Synthetic retention routine') returning id into routine;
  insert into public.routine_assignments(patient_profile_id,patient_id,routine_id,scheduled_date,routine_name_snapshot)
    values(expired_profile,expired,routine,current_date,'Synthetic snapshot') returning id into assignment;
  insert into public.routine_assignment_exercises(routine_assignment_id,exercise_name_snapshot,position)
    values(assignment,'Synthetic exercise',0) returning id into snapshot;
  insert into public.routine_assignment_exercise_feedback(routine_assignment_exercise_id,pain_score,feeling)
    values(snapshot,1,'good');
  insert into public.routine_follow_ups(routine_assignment_id,scheduled_at) values(assignment,now() + interval '1 day');
  insert into public.routine_schedule_requests(provider_id,request_id,patient_profile_id,payload,result)
    values(provider,gen_random_uuid(),expired_profile,'{}','{}');
  insert into public.messages(patient_profile_id,sender_kind,body) values(expired_profile,'provider','Synthetic retained message');
  insert into public.patient_statuses(patient_profile_id,day_index,status) values(expired_profile,0,'none') on conflict do nothing;
  begin
    delete from public.routine_assignment_exercises where id = snapshot;
    raise exception 'Active snapshots lost immutability';
  exception when check_violation then null; end;

  perform public.discharge_patient(retained);
  select retention_ends_at into deadline from public.provider_patient_profiles where id = retained_profile;
  if deadline <> ((now() at time zone 'UTC') + interval '6 months') at time zone 'UTC' then raise exception 'Wrong retention deadline'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform public.reinstate_patient(retained);
    raise exception 'Cross-provider reinstatement succeeded';
  exception when no_data_found then null; end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', provider, 'role', 'authenticated')::text, true);
  perform public.reinstate_patient(retained);
  perform public.reinstate_patient(retained); -- Lost-response retry is idempotent.
  if exists(select 1 from public.provider_patient_profiles where id = retained_profile and (discharged_at is not null or retention_ends_at is not null)) then raise exception 'Reinstatement did not clear deadline'; end if;
  perform public.discharge_patient(retained);
  update public.provider_patient_profiles set discharged_at = now() - interval '7 months' where id in (expired_profile,shared_profile);
  execute 'set local role authenticated';
  if exists(select 1 from public.provider_patient_profiles where id = expired_profile) then raise exception 'Expired profile still visible to browser'; end if;
  if not exists(select 1 from public.provider_patient_profiles where id = retained_profile) then raise exception 'Retained profile hidden from its provider'; end if;
  execute 'reset role';
  if other_provider is not null then
    insert into public.provider_patient_profiles(provider_id,patient_id) values(other_provider,shared);
  end if;
  begin
    perform public.reinstate_patient(expired);
    raise exception 'Expired profile was reinstated';
  exception when no_data_found then null; end;
  perform milestone_profiles.purge_expired_patient_profiles();
  if exists(select 1 from public.patients where id = expired) then raise exception 'Expired orphan demographics remain'; end if;
  if exists(select 1 from public.routine_assignments where id = assignment) or exists(select 1 from public.messages where patient_profile_id = expired_profile) then raise exception 'Expired history remains'; end if;
  if not exists(select 1 from public.provider_patient_profiles where id = retained_profile) then raise exception 'Fresh discharge was purged'; end if;
  if other_provider is not null and not exists(select 1 from public.patients p join public.provider_patient_profiles pp on pp.patient_id=p.id where p.id=shared and pp.provider_id=other_provider) then raise exception 'Other provider lost shared patient'; end if;
  perform public.reinstate_patient(retained);
  if has_function_privilege('authenticated','milestone_profiles.purge_expired_patient_profiles()','execute') then raise exception 'Browser may purge profiles'; end if;
end $$;
select 'discharge, deadline, reinstatement, isolation, expiry, immutable snapshots, dependent cleanup, shared patient protection: passed' as result;
