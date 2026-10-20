-- PROPOSED, NOT DEPLOYED. Forward-only extension of the deployed catalog release.
-- Do not run the migration directory wholesale. See ROUTINE_PRESCRIPTIONS.md.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public;

do $approval$
declare
  hosted_execution_approved constant boolean := false;
begin
  if not hosted_execution_approved then
    raise exception 'Prescription migration requires separate deployment review and approval';
  end if;
end;
$approval$;

lock table public.routines, public.routine_assignments, public.routine_assignment_exercises
  in share row exclusive mode;

do $preflight$
begin
  if current_user <> 'postgres' then raise exception 'Reviewed postgres execution required'; end if;
  if to_regprocedure('public.save_routine_from_catalog(uuid,text,uuid[])') is null
    or to_regprocedure('public.assign_routine(uuid,uuid,date)') is null then
    raise exception 'The deployed catalog release is required';
  end if;
  -- Pin the reviewed implementations. The verified SQL Editor export used CRLF;
  -- normalize only that line-ending difference, not arbitrary SQL/text changes.
  if (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_proc where oid='public.assign_routine(uuid,uuid,date)'::regprocedure)
      <> 'fdcde740a52923adfc8996bb3ddc1429'
    or (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_proc where oid='public.save_routine_from_catalog(uuid,text,uuid[])'::regprocedure)
      <> '8909de50ad5f715fc34facc8bf614ee2' then
    raise exception 'RPC implementation drift: review before replacing';
  end if;
  if exists (select 1 from pg_proc where oid in (
      'public.assign_routine(uuid,uuid,date)'::regprocedure,
      'public.save_routine_from_catalog(uuid,text,uuid[])'::regprocedure)
    and (not prosecdef or pg_get_userbyid(proowner)<>'postgres' or proconfig is distinct from array['search_path=""']::text[])) then
    raise exception 'Unexpected RPC security configuration';
  end if;
  if (select format_type(atttypid,atttypmod) from pg_attribute
      where attrelid='public.routines'::regclass and attname='exercise_list' and not attisdropped)
      is distinct from 'jsonb[]' then raise exception 'Expected routines.exercise_list jsonb[]'; end if;
  if exists (select 1 from pg_attribute where attrelid='public.routine_assignment_exercises'::regclass
    and attnum>0 and not attisdropped and attname not in ('id','routine_assignment_id','exercise_name_snapshot','position'))
    or exists (select 1 from pg_attribute where attrelid='public.routines'::regclass and not attisdropped
      and attname in ('exercise_format_version','exercise_revision','legacy_exercise_list'))
    or to_regnamespace('exercise_prescriptions') is not null then
    raise exception 'Overlapping snapshot/SCRUM-43 schema: reconcile before deployment';
  end if;
  if exists(select 1 from pg_class where oid in ('public.routines'::regclass,
      'public.routine_assignments'::regclass,'public.routine_assignment_exercises'::regclass) and not relrowsecurity)
    or exists(select 1 from pg_trigger where not tgisinternal and tgrelid in (
      'public.routines'::regclass,'public.routine_assignments'::regclass,'public.routine_assignment_exercises'::regclass)) then
    raise exception 'Unexpected RLS or triggers; review before deployment';
  end if;
  if has_table_privilege('authenticated','public.routine_assignment_exercises','INSERT,UPDATE,DELETE,TRUNCATE')
    or has_any_column_privilege('authenticated','public.routine_assignment_exercises','INSERT,UPDATE')
    or has_table_privilege('anon','public.routine_assignment_exercises','INSERT,UPDATE,DELETE,TRUNCATE')
    or has_any_column_privilege('anon','public.routine_assignment_exercises','INSERT,UPDATE') then
    raise exception 'Unexpected direct snapshot write privileges';
  end if;
end;
$preflight$;

-- Transaction-local evidence; no persistent backup or row rewrite.
create temporary table prescription_rows_before on commit drop as
select 'routines'::text relation, to_jsonb(t) row_value from public.routines t
union all select 'routine_assignments', to_jsonb(t) from public.routine_assignments t
union all select 'routine_assignment_exercises', to_jsonb(t) from public.routine_assignment_exercises t;
create temporary table prescription_rpc_security_before on commit drop as
select oid, proowner, proacl, proconfig, prosecdef from pg_proc
where oid in ('public.assign_routine(uuid,uuid,date)'::regprocedure,
  'public.save_routine_from_catalog(uuid,text,uuid[])'::regprocedure);

