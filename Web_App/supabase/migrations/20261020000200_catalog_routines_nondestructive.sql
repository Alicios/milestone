-- ALTERNATIVE release: use INSTEAD OF 20261020000100 and the cleanup bundle.
-- NO demo cleanup, row backfill, assignment replacement or ledger writes.
-- Preparation only: bind the reviewed SQL Editor baseline and separate approval.
begin;
set transaction isolation level read committed;
set local search_path = pg_catalog, public;
set local timezone = 'UTC';
set local datestyle = 'ISO, YMD';
set local intervalstyle = 'postgres';
set local extra_float_digits = 3;
set local row_security = off;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '60s';
do $release_gate$
declare
  hosted_execution_approved constant boolean := false;
  sql_editor_export_verified constant boolean := false;
  expected_baseline_sha256 constant text := 'REQUIRES_REVIEWED_SQL_EDITOR_BASELINE';
  observed text;
  relation record;
begin
  if not (hosted_execution_approved and sql_editor_export_verified) then
    raise exception 'PREPARATION ONLY: separate approval and verified private SQL Editor export required' using errcode='42501';
  end if;
  if current_user<>'postgres' then raise exception 'Reviewed postgres execution required'; end if;
  if expected_baseline_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Reviewed fresh baseline is required'; end if;
  -- Short coordinated public/Auth write and schema-maintenance pause required.
  -- Managed Auth/ledger tables are read only here. SELECT permits ACCESS SHARE,
  -- not SHARE ROW EXCLUSIVE. Do not change their ownership/grants or skip checks.
  -- READ COMMITTED keeps later fingerprint checks sensitive to committed Auth
  -- activity. ACCESS SHARE prevents concurrent destructive DDL, not Auth writes;
  -- managed-table drift detected by the full postcheck must abort this release.
  for relation in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and (n.nspname in ('public','auth') or
      (n.nspname='supabase_migrations' and c.relname='schema_migrations')) order by n.nspname,c.relname
  loop
    if relation.nspname = 'public' then
      execute format('lock table %I.%I in share row exclusive mode',relation.nspname,relation.relname);
    else
      execute format('lock table %I.%I in access share mode',relation.nspname,relation.relname);
    end if;
  end loop;
  with table_digests as materialized (
      select n.nspname schema_name,c.relname,
        ((xpath('/table/row/digest/text()',query_to_xml(format(
          'select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb)::text,''UTF8'')),''hex'') as digest from %I.%I t where %s',
          n.nspname,c.relname,'true'),false,false,'')))[1])::text digest
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind in ('r','p') and
        (n.nspname in ('public','auth') or (n.nspname='supabase_migrations' and c.relname='schema_migrations'))
    ) select encode(sha256(convert_to(jsonb_build_object(
      'tables',(select jsonb_agg(to_jsonb(t) order by schema_name,relname) from table_digests t),
      'structure',jsonb_build_object(
          'relations',(select jsonb_agg(to_jsonb(x) order by x.schema_name,x.relname) from (
            select n.nspname schema_name,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl,
              pg_get_userbyid(c.relowner) owner from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname in ('public','auth','supabase_migrations') and c.relkind in ('r','p','v','m','f')) x),
          'columns',(select jsonb_agg(to_jsonb(x) order by x.schema_name,x.relname,x.attnum) from (
            select n.nspname schema_name,c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) type,
              a.attnotnull,a.attidentity,a.attgenerated,a.attacl,pg_get_expr(d.adbin,d.adrelid) default_expression
            from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
            left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
            where a.attnum>0 and not a.attisdropped and n.nspname in ('public','auth','supabase_migrations')
              and c.relkind in ('r','p','v','m','f')) x),
          'constraints',(select jsonb_agg(to_jsonb(x) order by x.schema_name,x.relname,x.conname) from (
            select n.nspname schema_name,c.relname,k.conname,pg_get_constraintdef(k.oid) definition,k.convalidated
            from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
            where n.nspname in ('public','auth','supabase_migrations')) x),
          'indexes',(select jsonb_agg(to_jsonb(x) order by x.schemaname,x.tablename,x.indexname)
            from pg_indexes x where x.schemaname in ('public','auth','supabase_migrations')),
          'policies',(select jsonb_agg(to_jsonb(x) order by x.schemaname,x.tablename,x.policyname)
            from pg_policies x where x.schemaname in ('public','auth','supabase_migrations')),
          'rpcs',(select jsonb_agg(to_jsonb(x) order by x.schema_name,x.signature) from (
            select n.nspname schema_name,p.oid::regprocedure::text signature,p.proacl,pg_get_userbyid(p.proowner) owner,
              pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname in ('public','auth') and p.prokind in ('f','p')) x),
          'triggers',(select jsonb_agg(to_jsonb(x) order by x.schema_name,x.relname,x.tgname) from (
            select n.nspname schema_name,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition
            from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
            where n.nspname in ('public','auth')) x),
          'rules',(select jsonb_agg(to_jsonb(x) order by x.schemaname,x.tablename,x.rulename)
            from pg_rules x where x.schemaname in ('public','auth')),
          'roles',(select jsonb_agg(to_jsonb(x) order by x.rolname) from pg_roles x),
          'memberships',(select jsonb_agg(to_jsonb(x) order by x.roleid,x.member,x.grantor) from pg_auth_members x)
        ))::text,'UTF8')),'hex') into observed;
  if observed is distinct from expected_baseline_sha256 then raise exception 'Database changed since reviewed baseline; refresh review'; end if;
  if to_regprocedure('public.save_routine_from_catalog(uuid,text,uuid[])') is not null then raise exception 'Catalog RPC already exists; do not replay either release'; end if;
  if exists(select 1 from supabase_migrations.schema_migrations where version in ('20261020000100','20261020000200')) then
    raise exception 'Catalog migration already recorded; do not replay'; end if;
  if (select count(*) from public.exercises)<>248 then raise exception 'Expected existing 248-exercise catalog; review changed population'; end if;
  if exists(select 1 from public.exercises where nullif(btrim(name),'') is null) then raise exception 'Blank catalog names require review'; end if;
  if not exists(select 1 from pg_proc p where p.oid='public.assign_routine(uuid,uuid,date)'::regprocedure
    and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
    and position('routine.exercise_list' in pg_get_functiondef(p.oid))>0
    and position('exercise_name_snapshot' in pg_get_functiondef(p.oid))>0
    and position('provider_id = current_provider' in pg_get_functiondef(p.oid))>0
    and position('discharged_at is null' in pg_get_functiondef(p.oid))>0) then
    raise exception 'Existing assignment implementation differs from reviewed hosted parser; stop'; end if;
  if not has_function_privilege('authenticated','public.assign_routine(uuid,uuid,date)','EXECUTE')
    or has_function_privilege('anon','public.assign_routine(uuid,uuid,date)','EXECUTE') then
    raise exception 'Existing assignment execution privileges differ; review'; end if;
