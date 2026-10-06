-- SCRUM-43. Apply after migrations 010 and 011 on the established schema.
-- Deploy with the updated client: save_routine now accepts exercise IDs.
begin;

lock table public.routines, public.routine_exercises in access exclusive mode;

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index exercises_provider_name_idx on public.exercises (provider_id, name);

alter table public.exercises enable row level security;
revoke all on public.exercises from public, anon, authenticated;
grant select on public.exercises to authenticated;
create policy "Providers view own exercises" on public.exercises
  for select to authenticated using (provider_id = (select auth.uid()));

-- One new catalog identity per existing membership, even when names match.
-- Preserve membership IDs, routine IDs, names, ordering, and archived routines.
alter table public.routine_exercises add column exercise_id uuid;
update public.routine_exercises set exercise_id = gen_random_uuid();
insert into public.exercises (id, provider_id, name)
select re.exercise_id, r.provider_id, re.name
from public.routine_exercises re join public.routines r on r.id = re.routine_id;
alter table public.routine_exercises
  alter column exercise_id set not null,
  add constraint routine_exercises_exercise_id_fkey
    foreign key (exercise_id) references public.exercises(id) on delete restrict,
  drop column name;
create index routine_exercises_exercise_id_idx on public.routine_exercises (exercise_id);

-- Historical names/positions stay untouched. Old instructions were not recorded;
-- never infer them from today's catalog. Snapshots deliberately have no catalog FK.
alter table public.routine_assignment_exercises
  add column instructions text not null default '';

create function public.save_exercise(p_exercise_id uuid, p_name text, p_instructions text)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  current_provider uuid := auth.uid();
  saved_id uuid;
begin
  if current_provider is null then raise exception 'Sign in before saving an exercise' using errcode = '42501'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Exercise name is required' using errcode = '22023'; end if;
  if p_exercise_id is null then
    insert into public.exercises (provider_id, name, instructions)
    values (current_provider, btrim(p_name), coalesce(p_instructions, '')) returning id into saved_id;
  else
    update public.exercises set name = btrim(p_name), instructions = coalesce(p_instructions, ''), updated_at = now()
    where id = p_exercise_id and provider_id = current_provider returning id into saved_id;
    if saved_id is null then raise exception 'Exercise not found' using errcode = 'P0002'; end if;
  end if;
  return saved_id;
end;
$function$;
revoke all on function public.save_exercise(uuid, text, text) from public, anon;
grant execute on function public.save_exercise(uuid, text, text) to authenticated;

-- Remove the name-only entry point; leaving it callable would bypass the catalog.
drop function public.save_routine(uuid, text, text[]);
create function public.save_routine(p_routine_id uuid, p_routine_name text, p_exercise_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  current_provider uuid := auth.uid();
  saved_id uuid;
begin
  if current_provider is null then raise exception 'Sign in before saving a routine' using errcode = '42501'; end if;
  if nullif(btrim(p_routine_name), '') is null then raise exception 'Routine name is required' using errcode = '22023'; end if;
  if exists (
    select 1 from unnest(coalesce(p_exercise_ids, array[]::uuid[])) as requested(exercise_id)
    where not exists (
      select 1 from public.exercises e where e.id = requested.exercise_id and e.provider_id = current_provider
    )
  ) then raise exception 'Exercise not found in your catalog' using errcode = '42501'; end if;

  if p_routine_id is null then
    insert into public.routines (provider_id, name) values (current_provider, btrim(p_routine_name)) returning id into saved_id;
  else
    -- This row lock also serializes routine edits with assignment snapshot creation.
    update public.routines set name = btrim(p_routine_name), updated_at = now()
    where id = p_routine_id and provider_id = current_provider and archived_at is null returning id into saved_id;
    if saved_id is null then raise exception 'Routine not found' using errcode = 'P0002'; end if;
  end if;

  delete from public.routine_exercises
  where routine_id = saved_id and position >= coalesce(cardinality(p_exercise_ids), 0);
  insert into public.routine_exercises (routine_id, exercise_id, position)
  select saved_id, exercise_id, exercise_position - 1
  from unnest(coalesce(p_exercise_ids, array[]::uuid[])) with ordinality as requested(exercise_id, exercise_position)
  on conflict (routine_id, position) do update set exercise_id = excluded.exercise_id;
  return saved_id;
end;
$function$;
revoke all on function public.save_routine(uuid, text, uuid[]) from public, anon;
grant execute on function public.save_routine(uuid, text, uuid[]) to authenticated;

create or replace function public.assign_routine(p_patient_profile_id uuid, p_routine_id uuid, p_scheduled_date date)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  current_provider uuid := auth.uid();
  routine_name text;
  assignment_id uuid;
begin
  if current_provider is null then raise exception 'Sign in before assigning a routine' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.provider_patient_profiles pp
    where pp.id = p_patient_profile_id and pp.provider_id = current_provider and pp.discharged_at is null
  ) then raise exception 'Active patient profile not found' using errcode = '42501'; end if;
  select r.name into routine_name from public.routines r
  where r.id = p_routine_id and r.provider_id = current_provider and r.archived_at is null for share;
  if routine_name is null then raise exception 'Active routine not found' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.routine_exercises re join public.exercises e on e.id = re.exercise_id
    where re.routine_id = p_routine_id and e.provider_id <> current_provider
  ) then raise exception 'Exercise not found in your catalog' using errcode = '42501'; end if;

  insert into public.routine_assignments (patient_profile_id, routine_id, scheduled_date, routine_name_snapshot)
  values (p_patient_profile_id, p_routine_id, p_scheduled_date, routine_name) returning id into assignment_id;
  insert into public.routine_assignment_exercises (routine_assignment_id, name, instructions, position)
  select assignment_id, e.name, e.instructions, re.position
  from public.routine_exercises re join public.exercises e on e.id = re.exercise_id
  where re.routine_id = p_routine_id order by re.position;
  return assignment_id;
end;
$function$;
revoke all on function public.assign_routine(uuid, uuid, date) from public, anon;
grant execute on function public.assign_routine(uuid, uuid, date) to authenticated;

comment on table public.exercises is 'Provider-owned reusable exercise definitions; names need not be unique.';
comment on table public.routine_exercises is 'Ordered memberships referencing reusable exercises. Repetition at different positions is allowed.';
comment on column public.routine_assignment_exercises.instructions is 'Instructions captured at assignment time; empty for historical assignments without recorded instructions.';

commit;