-- Names match SCRUM-43's proposed snapshot vocabulary. Its old migration cannot
-- be replayed after this one; its ranges and JSON timer_seconds key differ.
alter table public.routine_assignment_exercises
  add column sets_snapshot integer check (sets_snapshot > 0),
  add column reps_snapshot integer check (reps_snapshot > 0),
  add column timer_seconds_snapshot integer check (timer_seconds_snapshot > 0),
  add column notes_snapshot text;

create schema milestone_routine_prescriptions;
revoke all on schema milestone_routine_prescriptions from public, anon, authenticated;

create function milestone_routine_prescriptions.positive_integer(
  p_value jsonb, p_label text, p_strict boolean default true
) returns integer language plpgsql immutable set search_path = '' as $function$
declare
  value numeric;
begin
  if p_value is null or p_value = 'null'::jsonb then return null; end if;
  if jsonb_typeof(p_value) = 'number' then
    value := p_value::text::numeric;
    if value = trunc(value) and value between 1 and 2147483647 then return value::integer; end if;
  end if;
  if p_strict then
    raise exception '% must be a positive integer up to 2147483647 or null', p_label using errcode='22023';
  end if;
  -- Preserve assignability of historical, unvalidated JSON without inventing dosage.
  return null;
end;
$function$;
revoke all on function milestone_routine_prescriptions.positive_integer(jsonb,text,boolean) from public, anon, authenticated;

create function public.save_routine_prescriptions(
  p_routine_id uuid, p_routine_name text, p_exercises jsonb
) returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  provider uuid := auth.uid();
  saved_id uuid;
  entry jsonb;
  exercise_ids uuid[] := array[]::uuid[];
  saved_list jsonb[];
