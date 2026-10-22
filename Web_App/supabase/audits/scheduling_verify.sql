-- READ ONLY. Compare fingerprints with the saved preflight before any acceptance writes.
begin isolation level repeatable read read only;
select 'routines' as relation,count(*) as rows,md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) as fingerprint from public.routines t
union all select 'assignments',count(*),md5(coalesce(jsonb_agg(to_jsonb(t)-'patient_id' order by id)::text,'[]')) from public.routine_assignments t
union all select 'snapshots',count(*),md5(coalesce(jsonb_agg(to_jsonb(t)-'exercise_id_snapshot' order by id)::text,'[]')) from public.routine_assignment_exercises t
union all select 'catalog',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.exercises t;
select count(*) as inconsistent_identities from public.routine_assignments a
join public.provider_patient_profiles p on p.id=a.patient_profile_id where a.patient_id<>p.patient_id;
select patient_id,scheduled_date,count(*) from public.routine_assignments
where status<>'cancelled' group by patient_id,scheduled_date having count(*)>1;
select count(*) as historical_ids_must_remain_unknown from public.routine_assignment_exercises where exercise_id_snapshot is not null;
select count(*) as receipts_before_acceptance_must_be_zero from public.routine_schedule_requests;
select * from milestone_scheduling.policy;
select indexdef from pg_indexes where indexname='routine_assignments_patient_date_active_idx';
select p.oid::regprocedure,p.prosecdef,p.proconfig,
has_function_privilege('anon',p.oid,'execute') as anon_execute,
has_function_privilege('authenticated',p.oid,'execute') as provider_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('get_routine_scheduling_policy','get_patient_schedule_occupancy',
'preview_routine_schedule','assign_routine_schedule','get_routine_schedule_request','assign_routine','cancel_routine_assignment','schedule_routine_follow_up');
select * from pg_policies where tablename='routine_schedule_requests';
rollback;
