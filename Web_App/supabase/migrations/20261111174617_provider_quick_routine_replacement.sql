-- Replace/remove an unstarted assignment without losing snapshots or feedback.
create schema if not exists milestone_companion;
revoke all on schema milestone_companion from public, anon;
grant usage on schema milestone_companion to authenticated;

create table public.provider_assignment_change_requests (
  provider_id uuid not null,
  request_id uuid not null,
  assignment_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (provider_id, request_id)
);
alter table public.provider_assignment_change_requests enable row level security;
revoke all on public.provider_assignment_change_requests from public, anon, authenticated;
grant select on public.provider_assignment_change_requests to authenticated;
create policy own_change_receipts on public.provider_assignment_change_requests
  for select to authenticated using (provider_id = (select auth.uid()));

create function milestone_companion.change_patient_routine(
  p_assignment_id uuid, p_request_id uuid, p_routine_id uuid,
  p_token text, p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_provider uuid := milestone_scheduling.provider();
  v_patient uuid; v_profile uuid; v_payload jsonb; v_previous jsonb; v_result jsonb;
  v_assignment public.routine_assignments%rowtype; v_policy jsonb;
begin
  if p_assignment_id is null or p_request_id is null or p_expected_updated_at is null
    or (p_routine_id is not null and (p_token is null or length(btrim(p_token)) = 0 or length(p_token) > 512))
    or (p_routine_id is null and p_token is not null) then
    raise exception 'Assignment, request, version and preview are required' using errcode='22023';
  end if;
  v_payload := jsonb_build_object('assignmentId',p_assignment_id,'routineId',p_routine_id,
    'token',p_token,'expectedUpdatedAt',p_expected_updated_at);
  -- Same namespace and lock order as assign_routine_schedule, including replays.
  perform pg_advisory_xact_lock(hashtextextended(v_provider::text||':'||p_request_id::text,6400));
  select payload,result into v_previous,v_result from public.provider_assignment_change_requests
    where provider_id=v_provider and request_id=p_request_id;
  if found then
    if v_previous <> v_payload then
      raise exception 'Request ID already used for another change' using errcode='22023';
    end if;
    return v_result;
  end if;
  if exists(select 1 from public.routine_schedule_requests where provider_id=v_provider and request_id=p_request_id) then
    raise exception 'Request ID already used for another schedule' using errcode='22023';
  end if;
  select a.patient_id,a.patient_profile_id into v_patient,v_profile
    from public.routine_assignments a join public.provider_patient_profiles p on p.id=a.patient_profile_id
    where a.id=p_assignment_id and p.provider_id=v_provider and p.discharged_at is null;
  if not found then raise exception 'Active patient assignment not found' using errcode='42501'; end if;
  perform id from public.patients where id=v_patient for update;
  perform id from public.provider_patient_profiles where id=v_profile and patient_id=v_patient
    and provider_id=v_provider and discharged_at is null for share;
  if not found then raise exception 'Active patient relationship not found' using errcode='42501'; end if;
  -- Patient feedback and template changes acquire this same patient lock first.
  perform r.id from public.routines r where r.provider_id=v_provider and
    (r.id=p_routine_id or r.id=(select routine_id from public.routine_assignments where id=p_assignment_id))
    order by r.id for share;
  select * into v_assignment from public.routine_assignments where id=p_assignment_id
    and patient_profile_id=v_profile and patient_id=v_patient for update;
  if not found then raise exception 'Assignment not found' using errcode='42501'; end if;
  if v_assignment.updated_at is distinct from p_expected_updated_at then
    raise exception 'This assignment changed. Refresh before trying again.' using errcode='40001';
  end if;
  if v_assignment.status not in ('scheduled','modified') or v_assignment.patient_in_progress
    or v_assignment.patient_issue_severity in ('noncritical','critical')
    or nullif(btrim(v_assignment.patient_comment),'') is not null
    or exists(select 1 from public.routine_assignment_exercise_feedback f
      join public.routine_assignment_exercises e on e.id=f.routine_assignment_exercise_id
      where e.routine_assignment_id=p_assignment_id) then
    raise exception 'Started or completed routines must retain their care history' using errcode='55000';
  end if;
  v_policy:=milestone_scheduling.policy_at(clock_timestamp());
  if v_assignment.scheduled_date not between (v_policy->>'today')::date and (v_policy->>'lastDate')::date then
    raise exception 'Date outside the permitted scheduling window' using errcode='22023';
  end if;
  if p_routine_id is not null then
    if p_routine_id=v_assignment.routine_id then
      raise exception 'Choose a different saved routine' using errcode='22023';
    end if;
    perform id from public.routines where id=p_routine_id and provider_id=v_provider and archived_at is null;
    if not found then raise exception 'Saved routine unavailable' using errcode='42501'; end if;
  end if;
  -- Both calls are in this transaction. Any assignment error rolls back cancellation.
  perform public.cancel_routine_assignment(p_assignment_id);
  if p_routine_id is not null then
    v_result:=public.assign_routine_schedule(v_profile,p_request_id,jsonb_build_array(
      jsonb_build_object('date',v_assignment.scheduled_date,'routineId',p_routine_id,'token',p_token)));
  else
    v_result:=jsonb_build_object('requestId',p_request_id,'patientProfileId',v_profile,'assignments','[]'::jsonb);
  end if;
  v_result:=v_result||jsonb_build_object('previousAssignmentId',p_assignment_id);
  insert into public.provider_assignment_change_requests(provider_id,request_id,assignment_id,payload,result)
    values(v_provider,p_request_id,p_assignment_id,v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function milestone_companion.change_patient_routine(uuid,uuid,uuid,text,timestamptz) from public,anon;
grant execute on function milestone_companion.change_patient_routine(uuid,uuid,uuid,text,timestamptz) to authenticated;

create function public.change_patient_routine(
  p_assignment_id uuid, p_request_id uuid, p_routine_id uuid,
  p_token text, p_expected_updated_at timestamptz
) returns jsonb language sql security invoker set search_path = '' as $$
  select milestone_companion.change_patient_routine(p_assignment_id,p_request_id,p_routine_id,p_token,p_expected_updated_at);
$$;
revoke all on function public.change_patient_routine(uuid,uuid,uuid,text,timestamptz) from public,anon;
grant execute on function public.change_patient_routine(uuid,uuid,uuid,text,timestamptz) to authenticated;
comment on table public.provider_assignment_change_requests is 'Immutable own-provider receipts for atomic saved-routine replacement and removal.';
notify pgrst, 'reload schema';
