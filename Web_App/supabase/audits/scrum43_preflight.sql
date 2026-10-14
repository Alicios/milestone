-- READ ONLY. Run manually in Supabase SQL Editor before reviewing deployment.
begin transaction read only;
select version(), current_database(), current_user;

select table_name, column_name, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in
  ('exercises','routines','routine_exercises','routine_assignments',
   'routine_assignment_exercises','providers','provider_patient_profiles')
order by table_name, ordinal_position;

select c.relname, c.relrowsecurity, c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) as owner
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';
select * from pg_policies where schemaname = 'public' order by tablename, policyname;

-- Effective privileges include grants inherited through PUBLIC/role membership.
select r.rolname, t.table_name, p.privilege,
       has_table_privilege(r.oid, format('public.%I', t.table_name), p.privilege) as allowed
from pg_roles r
cross join (values ('exercises'),('routines'),('routine_assignments'),
                   ('routine_assignment_exercises')) t(table_name)
cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
                   ('REFERENCES'),('TRIGGER')) p(privilege)
where r.rolname in ('anon','authenticated','service_role');
select * from information_schema.column_privileges
where table_schema = 'public' and table_name in
  ('exercises','routines','routine_assignments','routine_assignment_exercises');
select pg_get_userbyid(defaclrole) as owner, defaclnamespace::regnamespace,
       defaclobjtype, defaclacl from pg_default_acl;

select p.oid::regprocedure as signature, pg_get_userbyid(p.proowner) as owner,
       p.prosecdef, p.proconfig, p.proacl,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by p.proname;

select c.relname, t.tgname, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.oid in
  ('public.exercises'::regclass,'public.routines'::regclass,
   'public.routine_assignments'::regclass,'public.routine_assignment_exercises'::regclass);
select conrelid::regclass, conname, pg_get_constraintdef(oid)
from pg_constraint where connamespace = 'public'::regnamespace;
select tablename, indexname, indexdef from pg_indexes where schemaname = 'public';

select count(*) as exercises, count(distinct id) as ids, count(distinct name) as names,
       count(*) filter (where nullif(btrim(name),'') is null) as missing_names,
       count(*) filter (where nullif(btrim("desc"),'') is null) as missing_descriptions
from public.exercises;
select id, provider_id, name, exercise_list,
       case when exercise_list is null then 'sql-null'
            when cardinality(exercise_list) = 0 then 'empty' else 'populated' end as list_state
from public.routines order by id;
select r.id as routine_id, e.ordinality - 1 as position, jsonb_typeof(e.entry) as kind, e.entry
from public.routines r cross join lateral unnest(r.exercise_list) with ordinality e(entry, ordinality);
select r.id, r.exercise_list,
       (select jsonb_agg(re.name order by re.position) from public.routine_exercises re
        where re.routine_id = r.id) as legacy_memberships
from public.routines r order by r.id;
-- Inspect privately: historical strings beginning with JSON may be damaged snapshots.
select id, routine_assignment_id, exercise_name_snapshot, position
from public.routine_assignment_exercises
where exercise_name_snapshot ~ '^\s*[\{\[]';

-- Includes stored SQL where the deployment mechanism recorded it. Compare bodies,
-- not just names, with repository migrations; never repair the ledger by guessing.
select * from supabase_migrations.schema_migrations order by version;
rollback;
