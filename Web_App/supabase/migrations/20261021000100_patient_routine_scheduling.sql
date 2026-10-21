-- SCRUM-64. Apply ONLY after inspecting the live schema and scheduling_preflight.sql.
-- Never replay the migration directory. Enable a separately reviewed copy only.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $preflight$
declare
  hosted_execution_approved constant boolean := false;
begin
  if not hosted_execution_approved then
    raise exception 'SCRUM-64 requires separate deployment review; source execution is disabled';
  end if;
  if to_regnamespace('milestone_scheduling') is not null then
    raise exception 'Scheduling already exists. Inspect deployment state; do not replay.';
  end if;
  if to_regprocedure('public.save_routine_prescriptions(uuid,text,jsonb)') is null
    or to_regprocedure('milestone_routine_prescriptions.positive_integer(jsonb,text,boolean)') is null
    or to_regprocedure('public.assign_routine(uuid,uuid,date)') is null
    or to_regprocedure('public.cancel_routine_assignment(uuid)') is null
    or to_regprocedure('public.schedule_routine_follow_up(uuid,timestamptz)') is null then
    raise exception 'Expected deployed catalog/prescription and cancellation APIs are missing';
  end if;
  if exists(select 1 from pg_attribute where attrelid='public.routines'::regclass
    and attname in ('exercise_revision','exercise_format_version') and not attisdropped) then
    raise exception 'Overlapping SCRUM-43 schema requires reconciliation';
  end if;
  if (select atttypid from pg_attribute where attrelid='public.routines'::regclass
    and attname='exercise_list' and not attisdropped) is distinct from 'jsonb[]'::regtype then
    raise exception 'Expected routines.exercise_list jsonb[]';
  end if;
  if exists(select 1 from pg_class where oid in ('public.routines'::regclass,
    'public.routine_assignments'::regclass,'public.routine_assignment_exercises'::regclass,
    'public.provider_patient_profiles'::regclass) and not relrowsecurity) then
    raise exception 'Expected provider RLS is not enabled';
  end if;
  if exists(select 1 from pg_proc where oid in ('public.assign_routine(uuid,uuid,date)'::regprocedure,
    'public.cancel_routine_assignment(uuid)'::regprocedure,
    'public.schedule_routine_follow_up(uuid,timestamptz)'::regprocedure) and
    (not prosecdef or proconfig is distinct from array['search_path=""'] or
      has_function_privilege('anon',oid,'EXECUTE'))) then
    raise exception 'Existing assignment API security differs';
  end if;
  if not exists(select 1 from pg_attribute where attrelid='public.routine_assignment_exercises'::regclass
    and attname='notes_snapshot' and atttypid='text'::regtype and not attisdropped) then
    raise exception 'Prescription snapshot deployment is missing';
  end if;
end;
$preflight$;

-- Prevent writes between the collision check, identity backfill, and new index.
lock table public.provider_patient_profiles, public.routine_assignments,
  public.routine_assignment_exercises in share row exclusive mode;
do $collisions$
begin
  if exists(select 1 from public.routine_assignments a
    left join public.provider_patient_profiles p on p.id=a.patient_profile_id
    where p.patient_id is null or a.status is null or a.scheduled_date is null) then
    raise exception 'Assignment identity/status/date is incomplete. No changes applied.';
  end if;
  if exists(select 1 from public.routine_assignments a
    join public.provider_patient_profiles p on p.id=a.patient_profile_id
    where a.status<>'cancelled' group by p.patient_id,a.scheduled_date having count(*)>1) then
    raise exception 'Existing patient/date collisions: inspect scheduling_preflight.sql. No records were changed.';
  end if;
end;
$collisions$;

create schema milestone_scheduling;
revoke all on schema milestone_scheduling from public,anon,authenticated;

create table milestone_scheduling.policy (
  singleton boolean primary key default true check(singleton),
  horizon_days integer not null check(horizon_days between 1 and 366),
  time_zone text not null
);
insert into milestone_scheduling.policy values(true,14,'America/Los_Angeles');
alter table milestone_scheduling.policy enable row level security;
revoke all on milestone_scheduling.policy from public,anon,authenticated;