end;
$release_gate$;


do $preflight$
declare
  expected record;
  client_role text;
  target_table text;
begin
  if current_user <> 'postgres' then
    raise exception 'Run the reviewed migration as postgres';
  end if;
  for expected in select * from (values
    ('exercises', 'id', 'uuid'), ('exercises', 'name', 'text'), ('exercises', 'desc', 'text'),
    ('routines', 'id', 'uuid'), ('routines', 'provider_id', 'uuid'),
    ('routines', 'name', 'text'), ('routines', 'exercise_list', 'jsonb[]'),
    ('routine_assignment_exercises', 'exercise_name_snapshot', 'text'),
    ('routine_assignment_exercises', 'position', 'integer')
  ) as columns(table_name, column_name, column_type)
  loop
    if not exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = pg_catalog.to_regclass('public.' || expected.table_name)
        and a.attname = expected.column_name and not a.attisdropped
        and pg_catalog.format_type(a.atttypid, a.atttypmod) = expected.column_type
    ) then
      raise exception 'Schema differs: %.% must be %. Stop and review; no changes applied.',
        expected.table_name, expected.column_name, expected.column_type;
    end if;
  end loop;
  foreach client_role in array array['anon', 'authenticated'] loop
    foreach target_table in array array['public.routines', 'public.routine_assignments', 'public.routine_assignment_exercises'] loop
      if has_table_privilege(client_role, target_table, 'INSERT,UPDATE,DELETE,TRUNCATE')
        or has_any_column_privilege(client_role, target_table, 'INSERT,UPDATE') then
        raise exception 'Unexpected direct writes for % on %: review before deployment', client_role, target_table;
      end if;
    end loop;
  end loop;
  if exists (select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.routines'::regclass and attnum > 0 and not attisdropped
      and attname not in ('id', 'provider_id', 'name', 'created_at', 'description', 'exercise_list')) then
    raise exception 'Unexpected routine columns: reconcile other routine work before deployment';
  end if;
  if exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.exercises'::regclass) then
    raise exception 'Catalog policies already exist: review effective access before deployment';
  end if;
  if exists (select 1 from pg_catalog.pg_trigger where not tgisinternal
    and tgrelid in ('public.routines'::regclass, 'public.exercises'::regclass, 'public.routine_assignment_exercises'::regclass)) then
    raise exception 'Custom routine/catalog/snapshot triggers require review before deployment';
  end if;
  if exists (select 1 from pg_catalog.pg_class
    where oid in ('public.routines'::regclass, 'public.routine_assignments'::regclass,
      'public.routine_assignment_exercises'::regclass) and not relrowsecurity) then
    raise exception 'Routine and assignment RLS must already be enabled';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indexrelid = pg_catalog.to_regclass('public.routine_assignments_active_unique_idx')
      and i.indrelid = 'public.routine_assignments'::regclass
      and i.indisunique and i.indisvalid and i.indpred is not null
      and pg_get_indexdef(i.indexrelid) like '%(patient_profile_id, routine_id, scheduled_date)%'
  ) then
    raise exception 'Expected active-assignment unique index is missing or differs';
  end if;
  if pg_catalog.to_regprocedure('public.save_routine(uuid,text,text[])') is null
    or pg_catalog.to_regprocedure('public.assign_routine(uuid,uuid,date)') is null then
    raise exception 'Existing routine RPC signatures differ: review before deployment';
  end if;
