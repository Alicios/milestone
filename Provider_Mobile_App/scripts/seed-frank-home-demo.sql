-- Requested provider Home demo. Adds three new historical sessions only.
-- No existing prescriptions, patient results, or feedback are changed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

create temporary table home_demo_before on commit drop as
with demos as (select id from public.routine_assignments where patient_profile_id = '8da61f8b-6980-4c7f-95e7-266ef26b4f48'
  and patient_result_source = 'demo' and patient_comment like '[Provider Home demo v1]%'),
demo_exercises as (select id from public.routine_assignment_exercises where routine_assignment_id in (select id from demos))
select 'assignments' kind, count(*) records, md5(coalesce(string_agg(to_jsonb(a)::text, '' order by id), '')) fingerprint
from public.routine_assignments a where id not in (select id from demos)
union all
select 'exercises', count(*), md5(coalesce(string_agg(to_jsonb(e)::text, '' order by id), '')) from public.routine_assignment_exercises e where id not in (select id from demo_exercises)
union all
select 'feedback', count(*), md5(coalesce(string_agg(to_jsonb(f)::text, '' order by routine_assignment_exercise_id), '')) from public.routine_assignment_exercise_feedback f where routine_assignment_exercise_id not in (select id from demo_exercises);

do $seed$
declare
  relationship public.provider_patient_profiles%rowtype;
  template record;
  exercise record;
  assignment_id uuid;
  exercise_id uuid;
  session_date date;
  demo_count integer;
  session_number integer := 0;
  anchor date := (clock_timestamp() at time zone 'America/Los_Angeles')::date;
  marker constant text := '[Provider Home demo v1]';
begin
  select pp.* into strict relationship from public.provider_patient_profiles pp
  join public.patients p on p.id = pp.patient_id
  join public.providers pr on pr.id = pp.provider_id
  where pp.id = '8da61f8b-6980-4c7f-95e7-266ef26b4f48'
    and p.name = 'Frank Murgolo' and pr.name = 'Lebron James' and pp.discharged_at is null
  for update of pp;
  select count(*) into demo_count from public.routine_assignments
  where patient_profile_id = relationship.id and patient_result_source = 'demo' and patient_comment like marker || '%';
  if demo_count = 3 then return; end if;
  if demo_count <> 0 then raise exception 'Partial Home demo exists; review before continuing'; end if;
  if (select count(*) from public.routines where provider_id = relationship.provider_id
      and archived_at is null and name in ('Feet Fun','Lower Body','Upper Body') and cardinality(exercise_list) > 0) <> 3 then
    raise exception 'Expected three nonempty provider templates';
  end if;
  for template in select * from public.routines where provider_id = relationship.provider_id
    and archived_at is null and name in ('Feet Fun','Lower Body','Upper Body') order by name
  loop
    session_number := session_number + 1;
    select anchor - day_offset into session_date from generate_series(1,6) day_offset
    where not exists (select 1 from public.routine_assignments a
      where a.patient_id = relationship.patient_id and a.scheduled_date = anchor - day_offset and a.status <> 'cancelled')
    order by day_offset limit 1;
    if session_date is null then raise exception 'Not enough unoccupied historical dates for Home demo'; end if;
    insert into public.routine_assignments(patient_profile_id, patient_id, routine_id, scheduled_date, status,
      routine_name_snapshot, patient_in_progress, patient_issue_severity, patient_comment, patient_result_source)
    values (relationship.id, relationship.patient_id, template.id, session_date, 'completed', template.name, false,
      case when session_number = 1 then 'noncritical' else 'none' end,
      marker || case when session_number = 1 then ' Simulated completion with difficulty during Feet-Together Balance.' else ' Simulated completion; exercises felt comfortable.' end, 'demo')
    returning id into assignment_id;
    for exercise in select item, ordinality - 1 position from unnest(template.exercise_list) with ordinality as items(item, ordinality)
    loop
      insert into public.routine_assignment_exercises(routine_assignment_id, exercise_name_snapshot, position,
        sets_snapshot, reps_snapshot, timer_seconds_snapshot, notes_snapshot, exercise_id_snapshot)
      values (assignment_id, case when jsonb_typeof(exercise.item) = 'string' then exercise.item #>> '{}' else exercise.item->>'name' end,
        exercise.position, (exercise.item->>'sets')::integer, (exercise.item->>'reps')::integer,
        (exercise.item->>'duration_seconds')::integer, exercise.item->>'notes', (exercise.item->>'exercise_id')::uuid)
      returning id into exercise_id;
      insert into public.routine_assignment_exercise_feedback(routine_assignment_exercise_id, pain_score, feeling, explanation, reported_at)
      values (exercise_id, case when session_number = 1 and exercise.position = 1 then 6 else 2 end,
        case when session_number = 1 and exercise.position = 1 then 'difficult' else 'good' end,
        case when session_number = 1 and exercise.position = 1 then '[Simulated] I felt unsteady during Feet-Together Balance and needed to hold the chair. I would like to review this exercise.' else null end,
        (session_date + time '16:00') at time zone 'America/Los_Angeles');
    end loop;
  end loop;
end;
$seed$;

-- Check that every pre-existing record is byte-for-byte unchanged.
do $verify$
begin
  if exists (
    with demos as (select id from public.routine_assignments where patient_profile_id = '8da61f8b-6980-4c7f-95e7-266ef26b4f48'
      and patient_result_source = 'demo' and patient_comment like '[Provider Home demo v1]%'),
    demo_exercises as (select id from public.routine_assignment_exercises where routine_assignment_id in (select id from demos)),
    current_records as (
      select 'assignments' kind, count(*) records, md5(coalesce(string_agg(to_jsonb(a)::text, '' order by id), '')) fingerprint from public.routine_assignments a where id not in (select id from demos)
      union all select 'exercises', count(*), md5(coalesce(string_agg(to_jsonb(e)::text, '' order by id), '')) from public.routine_assignment_exercises e where id not in (select id from demo_exercises)
      union all select 'feedback', count(*), md5(coalesce(string_agg(to_jsonb(f)::text, '' order by routine_assignment_exercise_id), '')) from public.routine_assignment_exercise_feedback f where routine_assignment_exercise_id not in (select id from demo_exercises)
    ) select 1 from home_demo_before b join current_records c using (kind) where b.records <> c.records or b.fingerprint <> c.fingerprint
  ) then raise exception 'Existing records changed; rolling back Home demo'; end if;
end;
$verify$;
commit;
