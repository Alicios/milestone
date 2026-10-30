-- Metadata-only review. Does not call any application function or read patient rows.
begin read only;
set local statement_timeout = '15s';

select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) as owner, c.relacl
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

select c.relname, a.attname, a.attacl
from pg_attribute a join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
  and a.attacl is not null order by c.relname, a.attnum;

select p.oid::regprocedure as signature, pg_get_userbyid(p.proowner) as owner,
       p.prosecdef, p.proconfig, p.proacl, pg_get_functiondef(p.oid) as definition,
       encode(sha256(convert_to(btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g')), 'UTF8')), 'hex') as body_sha256
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_patient' order by p.oid::regprocedure::text;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid = 'public.provider_patient_profiles'::regclass;

-- Effective privileges also reveal permissions inherited through other roles.
select r.role_name, c.relname, has_table_privilege(r.role_name, c.oid, 'TRUNCATE') as can_truncate,
       has_table_privilege(r.role_name, c.oid, 'SELECT') as table_select,
       has_table_privilege(r.role_name, c.oid, 'INSERT') as table_insert,
       has_table_privilege(r.role_name, c.oid, 'UPDATE') as table_update,
       has_table_privilege(r.role_name, c.oid, 'DELETE') as table_delete
from pg_class c join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated')) r(role_name)
where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname, r.role_name;

select r.role_name, c.relname, a.attname,
       has_column_privilege(r.role_name, c.oid, a.attnum, 'SELECT') as can_select,
       has_column_privilege(r.role_name, c.oid, a.attnum, 'INSERT') as can_insert,
       has_column_privilege(r.role_name, c.oid, a.attnum, 'UPDATE') as can_update,
       has_column_privilege(r.role_name, c.oid, a.attnum, 'REFERENCES') as can_reference
from pg_attribute a join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated')) r(role_name)
where n.nspname = 'public' and c.relkind in ('r', 'p')
  and a.attnum > 0 and not a.attisdropped order by c.relname, a.attnum, r.role_name;

rollback;