end;
$preflight$;


create temporary table catalog_nondestructive_baseline(data_sha256 text not null,retained_security jsonb not null) on commit drop;
insert into catalog_nondestructive_baseline select d.digest,s.security from
  (with table_digests as materialized (
      select n.nspname schema_name,c.relname,
        ((xpath('/table/row/digest/text()',query_to_xml(format(
          'select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb)::text,''UTF8'')),''hex'') as digest from %I.%I t where %s',
          n.nspname,c.relname,'true'),false,false,'')))[1])::text digest
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind in ('r','p') and
        (n.nspname in ('public','auth') or (n.nspname='supabase_migrations' and c.relname='schema_migrations'))
    ) select encode(sha256(convert_to(jsonb_build_object(
      'tables',(select jsonb_agg(to_jsonb(t) order by schema_name,relname) from table_digests t),
      'structure','null'::jsonb)::text,'UTF8')),'hex')) d(digest) cross join (select jsonb_build_object(
  'assignment',(select to_jsonb(p) || jsonb_build_object('definition',pg_get_functiondef(p.oid))
    from pg_proc p where p.oid='public.assign_routine(uuid,uuid,date)'::regprocedure),
  'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)
    from pg_policies p where schemaname in ('public','auth') and not (schemaname='public' and tablename='exercises')),
  'rls',(select jsonb_agg(to_jsonb(x) order by x.schema_name,x.relname) from (
    select n.nspname schema_name,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and n.nspname in ('public','auth')
      and not (n.nspname='public' and c.relname='exercises')) x)
)) s(security);

-- Catalog is shared, but only actual providers can read it through the browser.
-- Revoke column grants as well as table grants, including TRUNCATE privileges.
revoke all on public.exercises from public, anon, authenticated;
revoke all (id, name, "desc", created_at) on public.exercises from public, anon, authenticated;
alter table public.exercises enable row level security;
grant select on public.exercises to authenticated;
create policy "Providers read shared exercise catalog" on public.exercises
for select to authenticated
using (exists (select 1 from public.providers p where p.id = (select auth.uid())));

