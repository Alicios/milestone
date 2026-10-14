-- SCRUM-43: targeted expansion of the verified hosted schema, NOT a bootstrap.
-- Review audits/scrum43_preflight.sql and SCRUM43_INTEGRATION.md before deployment.
-- No catalog inserts, legacy conversion, historical snapshot updates, or ledger repair.
begin;
set local lock_timeout = '10s';

do $preflight$
declare item record;
begin
  if current_user <> 'postgres' then
    raise exception 'SCRUM-43 deployment requires the reviewed postgres-owned baseline';
  end if;
  for item in select * from (values
    ('exercises','id','uuid'), ('exercises','name','text'),
    ('exercises','desc','text'), ('exercises','created_at','timestamptz'),
    ('routines','id','uuid'), ('routines','provider_id','uuid'),
    ('routines','name','text'), ('routines','created_at','date'),
    ('routines','description','text'), ('routines','exercise_list','_jsonb'),
    ('routine_assignments','patient_profile_id','uuid'),
    ('routine_assignments','routine_name_snapshot','text'),
    ('routine_assignment_exercises','exercise_name_snapshot','text'),
    ('routine_assignment_exercises','position','int4'),
    ('providers','professional_title','text'), ('providers','medical_practice_id','uuid'),
    ('provider_patient_profiles','discharged_at','timestamptz')
  ) expected(table_name,column_name,udt_name)
  loop
    if not exists (select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = item.table_name
        and c.column_name = item.column_name and c.udt_name = item.udt_name) then
      raise exception 'Unexpected SCRUM-43 baseline: %.% must be %',
        item.table_name, item.column_name, item.udt_name;
    end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'routines' and column_name in ('archived_at','updated_at','exercise_format_version'))
    or to_regnamespace('exercise_prescriptions') is not null
    or to_regclass('public.routine_follow_ups') is null then
    raise exception 'Unexpected or already-expanded SCRUM-43 baseline';
  end if;
  if (select count(*) from public.exercises) <> 248
    or exists (select 1 from public.exercises where nullif(btrim(name),'') is null)
    or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'exercises') then
    raise exception 'Review catalog population and policies before deploying SCRUM-43';
  end if;
  if exists (select 1 from pg_trigger where not tgisinternal and tgrelid in
    ('public.exercises'::regclass,'public.routines'::regclass,'public.routine_assignments'::regclass,
     'public.routine_assignment_exercises'::regclass)) then
    raise exception 'Unexpected triggers: review their interaction with SCRUM-43';
  end if;
  for item in select unnest(array['exercises','routines','routine_assignments',
    'routine_assignment_exercises']) as table_name loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || item.table_name)::regclass) then
      raise exception 'RLS must already be enabled on %', item.table_name;
    end if;
  end loop;
  for item in select unnest(array['save_routine(uuid,text,text[])',
    'assign_routine(uuid,uuid,date)','archive_routine(uuid)',
    'cancel_routine_assignment(uuid)']) as signature loop
    if to_regprocedure('public.' || item.signature) is null
      or has_function_privilege('anon','public.' || item.signature,'EXECUTE')
      or not has_function_privilege('authenticated','public.' || item.signature,'EXECUTE') then
      raise exception 'Unexpected effective RPC privileges: %', item.signature;
    end if;
    if not exists (select 1 from pg_proc where oid = to_regprocedure('public.' || item.signature)
      and prosecdef and pg_get_userbyid(proowner) = 'postgres') then
      raise exception 'Unexpected RPC owner/security: %', item.signature;
    end if;
  end loop;
  for item in select unnest(array['routines','routine_assignments',
    'routine_assignment_exercises']) as table_name loop
    if has_table_privilege('authenticated','public.' || item.table_name,'INSERT,UPDATE,DELETE,TRUNCATE')
      or has_any_column_privilege('authenticated','public.' || item.table_name,'INSERT,UPDATE')
      or has_table_privilege('anon','public.' || item.table_name,'INSERT,UPDATE,DELETE,TRUNCATE')
      or has_any_column_privilege('anon','public.' || item.table_name,'INSERT,UPDATE') then
      raise exception 'Unexpected client write access on %', item.table_name;
    end if;
  end loop;
  if not exists (select 1 from pg_index i where i.indrelid = 'public.routine_assignments'::regclass
    and i.indisunique and i.indisvalid
    and pg_get_indexdef(i.indexrelid) like '%(patient_profile_id, routine_id, scheduled_date)%'
    and pg_get_expr(i.indpred,i.indrelid) = '(status <> ''cancelled''::text)') then
    raise exception 'Required active-assignment uniqueness index is missing or changed';
  end if;