create function milestone_scheduling.policy_at(p_instant timestamptz)
returns jsonb language plpgsql stable set search_path='' as $function$
declare result jsonb;
begin
  select jsonb_build_object('today',(p_instant at time zone time_zone)::date,
    'lastDate',(p_instant at time zone time_zone)::date+horizon_days-1,
    'horizonDays',horizon_days,'timeZone',time_zone) into result
    from milestone_scheduling.policy where singleton;
  if result is null then
    raise exception 'Scheduling policy is unavailable; contact the administrator' using errcode='55000';
  end if;
  return result;
end;
$function$;

create function milestone_scheduling.provider()
returns uuid language plpgsql stable set search_path='' as $function$
declare provider_id uuid:=auth.uid();
begin
  if provider_id is null or not exists(select 1 from public.providers where id=provider_id) then
    raise exception 'Sign in as a provider to schedule routines' using errcode='42501';
  end if;
  return provider_id;
end;
$function$;

alter table public.provider_patient_profiles add constraint scheduling_profile_patient_identity unique(id,patient_id);
alter table public.routine_assignments add column patient_id uuid;
update public.routine_assignments a set patient_id=p.patient_id
  from public.provider_patient_profiles p where p.id=a.patient_profile_id;
alter table public.routine_assignments alter column patient_id set not null;
alter table public.routine_assignments alter column status set not null, alter column scheduled_date set not null;
alter table public.routine_assignments add constraint scheduling_assignment_patient_identity
  foreign key(patient_profile_id,patient_id) references public.provider_patient_profiles(id,patient_id) on delete restrict;
-- Keep both identities. Future uniqueness policies can change this index and
-- milestone_scheduling.occupied together without re-keying assignment history.
create unique index routine_assignments_patient_date_active_idx
  on public.routine_assignments(patient_id,scheduled_date) where status<>'cancelled';
-- The former routine-specific index is redundant but retained for compatibility.
alter table public.routine_assignment_exercises add column exercise_id_snapshot uuid;
-- These tables are written through checked RPCs, never through browser DML.
revoke insert,update,delete,truncate on public.routine_assignments,public.routine_assignment_exercises from public,anon,authenticated;
comment on column public.routine_assignment_exercises.exercise_id_snapshot is
  'Catalog identity captured at assignment time, without a mutable catalog FK. Historical unknown identities remain NULL.';

create table public.routine_schedule_requests (
  provider_id uuid not null references public.providers(id) on delete restrict,
  request_id uuid not null,
  patient_profile_id uuid not null references public.provider_patient_profiles(id) on delete restrict,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(provider_id,request_id)
);
alter table public.routine_schedule_requests enable row level security;
revoke all on public.routine_schedule_requests from public,anon,authenticated;
grant select on public.routine_schedule_requests to authenticated;
create policy "Providers read own scheduling receipts" on public.routine_schedule_requests
  for select to authenticated using(provider_id=(select auth.uid()));

create function milestone_scheduling.immutable_snapshot()
returns trigger language plpgsql set search_path='' as $function$
begin
  raise exception 'Assigned prescription snapshots are immutable; cancel the assignment to replace it' using errcode='23514';
end;
$function$;
create trigger scheduling_snapshot_immutable before update or delete on public.routine_assignment_exercises
  for each row execute function milestone_scheduling.immutable_snapshot();
create trigger scheduling_receipt_immutable before update or delete on public.routine_schedule_requests
  for each row execute function milestone_scheduling.immutable_snapshot();

create function milestone_scheduling.immutable_assignment()
returns trigger language plpgsql set search_path='' as $function$
begin
  if row(new.id,new.patient_id,new.patient_profile_id,new.routine_id,new.scheduled_date,new.routine_name_snapshot)
    is distinct from row(old.id,old.patient_id,old.patient_profile_id,old.routine_id,old.scheduled_date,old.routine_name_snapshot) then
    raise exception 'Assigned prescription identity and date are immutable; cancel and replace' using errcode='23514';
  end if;
  if old.status='cancelled' and new.status<>'cancelled' then
    raise exception 'Cancelled assignments cannot be reactivated' using errcode='23514';
  end if;
  return new;
end;
$function$;
create trigger scheduling_assignment_immutable before update on public.routine_assignments
  for each row execute function milestone_scheduling.immutable_assignment();

