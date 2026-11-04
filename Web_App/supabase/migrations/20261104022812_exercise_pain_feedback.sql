-- Exercise responses are independent of assignment completion/issue state.
set local lock_timeout = '5s';

create table public.routine_assignment_exercise_feedback (
  routine_assignment_exercise_id uuid primary key
    references public.routine_assignment_exercises(id) on delete restrict,
  pain_score smallint not null check (pain_score between 1 and 10),
  feeling text not null check (feeling in ('good', 'neutral', 'difficult')),
  explanation text check (char_length(explanation) <= 4000),
  reported_at timestamptz not null default clock_timestamp(),
  constraint exercise_feedback_explanation_check check (
    (feeling = 'good' and explanation is null) or
    (feeling in ('neutral', 'difficult') and explanation is not null and btrim(explanation) <> '')
  )
);
alter table public.routine_assignment_exercise_feedback enable row level security;
revoke all on public.routine_assignment_exercise_feedback from public, anon, authenticated;
grant select on public.routine_assignment_exercise_feedback to authenticated;
grant all on public.routine_assignment_exercise_feedback to service_role;
create policy "Providers read own exercise feedback"
  on public.routine_assignment_exercise_feedback for select to authenticated
  using (exists (
    select 1 from public.routine_assignment_exercises e
    join public.routine_assignments a on a.id = e.routine_assignment_id
    join public.provider_patient_profiles pp on pp.id = a.patient_profile_id
    where e.id = routine_assignment_exercise_feedback.routine_assignment_exercise_id
      and pp.provider_id = (select auth.uid())
  ));

create schema milestone_exercise_feedback;
revoke all on schema milestone_exercise_feedback from public, anon;
grant usage on schema milestone_exercise_feedback to authenticated;

create function milestone_exercise_feedback.read_feedback(p_routine_assignment_id uuid)
returns setof public.routine_assignment_exercise_feedback
language plpgsql stable security definer set search_path = '' as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.routine_assignments a
    join public.patients p on p.id = a.patient_id
    where a.id = p_routine_assignment_id and p.auth_user_id = auth.uid()
  ) then
    raise exception 'Assigned routine not found' using errcode = '42501';
  end if;
  return query select f.* from public.routine_assignment_exercise_feedback f
    join public.routine_assignment_exercises e on e.id = f.routine_assignment_exercise_id
    where e.routine_assignment_id = p_routine_assignment_id;
end;
$function$;

create function milestone_exercise_feedback.save_feedback(
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
end;
$function$;

create function public.get_my_routine_exercise_feedback(p_routine_assignment_id uuid)
returns setof public.routine_assignment_exercise_feedback
language sql stable security invoker set search_path = '' as $function$
  select * from milestone_exercise_feedback.read_feedback(p_routine_assignment_id);
$function$;
create function public.save_my_routine_exercise_feedback(
  p_routine_assignment_exercise_id uuid, p_pain_score integer, p_feeling text, p_explanation text default null
) returns setof public.routine_assignment_exercise_feedback
language sql security invoker set search_path = '' as $function$
  select * from milestone_exercise_feedback.save_feedback(p_routine_assignment_exercise_id, p_pain_score, p_feeling, p_explanation);
$function$;

revoke all on function milestone_exercise_feedback.read_feedback(uuid),
  milestone_exercise_feedback.save_feedback(uuid,integer,text,text),
  public.get_my_routine_exercise_feedback(uuid), public.save_my_routine_exercise_feedback(uuid,integer,text,text)
  from public, anon, authenticated;
grant execute on function milestone_exercise_feedback.read_feedback(uuid),
  milestone_exercise_feedback.save_feedback(uuid,integer,text,text),
  public.get_my_routine_exercise_feedback(uuid), public.save_my_routine_exercise_feedback(uuid,integer,text,text)
  to authenticated;

comment on table public.routine_assignment_exercise_feedback is
  'Latest patient response per immutable assigned exercise snapshot. No backfilled or demo scores; independent of routine status.';
comment on column public.routine_assignment_exercise_feedback.pain_score is 'Patient-reported integer 1 (least pain) through 10 (most pain). Colors are presentation only.';
comment on column public.routine_assignment_exercise_feedback.feeling is 'Patient-selected good, neutral, or difficult.';
comment on column public.routine_assignment_exercise_feedback.explanation is 'Plain-text patient explanation required for neutral/difficult; null for good; at most 4000 characters.';
comment on column public.routine_assignment_exercise_feedback.reported_at is 'Server time of the latest successful submission, including repeat attempts.';
notify pgrst, 'reload schema';
