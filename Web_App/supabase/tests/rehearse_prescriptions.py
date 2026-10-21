#!/usr/bin/env python3
"""Synthetic local PostgreSQL only. No hosted endpoint/credentials or exports."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import tempfile

BASE = Path(__file__).resolve().parents[2]
MIGRATION = BASE / 'supabase/migrations/20261020000300_routine_prescriptions.sql'
CATALOG = BASE / 'supabase/migrations/20261020000200_catalog_routines_nondestructive.sql'
A = '00000000-0000-0000-0000-000000000001'
B = '00000000-0000-0000-0000-000000000002'
PATIENT = '00000000-0000-0000-0000-000000000003'
UNLINKED = '00000000-0000-0000-0000-000000000004'
PROFILE = '00000000-0000-0000-0000-000000000011'
FOREIGN_PROFILE = '00000000-0000-0000-0000-000000000012'


def quote(value):
    return "'" + value.replace("'", "''") + "'"


def json_sql(value):
    return quote(json.dumps(value)) + '::jsonb'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pg-bin', default='/opt/homebrew/opt/postgresql@17/bin')
    args = parser.parse_args()
    pg = Path(args.pg_bin)
    os.umask(0o077)
    parent = BASE / 'node_modules/.tmp'
    parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='prescription-pg-', dir=parent))
    # PostgreSQL limits Unix socket path lengths. Use a short disposable socket
    # directory; the data, logs, and report stay in this worktree.
    socket = Path(tempfile.mkdtemp(prefix='milestone-rx-', dir='/private/tmp'))
    (work / 'pgpass').touch(mode=0o600)
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG') and k not in ('DATABASE_URL', 'SUPABASE_DB_URL')}
    env.update(PGHOST=str(socket), PGPORT='55489', PGUSER='postgres', PGDATABASE='postgres',
               PGPASSFILE=str(work / 'pgpass'), PGOPTIONS='-c timezone=UTC')
    checks = []
    started = False
    source = MIGRATION.read_text()
    source_hash = hashlib.sha256(source.encode()).hexdigest()

    def run(command, text=None, check=True):
        result = subprocess.run([str(pg / command[0]), *command[1:]], input=text,
                                env=env, cwd=BASE, text=True, capture_output=True, timeout=120)
        if check and result.returncode:
            raise RuntimeError(result.stderr)
        return result

    def sql(text, check=True):
        return run(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], text, check)

    def read(text):
        return json.loads(sql(text).stdout.strip().splitlines()[-1])

    def acting(text, claim=A, check=True, role='authenticated'):
        return sql('set role ' + role + "; select set_config('request.jwt.claim.sub'," + quote(claim) + ',false);\n' + text, check)

    def value(text, claim=A):
        return acting(text, claim).stdout.strip().splitlines()[-1]

    def passed(label):
        checks.append(label)
        print('PASS:', label, flush=True)

    def reject(text, code, claim=A, role='authenticated'):
        result = acting(text, claim, False, role)
        assert result.returncode and code in result.stderr, result.stderr

    def saved(entries, rid=None, name='Prescription', claim=A):
        return value('select public.save_routine_prescriptions(' + (quote(rid) if rid else 'null') +
                     ',' + quote(name) + ',' + json_sql(entries) + ');', claim)

    def load(rid):
        return json.loads(value('select to_jsonb(exercise_list) from routines where id=' + quote(rid)))

    def assign(rid, date='2026-12-01', claim=A, profile=PROFILE):
        return value('select assign_routine(' + quote(profile) + ',' + quote(rid) + ',' + quote(date) + ');', claim)

    def snapshots(aid):
        return read("select coalesce(jsonb_agg(to_jsonb(e) order by position),'[]'::jsonb) from routine_assignment_exercises e where routine_assignment_id=" + quote(aid))

    def rows():
        return {table: read("select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from " + table + ' t')
                for table in ['routines', 'routine_exercises', 'routine_assignments', 'routine_assignment_exercises', 'exercises']}

    try:
        run(['initdb', '-D', str(work / 'data'), '-U', 'postgres', '--auth=trust', '--no-locale', '--no-sync'])
        run(['pg_ctl', '-D', str(work / 'data'), '-l', str(work / 'server.log'),
             '-o', f"-k {socket} -h '' -p 55489", 'start'])
        started = True
        sql((BASE / 'supabase/tests/catalog_routines_fixture.sql').read_text())
        sql("""
