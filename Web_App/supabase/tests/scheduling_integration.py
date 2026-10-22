#!/usr/bin/env python3
"""SCRUM-64 real PostgreSQL tests. New disposable Unix-socket cluster, never hosted.

No endpoint flags or inherited database credentials are accepted. Baseline fixture
definitions are copied from reviewed source; only the new migration is deployed.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path
import hashlib
import json
import os
import subprocess
import tempfile
import uuid
import argparse

BASE = Path(__file__).resolve().parents[2]
PG = Path('/opt/homebrew/opt/postgresql@17/bin')
A = '00000000-0000-0000-0000-000000000001'
B = '00000000-0000-0000-0000-000000000002'
PATIENT = '00000000-0000-0000-0000-000000000003'
MIGRATION = BASE / 'supabase/migrations/20261021000100_patient_routine_scheduling.sql'


def q(value):
    return "'" + str(value).replace("'", "''") + "'"


def j(value):
    return q(json.dumps(value)) + '::jsonb'


def main():
    global PG
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', default=str(PG), help='Local PostgreSQL 17 binaries; no database endpoint is accepted')
    PG = Path(parser.parse_args().pg_bin)
    os.umask(0o077)
    work = Path(tempfile.mkdtemp(prefix='scrum64-pg-', dir='/private/tmp'))
    (work / 'pgpass').touch(mode=0o600)
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG') and k not in ('DATABASE_URL', 'SUPABASE_DB_URL')}
    env.update(PGHOST=str(work), PGPORT='55490', PGUSER='postgres', PGDATABASE='postgres',
               PGPASSFILE=str(work / 'pgpass'), PGOPTIONS='-c timezone=UTC')
    source = MIGRATION.read_text()
    digest = hashlib.sha256(source.encode()).hexdigest()
    checks = []
    started = False

    def run(args, text=None, check=True):
        result = subprocess.run([str(PG / args[0]), *args[1:]], input=text, env=env, cwd=BASE,
                                text=True, capture_output=True, timeout=90)
        if check and result.returncode:
            raise AssertionError(result.stderr)
        return result

    def sql(text, check=True):
        return run(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], text, check)

    def act(text, provider=A, check=True, role='authenticated'):
        return sql('set role ' + role + '; select set_config(\'request.jwt.claim.sub\',' + q(provider) + ',false);\n' + text, check)

    def value(text, provider=A):
        return act(text, provider).stdout.strip().splitlines()[-1]

    def data(text, provider=A):
        return json.loads(value(text, provider))

    def reject(text, code, provider=A, role='authenticated'):
        result = act(text, provider, False, role)
        assert result.returncode and code in result.stderr, result.stderr
        return result.stderr

    def passed(label):
        checks.append(label)
        print('PASS:', label, flush=True)

    def relationships():
        patient, pa, pb = [str(uuid.uuid4()) for _ in range(3)]
        sql('insert into patients(id,name) values(' + q(patient) + ",'Synthetic'); insert into provider_patient_profiles(id,provider_id,patient_id) values" +
            ','.join('(' + ','.join(map(q, row)) + ')' for row in [(pa, A, patient), (pb, B, patient)]) + ';')
        return patient, pa, pb

    def save(entries, routine=None, name='Scheduled routine', provider=A):
        return value('select save_routine_prescriptions(' + (q(routine) if routine else 'null') + ',' + q(name) + ',' + j(entries) + ');', provider)

    def preview(profile, entries, provider=A):
        return data('select preview_routine_schedule(' + q(profile) + ',' + j(entries) + ');', provider)

    def confirmed(previewed):
        return [{k: e[k] for k in ('date', 'routineId', 'token')} for e in previewed['entries']]

    def command(profile, entries, key=None):
        return 'select assign_routine_schedule(' + q(profile) + ',' + q(key or uuid.uuid4()) + ',' + j(entries) + ');'

    def snapshots(assignment):
        return json.loads(sql("select jsonb_agg(to_jsonb(e) order by position) from routine_assignment_exercises e where routine_assignment_id=" + q(assignment)).stdout)

    def counts():
        return sql("select (select count(*) from routine_assignments),(select count(*) from routine_assignment_exercises),(select count(*) from routine_schedule_requests);").stdout

    try:
        run(['initdb', '-D', str(work / 'data'), '-U', 'postgres', '--auth=trust', '--no-locale', '--no-sync'])
        run(['pg_ctl', '-D', str(work / 'data'), '-l', str(work / 'server.log'), '-o', f"-k {work} -h '' -p 55490", 'start'])
        started = True
        sql((BASE / 'supabase/tests/catalog_routines_fixture.sql').read_text())
        sql("""
