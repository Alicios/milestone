-- SCRUM-43 expand phase: apply AFTER 20261006000200_document_public_schema.sql.
-- Retains routine_exercises.name and save_routine(uuid,text,text[]) for old clients.
-- Replaces the unpublished 20261005000100 draft; never apply both files.
begin;
set local lock_timeout = '10s';

-- Fail before changes when pointed at a pre-rename or already-expanded baseline.
do $preflight$
begin
  if to_regclass('public.exercises') is not null
    or to_regclass('public.routine_follow_ups') is null
    or not exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'providers' and column_name = 'professional_title')
    or not exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'routine_assignment_exercises' and column_name = 'exercise_name_snapshot')
    or not exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'routine_exercises' and column_name = 'name')
    or to_regprocedure('public.save_routine(uuid,text,text[])') is null
  then raise exception 'SCRUM-43 requires the October 6 baseline without an exercise catalog'; end if;
end;
$preflight$;

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
    foreign key (exercise_id) references public.exercises(id) on delete restrict;
create index routine_exercises_exercise_id_idx on public.routine_exercises (exercise_id);

-- Historical names/positions stay untouched. Old instructions were not recorded;
-- never infer them from today's catalog. Snapshots deliberately have no catalog FK.
alter table public.routine_assignment_exercises
  add column instructions text not null default '';

-- Ownership transfers are not a supported operation, including for unreferenced
-- definitions/empty routines. Immutability also closes races with membership writes.
create function public.prevent_exercise_provider_transfer()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  raise exception 'Provider ownership is immutable for exercises and routines' using errcode = '23514';
end;
$function$;
revoke all on function public.prevent_exercise_provider_transfer() from public, anon, authenticated;
create trigger exercise_provider_immutable
  before update of provider_id on public.exercises for each row
  when (old.provider_id is distinct from new.provider_id)
  execute function public.prevent_exercise_provider_transfer();
create trigger routine_provider_immutable
  before update of provider_id on public.routines for each row
  when (old.provider_id is distinct from new.provider_id)
  execute function public.prevent_exercise_provider_transfer();

-- Defense in depth for all membership writers, including privileged imports.
-- Browser writes remain RPC-only. Catalog names are authoritative.
create function public.enforce_routine_exercise_catalog()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  select e.name into new.name
  from public.exercises e join public.routines r on r.provider_id = e.provider_id
  where e.id = new.exercise_id and r.id = new.routine_id;
  if not found then
    raise exception 'Exercise and routine must belong to the same provider' using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function public.enforce_routine_exercise_catalog() from public, anon, authenticated;
create trigger routine_exercise_catalog_guard
before insert or update of routine_id, exercise_id, name on public.routine_exercises
for each row execute function public.enforce_routine_exercise_catalog();

create function public.sync_exercise_membership_names()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  update public.routine_exercises set name = new.name where exercise_id = new.id;
  return new;
end;
$function$;
revoke all on function public.sync_exercise_membership_names() from public, anon, authenticated;
create trigger exercise_name_compatibility
  after update of name on public.exercises for each row
  when (old.name is distinct from new.name)
  execute function public.sync_exercise_membership_names();

create function public.save_exercise(p_exercise_id uuid, p_name text, p_instructions text)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  current_provider uuid := auth.uid();
  saved_id uuid;
begin
  if current_provider is null then raise exception 'Sign in before saving an exercise' using errcode = '42501'; end if;
  -- Serialize catalog/routine writes and assignments for this provider. This
  -- keeps mirrored names and snapshot contents consistent during concurrent RPCs.
  perform 1 from public.providers where id = current_provider for update;
  if not found then raise exception 'Provider not found' using errcode = '42501'; end if;
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