alter table routine_exercises alter column routine_id set not null, alter column name set not null, alter column position set not null;
alter table routine_assignment_exercises alter column routine_assignment_id set not null;
alter table routines alter column provider_id set not null;
alter table routine_assignments alter column patient_profile_id set not null, alter column routine_id set not null;
""")
        # Historical definitions reconstruct a synthetic pre-upgrade state ONLY.
        # They are never a deployment sequence.
        sql((BASE / 'supabase/migrations/20261007000200_routines_exercise_list_compatibility.sql').read_text())
        sql((BASE / 'supabase/migrations/20261019000100_patient_accounts.sql').read_text())
        catalog_source = CATALOG.read_text()
        assert hashlib.sha256(catalog_source.encode()).hexdigest() == '8b5e66789514d7045ddeeafd9713d96e329324f0db137e65a1c6c12f96a5e33a'
        sql(catalog_source[catalog_source.index('-- Catalog is shared'):catalog_source.index('-- assign_routine is deliberately')])
        sql("revoke all on function assign_routine(uuid,uuid,date) from public,anon; grant execute on function assign_routine(uuid,uuid,date) to authenticated;")
        # Simulate SQL Editor line endings observed in the verified hosted
        # definition, using only the synthetic local function bodies.
        sql("""do $fixture$ begin
