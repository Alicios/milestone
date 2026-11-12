-- Populate the prototype's current patient relationships, Monday through today.
-- Stable IDs and occupied-date checks make repeat runs safe. Existing records are
-- preserved, except the explicitly identified older sample labels below.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select pg_advisory_xact_lock(hashtext('provider-current-week-prototype'));

create temporary table week_patients on commit drop as
select pp.*, row_number() over (partition by pp.provider_id order by p.name, pp.id)::integer patient_number
from public.provider_patient_profiles pp join public.patients p on p.id=pp.patient_id
where pp.discharged_at is null;

create temporary table previous_samples on commit drop as
select a.id from public.routine_assignments a join week_patients p on p.id=a.patient_profile_id
where a.patient_result_source='demo';

create temporary table original_week_records on commit drop as
select 'assignments' kind,a.id::text id,to_jsonb(a) payload from public.routine_assignments a
where a.id not in (select id from previous_samples)
union all select 'exercises',e.id::text,to_jsonb(e) from public.routine_assignment_exercises e
union all select 'feedback',f.routine_assignment_exercise_id::text,to_jsonb(f)
from public.routine_assignment_exercise_feedback f
where not exists(select 1 from public.routine_assignment_exercises e join previous_samples s on s.id=e.routine_assignment_id where e.id=f.routine_assignment_exercise_id)
union all select 'appointments',a.id::text,to_jsonb(a) from public.provider_appointments a;

update public.routine_assignments a set patient_result_source=null,
  patient_comment=case when patient_comment not like '[Provider Home demo v1]%' or patient_comment is null then patient_comment
    when patient_issue_severity='none' then 'Completed the routine. Exercises felt comfortable.'
    else 'Completed the routine with some difficulty during balance exercises.' end
where a.id in (select id from previous_samples);
update public.routine_assignment_exercise_feedback f
set explanation=regexp_replace(f.explanation,'^\[Simulated\]\s*','')
where f.explanation like '[Simulated]%' and exists (
  select 1 from public.routine_assignment_exercises e join previous_samples s on s.id=e.routine_assignment_id
  where e.id=f.routine_assignment_exercise_id);

do $seed$
declare
  anchor date := (now() at time zone 'America/Los_Angeles')::date;
  monday date := date_trunc('week',now() at time zone 'America/Los_Angeles')::date;
  patient record;
  template record;
  exercise record;
  care_date date;
  day_number integer;
  assignment_id uuid;
  exercise_id uuid;
  visit_id uuid;
  result_status text;
  issue boolean;
  in_progress boolean;
  feeling text;
  pain integer;
  visit_start timestamptz;
  found_slot boolean;
  slot_offset integer;
