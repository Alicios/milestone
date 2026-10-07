-- Adapt the routine RPCs to the live six-column routines table. Routine
-- exercises are stored as a jsonb[] in routines.exercise_list; the normalized
-- exercise and assignment tables remain in place for historical assignments.
begin;

-- Preserve exercises created under the former normalized editor for any row
-- that has not yet been given an exercise_list value.
update public.routines as routine
set exercise_list = coalesce((
  select array_agg(to_jsonb(exercise.name) order by exercise.position)
  from public.routine_exercises as exercise
  where exercise.routine_id = routine.id
), array[]::jsonb[])
where routine.exercise_list is null;

create or replace function public.save_routine(
  p_routine_id uuid,
  p_routine_name text,
  p_exercise_names text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_provider uuid := auth.uid();
  saved_id uuid;
  saved_exercise_list jsonb[];
begin
  if current_provider is null then
    raise exception 'Sign in before saving a routine' using errcode = '42501';
  end if;
  if nullif(btrim(p_routine_name), '') is null then
    raise exception 'Routine name is required' using errcode = '22023';
  end if;

  select coalesce(
    array_agg(to_jsonb(btrim(exercise_name)) order by exercise_position),
    array[]::jsonb[]
  )
  into saved_exercise_list
  from unnest(coalesce(p_exercise_names, array[]::text[]))
    with ordinality as exercises(exercise_name, exercise_position)
  where nullif(btrim(exercise_name), '') is not null;

  if p_routine_id is null then
    insert into public.routines (provider_id, name, exercise_list)
    values (current_provider, btrim(p_routine_name), saved_exercise_list)
    returning id into saved_id;
  else
    update public.routines
    set name = btrim(p_routine_name), exercise_list = saved_exercise_list
    where id = p_routine_id and provider_id = current_provider
    returning id into saved_id;
    if saved_id is null then
      raise exception 'Routine not found' using errcode = 'P0002';
    end if;
  end if;

  return saved_id;
end;
$function$;

create or replace function public.assign_routine(
  p_patient_profile_id uuid,
  p_routine_id uuid,
  p_scheduled_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_provider uuid := auth.uid();
  routine_name text;
  routine_exercise_list jsonb[];
  assignment_id uuid;
begin
  if current_provider is null then
    raise exception 'Sign in before assigning a routine' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.provider_patient_profiles as profile
    where profile.id = p_patient_profile_id
      and profile.provider_id = current_provider
      and profile.discharged_at is null
  ) then
    raise exception 'Active patient profile not found' using errcode = '42501';
  end if;

  select routine.name, routine.exercise_list
  into routine_name, routine_exercise_list
  from public.routines as routine
  where routine.id = p_routine_id and routine.provider_id = current_provider;
  if routine_name is null then
    raise exception 'Routine not found' using errcode = 'P0002';
  end if;

  insert into public.routine_assignments (
    patient_profile_id, routine_id, scheduled_date, routine_name_snapshot
  )
  values (p_patient_profile_id, p_routine_id, p_scheduled_date, routine_name)
  returning id into assignment_id;

  insert into public.routine_assignment_exercises (
    routine_assignment_id, exercise_name_snapshot, position
  )
  select
    assignment_id,
    exercise_name,
    exercise_position - 1
  from unnest(coalesce(routine_exercise_list, array[]::jsonb[]))
    with ordinality as entries(entry, exercise_position)
  cross join lateral (
    select nullif(btrim(coalesce(
      entry ->> 'name',
      entry ->> 'exerciseName',
      entry ->> 'title',
      entry #>> '{}'
    )), '') as exercise_name
  ) as parsed
  where exercise_name is not null;

  return assignment_id;
end;
$function$;

commit;
