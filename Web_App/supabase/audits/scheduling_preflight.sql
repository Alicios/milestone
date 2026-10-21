-- READ ONLY. Run independently against the intended project before reviewing
-- 20261021000100_patient_routine_scheduling.sql. Do not run a migration directory.
begin isolation level repeatable read read only;
set local statement_timeout='30s';
-- MUST return zero rows. Includes all non-cancelled history, across providers.
select p.patient_id,a.scheduled_date,count(*) as conflicting_assignments
from public.routine_assignments a
join public.provider_patient_profiles p on p.id=a.patient_profile_id
where a.status<>'cancelled'
group by p.patient_id,a.scheduled_date having count(*)>1
order by a.scheduled_date,p.patient_id;

select count(*) as invalid_assignment_identities
from public.routine_assignments a left join public.provider_patient_profiles p on p.id=a.patient_profile_id
where p.patient_id is null or a.status is null or a.scheduled_date is null;

select table_name,column_name,data_type,udt_name,is_nullable from information_schema.columns
where table_schema='public' and table_name in
('routines','routine_assignments','routine_assignment_exercises','routine_follow_ups','provider_patient_profiles')
order by table_name,ordinal_position;
select tablename,indexname,indexdef from pg_indexes where schemaname='public'
and tablename in ('routine_assignments','routine_assignment_exercises','provider_patient_profiles');
select conrelid::regclass as relation,conname,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in ('public.routine_assignments'::regclass,
'public.routine_assignment_exercises'::regclass,'public.provider_patient_profiles'::regclass);
select p.oid::regprocedure as signature,p.proowner::regrole as owner,p.proacl,p.proconfig,p.prosecdef,
pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
('assign_routine','cancel_routine_assignment','schedule_routine_follow_up','save_routine_prescriptions','save_routine_from_catalog','save_routine');
select * from pg_policies where schemaname='public' and tablename in
('routines','routine_assignments','routine_assignment_exercises','provider_patient_profiles');
select tgrelid::regclass as relation,tgname,pg_get_triggerdef(oid) as definition from pg_trigger
where not tgisinternal and tgrelid in ('public.routine_assignments'::regclass,'public.routine_assignment_exercises'::regclass);
-- Keep this baseline privately; hashes/counts must match after deployment.
select 'routines' as relation,count(*) as rows,md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) as fingerprint from public.routines t
union all select 'assignments',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.routine_assignments t
union all select 'snapshots',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.routine_assignment_exercises t
union all select 'catalog',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.exercises t;
rollback;
