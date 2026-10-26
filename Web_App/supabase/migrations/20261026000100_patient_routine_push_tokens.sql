-- PROPOSED, NOT DEPLOYED. Additive patient push-token and routine-read APIs.
-- Keep the existing patient table-access boundary intact.
begin;

do $approval$
declare
  hosted_execution_approved constant boolean := false;
begin
  if not hosted_execution_approved then
    raise exception 'Patient push migration requires separate deployment review and approval';
  end if;
end;
$approval$;

create table public.patient_push_tokens (
  expo_push_token text primary key check (
    (expo_push_token like 'ExponentPushToken[%' or expo_push_token like 'ExpoPushToken[%')
    and expo_push_token like '%]'
  ),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

alter table public.patient_push_tokens enable row level security;
revoke all on public.patient_push_tokens from public, anon;
grant select, insert, update, delete on public.patient_push_tokens to authenticated;

create policy "Patients manage their own push tokens"
on public.patient_push_tokens
for all to authenticated
using (auth_user_id = (select auth.uid()))
with check (auth_user_id = (select auth.uid()));

create or replace function public.get_my_current_routine(p_scheduled_date date)
returns table (
  assignment_id uuid,
  routine_id uuid,
  patient_profile_id uuid,
  scheduled_date date,
  status text,
  routine_name text,
  description text,
  exercise_list jsonb
)
language sql
security definer
stable
set search_path = ''
as $function$
  select
    ra.id,
    r.id,
    ra.patient_profile_id,
    ra.scheduled_date,
    ra.status,
    r.name,
    r.description,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'exercise_id', e.id,
          'name', e.name,
          'description', e.desc,
          'sets', item.value->'sets',
          'reps', item.value->'reps',
          'timer', coalesce(item.value->'duration_seconds', item.value->'timer'),
          'notes', item.value->'notes'
        ) order by item.ordinality
      )
      from jsonb_array_elements(coalesce(to_jsonb(r.exercise_list), '[]'::jsonb))
        with ordinality as item(value, ordinality)
      left join public.exercises e on e.id::text = item.value->>'exercise_id'
    ), '[]'::jsonb)
  from public.routine_assignments ra
  join public.provider_patient_profiles pp on pp.id = ra.patient_profile_id
  join public.patients p on p.id = pp.patient_id
  join public.routines r on r.id = ra.routine_id
  where p.auth_user_id = (select auth.uid())
    and ra.scheduled_date = p_scheduled_date
    and ra.status in ('scheduled', 'in progress')
  order by ra.scheduled_date, ra.created_at
  limit 1;
$function$;

revoke all on function public.get_my_current_routine(date) from public, anon;
grant execute on function public.get_my_current_routine(date) to authenticated;

create index patient_push_tokens_auth_user_id_idx
  on public.patient_push_tokens(auth_user_id);

comment on table public.patient_push_tokens is
  'Expo push tokens keyed to a patient Supabase Auth account. Push content must not include patient or routine details.';

commit;
