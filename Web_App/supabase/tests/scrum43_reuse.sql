-- LOCAL/REFERENCE ONLY: run with psql -X on a disposable local database.
-- Requires existing public.exercises, public.providers, and public.routines,
-- at least one catalog exercise and provider, and a local administrative role.
-- Do not run against hosted Supabase, even though the transaction rolls back.
-- This tests stored routine rows, not CTE/VALUES simulations or an API workflow.
\set ON_ERROR_STOP on

begin isolation level repeatable read;
set local statement_timeout = '10s';
set local lock_timeout = '3s';

do $test$
declare
  catalog_id uuid;
  owner_id uuid;
  routine_a uuid := gen_random_uuid();
  routine_b uuid := gen_random_uuid();
  catalog_before jsonb;
  catalog_after jsonb;
  routines_before bigint;
  resolved_rows bigint;
  resolved_routines bigint;
  resolved_exercises bigint;
begin
  -- Reject direct remote TCP connections. Local tunnels cannot be detected;
  -- the operator must still verify that this is a disposable local database.
  if inet_server_addr() is not null
     and inet_server_addr() not in ('127.0.0.1'::inet, '::1'::inet) then
    raise exception 'SCRUM-43 reuse test requires a local database';
  end if;

  if (select atttypid from pg_attribute
      where attrelid = 'public.routines'::regclass
        and attname = 'exercise_list' and not attisdropped)
      is distinct from 'jsonb[]'::regtype::oid then
    raise exception 'Expected public.routines.exercise_list to be jsonb[]';
  end if;

  select id into catalog_id from public.exercises order by id limit 1;
  if catalog_id is null then
    raise exception 'Local fixture needs an existing catalog exercise';
  end if;
  select id into owner_id from public.providers order by id limit 1;
  if owner_id is null then
    raise exception 'Local fixture needs an existing provider';
  end if;

  select jsonb_agg(to_jsonb(e) order by e.id) into catalog_before
  from public.exercises e;
  select count(*) into routines_before from public.routines;

  insert into public.routines (id, provider_id, name, exercise_list)
  values
    (routine_a, owner_id, 'SCRUM-43 reuse A',
      array[jsonb_build_object('exercise_id', catalog_id)]::jsonb[]),
    (routine_b, owner_id, 'SCRUM-43 reuse B',
      array[jsonb_build_object('exercise_id', catalog_id)]::jsonb[]);

  if (select count(*) from public.routines) <> routines_before + 2 then
    raise exception 'Expected exactly two new stored routine rows';
  end if;

  -- Resolve references read back from the inserted table rows.
  select count(*), count(distinct r.id), count(distinct e.id)
    into resolved_rows, resolved_routines, resolved_exercises
  from public.routines r
  cross join lateral unnest(r.exercise_list) as entries(entry)
  join public.exercises e on e.id = (entries.entry ->> 'exercise_id')::uuid
  where r.id in (routine_a, routine_b) and e.id = catalog_id;

  if resolved_rows <> 2 or resolved_routines <> 2 or resolved_exercises <> 1 then
    raise exception 'Expected two routines to resolve the same catalog UUID';
  end if;
  if (select count(*) from public.exercises where id = catalog_id) <> 1 then
    raise exception 'Expected exactly one catalog row for the reused UUID';
  end if;

  select jsonb_agg(to_jsonb(e) order by e.id) into catalog_after
  from public.exercises e;
  if catalog_after is distinct from catalog_before then
    raise exception 'Catalog changed: reuse must not insert or modify exercises';
  end if;

  raise notice 'PASS: two stored routines resolve one existing UUID; catalog unchanged';
end;
$test$;

rollback;
-- Success ends with ROLLBACK. On failure ON_ERROR_STOP exits psql; disconnecting
-- aborts the open transaction. No test routine is committed in either case.