alter table routine_assignments add column updated_at timestamptz default now();
alter table routine_follow_ups add column updated_at timestamptz default now();
alter table routine_follow_ups alter column id set default gen_random_uuid(), alter column status set default 'scheduled';
alter table routine_follow_ups add unique(routine_assignment_id);
alter table routine_assignments alter column patient_profile_id set not null, alter column routine_id set not null;
alter table routines alter column provider_id set not null;
""")
        # Explicit synthetic baseline construction, never a hosted migration sequence.
        legacy = (BASE / 'supabase/migrations/20261007000200_routines_exercise_list_compatibility.sql').read_text()
        sql(legacy)
        sql((BASE / 'supabase/migrations/20261019000100_patient_accounts.sql').read_text())
        catalog = (BASE / 'supabase/migrations/20261020000200_catalog_routines_nondestructive.sql').read_text()
        sql(catalog[catalog.index('-- Catalog is shared'):catalog.index('-- assign_routine is deliberately')])
        rx = (BASE / 'supabase/migrations/20261020000300_routine_prescriptions.sql').read_text()
        sql(rx[rx.index('-- Names match'):rx.index('do $verify$')])
        old = (BASE / 'supabase/migrations/20261006000100_clarify_schema_names.sql').read_text()
        sql(old[old.index('create or replace function public.cancel_routine_assignment'):old.index('create or replace function public.cancel_routine_follow_up')])
        sql('revoke all on function assign_routine(uuid,uuid,date),cancel_routine_assignment(uuid),schedule_routine_follow_up(uuid,timestamptz) from public,anon; grant execute on function assign_routine(uuid,uuid,date),cancel_routine_assignment(uuid),schedule_routine_follow_up(uuid,timestamptz) to authenticated;')
        ea, eb = sql('select id from exercises order by id limit 2').stdout.strip().splitlines()
        r1 = save([{'exercise_id': ea, 'sets': 3, 'reps': 12, 'duration_seconds': 30, 'notes': 'Original notes'}, {'exercise_id': eb}])
        r2 = save([{'exercise_id': eb}], name='Second routine')
        rb = save([{'exercise_id': ea}], name='Private B routine', provider=B)
        patient, pa, pb = relationships()
        history_profile = pa
        h1 = value('select assign_routine(' + q(pa) + ',' + q(r1) + ",'2020-01-01');")
        h2 = value('select assign_routine(' + q(pb) + ',' + q(rb) + ",'2020-01-01');", B)
        disabled = sql(source, False)
        assert disabled.returncode and 'execution is disabled' in disabled.stderr
        enabled = source.replace('hosted_execution_approved constant boolean := false;', 'hosted_execution_approved constant boolean := true;')
        collision = sql(enabled, False)
        assert collision.returncode and 'Existing patient/date collisions' in collision.stderr
        assert sql("select to_regnamespace('milestone_scheduling') is null").stdout.strip() == 't'
        passed('Disabled migration and patient-wide collision preflight make no changes')
        # An explicitly cancelled synthetic collision, never automatic migration cleanup.
        value('select cancel_routine_assignment(' + q(h2) + ');', B)
        sql((BASE / 'supabase/audits/scheduling_preflight.sql').read_text())
        prescription_definition = sql("select pg_get_functiondef('save_routine_prescriptions(uuid,text,jsonb)'::regprocedure)").stdout
        before = {t: sql('select jsonb_agg(to_jsonb(t) order by id) from ' + t + ' t').stdout for t in ['routines', 'exercises', 'routine_assignments', 'routine_assignment_exercises']}
        sql(enabled)
        for table, serialized in before.items():
            minus = "-'patient_id'" if table == 'routine_assignments' else "-'exercise_id_snapshot'" if table == 'routine_assignment_exercises' else ''
            assert sql('select jsonb_agg(to_jsonb(t)' + minus + ' order by id) from ' + table + ' t').stdout == serialized
        assert all(row['exercise_id_snapshot'] is None for row in snapshots(h1))
        assert sql("select pg_get_functiondef('save_routine_prescriptions(uuid,text,jsonb)'::regprocedure)").stdout == prescription_definition
        sql((BASE / 'supabase/audits/scheduling_verify.sql').read_text())
        assert sql(enabled, False).returncode
        passed('Migration preserves existing records and unknown identities; replay rejected')
        policy = data('select get_routine_scheduling_policy();')
        assert policy['timeZone'] == 'America/Los_Angeles' and policy['horizonDays'] == 14
        today = date.fromisoformat(policy['today'])
        day = lambda offset: (today + timedelta(days=offset)).isoformat()
        def selections(*offsets, routine=r1):
            return [{'date': day(d), 'routineId': routine} for d in offsets]
        p, pa, pb = relationships()
        items = selections(0, 13)
        items[1]['routineId'] = r2
        pre = preview(pa, items)
        before_counts = counts()
        assert pre['conflicts'] == [] and len(pre['entries']) == 2
        assert counts() == before_counts
        key = str(uuid.uuid4())
        payload = confirmed(pre)
        result = data(command(pa, payload, key))
        assert len(result['assignments']) == 2
        assert sql('select count(*) from routine_assignments where patient_id=' + q(p)).stdout.strip() == '2'
        captured = snapshots(result['assignments'][0]['id'])
        assert (captured[0]['exercise_id_snapshot'], captured[0]['sets_snapshot'], captured[0]['reps_snapshot'], captured[0]['timer_seconds_snapshot'], captured[0]['notes_snapshot']) == (ea, 3, 12, 30, 'Original notes')
        assert data(command(pa, list(reversed(payload)), key)) == result
        assert data('select get_routine_schedule_request(' + q(key) + ');') == result
        assert value('select get_routine_schedule_request(' + q(key) + ') is null;', B) == 't'
        passed('Read-only preview; newly created routines; day 0/day 13; identity and all prescription snapshots; receipt replay')
        changed = [dict(e) for e in payload]
        changed[0]['routineId'] = r2
        reject(command(pa, changed, key), '22023')
        conflict = preview(pb, selections(0, routine=rb), B)
        assert conflict['conflicts'] == [{'date': day(0), 'assignmentId': None, 'routineName': None}]
        reject(command(pb, confirmed(conflict)), '23505', B)
        reject(command(pa, confirmed(preview(pa, selections(0, routine=r2)))), '23505')
        reject('select assign_routine(' + q(pb) + ',' + q(rb) + ',' + q(day(0)) + ');', '23505', B)
        historical = data('select get_patient_schedule_occupancy(' + q(history_profile) + ",'2020-01-01','2020-01-07');")
        assert len(historical) == 1 and historical[0]['assignmentId'] == h1
        passed('Patient-wide cross-provider conflicts reveal dates only; changed idempotent payload rejected')
        for bad in [-1, 14]:
            reject('select preview_routine_schedule(' + q(pa) + ',' + j(selections(bad)) + ');', '22023')
            reject('select assign_routine(' + q(pa) + ',' + q(r1) + ',' + q(day(bad)) + ');', '22023')
        reject('select preview_routine_schedule(' + q(pa) + ',' + j(selections(1, 1)) + ');', '22023')
        reject('select preview_routine_schedule(' + q(pa) + ',' + j([{'date': '2026-02-30', 'routineId': r1}]) + ');', '22023')
        passed('Horizon, invalid calendar dates, duplicate dates, and old API bypass attempts rejected')
        # Immutable future prescription, including its routine title and exercise identity.
        future_id = result['assignments'][1]['id']
        future_before = snapshots(future_id)
        stale = confirmed(preview(pa, selections(1, routine=r2)))
        save([{'exercise_id': ea, 'sets': 8, 'notes': 'Changed'}], r2, 'Changed title')
        reject(command(pa, stale), '40001')
        assert snapshots(future_id) == future_before
        save([{'exercise_id': eb, 'reps': 50}], r1, 'Edited current template')
        assert snapshots(result['assignments'][0]['id']) == captured
        assert value('select routine_name_snapshot from routine_assignments where id=' + q(future_id)) == 'Second routine'
        reject('update routine_assignment_exercises set reps_snapshot=5;', '42501')
        assert sql('update routine_assignment_exercises set reps_snapshot=5 where routine_assignment_id=' + q(future_id), False).returncode
        assert sql('update routine_assignments set scheduled_date=scheduled_date+1 where id=' + q(future_id), False).returncode
        passed('Template edits cannot alter future snapshots; stale preview and direct snapshot mutation rejected')
        value('select cancel_routine_assignment(' + q(result['assignments'][0]['id']) + ');')
        value('select cancel_routine_assignment(' + q(result['assignments'][0]['id']) + ');')
        assert data(command(pa, payload, key)) == result
        replacement = data(command(pa, confirmed(preview(pa, selections(0, routine=r2)))))
        assert replacement['assignments'][0]['id'] != result['assignments'][0]['id']
        assert snapshots(result['assignments'][0]['id']) == captured
        passed('Idempotent cancellation frees date; receipt replay after cancellation never recreates; history retained')
        # Full rollback even after earlier assignment and snapshot INSERTs succeeded.
        _, px, _ = relationships()
        prepared = confirmed(preview(px, selections(1, 2)))
        sql("create function public.fail_second_snapshot() returns trigger language plpgsql as $$begin if (select scheduled_date from public.routine_assignments where id=new.routine_assignment_id)=" + q(day(2)) + "::date then raise exception 'synthetic late failure'; end if; return new; end$$; create trigger synthetic_late_failure before insert on routine_assignment_exercises for each row execute function fail_second_snapshot();")
        before_counts = counts()
        reject(command(px, prepared), 'synthetic late failure')
        assert counts() == before_counts
        sql('drop trigger synthetic_late_failure on routine_assignment_exercises; drop function fail_second_snapshot();')
        passed('Late snapshot failure rolls back every assignment, snapshot, and receipt atomically')
        # Genuine concurrent sessions, both identical and competing requests.
        _, px, _ = relationships()
        prepared = confirmed(preview(px, selections(3, 4)))
        same = command(px, prepared, str(uuid.uuid4()))
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: data(same), range(2)))
        assert responses[0] == responses[1]
        _, px, py = relationships()
        ca = command(px, confirmed(preview(px, selections(3))))
        cb = command(py, confirmed(preview(py, selections(3, routine=rb), B)))
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda pair: act(pair[0], pair[1], False), [(ca, A), (cb, B)]))
        assert sorted(r.returncode == 0 for r in responses) == [False, True]
        assert '23505' in next(r.stderr for r in responses if r.returncode)
        passed('Concurrent same-key requests share one result; competing providers cannot both occupy a date')
        _, px, py = relationships()
        prepared = confirmed(preview(px, selections(5)))
        for provider in [B, PATIENT, '']:
            reject(command(px, prepared), '42501', provider)
        reject(command(px, prepared), '42501', '', 'anon')
        reject('select preview_routine_schedule(' + q(px) + ',' + j(selections(5, routine=rb)) + ');', '42501')
        reject(command(str(uuid.uuid4()), prepared), '42501')
        reject('select preview_routine_schedule(' + q(px) + ',' + j(selections(5, routine=str(uuid.uuid4()))) + ');', '42501')
        reject('select preview_routine_schedule(' + q(px) + ',' + j(selections(5, routine='not-a-uuid')) + ');', '22023')
        sql('update provider_patient_profiles set discharged_at=now() where id=' + q(px))
        reject(command(px, prepared), '42501')
        assert sql("select has_schema_privilege('authenticated','milestone_scheduling','usage')").stdout.strip() == 'f'
        assert sql("select has_table_privilege('authenticated','routine_schedule_requests','insert')").stdout.strip() == 'f'
        assert value('select count(*) from routine_schedule_requests where provider_id=' + q(A), B) == '0'
        passed('Ownership, invalid identifiers, discharged relationships, anonymous/non-provider access, receipt RLS and grants')
        _, px, _ = relationships()
        for contents in [[], [None], [{'name': 'Bad', 'reps': '12'}], [{'name': 'Bad', 'duration_seconds': 0}],
                         [{'name': 'Bad', 'exercise_id': 'bad'}], [{'name': 'Bad', 'timer': 30}], [{'name': '  '}],
                         [{'name': 'One', 'title': 'Another'}], [{'name': 'Bad', 'notes': 3}]]:
            rid = sql('insert into routines(provider_id,name,exercise_list) values(' + q(A) + ",'Malformed',array(select value from jsonb_array_elements(" + j(contents) + '))) returning id;').stdout.strip()
            reject('select preview_routine_schedule(' + q(px) + ',' + j(selections(1, routine=rid)) + ');', '22023')
        passed('Malformed legacy routines are rejected without modifying their saved templates')
        # Test production calendar helper at fixed instants; no public clock override.
        def at(instant):
            return json.loads(sql('select milestone_scheduling.policy_at(' + q(instant) + '::timestamptz)').stdout)
        assert at('2026-03-08T07:59:59Z')['today'] == '2026-03-07'
        assert at('2026-03-08T08:00:00Z')['today'] == '2026-03-08'
        assert at('2026-03-08T10:00:00Z')['lastDate'] == '2026-03-21'
        assert at('2026-11-01T08:30:00Z') == at('2026-11-01T09:30:00Z')
        sql("update milestone_scheduling.policy set horizon_days=21,time_zone='Pacific/Auckland';")
        assert at('2026-12-31T12:00:00Z')['today'] == '2027-01-01'
        assert at('2026-12-31T12:00:00Z')['lastDate'] == '2027-01-21'
        assert data(command(pa, payload, key)) == result
        sql("update milestone_scheduling.policy set horizon_days=14,time_zone='America/Los_Angeles';")
        passed('Server timezone, midnight, both DST transitions, year boundary, configurable policy, and receipt replay')
        # Policy must fail closed, including if its only row is missing.
        _, px, _ = relationships()
        late = confirmed(preview(px, selections(13)))
        sql('update milestone_scheduling.policy set horizon_days=1;')
        before_counts = counts()
        reject(command(px, late), '22023')
        assert counts() == before_counts
        sql('delete from milestone_scheduling.policy;')
        reject(command(px, late), '55000')
        sql("insert into milestone_scheduling.policy values(true,14,'America/Los_Angeles');")
        # Composite identity FK and index remain authoritative for direct admin writes.
        wrong_patient, _, _ = relationships()
        invalid = sql('insert into routine_assignments(patient_id,patient_profile_id,routine_id,scheduled_date,routine_name_snapshot) values(' + ','.join(map(q,[wrong_patient,px,r1,day(1),'Bad identity'])) + ');',False)
        assert invalid.returncode and '23503' in invalid.stderr
        old_api = value('select assign_routine(' + q(px) + ',' + q(r1) + ',' + q(day(1)) + ');')
        assert snapshots(old_api)[0]['exercise_id_snapshot'] == eb
        reject('select cancel_routine_assignment(' + q(old_api) + ');', '42501', B)
        passed('Horizon revalidation, missing policy, composite identity FK, old API snapshots, and unauthorized cancellation')
        # Cancellation and existing follow-up scheduling use the same patient lock.
        follow = 'select schedule_routine_follow_up(' + q(old_api) + ",now()+interval '1 day');"
        cancel = 'select cancel_routine_assignment(' + q(old_api) + ');'
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda command: act(command,A,False), [follow,cancel]))
        assert responses[1].returncode == 0
        assert responses[0].returncode == 0 or '42501' in responses[0].stderr
        assert sql('select count(*) from routine_follow_ups where routine_assignment_id=' + q(old_api) + " and status='scheduled'").stdout.strip() == '0'
        reject(follow,'42501')
        passed('Concurrent follow-up scheduling cannot survive assignment cancellation')
        # Commit survives a database restart and fresh connections, without resubmission.
        run(['pg_ctl', '-D', str(work / 'data'), '-m', 'fast', 'stop'])
        started = False
        run(['pg_ctl', '-D', str(work / 'data'), '-l', str(work / 'server.log'), '-o', f"-k {work} -h '' -p 55490", 'start'])
        started = True
        assert data('select get_routine_schedule_request(' + q(key) + ');') == result
        assert snapshots(future_id) == future_before
        passed('Assignments, future snapshots, and operation receipts survive database restart and reconnect')
        assert hashlib.sha256(MIGRATION.read_bytes()).hexdigest() == digest
        (work / 'results.json').write_text(json.dumps({'passed': len(checks), 'checks': checks, 'hosted_connection': False}, indent=2))
        print(f'PASS: {len(checks)} PostgreSQL integration groups. Evidence: {work}/results.json', flush=True)
    finally:
        if started:
            run(['pg_ctl', '-D', str(work / 'data'), '-m', 'fast', 'stop'], check=False)


if __name__ == '__main__':
    main()