create function public.save_routine_from_catalog(
  p_routine_id uuid, p_routine_name text, p_exercise_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  provider uuid := auth.uid();
  saved_id uuid;
  saved_list jsonb[];
begin
  if provider is null or not exists (select 1 from public.providers where id = provider) then
    raise exception 'Sign in as a provider before saving a routine' using errcode = '42501';
  end if;
  if nullif(btrim(p_routine_name), '') is null or length(p_routine_name) > 200 then
    raise exception 'Routine name must contain 1 to 200 characters' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_exercise_ids), 0) not between 1 and 100
    or array_ndims(p_exercise_ids) <> 1 then
    raise exception 'Select 1 to 100 existing catalog exercises' using errcode = '22023';
  end if;
  if array_position(p_exercise_ids, null) is not null then
    raise exception 'Select 1 to 100 existing catalog exercises' using errcode = '22023';
  end if;
  if p_routine_id is not null then
    select id into saved_id from public.routines
    where id = p_routine_id and provider_id = provider for update;
    if saved_id is null then raise exception 'Routine not found' using errcode = 'P0002'; end if;
  end if;
  -- Stable lock order; a trusted catalog deletion cannot race this save.
  perform id from public.exercises where id = any(p_exercise_ids) order by id for share;
  if exists (select 1 from unnest(p_exercise_ids) selected(id)
    left join public.exercises e on e.id = selected.id
    where e.id is null or nullif(btrim(e.name), '') is null) then
    raise exception 'A selected catalog exercise is unavailable' using errcode = '22023';
  end if;
  select array_agg(jsonb_build_object('exercise_id', e.id, 'name', e.name) order by selected.position)
  into saved_list from unnest(p_exercise_ids) with ordinality selected(id, position)
  join public.exercises e on e.id = selected.id;
  if p_routine_id is null then
    insert into public.routines (id, provider_id, name, exercise_list)
    values (gen_random_uuid(), provider, btrim(p_routine_name), saved_list) returning id into saved_id;
  else
    update public.routines set name = btrim(p_routine_name), exercise_list = saved_list where id = saved_id;
  end if;
  return saved_id;
end;
$function$;


-- Existing name-only templates can still be edited. All new templates must
-- use the UUID-based catalog RPC; an older client cannot flatten structured data.
create or replace function public.save_routine(p_routine_id uuid, p_routine_name text, p_exercise_names text[])
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  provider uuid := auth.uid();
  saved_id uuid;
  previous_list jsonb[];
  saved_list jsonb[];
begin
  if provider is null or not exists(select 1 from public.providers where id=provider) then
    raise exception 'Sign in as a provider before saving a routine' using errcode='42501';
  end if;
  if p_routine_id is null then
    raise exception 'Create new routines with the catalog editor' using errcode='22023';
  end if;
  if nullif(btrim(p_routine_name),'') is null then raise exception 'Routine name is required' using errcode='22023'; end if;
  select id,exercise_list into saved_id,previous_list from public.routines
    where id=p_routine_id and provider_id=provider for update;
  if saved_id is null then raise exception 'Routine not found' using errcode='P0002'; end if;
  if exists(select 1 from unnest(previous_list) entry where jsonb_typeof(entry) is distinct from 'string') then
    raise exception 'Use the catalog editor to update this routine' using errcode='55000';
  end if;
  select coalesce(array_agg(to_jsonb(btrim(name)) order by position),array[]::jsonb[])
    into saved_list from unnest(p_exercise_names) with ordinality selected(name,position)
    where nullif(btrim(name),'') is not null;
  update public.routines set name=btrim(p_routine_name),exercise_list=saved_list where id=saved_id;
  return saved_id;
end;
$function$;

revoke all on function public.save_routine_from_catalog(uuid,text,uuid[]),public.save_routine(uuid,text,text[]) from public,anon;
grant execute on function public.save_routine_from_catalog(uuid,text,uuid[]),public.save_routine(uuid,text,text[]) to authenticated;


