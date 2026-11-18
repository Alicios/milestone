-- Provider-facing routine completion + pain-feedback analytics, aggregated
-- server-side so the dashboard never has to load raw assignment/exercise/
-- feedback rows into the browser for a wide date range. Mirrors the same
-- status-bucket precedence as the client's resolveRoutineStatus()
-- (critical > missed > issue > completed > in progress > neutral) and the
-- same "past-due, never completed" missed rule, using the scheduling
-- policy's timezone-aware notion of "today" (milestone_scheduling.policy_at)
-- rather than the database server's local date.
begin;
set local lock_timeout = '5s';

create schema milestone_analytics;
revoke all on schema milestone_analytics from public, anon, authenticated;
grant usage on schema milestone_analytics to authenticated;

-- Private implementation: security definer so it can read across a
-- provider's patients/assignments/feedback regardless of RLS, manually
-- re-scoped to p_provider_id below. Never call with a provider id the
-- caller does not own; the public wrapper enforces that.
create function milestone_analytics.provider_routine_summary(p_provider_id uuid, p_start date, p_end date)
returns table(
  patient_profile_id uuid,
  patient_name text,
  discharged boolean,
  scheduled_count integer,
  completed_count integer,
  missed_count integer,
  critical_count integer,
  issue_count integer,
  in_progress_count integer,
  avg_pain_score numeric
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  v_today date := (milestone_scheduling.policy_at(now())->>'today')::date;
  v_end date := coalesce(p_end, v_today);
  v_start date := coalesce(p_start, v_end - 55);
begin
  return query
  with scoped as (
    select
      ra.id,
      ra.patient_profile_id,
      ra.scheduled_date,
      ra.status,
      coalesce(ra.patient_in_progress, false) as in_progress,
      case ra.patient_issue_severity when 'critical' then 2 when 'noncritical' then 1 else 0 end as stored_rank,
      coalesce(fb.feedback_rank, 0) as feedback_rank,
      fb.avg_pain_score
    from public.routine_assignments ra
    join public.provider_patient_profiles pp on pp.id = ra.patient_profile_id
    left join lateral (
      select
        max(case when f.pain_score >= 7 then 2 when f.pain_score > 3 or f.feeling <> 'good' then 1 else 0 end) as feedback_rank,
        avg(f.pain_score) as avg_pain_score
      from public.routine_assignment_exercises rae
      join public.routine_assignment_exercise_feedback f on f.routine_assignment_exercise_id = rae.id
      where rae.routine_assignment_id = ra.id
    ) fb on true
    where pp.provider_id = p_provider_id
      and ra.status <> 'cancelled'
      and ra.scheduled_date between v_start and v_end
  ),
  bucketed as (
    select
      scoped.*,
      case
        when greatest(stored_rank, feedback_rank) = 2 then 'critical'
        when status = 'missed' or (scheduled_date < v_today and status <> 'completed') then 'missed'
        when greatest(stored_rank, feedback_rank) = 1 then 'issue'
        when status = 'completed' then 'completed'
        when in_progress then 'in_progress'
        else 'neutral'
      end as bucket
    from scoped
  )
  select
    pp.id,
    p.name,
    pp.discharged_at is not null,
    count(b.id)::integer,
    count(b.id) filter (where b.bucket = 'completed')::integer,
    count(b.id) filter (where b.bucket = 'missed')::integer,
    count(b.id) filter (where b.bucket = 'critical')::integer,
    count(b.id) filter (where b.bucket = 'issue')::integer,
    count(b.id) filter (where b.bucket = 'in_progress')::integer,
    avg(b.avg_pain_score)
  from public.provider_patient_profiles pp
  join public.patients p on p.id = pp.patient_id
  left join bucketed b on b.patient_profile_id = pp.id
  where pp.provider_id = p_provider_id
  group by pp.id, p.name, pp.discharged_at
  order by p.name;
end;
$function$;

revoke all on function milestone_analytics.provider_routine_summary(uuid, date, date) from public, anon, authenticated;
grant execute on function milestone_analytics.provider_routine_summary(uuid, date, date) to authenticated;

-- Thin public wrapper: security invoker, scopes strictly to the caller's own
-- auth.uid(). p_start/p_end default to the last 8 weeks ending "today" when
-- omitted.
create function public.get_provider_routine_analytics(p_start date default null, p_end date default null)
returns table(
  patient_profile_id uuid,
  patient_name text,
  discharged boolean,
  scheduled_count integer,
  completed_count integer,
  missed_count integer,
  critical_count integer,
  issue_count integer,
  in_progress_count integer,
  avg_pain_score numeric
)
language sql
security invoker
stable
set search_path = ''
as $function$
  select * from milestone_analytics.provider_routine_summary(auth.uid(), p_start, p_end);
$function$;

revoke all on function public.get_provider_routine_analytics(date, date) from public, anon;
grant execute on function public.get_provider_routine_analytics(date, date) to authenticated;

comment on function public.get_provider_routine_analytics(date, date) is
  'Provider-facing analytics: per-patient routine completion/missed/issue/critical counts and average reported pain, defaulting to the last 8 weeks. Returns no rows for a non-provider caller (scoped via provider_patient_profiles.provider_id = auth.uid()).';

notify pgrst, 'reload schema';

commit;