create function milestone_scheduling.entries(p_entries jsonb,p_tokens boolean)
returns jsonb language plpgsql immutable set search_path='' as $function$
declare entry jsonb; normalized jsonb:='[]'; day date; routine uuid;
begin
  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'Supply a schedule of dated routine selections' using errcode='22023';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 366 then
    raise exception 'Select at least one routine; schedules are limited to 366 dates' using errcode='22023';
  end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) is distinct from 'object' then
      raise exception 'Every schedule entry must contain a date and routine ID' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_object_keys(entry) k where k not in ('date','routineId','token'))
      or jsonb_typeof(entry->'date') is distinct from 'string'
      or (entry->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
      or jsonb_typeof(entry->'routineId') is distinct from 'string'
      or (entry->>'routineId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Each entry requires an ISO calendar date and valid routine UUID' using errcode='22023';
    end if;
    begin day:=(entry->>'date')::date;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception 'A scheduling date is invalid' using errcode='22023';
    end;
    routine:=(entry->>'routineId')::uuid;
    if p_tokens and (jsonb_typeof(entry->'token') is distinct from 'string' or (entry->>'token') !~ '^[0-9a-f]{64}$') then
      raise exception 'Preview the schedule before confirming it' using errcode='22023';
    end if;
    normalized:=normalized || jsonb_build_array(jsonb_build_object('date',day,'routineId',routine)
      || case when p_tokens then jsonb_build_object('token',entry->>'token') else '{}'::jsonb end);
  end loop;
  if exists(select 1 from jsonb_array_elements(normalized) e group by e->>'date' having count(*)>1) then
    raise exception 'Select only one routine per calendar date' using errcode='22023';
  end if;
  return (select jsonb_agg(e order by e->>'date') from jsonb_array_elements(normalized) e);
end;
$function$;

create function milestone_scheduling.prescription(p_name text,p_list jsonb[])
returns jsonb language plpgsql immutable set search_path='' as $function$
declare item jsonb; label text; identity uuid; result jsonb:='[]'; pos integer:=0;
begin
  if nullif(btrim(p_name),'') is null or coalesce(cardinality(p_list),0) not between 1 and 100
    or array_ndims(p_list)<>1 then
    raise exception 'Routine cannot be assigned: save 1 to 100 valid exercises in the routine editor' using errcode='22023';
  end if;
  foreach item in array p_list loop
    identity:=null;
    if jsonb_typeof(item)='string' then label:=item#>>'{}';
    elsif jsonb_typeof(item)='object' then
      if exists(select 1 from jsonb_object_keys(item) k where k not in
        ('exercise_id','name','exerciseName','title','sets','reps','duration_seconds','notes')) then
        raise exception 'Routine cannot be assigned: unsupported legacy exercise fields; review it in the routine editor' using errcode='22023';
      end if;
      if jsonb_typeof(coalesce(nullif(item->'name','null'),nullif(item->'exerciseName','null'),item->'title')) is distinct from 'string' then
        raise exception 'Routine cannot be assigned: every exercise needs a name' using errcode='22023';
      end if;
      label:=coalesce(item->>'name',item->>'exerciseName',item->>'title');
      if exists(select 1 from jsonb_each(item) field where field.key in ('name','exerciseName','title')
        and field.value<>'null'::jsonb and field.value is distinct from to_jsonb(label)) then
        raise exception 'Routine cannot be assigned: ambiguous legacy exercise names; review it in the routine editor' using errcode='22023';
      end if;
      if item->'exercise_id' is not null and item->'exercise_id'<>'null'::jsonb then
        if jsonb_typeof(item->'exercise_id')<>'string' or
          (item->>'exercise_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'Routine cannot be assigned: invalid catalog identity; review it in the routine editor' using errcode='22023';
        end if;
        identity:=(item->>'exercise_id')::uuid;
      end if;
      if item->'notes' is not null and jsonb_typeof(item->'notes') not in ('string','null') then
        raise exception 'Routine cannot be assigned: exercise notes must be text' using errcode='22023';
      end if;
    else
      raise exception 'Routine cannot be assigned: malformed exercise; review it in the routine editor' using errcode='22023';
    end if;
    if nullif(regexp_replace(label,'[[:space:]]','','g'),'') is null then
      raise exception 'Routine cannot be assigned: every exercise needs a nonblank name' using errcode='22023';
    end if;
    result:=result||jsonb_build_array(jsonb_build_object('exerciseId',identity,'name',label,'position',pos,
      'sets',milestone_routine_prescriptions.positive_integer(item->'sets','Sets'),
      'reps',milestone_routine_prescriptions.positive_integer(item->'reps','Reps'),
      'durationSeconds',milestone_routine_prescriptions.positive_integer(item->'duration_seconds','Duration'),
      'notes',item->>'notes'));
    pos:=pos+1;
  end loop;
  return result;
end;
$function$;

create function milestone_scheduling.token(p_name text,p_list jsonb[])
returns text language sql immutable set search_path='' as $function$
  select encode(sha256(convert_to(jsonb_build_object('name',p_name,'exercises',p_list)::text,'UTF8')),'hex');
$function$;

create function milestone_scheduling.occupied(p_patient uuid,p_provider uuid,p_start date,p_end date)
returns jsonb language sql stable set search_path='' as $function$
  select coalesce(jsonb_agg(jsonb_build_object('date',a.scheduled_date,
    'assignmentId',case when p.provider_id=p_provider then a.id end,
    'routineName',case when p.provider_id=p_provider then a.routine_name_snapshot end) order by a.scheduled_date),'[]'::jsonb)
  from public.routine_assignments a join public.provider_patient_profiles p on p.id=a.patient_profile_id
  where a.patient_id=p_patient and a.status<>'cancelled' and a.scheduled_date between p_start and p_end;
$function$;

create function public.get_routine_scheduling_policy()
returns jsonb language plpgsql security definer set search_path='' as $function$
begin
  perform milestone_scheduling.provider();
  return milestone_scheduling.policy_at(clock_timestamp());
end;
$function$;

create function public.get_patient_schedule_occupancy(p_patient_profile_id uuid,p_start_date date,p_end_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare provider uuid:=milestone_scheduling.provider(); patient uuid;
begin
  select patient_id into patient from public.provider_patient_profiles where id=p_patient_profile_id and provider_id=provider;
  if patient is null then raise exception 'Patient relationship not found' using errcode='42501'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date or p_end_date-p_start_date>365 then
    raise exception 'Choose a calendar range of at most 366 days' using errcode='22023';
  end if;
  return milestone_scheduling.occupied(patient,provider,p_start_date,p_end_date);
end;
$function$;

create function public.preview_routine_schedule(p_patient_profile_id uuid,p_entries jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare provider uuid:=milestone_scheduling.provider(); patient uuid; normalized jsonb;
  policy jsonb; entry jsonb; template public.routines%rowtype; result jsonb:='[]'; occupied jsonb;
begin
  normalized:=milestone_scheduling.entries(p_entries,false);
  select patient_id into patient from public.provider_patient_profiles
    where id=p_patient_profile_id and provider_id=provider and discharged_at is null;
  if patient is null then raise exception 'Active patient relationship not found' using errcode='42501'; end if;
  policy:=milestone_scheduling.policy_at(clock_timestamp());
  for entry in select value from jsonb_array_elements(normalized) loop
    if (entry->>'date')::date not between (policy->>'today')::date and (policy->>'lastDate')::date then
      raise exception 'Date outside the permitted scheduling window; refresh the schedule' using errcode='22023';
    end if;
    select * into template from public.routines where id=(entry->>'routineId')::uuid and provider_id=provider;
    if not found then raise exception 'A selected routine is unavailable or belongs to another provider' using errcode='42501'; end if;
    result:=result||jsonb_build_array(entry||jsonb_build_object('routineName',template.name,
      'token',milestone_scheduling.token(template.name,template.exercise_list),
      'exercises',milestone_scheduling.prescription(template.name,template.exercise_list)));
  end loop;
  occupied:=milestone_scheduling.occupied(patient,provider,(policy->>'today')::date,(policy->>'lastDate')::date);
  return jsonb_build_object('policy',policy,'entries',result,'occupied',occupied,
    'conflicts',(select coalesce(jsonb_agg(o),'[]') from jsonb_array_elements(occupied) o
      where exists(select 1 from jsonb_array_elements(normalized) n where n->>'date'=o->>'date')));
end;
$function$;

create function public.get_routine_schedule_request(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare provider uuid:=milestone_scheduling.provider(); receipt jsonb;
begin
  select result into receipt from public.routine_schedule_requests where provider_id=provider and request_id=p_request_id;
  return receipt;
end;
$function$;

create function public.assign_routine_schedule(p_patient_profile_id uuid,p_request_id uuid,p_entries jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare provider uuid:=milestone_scheduling.provider(); patient uuid; normalized jsonb; payload jsonb;
  previous public.routine_schedule_requests%rowtype; policy jsonb; entry jsonb; template public.routines%rowtype;
  exercises jsonb; exercise jsonb; assignment uuid; results jsonb:='[]'; result jsonb; conflicts jsonb;
begin
  if p_request_id is null or p_patient_profile_id is null then
    raise exception 'Request and patient relationship IDs are required' using errcode='22023';
  end if;
  normalized:=milestone_scheduling.entries(p_entries,true);
  payload:=jsonb_build_object('patientProfileId',p_patient_profile_id,'entries',normalized);
  -- Same-key submissions wait for the first transaction, including its receipt.
  perform pg_advisory_xact_lock(hashtextextended(provider::text||':'||p_request_id::text,6400));
  select * into previous from public.routine_schedule_requests where provider_id=provider and request_id=p_request_id;
  if found then
    if previous.payload<>payload then raise exception 'Request ID was already used for a different schedule' using errcode='22023'; end if;
    return previous.result; -- Before horizon/template checks: replay never creates rows.
  end if;
  select patient_id into patient from public.provider_patient_profiles
    where id=p_patient_profile_id and provider_id=provider and discharged_at is null;
  if patient is null then raise exception 'Active patient relationship not found' using errcode='42501'; end if;
  -- All assignment/cancellation paths lock shared patient, then relationship, then routines.
  perform id from public.patients where id=patient for update;
  perform id from public.provider_patient_profiles where id=p_patient_profile_id and patient_id=patient
    and provider_id=provider and discharged_at is null for share;
  if not found then raise exception 'Active patient relationship not found' using errcode='42501'; end if;
  perform id from public.routines where id in (select (e->>'routineId')::uuid from jsonb_array_elements(normalized) e)
    and provider_id=provider order by id for share;
  -- Use the actual server clock after waiting for locks, consistently for the whole batch.
  policy:=milestone_scheduling.policy_at(clock_timestamp());
  for entry in select value from jsonb_array_elements(normalized) loop
    if (entry->>'date')::date not between (policy->>'today')::date and (policy->>'lastDate')::date then
      raise exception 'Date outside the permitted scheduling window; preview again' using errcode='22023';
    end if;
    select * into template from public.routines where id=(entry->>'routineId')::uuid and provider_id=provider;
    if not found then raise exception 'A selected routine is unavailable or belongs to another provider' using errcode='42501'; end if;
    if milestone_scheduling.token(template.name,template.exercise_list)<>entry->>'token' then
      raise exception 'A routine changed after preview. Review the updated prescription before confirming.' using errcode='40001';
    end if;
    perform milestone_scheduling.prescription(template.name,template.exercise_list);
  end loop;
  select coalesce(jsonb_agg(o->'date' order by o->>'date'),'[]') into conflicts
    from jsonb_array_elements(milestone_scheduling.occupied(patient,provider,
      (policy->>'today')::date,(policy->>'lastDate')::date)) o
    where exists(select 1 from jsonb_array_elements(normalized) e where e->>'date'=o->>'date');
  if jsonb_array_length(conflicts)>0 then
    raise exception 'One or more dates already have an assignment. Cancel an existing assignment before replacing it.'
      using errcode='23505',detail=jsonb_build_object('conflictDates',conflicts)::text;
  end if;
  for entry in select value from jsonb_array_elements(normalized) loop
    select * into template from public.routines where id=(entry->>'routineId')::uuid and provider_id=provider;
    exercises:=milestone_scheduling.prescription(template.name,template.exercise_list);
    insert into public.routine_assignments(patient_id,patient_profile_id,routine_id,scheduled_date,routine_name_snapshot)
      values(patient,p_patient_profile_id,template.id,(entry->>'date')::date,template.name) returning id into assignment;
    for exercise in select value from jsonb_array_elements(exercises) loop
      insert into public.routine_assignment_exercises(routine_assignment_id,exercise_id_snapshot,exercise_name_snapshot,
        position,sets_snapshot,reps_snapshot,timer_seconds_snapshot,notes_snapshot)
      values(assignment,(exercise->>'exerciseId')::uuid,exercise->>'name',(exercise->>'position')::integer,
        (exercise->>'sets')::integer,(exercise->>'reps')::integer,(exercise->>'durationSeconds')::integer,exercise->>'notes');
    end loop;
    results:=results||jsonb_build_array(jsonb_build_object('id',assignment,'date',entry->>'date','routineId',template.id));
  end loop;
  result:=jsonb_build_object('requestId',p_request_id,'patientProfileId',p_patient_profile_id,'assignments',results);
  insert into public.routine_schedule_requests(provider_id,request_id,patient_profile_id,payload,result)
    values(provider,p_request_id,p_patient_profile_id,payload,result);
  return result;
end;
$function$;

-- Keep the original signature. Older callers get identical rules and current snapshots.
create or replace function public.assign_routine(p_patient_profile_id uuid,p_routine_id uuid,p_scheduled_date date)
returns uuid language plpgsql security definer set search_path='' as $function$
declare preview jsonb; selections jsonb; result jsonb;
begin
  preview:=public.preview_routine_schedule(p_patient_profile_id,
    jsonb_build_array(jsonb_build_object('date',p_scheduled_date,'routineId',p_routine_id)));
  select jsonb_agg(jsonb_build_object('date',e->>'date','routineId',e->>'routineId','token',e->>'token'))
    into selections from jsonb_array_elements(preview->'entries') e;
  result:=public.assign_routine_schedule(p_patient_profile_id,gen_random_uuid(),selections);
  return (result->'assignments'->0->>'id')::uuid;
end;
$function$;

create or replace function public.cancel_routine_assignment(p_routine_assignment_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
declare provider uuid:=milestone_scheduling.provider(); patient uuid;
begin
  select a.patient_id into patient from public.routine_assignments a
    join public.provider_patient_profiles p on p.id=a.patient_profile_id
    where a.id=p_routine_assignment_id and p.provider_id=provider;
  if patient is null then raise exception 'Assignment not found' using errcode='42501'; end if;
  perform id from public.patients where id=patient for update;
  -- Recheck authorization after waiting. Repeated cancellation is a successful no-op.
  perform a.id from public.routine_assignments a join public.provider_patient_profiles p on p.id=a.patient_profile_id
    where a.id=p_routine_assignment_id and p.provider_id=provider for update of a;
  if not found then raise exception 'Assignment not found' using errcode='42501'; end if;
  update public.routine_assignments set status='cancelled',updated_at=now() where id=p_routine_assignment_id and status<>'cancelled';
  update public.routine_follow_ups set status='cancelled',updated_at=now()
    where routine_assignment_id=p_routine_assignment_id and status='scheduled';
end;
$function$;

-- Preserve the existing follow-up API, but serialize it with cancellation.
-- Without this lock an overlapping follow-up could be added after cancellation.
create or replace function public.schedule_routine_follow_up(p_routine_assignment_id uuid,p_scheduled_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $function$
declare provider uuid:=milestone_scheduling.provider(); patient uuid; follow_up uuid;
begin
  if p_scheduled_at is null then raise exception 'Follow-up date and time are required' using errcode='22023'; end if;
  select a.patient_id into patient from public.routine_assignments a
    join public.provider_patient_profiles p on p.id=a.patient_profile_id
    where a.id=p_routine_assignment_id and p.provider_id=provider;
  if patient is null then raise exception 'Active routine assignment not found' using errcode='42501'; end if;
  perform id from public.patients where id=patient for update;
  perform p.id from public.provider_patient_profiles p join public.routine_assignments a on a.patient_profile_id=p.id
    where a.id=p_routine_assignment_id and p.provider_id=provider and p.discharged_at is null for share of p;
  if not found then raise exception 'Active routine assignment not found' using errcode='42501'; end if;
  perform id from public.routine_assignments where id=p_routine_assignment_id and status<>'cancelled' for update;
  if not found then raise exception 'Active routine assignment not found' using errcode='42501'; end if;
  insert into public.routine_follow_ups(routine_assignment_id,scheduled_at) values(p_routine_assignment_id,p_scheduled_at)
    on conflict(routine_assignment_id) do update set scheduled_at=excluded.scheduled_at,status='scheduled',updated_at=now()
    returning id into follow_up;
  return follow_up;
end;
$function$;

-- PostgreSQL default function grants must not expose helpers or write APIs to anon.
revoke all on all functions in schema milestone_scheduling from public,anon,authenticated;
revoke all on function public.get_routine_scheduling_policy(),public.get_patient_schedule_occupancy(uuid,date,date),
  public.preview_routine_schedule(uuid,jsonb),public.get_routine_schedule_request(uuid),
  public.assign_routine_schedule(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_routine_scheduling_policy(),public.get_patient_schedule_occupancy(uuid,date,date),
  public.preview_routine_schedule(uuid,jsonb),public.get_routine_schedule_request(uuid),
  public.assign_routine_schedule(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