begin
  if anchor <> date '2026-11-12' then raise exception 'This seed targets the week ending November 12, 2026. Review dates before running on another day.'; end if;
  for patient in select * from week_patients order by provider_id,patient_number loop
    if not exists(select 1 from public.routines r where r.provider_id=patient.provider_id and r.archived_at is null and cardinality(r.exercise_list)>0) then
      raise exception 'No nonempty saved routines for provider %',patient.provider_id;
    end if;
    for day_number in 0..(anchor-monday) loop
      care_date := monday+day_number;
      if not exists(select 1 from public.routine_assignments a where a.patient_id=patient.patient_id and a.scheduled_date=care_date and a.status<>'cancelled') then
        select r.* into strict template from public.routines r
        where r.provider_id=patient.provider_id and r.archived_at is null and cardinality(r.exercise_list)>0
        order by case when r.name in ('Feet Fun','Lower Body','Upper Body','Bulletproof Back') then 0 else 1 end,r.name,r.id
        offset ((patient.patient_number+day_number-1) % (select count(*) from public.routines r where r.provider_id=patient.provider_id and r.archived_at is null and cardinality(r.exercise_list)>0)) limit 1;
        assignment_id := md5('current-week-routine:'||patient.id::text||':'||care_date::text)::uuid;
        result_status := case when care_date=anchor and patient.patient_number%3<>0 then 'scheduled'
          when day_number=2 and patient.patient_number=1 then 'missed' else 'completed' end;
        in_progress := care_date=anchor and patient.patient_number%3=2;
        issue := result_status='completed' and (patient.patient_number+day_number)%3=0;
        insert into public.routine_assignments(id,patient_profile_id,patient_id,routine_id,scheduled_date,status,
          routine_name_snapshot,patient_in_progress,patient_issue_severity,patient_comment,patient_result_source,created_at,updated_at)
        values(assignment_id,patient.id,patient.patient_id,template.id,care_date,result_status,template.name,in_progress,
          case when issue then 'noncritical' else 'none' end,
          case when issue then 'Some exercises felt uncomfortable. I would like to review my technique.'
            when result_status='completed' then 'Completed the routine. Movement is feeling easier.'
            when result_status='missed' then 'Unable to fit the routine in today.'
            when in_progress then 'Working through the exercises with short breaks.' else null end,null,
          (care_date+time '07:00') at time zone 'America/Los_Angeles',
          least(now(),(care_date+time '08:30') at time zone 'America/Los_Angeles'));
        for exercise in select item,ordinality-1 position from unnest(template.exercise_list) with ordinality as entries(item,ordinality) loop
          exercise_id := md5('current-week-exercise:'||assignment_id::text||':'||exercise.position::text)::uuid;
          insert into public.routine_assignment_exercises(id,routine_assignment_id,exercise_name_snapshot,position,
            sets_snapshot,reps_snapshot,timer_seconds_snapshot,notes_snapshot,exercise_id_snapshot)
          values(exercise_id,assignment_id,
            case when jsonb_typeof(exercise.item)='string' then exercise.item #>> '{}' else exercise.item->>'name' end,
            exercise.position,(exercise.item->>'sets')::integer,(exercise.item->>'reps')::integer,
            (exercise.item->>'duration_seconds')::integer,exercise.item->>'notes',(exercise.item->>'exercise_id')::uuid);
          if result_status='completed' or (in_progress and exercise.position=0) then
            feeling := case when issue and exercise.position=0 then 'difficult' when (patient.patient_number+day_number+exercise.position)%4=0 then 'neutral' else 'good' end;
            pain := case when feeling='difficult' then 6 when feeling='neutral' then 4 else 1+(patient.patient_number+day_number)%3 end;
            insert into public.routine_assignment_exercise_feedback(routine_assignment_exercise_id,pain_score,feeling,explanation,reported_at)
            values(exercise_id,pain,feeling,case when feeling='difficult' then 'I needed extra support and took a break. Please check my form.'
              when feeling='neutral' then 'A little stiff at first, but more comfortable after a few repetitions.' else null end,
              least(now()-interval '5 minutes',(care_date+time '08:30') at time zone 'America/Los_Angeles'));
          end if;
        end loop;
      end if;

      if not exists(select 1 from public.provider_appointments a where a.patient_profile_id=patient.id
        and (a.starts_at at time zone 'America/Los_Angeles')::date=care_date and a.status='scheduled') then
        visit_id := md5('current-week-appointment:'||patient.id::text||':'||care_date::text)::uuid;
        found_slot := false;
        for slot_offset in 0..15 loop
          visit_start := (care_date+case when care_date=anchor then time '14:00' else time '09:00' end
            +make_interval(mins => (patient.patient_number-1)*45+slot_offset*30)) at time zone 'America/Los_Angeles';
          if (visit_start at time zone 'America/Los_Angeles')::date<>care_date then exit; end if;
          if not exists(select 1 from public.provider_appointments a where a.provider_id=patient.provider_id and a.status='scheduled'
            and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(visit_start,visit_start+interval '30 minutes','[)')) then
            found_slot := true; exit;
          end if;
        end loop;
        if not found_slot then raise exception 'No appointment slot available for % on %',patient.id,care_date; end if;
        insert into public.provider_appointments(id,provider_id,patient_profile_id,starts_at,ends_at,location,status,created_at)
        values(visit_id,patient.provider_id,patient.id,visit_start,visit_start+interval '30 minutes',
          case when patient.patient_number%2=0 then 'Room 2' else 'Room 1' end,'scheduled',
          (monday+time '07:00') at time zone 'America/Los_Angeles');
      end if;
    end loop;
  end loop;
end;
$seed$;

do $verify$
begin
  if exists(with current_records as (
    select 'assignments' kind,a.id::text id,to_jsonb(a) payload from public.routine_assignments a
    union all select 'exercises',e.id::text,to_jsonb(e) from public.routine_assignment_exercises e
    union all select 'feedback',f.routine_assignment_exercise_id::text,to_jsonb(f) from public.routine_assignment_exercise_feedback f
    union all select 'appointments',a.id::text,to_jsonb(a) from public.provider_appointments a
  ) select 1 from original_week_records b left join current_records c using(kind,id) where c.payload is distinct from b.payload) then
    raise exception 'An unrelated existing record changed; rolling back';
  end if;
  if exists(select 1 from week_patients p cross join generate_series(date '2026-11-09',date '2026-11-12',interval '1 day') d
    where not exists(select 1 from public.routine_assignments a where a.patient_profile_id=p.id and a.scheduled_date=d::date and a.status<>'cancelled')
       or not exists(select 1 from public.provider_appointments a where a.patient_profile_id=p.id and (a.starts_at at time zone 'America/Los_Angeles')::date=d::date and a.status='scheduled')) then
    raise exception 'A patient is missing routine or appointment coverage';
  end if;
end;
$verify$;
commit;