end;
$preflight$;

lock table public.exercises, public.routines, public.routine_assignment_exercises
  in access exclusive mode;

create schema exercise_prescriptions;
revoke all on schema exercise_prescriptions from public, anon, authenticated;

revoke all on public.exercises from public, anon, authenticated;
revoke all (id, name, "desc", created_at) on public.exercises from public, anon, authenticated;
grant select on public.exercises to authenticated;
create policy "Providers read shared exercises" on public.exercises
for select to authenticated using (
  exists (select 1 from public.providers p where p.id = (select auth.uid()))
);

-- IDs are permanent. This closes the JSON-reference deletion race for every
-- ordinary SQL writer, including service_role. Catalog text may be maintained
-- by trusted administrators; replacing IDs/deleting requires a reviewed migration.
create function exercise_prescriptions.protect_catalog() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Shared exercise IDs are permanent; catalog deletion/truncation is disabled' using errcode = '23514';
end;
$$;
create trigger exercises_no_delete before delete on public.exercises
for each row execute function exercise_prescriptions.protect_catalog();
create trigger exercises_no_truncate before truncate on public.exercises
for each statement execute function exercise_prescriptions.protect_catalog();
create trigger exercises_id_immutable before update of id on public.exercises
for each row when (old.id is distinct from new.id)
execute function exercise_prescriptions.protect_catalog();

alter table public.routines
  add column exercise_format_version smallint not null default 0 check (exercise_format_version in (0,1)),
  add column exercise_revision bigint not null default 0 check (exercise_revision >= 0),
  add column legacy_exercise_list jsonb[],
  add column legacy_preserved_at timestamptz;
alter table public.routine_assignment_exercises
  add column exercise_id_snapshot uuid,
  add column description_snapshot text,
  add column sets_snapshot integer check (sets_snapshot between 1 and 100),
  add column reps_snapshot integer check (reps_snapshot between 1 and 1000),
  add column timer_seconds_snapshot integer check (timer_seconds_snapshot between 1 and 86400);

create function exercise_prescriptions.parameter(p_value jsonb, p_label text, p_max integer)
returns integer language plpgsql set search_path = '' as $$
declare number numeric;
begin
  if p_value is null or p_value = 'null'::jsonb then return null; end if;
  if jsonb_typeof(p_value) <> 'number' then
    raise exception '% must be a whole number or null', p_label using errcode = '22023';
  end if;
  number := p_value::text::numeric;
  if number <> trunc(number) or number < 1 or number > p_max then
    raise exception '% must be between 1 and %', p_label, p_max using errcode = '22023';
  end if;
  return number::integer;
end;
$$;