-- assign_routine is deliberately NOT replaced, renamed, re-granted or called.
do $verify$
declare observed text; security jsonb; browser_role text; privilege_name text; signature text;
begin
  with table_digests as materialized (
      select n.nspname schema_name,c.relname,
        ((xpath('/table/row/digest/text()',query_to_xml(format(
          'select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb)::text,''UTF8'')),''hex'') as digest from %I.%I t where %s',
          n.nspname,c.relname,'true'),false,false,'')))[1])::text digest
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind in ('r','p') and
        (n.nspname in ('public','auth') or (n.nspname='supabase_migrations' and c.relname='schema_migrations'))
    ) select encode(sha256(convert_to(jsonb_build_object(
      'tables',(select jsonb_agg(to_jsonb(t) order by schema_name,relname) from table_digests t),
      'structure','null'::jsonb)::text,'UTF8')),'hex') into observed;
  select jsonb_build_object(
  'assignment',(select to_jsonb(p) || jsonb_build_object('definition',pg_get_functiondef(p.oid))
    from pg_proc p where p.oid='public.assign_routine(uuid,uuid,date)'::regprocedure),
  'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)
    from pg_policies p where schemaname in ('public','auth') and not (schemaname='public' and tablename='exercises')),
  'rls',(select jsonb_agg(to_jsonb(x) order by x.schema_name,x.relname) from (
    select n.nspname schema_name,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and n.nspname in ('public','auth')
      and not (n.nspname='public' and c.relname='exercises')) x)
) into security;
  if observed is distinct from (select data_sha256 from catalog_nondestructive_baseline) then
    raise exception 'Existing public/Auth data or migration ledger changed; rollback'; end if;
  if security is distinct from (select retained_security from catalog_nondestructive_baseline) then
    raise exception 'Assignment implementation or existing ownership/RLS/grants changed; rollback'; end if;
  if (select count(*) from public.exercises)<>248 then raise exception 'Catalog count changed'; end if;
  foreach signature in array array['public.save_routine_from_catalog(uuid,text,uuid[])','public.save_routine(uuid,text,text[])'] loop
    if not exists(select 1 from pg_proc p where p.oid=signature::regprocedure and p.prosecdef
      and pg_get_userbyid(p.proowner)='postgres' and p.proconfig @> array['search_path=""']) then
      raise exception 'Save RPC security configuration differs'; end if;
    if not has_function_privilege('authenticated',signature,'EXECUTE') or has_function_privilege('anon',signature,'EXECUTE') then
      raise exception 'Save RPC execution privileges differ'; end if;
  end loop;
  if not exists(select 1 from pg_class where oid='public.exercises'::regclass and relrowsecurity) or
    (select count(*) from pg_policy where polrelid='public.exercises'::regclass)<>1 or
    not exists(select 1 from pg_policy where polrelid='public.exercises'::regclass and polname='Providers read shared exercise catalog') then
    raise exception 'Provider-only catalog RLS policy missing or changed'; end if;
  if not has_table_privilege('authenticated','public.exercises','SELECT') or has_table_privilege('anon','public.exercises','SELECT') then
    raise exception 'Catalog read grants differ'; end if;
  foreach browser_role in array array['anon','authenticated'] loop
    foreach privilege_name in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] ||
      case when current_setting('server_version_num')::integer>=170000 then array['MAINTAIN'] else array[]::text[] end loop
      if has_table_privilege(browser_role,'public.exercises',privilege_name) then raise exception 'Inherited catalog mutation privilege remains'; end if;
    end loop;
    if has_any_column_privilege(browser_role,'public.exercises','INSERT,UPDATE,REFERENCES') then raise exception 'Catalog column mutation privilege remains'; end if;
  end loop;
end;
$verify$;
-- Delivered only if the transaction commits. No application record is modified.
notify pgrst, 'reload schema';
select jsonb_build_object('status','validated_commit_pending','existing_rows_modified',0,
  'assignment_rpc_unchanged',true,'catalog_count',248,'migration_ledger_modified',false) as catalog_nondestructive_release;
commit;
