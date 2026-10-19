-- Adds the patient-facing (Mobile_App) half of role-based access: a nullable
-- link from a shared patient identity to its own Supabase Auth account, plus
-- a security-definer RPC surface for everything a signed-in patient may read
-- or write. Patients are never granted a direct RLS policy on any table in
-- this migration (see note below). Provider-side tables, grants and policies
-- are entirely unchanged.
begin;

-- Most patients have no account yet; only the provider-invited flow in
-- scripts/invite-patient.mjs sets this. One patient identity maps to at most
-- one Auth user, and vice versa.
alter table public.patients
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

comment on column public.patients.auth_user_id is
  'Supabase Auth user backing this patient''s own login (Mobile_App), set by scripts/invite-patient.mjs. Null means the patient has no account yet.';

-- Patients deliberately get zero direct table-level RLS access, even to rows
-- that are "theirs" (unlike providers, who read provider_patient_profiles,
-- routine_assignments, etc. directly). Every patient-facing read below is a
-- security-definer function that filters by patients.auth_user_id = auth.uid()
-- internally. This is what keeps provider-only columns — specifically
-- provider_patient_profiles.clinical_notes — unreachable by a patient even
-- though both roles share the `authenticated` Postgres role: a raw RLS SELECT
-- policy can restrict which rows a patient sees, but not which columns, so
-- granting any direct table policy here would also hand over clinical_notes.

create or replace function public.get_my_patient_profile()
returns table (
  id uuid,
  name text,
  email text,
  phone text,
  primary_concern text,
  treatment_focus text,
  start_of_care date,
  care_status text
)
language sql
security definer
stable
set search_path = ''
as $function$
  select p.id, p.name, p.email, p.phone, p.primary_concern, p.treatment_focus, p.start_of_care, p.care_status
  from public.patients p
  where p.auth_user_id = auth.uid();
$function$;

