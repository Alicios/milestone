-- Six calendar months, computed in UTC (including month-end clamping).
alter table public.provider_patient_profiles add column retention_ends_at timestamptz
  generated always as (((discharged_at at time zone 'UTC') + interval '6 months') at time zone 'UTC') stored;
create index provider_patient_profiles_retention_idx on public.provider_patient_profiles(retention_ends_at)
  where discharged_at is not null;

create or replace function public.reinstate_patient(patient_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.provider_patient_profiles pp set discharged_at = null
    where pp.provider_id = auth.uid() and pp.patient_id = $1
      and pp.discharged_at is not null and pp.retention_ends_at > now();
  if not found then
    -- Idempotent retry after a lost response; never recreate an expired profile.
    if exists (select 1 from public.provider_patient_profiles pp
      where pp.provider_id = auth.uid() and pp.patient_id = $1 and pp.discharged_at is null) then return; end if;
    raise exception 'Retained discharged patient profile not found' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.reinstate_patient(uuid) from public, anon;
grant execute on function public.reinstate_patient(uuid) to authenticated;

-- Browsers cannot access profiles past the deadline, even between cleanup runs.
alter policy "Providers view own patient assignments" on public.provider_patient_profiles
  using (provider_id = (select auth.uid()) and (retention_ends_at is null or retention_ends_at > now()));

-- Keep snapshots immutable during care. Only the database owner may delete
-- snapshots/receipts belonging to an expired relationship during retention cleanup.
create or replace function milestone_scheduling.immutable_snapshot()
returns trigger language plpgsql set search_path = '' as $$
declare profile_id uuid;
begin
  if TG_OP = 'DELETE' and current_user = 'postgres' then
    if TG_TABLE_NAME = 'routine_schedule_requests' then profile_id := old.patient_profile_id;
    else select patient_profile_id into profile_id from public.routine_assignments where id = old.routine_assignment_id;
    end if;
    if exists (select 1 from public.provider_patient_profiles where id = profile_id and retention_ends_at <= now()) then
      return old;
    end if;
  end if;
  raise exception 'Assigned prescription snapshots are immutable; cancel the assignment to replace it' using errcode = '23514';
end $$;

create or replace function milestone_profiles.purge_expired_patient_profiles()
returns integer language plpgsql security definer set search_path = '' as $$
declare candidate record; expired record; removed integer := 0;
begin
  -- Match onboarding's operation -> relationship -> patient lock order.
  for candidate in select distinct patient_id from public.provider_patient_profiles
    where retention_ends_at <= now() order by patient_id loop
    perform 1 from milestone_profiles.patient_onboarding_operations where patient_id = candidate.patient_id for update;
    perform 1 from public.provider_patient_profiles where patient_id = candidate.patient_id order by id for update;
    perform 1 from public.patients where id = candidate.patient_id for update;
    for expired in select id from public.provider_patient_profiles
      where patient_id = candidate.patient_id and retention_ends_at <= now() loop
      delete from public.routine_assignment_exercise_feedback f using public.routine_assignment_exercises e, public.routine_assignments a
        where f.routine_assignment_exercise_id = e.id and e.routine_assignment_id = a.id and a.patient_profile_id = expired.id;
      delete from public.routine_assignment_exercises e using public.routine_assignments a
        where e.routine_assignment_id = a.id and a.patient_profile_id = expired.id;
      delete from public.routine_follow_ups f using public.routine_assignments a
        where f.routine_assignment_id = a.id and a.patient_profile_id = expired.id;
      delete from public.routine_schedule_requests where patient_profile_id = expired.id;
      delete from public.routine_assignments where patient_profile_id = expired.id;
      delete from public.messages where patient_profile_id = expired.id;
      delete from public.provider_patient_profiles where id = expired.id;
      removed := removed + 1;
    end loop;
    -- Shared demographics survive while ANY other provider relationship remains.
    -- Auth identity is separate from the clinical profile and is not deleted here.
    delete from public.patients p where p.id = candidate.patient_id
      and not exists (select 1 from public.provider_patient_profiles pp where pp.patient_id = p.id);
  end loop;
  return removed;
end $$;
revoke all on function milestone_profiles.purge_expired_patient_profiles() from public, anon, authenticated, service_role;

create extension if not exists pg_cron;
select cron.schedule('purge-expired-patient-profiles', '15 8 * * *',
  'select milestone_profiles.purge_expired_patient_profiles()');