begin
  if provider is null or not exists(select 1 from public.providers where id=provider) then
    raise exception 'Sign in as a provider before saving a routine' using errcode='42501';
  end if;
  if nullif(btrim(p_routine_name),'') is null or length(p_routine_name)>200 then
    raise exception 'Routine name must contain 1 to 200 characters' using errcode='22023';
  end if;
  if jsonb_typeof(p_exercises) is distinct from 'array' then
    raise exception 'Select 1 to 100 catalog exercises' using errcode='22023';
  end if;
  if jsonb_array_length(p_exercises) not between 1 and 100 then
    raise exception 'Select 1 to 100 catalog exercises' using errcode='22023';
  end if;
  if p_routine_id is not null then
    select id into saved_id from public.routines where id=p_routine_id and provider_id=provider for update;
    if saved_id is null then raise exception 'Routine not found' using errcode='P0002'; end if;
  end if;
  for entry in select value from jsonb_array_elements(p_exercises) loop
    if jsonb_typeof(entry) is distinct from 'object' then
      raise exception 'Each exercise must be an object' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_object_keys(entry) k
        where k not in ('exercise_id','sets','reps','duration_seconds','notes')) then
      raise exception 'Unsupported prescription field' using errcode='22023';
    end if;
    if jsonb_typeof(entry->'exercise_id') is distinct from 'string'
      or (entry->>'exercise_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Select an existing catalog UUID' using errcode='22023';
    end if;
    exercise_ids := array_append(exercise_ids,(entry->>'exercise_id')::uuid);
    perform milestone_routine_prescriptions.positive_integer(entry->'sets','Sets');
    perform milestone_routine_prescriptions.positive_integer(entry->'reps','Reps');
    perform milestone_routine_prescriptions.positive_integer(entry->'duration_seconds','Duration');
    if entry->'notes' is not null and jsonb_typeof(entry->'notes') not in ('string','null') then
      raise exception 'Notes must be text or null' using errcode='22023';
    end if;
  end loop;
  perform id from public.exercises where id=any(exercise_ids) order by id for share;
  if exists(select 1 from unnest(exercise_ids) selected(id) left join public.exercises e on e.id=selected.id
    where e.id is null or nullif(btrim(e.name),'') is null) then
    raise exception 'A selected catalog exercise is unavailable' using errcode='22023';
  end if;
  select array_agg(jsonb_build_object(
    'exercise_id',e.id,'name',e.name,
    'sets',milestone_routine_prescriptions.positive_integer(item->'sets','Sets'),
    'reps',milestone_routine_prescriptions.positive_integer(item->'reps','Reps'),
    'duration_seconds',milestone_routine_prescriptions.positive_integer(item->'duration_seconds','Duration'),
    'notes',nullif(btrim(item->>'notes'),'')) order by position)
  into saved_list from jsonb_array_elements(p_exercises) with ordinality items(item,position)
  join public.exercises e on e.id=(item->>'exercise_id')::uuid;
  if p_routine_id is null then
    insert into public.routines(id,provider_id,name,exercise_list)
      values(gen_random_uuid(),provider,btrim(p_routine_name),saved_list) returning id into saved_id;
  else
    update public.routines set name=btrim(p_routine_name),exercise_list=saved_list where id=saved_id;
  end if;
  return saved_id;
end;
$function$;
revoke all on function public.save_routine_prescriptions(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_routine_prescriptions(uuid,text,jsonb) to authenticated;

-- Retain the UUID-only contract for older clients, but reject edits that would
-- erase any non-null prescription or unknown legacy object fields.
create or replace function public.save_routine_from_catalog(
  p_routine_id uuid, p_routine_name text, p_exercise_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  provider uuid := auth.uid();
  saved_id uuid;
  saved_list jsonb[];
begin
  if provider is null or not exists (select 1 from public.providers where id = provider) then
    raise exception 'Sign in as a provider before saving a routine' using errcode = '42501';
  end if;
  if nullif(btrim(p_routine_name), '') is null or length(p_routine_name) > 200 then
    raise exception 'Routine name must contain 1 to 200 characters' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_exercise_ids), 0) not between 1 and 100
    or array_ndims(p_exercise_ids) <> 1 then
    raise exception 'Select 1 to 100 existing catalog exercises' using errcode = '22023';
  end if;
  if array_position(p_exercise_ids, null) is not null then
    raise exception 'Select 1 to 100 existing catalog exercises' using errcode = '22023';
  end if;
  if p_routine_id is not null then
    select id into saved_id from public.routines
    where id = p_routine_id and provider_id = provider for update;
    if saved_id is null then raise exception 'Routine not found' using errcode = 'P0002'; end if;
  end if;
  if p_routine_id is not null and exists (
    select 1 from public.routines r cross join lateral unnest(r.exercise_list) item
    cross join lateral jsonb_each(case when jsonb_typeof(item)='object' then item else '{}'::jsonb end) field
    where r.id=saved_id and field.key not in ('exercise_id','name') and field.value<>'null'::jsonb
  ) then
    raise exception 'Use the prescription editor to preserve exercise details' using errcode='55000';
  end if;
  -- Stable lock order; a trusted catalog deletion cannot race this save.
  perform id from public.exercises where id = any(p_exercise_ids) order by id for share;
  if exists (select 1 from unnest(p_exercise_ids) selected(id)
    left join public.exercises e on e.id = selected.id
    where e.id is null or nullif(btrim(e.name), '') is null) then
    raise exception 'A selected catalog exercise is unavailable' using errcode = '22023';
  end if;
  select array_agg(jsonb_build_object('exercise_id', e.id, 'name', e.name) order by selected.position)
  into saved_list from unnest(p_exercise_ids) with ordinality selected(id, position)
  join public.exercises e on e.id = selected.id;
  if p_routine_id is null then
    insert into public.routines (id, provider_id, name, exercise_list)
    values (gen_random_uuid(), provider, btrim(p_routine_name), saved_list) returning id into saved_id;
  else
    update public.routines set name = btrim(p_routine_name), exercise_list = saved_list where id = saved_id;
  end if;
  return saved_id;
end;
$function$;

-- Same ownership/relationship checks and legacy name parser; new snapshot
-- columns are populated only on INSERT of a new assignment.
create or replace function public.assign_routine(
  p_patient_profile_id uuid, p_routine_id uuid, p_scheduled_date date
) returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  current_provider uuid := auth.uid();
  routine_name text;
  routine_exercise_list jsonb[];
  assignment_id uuid;
begin
  if current_provider is null then
    raise exception 'Sign in before assigning a routine' using errcode='42501';
  end if;
  perform id from public.provider_patient_profiles
    where id=p_patient_profile_id and provider_id=current_provider and discharged_at is null for share;
  if not found then raise exception 'Active patient profile not found' using errcode='42501'; end if;
  select name,exercise_list into routine_name,routine_exercise_list from public.routines
    where id=p_routine_id and provider_id=current_provider for share;
  if routine_name is null then raise exception 'Routine not found' using errcode='P0002'; end if;
  insert into public.routine_assignments(patient_profile_id,routine_id,scheduled_date,routine_name_snapshot)
    values(p_patient_profile_id,p_routine_id,p_scheduled_date,routine_name) returning id into assignment_id;
  insert into public.routine_assignment_exercises(
    routine_assignment_id,exercise_name_snapshot,position,sets_snapshot,reps_snapshot,timer_seconds_snapshot,notes_snapshot)
  select assignment_id,exercise_name,exercise_position-1,
    milestone_routine_prescriptions.positive_integer(entry->'sets','Sets',false),
    milestone_routine_prescriptions.positive_integer(entry->'reps','Reps',false),
    milestone_routine_prescriptions.positive_integer(entry->'duration_seconds','Duration',false),
    case when jsonb_typeof(entry->'notes')='string' then nullif(btrim(entry->>'notes'),'') end
  from unnest(coalesce(routine_exercise_list,array[]::jsonb[])) with ordinality entries(entry,exercise_position)
  cross join lateral (select nullif(btrim(coalesce(
    entry->>'name',entry->>'exerciseName',entry->>'title',entry#>>'{}')),'') exercise_name) parsed
  where exercise_name is not null;
  return assignment_id;
end;
$function$;

-- Additive patient API: keep the old return type and its clients untouched.
create function public.get_my_routine_assignment_prescriptions(p_routine_assignment_id uuid)
returns table (
  id uuid, exercise_name_snapshot text, exercise_position integer,
  sets_snapshot integer, reps_snapshot integer, timer_seconds_snapshot integer, notes_snapshot text
) language sql security definer stable set search_path = '' as $function$
  select e.id,e.exercise_name_snapshot,e.position,e.sets_snapshot,e.reps_snapshot,e.timer_seconds_snapshot,e.notes_snapshot
  from public.routine_assignment_exercises e
  join public.routine_assignments a on a.id=e.routine_assignment_id
  join public.provider_patient_profiles pp on pp.id=a.patient_profile_id
  join public.patients p on p.id=pp.patient_id
  where e.routine_assignment_id=p_routine_assignment_id and p.auth_user_id=auth.uid()
  order by e.position;
$function$;
revoke all on function public.get_my_routine_assignment_prescriptions(uuid) from public, anon, authenticated;
grant execute on function public.get_my_routine_assignment_prescriptions(uuid) to authenticated;

comment on column public.routine_assignment_exercises.sets_snapshot is 'Optional positive prescribed sets captured on assignment; NULL for historical or unspecified values.';
comment on column public.routine_assignment_exercises.reps_snapshot is 'Optional positive repetitions captured on assignment; NULL for historical or unspecified values.';
comment on column public.routine_assignment_exercises.timer_seconds_snapshot is 'Optional positive duration in seconds, copied from exercise_list.duration_seconds.';
comment on column public.routine_assignment_exercises.notes_snapshot is 'Optional exercise notes captured on assignment; later template edits do not change this text.';

do $verify$
begin
  if exists(
    (select * from prescription_rows_before except all
      (select 'routines',to_jsonb(t) from public.routines t
       union all select 'routine_assignments',to_jsonb(t) from public.routine_assignments t
       union all select 'routine_assignment_exercises',to_jsonb(t)-array['sets_snapshot','reps_snapshot','timer_seconds_snapshot','notes_snapshot'] from public.routine_assignment_exercises t))
    union all
    ((select 'routines',to_jsonb(t) from public.routines t
       union all select 'routine_assignments',to_jsonb(t) from public.routine_assignments t
       union all select 'routine_assignment_exercises',to_jsonb(t)-array['sets_snapshot','reps_snapshot','timer_seconds_snapshot','notes_snapshot'] from public.routine_assignment_exercises t)
     except all select * from prescription_rows_before)
  ) then raise exception 'Existing routine/assignment rows changed'; end if;
  if exists(select 1 from public.routine_assignment_exercises
    where sets_snapshot is not null or reps_snapshot is not null or timer_seconds_snapshot is not null or notes_snapshot is not null) then
    raise exception 'Existing snapshots must not be backfilled';
  end if;
  if exists(select 1 from prescription_rpc_security_before b join pg_proc p on p.oid=b.oid
    where row(p.proowner,p.proacl,p.proconfig,p.prosecdef) is distinct from row(b.proowner,b.proacl,b.proconfig,b.prosecdef)) then
    raise exception 'Existing RPC security changed';
  end if;
end;
$verify$;
notify pgrst, 'reload schema';
commit;
