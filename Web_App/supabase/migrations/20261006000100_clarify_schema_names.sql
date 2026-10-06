-- Clarify names that otherwise imply authorization roles, mutable exercise
-- content, or a general-purpose appointment calendar.
--
-- This migration only renames existing objects. It preserves every row, UUID,
-- relationship, grant, RLS policy, and public RPC signature.
begin;

alter table public.appointments rename to routine_follow_ups;
alter table public.routine_follow_ups
  rename constraint appointments_pkey to routine_follow_ups_pkey;
alter table public.routine_follow_ups
  rename constraint appointments_routine_assignment_id_key
  to routine_follow_ups_routine_assignment_id_key;
alter table public.routine_follow_ups
  rename constraint appointments_routine_assignment_id_fkey
  to routine_follow_ups_routine_assignment_id_fkey;
alter table public.routine_follow_ups
  rename constraint appointments_status_check
  to routine_follow_ups_status_check;

alter table public.providers rename column role to professional_title;

alter table public.routine_assignment_exercises
  rename column name to exercise_name_snapshot;
alter table public.routine_assignment_exercises
  rename constraint routine_assignment_exercises_name_check
  to routine_assignment_exercises_exercise_name_snapshot_check;

-- The auth trigger keeps accepting legacy `role` metadata while new clients
-- transition to the more precise `professional_title` key.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  full_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'New user'
  );
  provider_title text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'professional_title'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'role'), ''),
    'Physical Therapist'
  );
begin
  insert into public.providers (
    id, name, professional_title, initials, contact_email, specialty
  )
  values (
    new.id,
    full_name,
    provider_title,
    upper(left(full_name, 1)) ||
      upper(coalesce(nullif(left(split_part(full_name, ' ', 2), 1), ''), '')),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'specialty', '')
  );
  return new;
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
  assignment_id uuid;
begin
  if current_provider is null then
    raise exception 'Sign in before assigning a routine' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.provider_patient_profiles pp
    where pp.id = p_patient_profile_id
      and pp.provider_id = current_provider
      and pp.discharged_at is null
  ) then
    raise exception 'Active patient profile not found' using errcode = '42501';
  end if;
  select r.name
  into routine_name
  from public.routines r
  where r.id = p_routine_id
    and r.provider_id = current_provider
    and r.archived_at is null;
  if routine_name is null then
    raise exception 'Active routine not found' using errcode = 'P0002';
  end if;
  insert into public.routine_assignments (
    patient_profile_id, routine_id, scheduled_date, routine_name_snapshot
  )
  values (p_patient_profile_id, p_routine_id, p_scheduled_date, routine_name)
  returning id into assignment_id;
  insert into public.routine_assignment_exercises (
    routine_assignment_id, exercise_name_snapshot, position
  )
  select assignment_id, re.name, re.position
  from public.routine_exercises re
  where re.routine_id = p_routine_id
  order by re.position;
  return assignment_id;
end;
$function$;

create or replace function public.cancel_routine_assignment(
  p_routine_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.routine_assignments ra
  set status = 'cancelled', updated_at = now()
  where ra.id = p_routine_assignment_id
    and ra.status <> 'cancelled'
    and exists (
      select 1
      from public.provider_patient_profiles pp
      where pp.id = ra.patient_profile_id
        and pp.provider_id = auth.uid()
    );
  if not found then
    raise exception 'Routine assignment not found' using errcode = 'P0002';
  end if;
  update public.routine_follow_ups
  set status = 'cancelled', updated_at = now()
  where routine_assignment_id = p_routine_assignment_id
    and status = 'scheduled';
end;
$function$;

create or replace function public.schedule_routine_follow_up(
  p_routine_assignment_id uuid,
  p_scheduled_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  follow_up_id uuid;
begin
  if p_scheduled_at is null then
    raise exception 'Follow-up date and time are required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.routine_assignments ra
    join public.provider_patient_profiles pp on pp.id = ra.patient_profile_id
    where ra.id = p_routine_assignment_id
      and ra.status <> 'cancelled'
      and pp.provider_id = auth.uid()
      and pp.discharged_at is null
  ) then
    raise exception 'Active routine assignment not found' using errcode = '42501';
  end if;
  insert into public.routine_follow_ups (routine_assignment_id, scheduled_at)
  values (p_routine_assignment_id, p_scheduled_at)
  on conflict (routine_assignment_id) do update
    set scheduled_at = excluded.scheduled_at,
        status = 'scheduled',
        updated_at = now()
  returning id into follow_up_id;
  return follow_up_id;
end;
$function$;

create or replace function public.cancel_routine_follow_up(
  p_routine_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.routine_follow_ups follow_up
  set status = 'cancelled', updated_at = now()
  where follow_up.routine_assignment_id = p_routine_assignment_id
    and follow_up.status = 'scheduled'
    and exists (
      select 1
      from public.routine_assignments ra
      join public.provider_patient_profiles pp on pp.id = ra.patient_profile_id
      where ra.id = follow_up.routine_assignment_id
        and pp.provider_id = auth.uid()
    );
  if not found then
    raise exception 'Scheduled follow-up not found' using errcode = 'P0002';
  end if;
end;
$function$;

create or replace function public.complete_routine_follow_up(
  p_routine_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.routine_follow_ups follow_up
  set status = 'completed', updated_at = now()
  where follow_up.routine_assignment_id = p_routine_assignment_id
    and follow_up.status = 'scheduled'
    and exists (
      select 1
      from public.routine_assignments ra
      join public.provider_patient_profiles pp on pp.id = ra.patient_profile_id
      where ra.id = follow_up.routine_assignment_id
        and pp.provider_id = auth.uid()
    );
  if not found then
    raise exception 'Scheduled follow-up not found' using errcode = 'P0002';
  end if;
end;
$function$;

commit;