create or replace function public.get_my_care_relationships()
returns table (
  patient_profile_id uuid,
  provider_id uuid,
  provider_name text,
  provider_professional_title text,
  discharged_at timestamptz,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $function$
  select pp.id, pp.provider_id, pr.name, pr.professional_title, pp.discharged_at, pp.created_at
  from public.provider_patient_profiles pp
  join public.patients p on p.id = pp.patient_id
  join public.providers pr on pr.id = pp.provider_id
  where p.auth_user_id = auth.uid();
$function$;

create or replace function public.get_my_routine_assignments(p_patient_profile_id uuid)
returns table (
  id uuid,
  routine_name_snapshot text,
  scheduled_date date,
  status text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $function$
  select ra.id, ra.routine_name_snapshot, ra.scheduled_date, ra.status, ra.created_at
  from public.routine_assignments ra
  join public.provider_patient_profiles pp on pp.id = ra.patient_profile_id
  join public.patients p on p.id = pp.patient_id
  where pp.id = p_patient_profile_id
    and p.auth_user_id = auth.uid();
$function$;

create or replace function public.get_my_routine_assignment_exercises(p_routine_assignment_id uuid)
returns table (
  id uuid,
  exercise_name_snapshot text,
  position integer
)
language sql
security definer
stable
set search_path = ''
as $function$
  select rae.id, rae.exercise_name_snapshot, rae.position
  from public.routine_assignment_exercises rae
  join public.routine_assignments ra on ra.id = rae.routine_assignment_id
  join public.provider_patient_profiles pp on pp.id = ra.patient_profile_id
  join public.patients p on p.id = pp.patient_id
  where rae.routine_assignment_id = p_routine_assignment_id
    and p.auth_user_id = auth.uid()
  order by rae.position;
$function$;

create or replace function public.get_my_routine_follow_ups(p_patient_profile_id uuid)
returns table (
  id uuid,
  routine_assignment_id uuid,
  scheduled_at timestamptz,
  status text
)
language sql
security definer
stable
set search_path = ''
as $function$
  select rfu.id, rfu.routine_assignment_id, rfu.scheduled_at, rfu.status
  from public.routine_follow_ups rfu
  join public.routine_assignments ra on ra.id = rfu.routine_assignment_id
  join public.provider_patient_profiles pp on pp.id = ra.patient_profile_id
  join public.patients p on p.id = pp.patient_id
  where pp.id = p_patient_profile_id
    and p.auth_user_id = auth.uid();
$function$;

create or replace function public.get_my_messages(p_patient_profile_id uuid)
returns table (
  id uuid,
  sender_kind text,
  body text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $function$
  select m.id, m.sender_kind, m.body, m.created_at
  from public.messages m
  join public.provider_patient_profiles pp on pp.id = m.patient_profile_id
  join public.patients p on p.id = pp.patient_id
  where pp.id = p_patient_profile_id
    and p.auth_user_id = auth.uid()
  order by m.created_at, m.id;
$function$;

-- The only write a patient gets in this round (per product decision: read-only
-- except messages). Mirrors the shape of the existing provider message insert
-- policy in 20261007000500_messages.sql, just for the patient side.
create or replace function public.send_my_message(p_patient_profile_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_message_id uuid;
begin
  if not exists (
    select 1 from public.provider_patient_profiles pp
    join public.patients p on p.id = pp.patient_id
    where pp.id = p_patient_profile_id and p.auth_user_id = auth.uid()
  ) then
    raise exception 'Care relationship not found' using errcode = '42501';
  end if;
  insert into public.messages (patient_profile_id, sender_kind, body)
  values (p_patient_profile_id, 'patient', p_body)
  returning id into new_message_id;
  return new_message_id;
end;
$function$;

-- Each of the three thread-state functions below double-checks ownership the
-- same way the existing provider message_thread_state policies do in
-- 20261007000500_messages.sql: participant_user_id = auth.uid() AND the
-- relationship itself still resolves to this caller's own identity.
create or replace function public.get_my_message_thread_state(p_patient_profile_id uuid)
returns table (
  last_read_at timestamptz,
  starred boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  select mts.last_read_at, mts.starred
  from public.message_thread_state mts
  where mts.patient_profile_id = p_patient_profile_id
    and mts.participant_user_id = auth.uid()
    and exists (
      select 1 from public.provider_patient_profiles pp
      join public.patients p on p.id = pp.patient_id
      where pp.id = p_patient_profile_id and p.auth_user_id = auth.uid()
    );
$function$;

create or replace function public.mark_my_messages_read(p_patient_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.message_thread_state mts
  set last_read_at = now()
  where mts.patient_profile_id = p_patient_profile_id
    and mts.participant_user_id = auth.uid()
    and exists (
      select 1 from public.provider_patient_profiles pp
      join public.patients p on p.id = pp.patient_id
      where pp.id = p_patient_profile_id and p.auth_user_id = auth.uid()
    );
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
end;
$function$;

create or replace function public.set_my_message_thread_starred(p_patient_profile_id uuid, p_starred boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.message_thread_state mts
  set starred = p_starred
  where mts.patient_profile_id = p_patient_profile_id
    and mts.participant_user_id = auth.uid()
    and exists (
      select 1 from public.provider_patient_profiles pp
      join public.patients p on p.id = pp.patient_id
      where pp.id = p_patient_profile_id and p.auth_user_id = auth.uid()
    );
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function
  public.get_my_patient_profile(),
  public.get_my_care_relationships(),
  public.get_my_routine_assignments(uuid),
  public.get_my_routine_assignment_exercises(uuid),
  public.get_my_routine_follow_ups(uuid),
  public.get_my_messages(uuid),
  public.send_my_message(uuid, text),
  public.get_my_message_thread_state(uuid),
  public.mark_my_messages_read(uuid),
  public.set_my_message_thread_starred(uuid, boolean)
from public, anon;

grant execute on function
  public.get_my_patient_profile(),
  public.get_my_care_relationships(),
  public.get_my_routine_assignments(uuid),
  public.get_my_routine_assignment_exercises(uuid),
  public.get_my_routine_follow_ups(uuid),
  public.get_my_messages(uuid),
  public.send_my_message(uuid, text),
  public.get_my_message_thread_state(uuid),
  public.mark_my_messages_read(uuid),
  public.set_my_message_thread_starred(uuid, boolean)
to authenticated;

-- A patient's thread-state row needs auth_user_id to exist (participant_user_id
-- is not null), so it can only be created once they have an account. Two paths
-- create it, covering both orderings of "invite" vs "relationship created":

-- 1) Relationship created after the patient already has an account.
create or replace function public.create_provider_message_thread_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  patient_auth_user_id uuid;
begin
  insert into public.message_thread_state (patient_profile_id, participant_user_id)
  values (new.id, new.provider_id);

  select p.auth_user_id into patient_auth_user_id
  from public.patients p where p.id = new.patient_id;

  if patient_auth_user_id is not null then
    insert into public.message_thread_state (patient_profile_id, participant_user_id)
    values (new.id, patient_auth_user_id)
    on conflict do nothing;
  end if;

  return new;
end;
$function$;

-- 2) Patient invited (auth_user_id set) after relationships already exist:
-- backfill thread state for every existing relationship.
create or replace function public.backfill_patient_message_thread_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.auth_user_id is not null and new.auth_user_id is distinct from old.auth_user_id then
    insert into public.message_thread_state (patient_profile_id, participant_user_id)
    select pp.id, new.auth_user_id
    from public.provider_patient_profiles pp
    where pp.patient_id = new.id
    on conflict do nothing;
  end if;
  return new;
end;
$function$;

revoke execute on function public.backfill_patient_message_thread_state() from public, anon, authenticated;

drop trigger if exists backfill_patient_message_thread_state on public.patients;
create trigger backfill_patient_message_thread_state
after update of auth_user_id on public.patients
for each row execute function public.backfill_patient_message_thread_state();

comment on function public.get_my_patient_profile() is
  'Patient-facing read: the calling patient''s own shared identity row.';
comment on function public.get_my_care_relationships() is
  'Patient-facing read: the calling patient''s provider relationships. Excludes clinical_notes by construction.';

commit;
