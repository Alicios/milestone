-- SCRUM-92: narrow client privileges without changing ownership policies.
-- Keep the exercise SELECT policy/grants pending deployed-mobile verification.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $privileges$
declare
  table_name text;
  columns_sql text;
  tables constant text[] := array[
    'access_requests', 'medical_practices', 'providers', 'patients',
    'provider_patient_profiles', 'patient_statuses', 'routines', 'routine_exercises',
    'routine_assignments', 'routine_assignment_exercises', 'routine_follow_ups',
    'routine_schedule_requests', 'messages', 'message_thread_state', 'exercises'
  ];
begin
  -- Fail closed on schema drift rather than silently skipping protected tables.
  foreach table_name in array tables loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name
        and c.relkind in ('r', 'p') and c.relrowsecurity
    ) then
      raise exception 'Expected public.% with RLS enabled; reconcile before deployment', table_name;
    end if;

    -- TRUNCATE is not subject to RLS. Ordinary app clients never need it.
    execute format('revoke truncate on table public.%I from public, anon, authenticated', table_name);

    if table_name = 'exercises' then
      continue; -- No change to catalog read/write grants or policies here.
    end if;
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
      into columns_sql
      from pg_attribute a
      where a.attrelid = format('public.%I', table_name)::regclass
        and a.attnum > 0 and not a.attisdropped;

    -- Table REVOKE alone does not remove separately granted column privileges.
    execute format('revoke all privileges on table public.%I from public, anon', table_name);
    execute format('revoke all privileges (%s) on table public.%I from public, anon', columns_sql, table_name);
    if table_name in ('access_requests', 'medical_practices', 'providers') then
      execute format('revoke all privileges on table public.%I from authenticated', table_name);
      execute format('revoke all privileges (%s) on table public.%I from authenticated', columns_sql, table_name);
    end if;
  end loop;
end;
$privileges$;

-- Public onboarding uses INSERT without RETURNING. Do not let clients set
-- approval status, IDs, or creation timestamps (including through column grants).
grant insert (name, email, department, notes) on public.access_requests to anon, authenticated;
grant select on public.medical_practices to anon, authenticated;

-- Matches updateProvider(); retain initials for existing profile clients.
-- Ownership/identity is not editable. Existing duplicate own-row policies stay.
grant select on public.providers to authenticated;
grant update (name, professional_title, initials, contact_email, phone, bio,
              avatar_url, medical_practice_id, facility, office_location,
              work_phone, work_phone_extension, preferred_contact)
  on public.providers to authenticated;

-- Authenticated grants on clinical tables, messaging column grants, RPC ACLs,
-- service_role privileges, managed schemas, and all policies remain unchanged.
notify pgrst, 'reload schema';
commit;