-- A distinct RPC name avoids PostgREST overload ambiguity for old clients.
create function public.save_routine_with_exercises(p_routine_id uuid, p_routine_name text, p_exercise_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  current_provider uuid := auth.uid();
  saved_id uuid;
begin
  if current_provider is null then raise exception 'Sign in before saving a routine' using errcode = '42501'; end if;
  -- Serialize catalog/routine writes and assignments for this provider. This
  -- keeps mirrored names and snapshot contents consistent during concurrent RPCs.
  perform 1 from public.providers where id = current_provider for update;
  if not found then raise exception 'Provider not found' using errcode = '42501'; end if;
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
  insert into public.routine_exercises (routine_id, exercise_id, name, position)
  select saved_id, e.id, e.name, requested.exercise_position - 1
  from unnest(coalesce(p_exercise_ids, array[]::uuid[])) with ordinality as requested(exercise_id, exercise_position)
  join public.exercises e on e.id = requested.exercise_id
  on conflict (routine_id, position) do update set exercise_id = excluded.exercise_id, name = excluded.name;
  return saved_id;
end;
$function$;
revoke all on function public.save_routine_with_exercises(uuid, text, uuid[]) from public, anon;
grant execute on function public.save_routine_with_exercises(uuid, text, uuid[]) to authenticated;

-- Transitional legacy API: create new definitions, or rename an existing
-- routine ONLY when its ordered exercise names are unchanged. Never infer IDs.
create or replace function public.save_routine(p_routine_id uuid, p_routine_name text, p_exercise_names text[])
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  current_provider uuid := auth.uid();
  saved_id uuid;
  catalog_id uuid;
  requested record;
  existing_names text[];
  submitted_names text[];
begin
  if current_provider is null then raise exception 'Sign in before saving a routine' using errcode = '42501'; end if;
  perform 1 from public.providers where id = current_provider for update;
  if not found then raise exception 'Provider not found' using errcode = '42501'; end if;
  if nullif(btrim(p_routine_name), '') is null then raise exception 'Routine name is required' using errcode = '22023'; end if;

  if p_routine_id is not null then
    select id into saved_id from public.routines
    where id = p_routine_id and provider_id = current_provider and archived_at is null for update;
    if saved_id is null then raise exception 'Routine not found' using errcode = 'P0002'; end if;
    select coalesce(array_agg(re.name order by re.position), array[]::text[])
      into existing_names from public.routine_exercises re where re.routine_id = saved_id;
    select coalesce(array_agg(btrim(exercise_name) order by ordinality), array[]::text[])
      into submitted_names
      from unnest(coalesce(p_exercise_names, array[]::text[])) with ordinality as input(exercise_name, ordinality)
      where nullif(btrim(exercise_name), '') is not null;
    if submitted_names is distinct from existing_names then
      raise exception 'Legacy exercise-list changes are not supported. Use the catalog-aware routine editor.'
        using errcode = '55000';
    end if;
    -- Validation precedes every write. Equal-name entries retain their exact
    -- IDs and instructions; even gaps in stored positions remain untouched.
    update public.routines set name = btrim(p_routine_name), updated_at = now() where id = saved_id;
    return saved_id;
  end if;

  insert into public.routines (provider_id, name) values (current_provider, btrim(p_routine_name)) returning id into saved_id;
  for requested in
    select btrim(exercise_name) as name, (ordinality - 1)::integer as position
    from unnest(coalesce(p_exercise_names, array[]::text[])) with ordinality as input(exercise_name, ordinality)
    where nullif(btrim(exercise_name), '') is not null
  loop
    insert into public.exercises (provider_id, name) values (current_provider, requested.name)
      returning id into catalog_id;
    insert into public.routine_exercises (routine_id, exercise_id, name, position)
      values (saved_id, catalog_id, requested.name, requested.position);
  end loop;
  return saved_id;
end;
$function$;
revoke all on function public.save_routine(uuid, text, text[]) from public, anon;
grant execute on function public.save_routine(uuid, text, text[]) to authenticated;

create or replace function public.assign_routine(p_patient_profile_id uuid, p_routine_id uuid, p_scheduled_date date)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  current_provider uuid := auth.uid();
  routine_name text;
  assignment_id uuid;
begin
  if current_provider is null then raise exception 'Sign in before assigning a routine' using errcode = '42501'; end if;
  -- Serialize catalog/routine writes and assignments for this provider. This
  -- keeps mirrored names and snapshot contents consistent during concurrent RPCs.
  perform 1 from public.providers where id = current_provider for update;
  if not found then raise exception 'Provider not found' using errcode = '42501'; end if;
  perform 1 from public.provider_patient_profiles pp
    where pp.id = p_patient_profile_id and pp.provider_id = current_provider and pp.discharged_at is null for share;
  if not found then raise exception 'Active patient profile not found' using errcode = '42501'; end if;
  select r.name into routine_name from public.routines r
  where r.id = p_routine_id and r.provider_id = current_provider and r.archived_at is null for share;
  if routine_name is null then raise exception 'Active routine not found' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.routine_exercises re join public.exercises e on e.id = re.exercise_id
    where re.routine_id = p_routine_id and e.provider_id <> current_provider
  ) then raise exception 'Exercise not found in your catalog' using errcode = '42501'; end if;

  insert into public.routine_assignments (patient_profile_id, routine_id, scheduled_date, routine_name_snapshot)
  values (p_patient_profile_id, p_routine_id, p_scheduled_date, routine_name) returning id into assignment_id;
  insert into public.routine_assignment_exercises (routine_assignment_id, exercise_name_snapshot, instructions, position)
  select assignment_id, e.name, e.instructions, re.position
  from public.routine_exercises re join public.exercises e on e.id = re.exercise_id
  where re.routine_id = p_routine_id order by re.position;
  return assignment_id;
end;
$function$;
revoke all on function public.assign_routine(uuid, uuid, date) from public, anon;
grant execute on function public.assign_routine(uuid, uuid, date) to authenticated;

comment on table public.exercises is 'Provider-owned reusable exercise definitions; names need not be unique.';
comment on column public.exercises.id is 'Stable reusable exercise UUID, independent of routine membership IDs.';
comment on column public.exercises.provider_id is 'Owning provider Auth user ID; no cross-provider reuse.';
comment on column public.exercises.name is 'Current exercise name; equal names do not imply identity.';
comment on column public.exercises.instructions is 'Reusable movement instructions; empty when not recorded.';
comment on column public.exercises.created_at is 'Creation timestamp of the catalog record, not the historical membership.';
comment on column public.exercises.updated_at is 'Last catalog update through save_exercise.';
comment on column public.routine_exercises.exercise_id is 'Required reusable exercise reference owned by the routine provider.';
comment on column public.routine_exercises.name is 'Compatibility mirror of exercises.name maintained by triggers; retained for legacy readers.';
comment on table public.routine_assignment_exercises is 'Independent ordered name and instruction snapshots captured at assignment time.';
comment on table public.routine_exercises is 'Ordered memberships referencing reusable exercises. Repetition at different positions is allowed.';
comment on column public.routine_assignment_exercises.instructions is 'Instructions captured at assignment time; empty for historical assignments without recorded instructions.';

notify pgrst, 'reload schema';
commit;
