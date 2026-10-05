-- Persist provider routine templates, dated assignments, and optional follow-ups.
begin;

alter table public.provider_patient_profiles
  add column if not exists discharged_at timestamptz;

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index routines_provider_active_idx on public.routines (provider_id, name) where archived_at is null;

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  position integer not null check (position >= 0),
  unique (routine_id, position)
);

create table public.routine_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.provider_patient_profiles(id) on delete restrict,
  routine_id uuid not null references public.routines(id) on delete restrict,
  scheduled_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'missed', 'modified', 'cancelled')),
  routine_name_snapshot text not null check (btrim(routine_name_snapshot) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index routine_assignments_active_unique_idx
  on public.routine_assignments (patient_profile_id, routine_id, scheduled_date)
  where status <> 'cancelled';
create index routine_assignments_profile_date_idx on public.routine_assignments (patient_profile_id, scheduled_date);

create table public.routine_assignment_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_assignment_id uuid not null references public.routine_assignments(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  position integer not null check (position >= 0),
  unique (routine_assignment_id, position)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  routine_assignment_id uuid not null unique references public.routine_assignments(id) on delete restrict,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.routine_assignments enable row level security;
alter table public.routine_assignment_exercises enable row level security;
alter table public.appointments enable row level security;

revoke all on public.routines, public.routine_exercises, public.routine_assignments,
  public.routine_assignment_exercises, public.appointments from public, anon, authenticated;
grant select on public.routines, public.routine_exercises, public.routine_assignments,
  public.routine_assignment_exercises, public.appointments to authenticated;

create policy "Providers view own routines" on public.routines for select to authenticated
using (provider_id = (select auth.uid()));
create policy "Providers view own routine exercises" on public.routine_exercises for select to authenticated
using (exists (select 1 from public.routines r where r.id = routine_exercises.routine_id and r.provider_id = (select auth.uid())));
create policy "Providers view own routine assignments" on public.routine_assignments for select to authenticated
using (exists (select 1 from public.provider_patient_profiles pp where pp.id = routine_assignments.patient_profile_id and pp.provider_id = (select auth.uid())));
create policy "Providers view own assignment exercises" on public.routine_assignment_exercises for select to authenticated
using (exists (
  select 1 from public.routine_assignments ra
  join public.provider_patient_profiles pp on pp.id = ra.patient_profile_id
  where ra.id = routine_assignment_exercises.routine_assignment_id and pp.provider_id = (select auth.uid())
));
create policy "Providers view own routine follow ups" on public.appointments for select to authenticated
using (exists (
  select 1 from public.routine_assignments ra
  join public.provider_patient_profiles pp on pp.id = ra.patient_profile_id
  where ra.id = appointments.routine_assignment_id and pp.provider_id = (select auth.uid())
));

create or replace function public.save_routine(routine_id uuid, routine_name text, exercise_names text[])
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  current_provider uuid := auth.uid();
  saved_id uuid;
begin
  if current_provider is null then raise exception 'Sign in before saving a routine' using errcode = '42501'; end if;
  if nullif(btrim(routine_name), '') is null then raise exception 'Routine name is required' using errcode = '22023'; end if;
  if routine_id is null then
    insert into public.routines (provider_id, name) values (current_provider, btrim(routine_name)) returning id into saved_id;
  else
    update public.routines set name = btrim(routine_name), updated_at = now()
    where id = routine_id and provider_id = current_provider and archived_at is null returning id into saved_id;
    if saved_id is null then raise exception 'Routine not found' using errcode = 'P0002'; end if;
    delete from public.routine_exercises where routine_exercises.routine_id = saved_id;
  end if;
  insert into public.routine_exercises (routine_id, name, position)
  select saved_id, btrim(exercise_name), exercise_position - 1
  from unnest(coalesce(exercise_names, array[]::text[])) with ordinality as exercises(exercise_name, exercise_position)
  where nullif(btrim(exercise_name), '') is not null;
  return saved_id;
end;
$function$;

create or replace function public.archive_routine(routine_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  update public.routines set archived_at = now(), updated_at = now()
  where id = routine_id and provider_id = auth.uid() and archived_at is null;
  if not found then raise exception 'Routine not found' using errcode = 'P0002'; end if;
end;
$function$;

create or replace function public.assign_routine(patient_profile_id uuid, routine_id uuid, scheduled_date date)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  current_provider uuid := auth.uid();
  routine_name text;
  assignment_id uuid;
begin
  if current_provider is null then raise exception 'Sign in before assigning a routine' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.provider_patient_profiles pp
    where pp.id = patient_profile_id and pp.provider_id = current_provider and pp.discharged_at is null
  ) then raise exception 'Active patient profile not found' using errcode = '42501'; end if;
  select r.name into routine_name from public.routines r
  where r.id = routine_id and r.provider_id = current_provider and r.archived_at is null;
  if routine_name is null then raise exception 'Active routine not found' using errcode = 'P0002'; end if;
  insert into public.routine_assignments (patient_profile_id, routine_id, scheduled_date, routine_name_snapshot)
  values (patient_profile_id, routine_id, scheduled_date, routine_name) returning id into assignment_id;
  insert into public.routine_assignment_exercises (routine_assignment_id, name, position)
  select assignment_id, re.name, re.position from public.routine_exercises re
  where re.routine_id = routine_id order by re.position;
  return assignment_id;
end;
$function$;

create or replace function public.cancel_routine_assignment(routine_assignment_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  update public.routine_assignments ra set status = 'cancelled', updated_at = now()
  where ra.id = routine_assignment_id and ra.status <> 'cancelled'
    and exists (select 1 from public.provider_patient_profiles pp where pp.id = ra.patient_profile_id and pp.provider_id = auth.uid());
  if not found then raise exception 'Routine assignment not found' using errcode = 'P0002'; end if;
  update public.appointments set status = 'cancelled', updated_at = now()
  where appointments.routine_assignment_id = $1 and status = 'scheduled';
end;
$function$;

create or replace function public.schedule_routine_follow_up(routine_assignment_id uuid, scheduled_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare appointment_id uuid;
begin
  if scheduled_at is null then raise exception 'Follow-up date and time are required' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.routine_assignments ra
    join public.provider_patient_profiles pp on pp.id = ra.patient_profile_id
    where ra.id = routine_assignment_id and ra.status <> 'cancelled'
      and pp.provider_id = auth.uid() and pp.discharged_at is null
  ) then raise exception 'Active routine assignment not found' using errcode = '42501'; end if;
  insert into public.appointments (routine_assignment_id, scheduled_at) values (routine_assignment_id, scheduled_at)
  on conflict (routine_assignment_id) do update
    set scheduled_at = excluded.scheduled_at, status = 'scheduled', updated_at = now()
  returning id into appointment_id;
  return appointment_id;
end;
$function$;

create or replace function public.cancel_routine_follow_up(routine_assignment_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  update public.appointments a set status = 'cancelled', updated_at = now()
  where a.routine_assignment_id = $1 and a.status = 'scheduled'
    and exists (
      select 1 from public.routine_assignments ra
      join public.provider_patient_profiles pp on pp.id = ra.patient_profile_id
      where ra.id = a.routine_assignment_id and pp.provider_id = auth.uid()
    );
  if not found then raise exception 'Scheduled follow-up not found' using errcode = 'P0002'; end if;
end;
$function$;

create or replace function public.discharge_patient(patient_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  update public.provider_patient_profiles pp set discharged_at = now()
  where pp.provider_id = auth.uid() and pp.patient_id = $1 and pp.discharged_at is null;
  if not found then raise exception 'Active patient profile not found' using errcode = 'P0002'; end if;
end;
$function$;

revoke all on function public.save_routine(uuid, text, text[]) from public, anon;
revoke all on function public.archive_routine(uuid) from public, anon;
revoke all on function public.assign_routine(uuid, uuid, date) from public, anon;
revoke all on function public.cancel_routine_assignment(uuid) from public, anon;
revoke all on function public.schedule_routine_follow_up(uuid, timestamptz) from public, anon;
revoke all on function public.cancel_routine_follow_up(uuid) from public, anon;
grant execute on function public.save_routine(uuid, text, text[]) to authenticated;
grant execute on function public.archive_routine(uuid) to authenticated;
grant execute on function public.assign_routine(uuid, uuid, date) to authenticated;
grant execute on function public.cancel_routine_assignment(uuid) to authenticated;
grant execute on function public.schedule_routine_follow_up(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_routine_follow_up(uuid) to authenticated;

comment on table public.routines is 'Reusable provider-owned routine templates.';
comment on table public.routine_assignments is 'Dated prescriptions with immutable routine snapshots.';
comment on table public.appointments is 'Optional follow-up appointment for a single routine assignment.';
comment on column public.provider_patient_profiles.discharged_at is 'Soft-discharge timestamp; null means active care.';

commit;
