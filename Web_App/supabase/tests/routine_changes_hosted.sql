-- Rollback-only verification after the approved routine-editor deployment.
-- Uses random synthetic records and existing provider/catalog identities.
-- No Auth records, existing patient data, or Storage objects are modified.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '45s';
do $verify$
declare
  provider uuid; other_provider uuid; patient uuid := gen_random_uuid(); profile uuid := gen_random_uuid();
  routine uuid := gen_random_uuid(); exercise uuid; upcoming uuid; started uuid; completed uuid; partial uuid; past uuid;
  replacement uuid; doc jsonb; impact jsonb; history jsonb; media jsonb; today date;
begin
  select p.id into provider from public.providers p
    where not exists(select 1 from public.patients x where x.auth_user_id = p.id) order by p.id limit 1;
  select id into other_provider from public.providers where id <> provider order by id limit 1;
  select id into exercise from public.exercises order by id limit 1;
  if provider is null or other_provider is null or exercise is null then raise exception 'Missing verification identities'; end if;
  today := (milestone_scheduling.policy_at(statement_timestamp())->>'today')::date;
  insert into public.patients(id,name,care_status,auth_user_id) values(patient,'Routine migration rollback verification','active',provider);
  insert into public.provider_patient_profiles(id,provider_id,patient_id) values(profile,provider,patient);
  perform set_config('request.jwt.claim.sub',provider::text,true);
  doc := jsonb_build_object('id',routine,'name','Rollback verification routine','description','Routine instructions','source','provider',
    'exercises',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'catalogId',exercise,
      'name','Verification movement','description','Movement instructions','sets','3','repetitions','8','duration','30','rest','15','notes','Provider notes',
      'media',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','image','url','https://example.invalid/verification.png','name','Verification picture','caption','Verification caption')))));
  if public.save_editor_routine(null,doc,null) <> routine then raise exception 'Create failed'; end if;
  if public.save_editor_routine(null,doc,null) <> routine then raise exception 'Create retry failed'; end if;
  upcoming := public.assign_routine(profile,routine,today+1);
  started := public.assign_routine(profile,routine,today+2);
  completed := public.assign_routine(profile,routine,today+3);
  partial := public.assign_routine(profile,routine,today+4);
  insert into public.routine_assignments(patient_profile_id,patient_id,routine_id,scheduled_date,routine_name_snapshot)
    values(profile,patient,routine,today-1,'Historical verification') returning id into past;
  update public.routine_assignments set patient_in_progress=true where id=started;
  update public.routine_assignments set status='completed' where id=completed;
  insert into public.routine_assignment_exercise_feedback(routine_assignment_exercise_id,pain_score,feeling)
    select id,3,'good' from public.routine_assignment_exercises where routine_assignment_id=partial;
  perform public.schedule_routine_follow_up(upcoming,(today+5)::timestamptz+interval '12 hours');
  select jsonb_agg(to_jsonb(a) order by id) into history from public.routine_assignments a where id in(started,completed,partial,past);
  impact := public.preview_routine_change(routine);
  if (impact->>'assignmentCount')::integer <> 1 or jsonb_array_length(impact->'patients') <> 1 or (impact->>'preservedCount')::integer <> 4 then
    raise exception 'Affected patient scope differs';
  end if;
  perform set_config('request.jwt.claim.sub',other_provider::text,true);
  begin
    perform public.preview_routine_change(routine);
    raise exception 'Foreign preview was accepted';
  exception when sqlstate 'P0002' then null; end;
  begin
    perform public.apply_routine_change(routine,'delete',impact->>'token');
    raise exception 'Foreign deletion was accepted';
  exception when sqlstate 'P0002' then null; end;
  perform set_config('request.jwt.claim.sub',provider::text,true);
  doc := jsonb_set(jsonb_set(doc,'{name}','"Updated verification routine"'),'{exercises,0,rest}','"45"');
  begin
    perform public.save_editor_routine(routine,doc,'stale');
    raise exception 'Stale edit was accepted';
  exception when sqlstate '40001' then null; end;
  perform public.save_editor_routine(routine,doc,impact->>'token');
  if (select status from public.routine_assignments where id=upcoming) <> 'cancelled' then raise exception 'Original assignment not cancelled'; end if;
  select id into replacement from public.routine_assignments where routine_id=routine and scheduled_date=today+1 and status='scheduled';
  if replacement is null or replacement=upcoming then raise exception 'Replacement missing'; end if;
  if (select editor_snapshot->'exercises'->0->>'rest' from public.routine_assignments where id=replacement) <> '45' then raise exception 'Editor snapshot missing'; end if;
  if not exists(select 1 from public.routine_follow_ups where routine_assignment_id=replacement and status='scheduled')
    or not exists(select 1 from public.routine_follow_ups where routine_assignment_id=upcoming and status='cancelled') then
    raise exception 'Follow-up preservation failed';
  end if;
  if (select jsonb_agg(to_jsonb(a) order by id) from public.routine_assignments a where id in(started,completed,partial,past)) is distinct from history then
    raise exception 'Patient history was modified';
  end if;
  select to_jsonb(m) into media from public.get_my_routine_assignment_media(replacement) m;
  if media->>'instructions' <> E'Movement instructions\nRest: 45 seconds.' or media->'media'->0->>'source' <> 'Verification caption' then
    raise exception 'Patient media/instructions differ';
  end if;
  begin
    update public.routine_assignments set editor_snapshot='{}' where id=replacement;
    raise exception 'Immutable editor snapshot changed';
  exception when check_violation then null; end;
  impact := public.preview_routine_change(routine);
  update public.routine_assignments set patient_in_progress=true where id=replacement;
  begin
    perform public.apply_routine_change(routine,'delete',impact->>'token');
    raise exception 'Stale deletion was accepted';
  exception when sqlstate '40001' then null; end;
  update public.routine_assignments set patient_in_progress=false where id=replacement;
  impact := public.preview_routine_change(routine);
  perform public.apply_routine_change(routine,'delete',impact->>'token');
  if not exists(select 1 from public.routines where id=routine and archived_at is not null)
    or (select status from public.routine_assignments where id=replacement) <> 'cancelled'
    or exists(select 1 from public.routine_follow_ups where routine_assignment_id=replacement and status='scheduled') then
    raise exception 'Deletion workflow differs';
  end if;
  if (select jsonb_agg(to_jsonb(a) order by id) from public.routine_assignments a where id in(started,completed,partial,past)) is distinct from history then
    raise exception 'Deletion modified historical work';
  end if;
  begin
    perform public.assign_routine(profile,routine,today+6);
    raise exception 'Archived routine assigned';
  exception when invalid_parameter_value then null; end;
  if has_function_privilege('anon','public.save_editor_routine(uuid,jsonb,text)','execute')
    or has_function_privilege('anon','public.preview_routine_change(uuid)','execute')
    or not has_function_privilege('authenticated','public.save_editor_routine(uuid,jsonb,text)','execute')
    or not exists(select 1 from storage.buckets where id='routine-media' and not public) then
    raise exception 'API or private media security differs';
  end if;
end;
$verify$;
-- Exercise the same grants and RLS role used by the web client, rather than
-- relying only on privileged verification queries above.
set local role authenticated;
do $client_role$
declare routine uuid := gen_random_uuid(); doc jsonb; impact jsonb;
begin
  doc := jsonb_build_object('id',routine,'name','Client-role rollback verification','description','Verification',
    'exercises',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Custom verification exercise',
      'description','Instructions','sets','2','repetitions','8','duration','','rest','','notes','','media','[]'::jsonb)));
  perform public.save_editor_routine(null,doc,null);
  impact := public.preview_routine_change(routine);
  if (impact->>'assignmentCount')::integer <> 0 then raise exception 'Client impact differs'; end if;
  doc := jsonb_set(doc,'{description}','"Edited by client role"');
  perform public.save_editor_routine(routine,doc,impact->>'token');
  impact := public.preview_routine_change(routine);
  perform public.apply_routine_change(routine,'delete',impact->>'token');
end;
$client_role$;
reset role;
rollback;
select 'PASS: hosted create/retry, patient impact, provider isolation, stale confirmation, edit/replacement, follow-ups, immutable history, patient media, deletion and private-media/API checks. All synthetic records rolled back.' as verification;