-- Canonicalize only explicitly submitted prescriptions, never pre-existing data.
-- Locks all selected catalog rows in UUID order to serialize trusted text edits.
create function exercise_prescriptions.prepare(p_entries jsonb) returns jsonb[]
language plpgsql set search_path = '' as $$
declare entry jsonb; catalog_id uuid; label text; result jsonb[] := array[]::jsonb[];
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Exercises must be an array; use [] for an empty draft' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 100 or octet_length(p_entries::text) > 65536 then
    raise exception 'A routine supports at most 100 entries and a 64 KiB prescription payload' using errcode = '22023';
  end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' then
      raise exception 'Replace unresolved entries using the exercise catalog' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(entry) k
      where k not in ('exercise_id','name','sets','reps','timer_seconds')) then
      raise exception 'Unsupported prescription field; timer durations must use timer_seconds' using errcode = '22023';
    end if;
    if jsonb_typeof(entry -> 'exercise_id') is distinct from 'string'
      or (entry ->> 'exercise_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Each exercise requires a catalog UUID' using errcode = '22023';
    end if;
    perform exercise_prescriptions.parameter(entry -> 'sets','Sets',100);
    perform exercise_prescriptions.parameter(entry -> 'reps','Repetitions',1000);
    perform exercise_prescriptions.parameter(entry -> 'timer_seconds','Timer seconds',86400);
  end loop;
  perform e.id from public.exercises e where e.id in
    (select (value ->> 'exercise_id')::uuid from jsonb_array_elements(p_entries))
    order by e.id for share;
  for entry in select value from jsonb_array_elements(p_entries) loop
    catalog_id := (entry ->> 'exercise_id')::uuid;
    select name into label from public.exercises where id = catalog_id;
    if not found or nullif(btrim(label),'') is null then
      raise exception 'Exercise is unavailable in the shared catalog' using errcode = '22023';
    end if;
    result := array_append(result, jsonb_build_object(
      'exercise_id',catalog_id,'name',label,
      'sets',exercise_prescriptions.parameter(entry -> 'sets','Sets',100),
      'reps',exercise_prescriptions.parameter(entry -> 'reps','Repetitions',1000),
      'timer_seconds',exercise_prescriptions.parameter(entry -> 'timer_seconds','Timer seconds',86400)));
  end loop;
  return result;
end;
$$;

create function exercise_prescriptions.legacy_names(p_entries jsonb[]) returns text[]
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(p_entries) e where jsonb_typeof(e) is distinct from 'string') then
    return null;
  end if;
  return coalesce((select array_agg(e #>> '{}' order by n)
    from unnest(p_entries) with ordinality items(e,n)),array[]::text[]);
end;
$$;

create function exercise_prescriptions.guard_routine() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.legacy_exercise_list is not null or new.legacy_preserved_at is not null then
      raise exception 'Legacy provenance is maintained by the database' using errcode = '23514';
    end if;
    new.exercise_revision := 0;
  else
    if new.provider_id is distinct from old.provider_id then
      raise exception 'Routine ownership is immutable' using errcode = '23514';
    end if;
    if new.legacy_exercise_list is distinct from old.legacy_exercise_list
      or new.legacy_preserved_at is distinct from old.legacy_preserved_at then
      raise exception 'Original legacy exercises cannot be overwritten' using errcode = '23514';
    end if;
    if old.exercise_format_version = 1 and new.exercise_format_version <> 1 then
      raise exception 'A catalog routine cannot be downgraded to legacy names' using errcode = '23514';
    end if;
    if old.exercise_format_version = 0 and old.legacy_preserved_at is null
      and (new.exercise_list is distinct from old.exercise_list or new.exercise_format_version = 1) then
      new.legacy_exercise_list := old.exercise_list;
      new.legacy_preserved_at := now();
    end if;
    new.exercise_revision := old.exercise_revision + 1;
  end if;
  if new.exercise_format_version = 1 then
    if coalesce(array_ndims(new.exercise_list),1) <> 1 then
      raise exception 'Exercise list must be one dimensional' using errcode = '22023';
    end if;
    new.exercise_list := exercise_prescriptions.prepare(to_jsonb(new.exercise_list));
  elsif tg_op = 'INSERT' or new.exercise_list is distinct from old.exercise_list then
    if exercise_prescriptions.legacy_names(new.exercise_list) is null then
      raise exception 'New legacy writes support names only; use the catalog editor' using errcode = '22023';
    end if;
    if tg_op = 'UPDATE' and exercise_prescriptions.legacy_names(old.exercise_list) is null then
      raise exception 'Structured legacy exercises require explicit catalog replacement' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create trigger routines_prescription_guard before insert or update on public.routines
for each row execute function exercise_prescriptions.guard_routine();

create function exercise_prescriptions.protect_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Assignment exercise snapshots are immutable' using errcode = '23514';
end;
$$;
create trigger assignment_exercises_immutable before update or delete on public.routine_assignment_exercises
for each row execute function exercise_prescriptions.protect_snapshot();
create trigger assignment_exercises_no_truncate before truncate on public.routine_assignment_exercises
for each statement execute function exercise_prescriptions.protect_snapshot();

create function public.save_routine_with_prescriptions(
  p_routine_id uuid, p_routine_name text, p_exercises jsonb, p_expected_revision bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare provider uuid := auth.uid(); saved_id uuid; revision bigint; entries jsonb[];
begin
  if provider is null or not exists (select 1 from public.providers where id = provider) then
    raise exception 'Sign in as a provider before saving a routine' using errcode = '42501';
  end if;
  if p_routine_name is null or p_routine_name !~ '[^[:space:]]' or char_length(btrim(p_routine_name)) > 200 then
    raise exception 'Routine name must contain 1–200 characters' using errcode = '22023';
  end if;
  if p_exercises is null or jsonb_typeof(p_exercises) <> 'array' then
    raise exception 'Exercises must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_exercises) > 100 or octet_length(p_exercises::text) > 65536 then
    raise exception 'A routine supports at most 100 entries and a 64 KiB prescription payload' using errcode = '22023';
  end if;
  if p_routine_id is not null then
    select exercise_revision into revision from public.routines
    where id = p_routine_id and provider_id = provider for update;
    if not found then raise exception 'Routine not found' using errcode = 'P0002'; end if;
    if p_expected_revision is distinct from revision then
      raise exception 'This routine changed. Reload before saving your edits.' using errcode = '40001';
    end if;
  elsif p_expected_revision is not null then
    raise exception 'New routines must not specify a revision' using errcode = '22023';
  end if;
  select coalesce(array_agg(value order by n),array[]::jsonb[]) into entries
    from jsonb_array_elements(p_exercises) with ordinality items(value,n);
  if p_routine_id is null then
    insert into public.routines(provider_id,name,exercise_list,exercise_format_version)
    values(provider,btrim(p_routine_name),entries,1) returning id into saved_id;
  else
    update public.routines set name = btrim(p_routine_name), exercise_list = entries,
      exercise_format_version = 1 where id = p_routine_id returning id into saved_id;
  end if;
  return saved_id;
end;
$$;

-- Preserve the old signature. Name-only clients cannot erase prescription data.
create or replace function public.save_routine(p_routine_id uuid,p_routine_name text,p_exercise_names text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare provider uuid := auth.uid(); target public.routines%rowtype;
  names text[]; existing_names text[]; entries jsonb[]; saved_id uuid;
begin
  if provider is null or not exists (select 1 from public.providers where id = provider) then
    raise exception 'Sign in as a provider before saving a routine' using errcode = '42501';
  end if;
  if p_routine_name is null or p_routine_name !~ '[^[:space:]]' or char_length(btrim(p_routine_name)) > 200 then
    raise exception 'Routine name must contain 1–200 characters' using errcode = '22023';
  end if;
  if coalesce(array_ndims(p_exercise_names),1) <> 1 or coalesce(cardinality(p_exercise_names),0) > 100
    or octet_length(to_jsonb(p_exercise_names)::text) > 65536 then
    raise exception 'Exercise names must be a one dimensional array of at most 100 entries' using errcode = '22023';
  end if;
  select coalesce(array_agg(btrim(value) order by n),array[]::text[]) into names
    from unnest(p_exercise_names) with ordinality items(value,n) where nullif(btrim(value),'') is not null;
  select coalesce(array_agg(to_jsonb(value) order by n),array[]::jsonb[]) into entries
    from unnest(names) with ordinality items(value,n);
  if p_routine_id is null then
    insert into public.routines(provider_id,name,exercise_list) values(provider,btrim(p_routine_name),entries)
      returning id into saved_id;
    return saved_id;
  end if;
  select * into target from public.routines where id = p_routine_id and provider_id = provider for update;
  if not found then raise exception 'Routine not found' using errcode = 'P0002'; end if;
  if target.exercise_format_version = 1 then
    select coalesce(array_agg(value ->> 'name' order by n),array[]::text[]) into existing_names
      from unnest(target.exercise_list) with ordinality items(value,n);
    if names is distinct from existing_names then
      raise exception 'Use the catalog editor to change exercises; prescriptions have been preserved' using errcode = '55000';
    end if;
    update public.routines set name = btrim(p_routine_name) where id = target.id;
  else
    if exercise_prescriptions.legacy_names(target.exercise_list) is null then
      raise exception 'Use the catalog editor to resolve legacy exercises; original data has been preserved' using errcode = '55000';
    end if;
    update public.routines set name = btrim(p_routine_name),exercise_list = entries where id = target.id;
  end if;
  return target.id;
end;
$$;

create or replace function public.assign_routine(p_patient_profile_id uuid,p_routine_id uuid,p_scheduled_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare provider uuid := auth.uid(); target public.routines%rowtype; entries jsonb[]; assignment_id uuid;
begin
  if provider is null or not exists (select 1 from public.providers where id = provider) then
    raise exception 'Sign in as a provider before assigning a routine' using errcode = '42501';
  end if;
  if p_scheduled_date is null or not isfinite(p_scheduled_date)
    or p_scheduled_date < date '0001-01-01' or p_scheduled_date > date '9999-12-31' then
    raise exception 'A valid scheduled date is required' using errcode = '22023';
  end if;
  -- Consistent lock order: relationship, routine, then catalog UUIDs.
  perform 1 from public.provider_patient_profiles where id = p_patient_profile_id
    and provider_id = provider and discharged_at is null for share;
  if not found then raise exception 'Active patient profile not found' using errcode = '42501'; end if;
  select * into target from public.routines where id = p_routine_id and provider_id = provider for share;
  if not found then raise exception 'Routine not found' using errcode = 'P0002'; end if;
  if target.exercise_format_version <> 1 then
    raise exception 'Resolve this routine in the catalog editor before assigning it' using errcode = '22023';
  end if;
  if coalesce(cardinality(target.exercise_list),0) = 0 then
    raise exception 'Add at least one catalog exercise before assigning this draft' using errcode = '22023';
  end if;
  entries := exercise_prescriptions.prepare(to_jsonb(target.exercise_list));
  insert into public.routine_assignments(patient_profile_id,routine_id,scheduled_date,routine_name_snapshot)
    values(p_patient_profile_id,target.id,p_scheduled_date,target.name) returning id into assignment_id;
  insert into public.routine_assignment_exercises(routine_assignment_id,exercise_name_snapshot,position,
    exercise_id_snapshot,description_snapshot,sets_snapshot,reps_snapshot,timer_seconds_snapshot)
  select assignment_id,e.name,n - 1,e.id,e."desc",(entry ->> 'sets')::integer,
    (entry ->> 'reps')::integer,(entry ->> 'timer_seconds')::integer
  from unnest(entries) with ordinality items(entry,n)
  join public.exercises e on e.id = (entry ->> 'exercise_id')::uuid order by n;
  return assignment_id;
end;
$$;

revoke all on all functions in schema exercise_prescriptions from public, anon, authenticated;
revoke all on function public.save_routine_with_prescriptions(uuid,text,jsonb,bigint) from public, anon;
revoke all on function public.save_routine(uuid,text,text[]) from public, anon;
revoke all on function public.assign_routine(uuid,uuid,date) from public, anon;
grant execute on function public.save_routine_with_prescriptions(uuid,text,jsonb,bigint) to authenticated, service_role;
grant execute on function public.save_routine(uuid,text,text[]) to authenticated, service_role;
grant execute on function public.assign_routine(uuid,uuid,date) to authenticated, service_role;

do $$
begin
  if has_table_privilege('anon','public.exercises','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    or has_any_column_privilege('anon','public.exercises','SELECT,INSERT,UPDATE')
    or has_table_privilege('authenticated','public.exercises','INSERT,UPDATE,DELETE,TRUNCATE')
    or has_any_column_privilege('authenticated','public.exercises','INSERT,UPDATE') then
    raise exception 'Inherited exercise privileges still allow client access beyond provider SELECT';
  end if;
end;
$$;
comment on table public.exercises is 'Shared rehabilitation catalog. Provider clients have read access only; IDs are permanent.';
comment on column public.exercises."desc" is 'Reusable exercise instructions; copied into new assignment snapshots.';
comment on column public.routines.exercise_format_version is '0: preserved legacy input, not assignable. 1: validated catalog prescriptions in exercise_list.';
comment on column public.routines.exercise_revision is 'Optimistic edit token maintained by the routine trigger.';
comment on column public.routines.legacy_exercise_list is 'Original legacy list captured before its first explicit replacement; never read as active memberships.';
comment on column public.routines.legacy_preserved_at is 'When the original legacy list was preserved, including an originally SQL-null list.';
comment on column public.routine_assignment_exercises.exercise_id_snapshot is 'Catalog provenance only, intentionally no FK or dynamic catalog lookup.';
comment on column public.routine_assignment_exercises.description_snapshot is 'Instructions at assignment time. NULL means unavailable/not historically recorded.';
comment on column public.routine_assignment_exercises.sets_snapshot is 'Prescribed sets at assignment time, 1–100 or NULL.';
comment on column public.routine_assignment_exercises.reps_snapshot is 'Repetitions per set at assignment time, 1–1000 or NULL.';
comment on column public.routine_assignment_exercises.timer_seconds_snapshot is 'Duration in seconds per set at assignment time, 1–86400 or NULL.';
notify pgrst, 'reload schema';
commit;
