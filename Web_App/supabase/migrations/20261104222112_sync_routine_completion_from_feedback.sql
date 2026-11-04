set local lock_timeout = '5s';

create or replace function milestone_exercise_feedback.save_feedback(
  p_routine_assignment_exercise_id uuid, p_pain_score integer, p_feeling text, p_explanation text
) returns setof public.routine_assignment_exercise_feedback
language plpgsql security definer set search_path = '' as $function$
declare
  patient uuid; profile uuid; assignment uuid; assignment_date date; assignment_status text;
  reason text;
begin
  if auth.uid() is null then raise exception 'Sign in to save feedback' using errcode = '42501'; end if;
  if p_pain_score is null or p_pain_score not between 1 and 10
    or p_feeling is null or p_feeling not in ('good', 'neutral', 'difficult') then
    raise exception 'Choose pain from 1 to 10 and Good, Neutral, or Difficult' using errcode = '22023';
  end if;
  reason := case when p_feeling = 'good' then null else nullif(btrim(p_explanation), '') end;
  if (p_feeling <> 'good' and reason is null) or char_length(reason) > 4000 then
    raise exception 'Explain how the exercise felt using 1 to 4000 characters' using errcode = '22023';
  end if;

  select a.patient_id, a.patient_profile_id, a.id into patient, profile, assignment
    from public.routine_assignment_exercises e
    join public.routine_assignments a on a.id = e.routine_assignment_id
    join public.patients p on p.id = a.patient_id
    where e.id = p_routine_assignment_exercise_id and p.auth_user_id = auth.uid();
  if patient is null then raise exception 'Assigned exercise not found' using errcode = '42501'; end if;

  -- Same patient-first order as scheduling/cancellation. Lock the relationship
  -- too, so a discharge either follows this save or makes it fail after waiting.
  perform p.id from public.patients p where p.id = patient and p.auth_user_id = auth.uid() for update;
  if not found then raise exception 'Assigned exercise not found' using errcode = '42501'; end if;
  perform pp.id from public.provider_patient_profiles pp
    where pp.id = profile and pp.patient_id = patient and pp.discharged_at is null for update;
  if not found then raise exception 'Care relationship is no longer active' using errcode = '42501'; end if;
  select a.scheduled_date, a.status into assignment_date, assignment_status
    from public.routine_assignments a where a.id = assignment and a.patient_id = patient
      and a.patient_profile_id = profile for update;
  if not found or assignment_status = 'cancelled'
    or assignment_date > (milestone_scheduling.policy_at(clock_timestamp())->>'today')::date then
    raise exception 'Feedback is unavailable for this assigned exercise' using errcode = '22023';
  end if;

  return query insert into public.routine_assignment_exercise_feedback as f
    (routine_assignment_exercise_id, pain_score, feeling, explanation, reported_at)
    values (p_routine_assignment_exercise_id, p_pain_score, p_feeling, reason, clock_timestamp())
    on conflict (routine_assignment_exercise_id) do update
      set pain_score = excluded.pain_score, feeling = excluded.feeling,
        explanation = excluded.explanation, reported_at = excluded.reported_at
    returning f.*;

  -- A successful response means this exercise is finished. The patient and
  -- assignment locks above serialize simultaneous saves of the final exercises.
  update public.routine_assignments a
    set status = case when not exists (
          select 1 from public.routine_assignment_exercises e
          where e.routine_assignment_id = assignment and not exists (
            select 1 from public.routine_assignment_exercise_feedback f
            where f.routine_assignment_exercise_id = e.id
          )
        ) then 'completed' else a.status end,
        patient_in_progress = a.status <> 'completed' and exists (
          select 1 from public.routine_assignment_exercises e
          where e.routine_assignment_id = assignment and not exists (
            select 1 from public.routine_assignment_exercise_feedback f
            where f.routine_assignment_exercise_id = e.id
          )
        ),
        patient_result_source = 'patient', updated_at = clock_timestamp()
    where a.id = assignment;
end;
$function$;

-- Repair only Frank's verified November 4 assignment. No other historical
-- assignments or existing feedback are changed. Skip if its state has changed.
update public.routine_assignments a
set status = 'completed', patient_in_progress = false,
    patient_result_source = 'patient', updated_at = clock_timestamp()
where a.id = 'cb6fa5b0-9e62-4a6f-8cd7-8b1e668ce574'
  and a.scheduled_date = '2026-11-04' and a.status = 'scheduled'
  and a.patient_result_source is null
  and exists (select 1 from public.provider_patient_profiles pp where pp.id = a.patient_profile_id and pp.discharged_at is null)
  and (select count(*) from public.routine_assignment_exercises e where e.routine_assignment_id = a.id) = 2
  and not exists (
    select 1 from public.routine_assignment_exercises e
    where e.routine_assignment_id = a.id and not exists (
      select 1 from public.routine_assignment_exercise_feedback f where f.routine_assignment_exercise_id = e.id
    )
  );

comment on table public.routine_assignment_exercise_feedback is
  'Latest patient response per immutable assigned exercise snapshot. Saving all exercise responses completes the assignment; pain and feeling do not change issue severity.';
notify pgrst, 'reload schema';