execute replace(pg_get_functiondef('public.assign_routine(uuid,uuid,date)'::regprocedure),chr(10),chr(13)||chr(10));
execute replace(pg_get_functiondef('public.save_routine_from_catalog(uuid,text,uuid[])'::regprocedure),chr(10),chr(13)||chr(10));
end $fixture$;""")
        assert sql("select position(chr(13) in prosrc)>0 from pg_proc where oid='assign_routine(uuid,uuid,date)'::regprocedure").stdout.strip() == 't'
        sql("insert into auth.users values(" + quote(UNLINKED) + "); update patients set auth_user_id=" + quote(PATIENT) + ';')
        ea, eb = sql('select id from exercises order by id limit 2').stdout.strip().splitlines()
        old = value("select save_routine_from_catalog(null,'Original',array[" + quote(ea) + '::uuid]);')
        old_assignment = assign(old)
        sql('insert into routine_exercises(routine_id,name,position) values(' + quote(old) + ",'Historical normalized row',0);")
        # Preserve assignment behavior for all supported historical JSON shapes.
        legacy_ids = []
        legacy_entries = [
            ['Legacy string', {'name': 'Old object'}, {'exerciseName': 'Alternate name'}, {'title': 'Title'}],
            [{'exercise_id': 43, 'sets': 2, 'reps': 'bad', 'timer': 30}, None, '', {'unknown': 'historical'}],
            [], [{'name': 'Old dosage', 'sets': -2, 'reps': 1.5, 'duration_seconds': '30', 'notes': {}}],
        ]
        legacy_shapes = []
        for index, entries in enumerate(legacy_entries):
            rid = sql("insert into routines(provider_id,name,exercise_list) values(" + quote(A) +
                      ",'Legacy " + str(index) + "',array(select value from jsonb_array_elements(" + json_sql(entries) + '))) returning id;').stdout.strip()
            legacy_ids.append(rid)
            aid = assign(rid)
            legacy_shapes.append([(row['exercise_name_snapshot'], row['position']) for row in snapshots(aid)])
        before = rows()
        old_patient_api = sql("select pg_get_functiondef('get_my_routine_assignment_exercises(uuid)'::regprocedure)").stdout
        old_name_writer = sql("select pg_get_functiondef('save_routine(uuid,text,text[])'::regprocedure)").stdout
        failed = sql(source, False)
        assert failed.returncode and 'requires separate deployment review' in failed.stderr
        assert rows() == before
        passed('Unapproved source is disabled and changes no data')
        approved = source.replace('hosted_execution_approved constant boolean := false;',
                                  'hosted_execution_approved constant boolean := true;')
        for label, candidate in [
            ('late failure', approved.replace("notify pgrst, 'reload schema';", "select 1/0;")),
            ('overlapping snapshot column', approved.replace('do $preflight$', 'alter table public.routine_assignment_exercises add column sets_snapshot integer;\ndo $preflight$', 1)),
            ('assignment RPC drift', approved.replace('do $preflight$', "create or replace function public.assign_routine(p_patient_profile_id uuid,p_routine_id uuid,p_scheduled_date date) returns uuid language sql security definer set search_path='' as 'select null::uuid';\ndo $preflight$", 1)),
        ]:
            failed = sql(candidate, False)
            assert failed.returncode, label
            if label == 'assignment RPC drift': assert 'RPC implementation drift' in failed.stderr, failed.stderr
            if label == 'overlapping snapshot column': assert 'Overlapping snapshot' in failed.stderr, failed.stderr
            assert rows() == before, label
            assert sql("select to_regnamespace('milestone_routine_prescriptions') is null").stdout.strip() == 't'
            passed('Transaction rolls back on ' + label)
        sql(approved)
        after = rows()
        for table in before:
            compared = after[table]
            if table == 'routine_assignment_exercises':
                assert all(all(row[field] is None for field in ['sets_snapshot', 'reps_snapshot', 'timer_seconds_snapshot', 'notes_snapshot']) for row in compared)
                compared = [{k: v for k, v in row.items() if k not in ['sets_snapshot', 'reps_snapshot', 'timer_seconds_snapshot', 'notes_snapshot']} for row in compared]
            assert compared == before[table], table
        assert sql("select pg_get_functiondef('get_my_routine_assignment_exercises(uuid)'::regprocedure)").stdout == old_patient_api
        assert sql("select pg_get_functiondef('save_routine(uuid,text,text[])'::regprocedure)").stdout == old_name_writer
        passed('Forward migration preserves every existing row, legacy writer, and old patient API; old dosage snapshots remain NULL')
        passed('Reviewed SQL Editor CRLF function bodies pass the normalized preflight')
        replay = sql(approved, False)
        assert replay.returncode
        assert rows() == after
        passed('Migration replay is rejected without data changes')
        columns = read("select jsonb_agg(jsonb_build_object('name',column_name,'nullable',is_nullable) order by column_name) from information_schema.columns where table_schema='public' and table_name='routine_assignment_exercises' and column_name in ('sets_snapshot','reps_snapshot','timer_seconds_snapshot','notes_snapshot')")
        assert len(columns) == 4 and all(c['nullable'] == 'YES' for c in columns)
        passed('All four new snapshot columns are nullable')
        for index, rid in enumerate(legacy_ids):
            new = snapshots(assign(rid, '2026-12-02'))
            assert [(row['exercise_name_snapshot'], row['position']) for row in new] == legacy_shapes[index]
        passed('Legacy strings, objects, malformed IDs, invalid dosage and empty routines retain their assignment names/order')
        rx = {'exercise_id': eb, 'sets': 3, 'reps': 12, 'duration_seconds': 45, 'notes': '  Slow\nControlled  '}
        rid = saved([rx, {'exercise_id': ea}, {'exercise_id': eb, 'reps': 6}], name='  Prescription  ')
        loaded = load(rid)
        assert [e['exercise_id'] for e in loaded] == [eb, ea, eb]
        assert loaded[0]['sets'] == 3 and loaded[0]['duration_seconds'] == 45 and loaded[0]['notes'] == 'Slow\nControlled'
        assert loaded[1] == {'exercise_id': ea, 'name': sql('select name from exercises where id=' + quote(ea)).stdout.strip(),
                             'sets': None, 'reps': None, 'duration_seconds': None, 'notes': None}
        assert value('select provider_id=auth.uid() from routines where id=' + quote(rid)) == 't'
        passed('Create and reload preserve catalog names, repeated UUIDs, order, optional values, notes and provider ownership')
        snapshot_id = assign(rid)
        snapshot_before = snapshots(snapshot_id)
        assert [(r['sets_snapshot'], r['reps_snapshot'], r['timer_seconds_snapshot'], r['notes_snapshot']) for r in snapshot_before] == [
            (3, 12, 45, 'Slow\nControlled'), (None, None, None, None), (None, 6, None, None)]
        passed('New assignments capture complete ordered prescription snapshots')
        saved([{'exercise_id': ea, 'sets': None, 'reps': 4, 'duration_seconds': None, 'notes': ''}], rid, 'Edited')
        assert load(rid)[0]['reps'] == 4 and load(rid)[0]['notes'] is None and load(rid)[0]['duration_seconds'] is None
        assert snapshots(snapshot_id) == snapshot_before
        assert snapshots(old_assignment) == next_rows(after['routine_assignment_exercises'], old_assignment)
        passed('Edit/reload supports clearing values and never changes existing assignment snapshots')
        saved([{'exercise_id': ea, 'sets': 2147483647, 'reps': 1, 'duration_seconds': 2147483647}], name='Integer bounds')
        passed('Positive PostgreSQL integer boundary values accepted')
        for field in ['sets', 'reps', 'duration_seconds']:
            for invalid in [0, -1, 1.5, '2', '', True, {}, [], 2147483648]:
                reject("select save_routine_prescriptions(null,'Invalid'," + json_sql([{'exercise_id': ea, field: invalid}]) + ');', '22023')
        passed('Zero, negative, fractional, string, boolean, container and overflow numeric inputs rejected server-side')
        for invalid in [None, {}, [], [None], ['label'], [{'exercise_id': None}], [{'exercise_id': 'bad'}],
                        [{'exercise_id': '99999999-9999-9999-9999-999999999999'}],
                        [{'exercise_id': ea, 'notes': 4}], [{'exercise_id': ea, 'name': 'Forged name'}],
                        [{'exercise_id': ea, 'timer_seconds': 30}], [{'exercise_id': ea}] * 101]:
            reject("select save_routine_prescriptions(null,'Invalid'," + json_sql(invalid) + ');', '22023')
        for invalid_name in ["''", 'null', quote(' '), quote('x' * 201)]:
            reject('select save_routine_prescriptions(null,' + invalid_name + ',' + json_sql([{'exercise_id': ea}]) + ');', '22023')
        passed('Invalid structures, notes, forged labels, unknown keys/UUIDs, count and name limits rejected')
        before_invalid = load(rid)
        reject('select save_routine_prescriptions(' + quote(rid) + ",'Invalid edit'," +
               json_sql([{'exercise_id': ea}, {'exercise_id': eb, 'sets': 0}]) + ');', '22023')
        assert load(rid) == before_invalid
        passed('Invalid edit is atomic and retains the saved prescription')
        old_client_new = value("select save_routine_from_catalog(null,'Old client',array[" + quote(ea) + '::uuid]);')
        value('select save_routine_from_catalog(' + quote(old_client_new) + ",'Old client edit',array[" + quote(eb) + '::uuid]);')
        assert load(old_client_new)[0]['exercise_id'] == eb
        assert set(load(old_client_new)[0]) == {'exercise_id', 'name'}
        reject('select save_routine_from_catalog(' + quote(rid) + ",'Erase',array[" + quote(ea) + '::uuid]);', '55000')
        reject('select save_routine(' + quote(rid) + ",'Flatten',array['Name']);", '55000')
        assert load(rid) == before_invalid
        passed('Old catalog clients can create/edit plain routines but cannot erase prescriptions; name-only writer cannot flatten objects')
        for expression in ['null', "array[]::uuid[]", "array[null::uuid]", "array[[" + quote(ea) + "::uuid],[" + quote(eb) + "::uuid]]"]:
            reject("select save_routine_from_catalog(null,'Invalid'," + expression + ');', 'ERROR:')
        passed('Old catalog contract still rejects null, empty, null-element and multidimensional arrays')
        for claim in [PATIENT, UNLINKED, '']:
            reject("select save_routine_prescriptions(null,'Denied'," + json_sql([{'exercise_id': ea}]) + ');', '42501', claim)
        reject('select save_routine_prescriptions(' + quote(rid) + ",'Stolen'," + json_sql([{'exercise_id': ea}]) + ');', 'P0002', B)
        reject('select assign_routine(' + quote(FOREIGN_PROFILE) + ',' + quote(rid) + ",'2026-12-03');", 'P0002', B)
        reject('select assign_routine(' + quote(PROFILE) + ',' + quote(rid) + ",'2026-12-03');", '42501', B)
        reject("select save_routine_prescriptions(null,'Anon'," + json_sql([{'exercise_id': ea}]) + ');', '42501', '', 'anon')
        reject('update routine_assignment_exercises set sets_snapshot=1;', '42501')
        assert value('select count(*) from routines where id=' + quote(rid), B) == '0'
        assert value('select count(*) from routine_assignment_exercises where routine_assignment_id=' + quote(snapshot_id), B) == '0'
        passed('Provider ownership, non-provider/anon denial, direct-write denial and RLS isolation hold')
        sql('update provider_patient_profiles set discharged_at=now() where id=' + quote(PROFILE))
        reject('select assign_routine(' + quote(PROFILE) + ',' + quote(rid) + ",'2026-12-03');", '42501')
        sql('update provider_patient_profiles set discharged_at=null where id=' + quote(PROFILE))
        passed('Discharged care relationships cannot receive assignments')
        patient_rows = json.loads(value('select jsonb_agg(to_jsonb(x) order by exercise_position) from get_my_routine_assignment_prescriptions(' + quote(snapshot_id) + ') x;', PATIENT))
        assert [r['timer_seconds_snapshot'] for r in patient_rows] == [45, None, None]
        assert value('select count(*) from get_my_routine_assignment_prescriptions(' + quote(snapshot_id) + ');', UNLINKED) == '0'
        assert value('select count(*) from get_my_routine_assignment_prescriptions(' + quote(snapshot_id) + ');', B) == '0'
        assert value('select count(*) from get_my_routine_assignment_exercises(' + quote(snapshot_id) + ');', PATIENT) == '3'
        passed('New patient API returns own prescription snapshots; unrelated callers see none and old patient API still works')
        # The snapshot CHECK constraints independently protect direct trusted writes.
        for field in ['sets_snapshot', 'reps_snapshot', 'timer_seconds_snapshot']:
            failed = sql('begin; update routine_assignment_exercises set ' + field + '=0 where routine_assignment_id=' + quote(snapshot_id) + '; rollback;', False)
            assert failed.returncode and '23514' in failed.stderr
        assert snapshots(snapshot_id) == snapshot_before
        assert rows()['exercises'] == before['exercises']
        assert rows()['routine_exercises'] == before['routine_exercises']
        assert hashlib.sha256(MIGRATION.read_bytes()).hexdigest() == source_hash
        passed('Snapshot CHECK constraints reject zero; shared catalog, legacy exercise rows and gated source remain unchanged')
        report = {'postgres_version': sql('show server_version').stdout.strip(), 'checks_passed': checks,
                  'migration_sha256': source_hash, 'hosted_connection': False,
                  'existing_assignment_rows_modified': 0, 'catalog_rows_preserved': len(before['exercises']),
                  'limitations': ['Synthetic schema and Auth test double, not a hosted clone', 'No hosted browser/PostgREST acceptance']}
        (work / 'assessment.json').write_text(json.dumps(report, indent=2))
        print('PRESCRIPTION REHEARSAL PASSED:', len(checks), 'checks')
        print('Report:', work / 'assessment.json')
    finally:
        if started:
            run(['pg_ctl', '-D', str(work / 'data'), '-m', 'immediate', 'stop'], check=False)
        socket.rmdir()


def next_rows(rows, assignment):
    return sorted([r for r in rows if r['routine_assignment_id'] == assignment], key=lambda row: row['position'])


if __name__ == '__main__':
    main()
