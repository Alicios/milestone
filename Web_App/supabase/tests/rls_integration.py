#!/usr/bin/env python3
"""SCRUM-92 behavioral tests in a new local PostgreSQL cluster; never hosted.

Accepts only a PostgreSQL binary directory, not an endpoint. No .env files,
network clients, application startup, or existing database are used.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import tempfile
import uuid

BASE = Path(__file__).resolve().parents[2]
MIGRATIONS = BASE / 'supabase/migrations'
A, B, PATIENT, OUTSIDER = [f'00000000-0000-0000-0000-{i:012d}' for i in range(1, 5)]
PATCHES = ['20261029000100_scrum92_create_patient_authorization.sql',
           '20261029000200_scrum92_client_privileges.sql']


def q(value):
    return "'" + str(value).replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', default='/opt/homebrew/opt/postgresql@17/bin')
    pg = Path(parser.parse_args().pg_bin)
    os.umask(0o077)
    work = Path(tempfile.mkdtemp(prefix='scrum92-pg-'))
    (work / 'pgpass').touch(mode=0o600)
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(('PG', 'SUPABASE', 'VITE_SUPABASE', 'EXPO_PUBLIC_SUPABASE'))
           and k not in ('DATABASE_URL', 'MILESTONE_DEMO_DATABASE_URL')}
    # Short private socket, TCP disabled; explicit connection args override defaults.
    socket = Path(tempfile.mkdtemp(prefix='s92-', dir='/private/tmp'))
    env.update(PGHOST=str(socket), PGPORT='55492', PGUSER='postgres', PGDATABASE='postgres',
               PGPASSFILE=str(work / 'pgpass'), PGOPTIONS='-c timezone=UTC')
    checks, started = [], False

    def run(args, source=None, check=True):
        result = subprocess.run([str(pg / args[0]), *args[1:]], input=source,
                                env=env, cwd=BASE, text=True, capture_output=True, timeout=120)
        if check and result.returncode:
            raise AssertionError(result.stderr)
        return result

    def sql(source, check=True):
        return run(['psql', '-X', '-h', str(socket), '-p', '55492', '-U', 'postgres',
                    '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], source, check)

    def act(source, identity=A, role='authenticated', check=True):
        return sql('set role ' + role + '; select set_config(\'request.jwt.claim.sub\',' +
                   q(identity) + ',false);\n' + source, check)

    def value(source, identity=A, role='authenticated'):
        return act(source, identity, role).stdout.strip().splitlines()[-1]

    def reject(source, identity=A, role='authenticated', code='42501'):
        result = act(source, identity, role, False)
        assert result.returncode and code in result.stderr, (source, result.stdout, result.stderr)

    def passed(label):
        checks.append(label)
        print('PASS:', label, flush=True)

    def source(name):
        return (MIGRATIONS / name).read_text()

    def public_rows():
        tables = sql("select tablename from pg_tables where schemaname='public' order by tablename;").stdout.splitlines()
        return {t: sql('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),\'[]\') from public.' + t + ' t;').stdout for t in tables}

    def policies():
        return sql("select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public';").stdout

    try:
        run(['initdb', '-D', str(work / 'data'), '-U', 'postgres', '--auth=trust', '--no-locale', '--no-sync'])
        run(['pg_ctl', '-D', str(work / 'data'), '-l', str(work / 'server.log'),
             '-o', f"-k {socket} -h '' -p 55492", 'start'])
        started = True
        fixture = (BASE / 'supabase/tests/catalog_routines_fixture.sql').read_text()
        # Use synthetic exercises as well as synthetic people; no CSV/hosted export.
        sql(fixture[:fixture.index('-- The reference CSV')])
        sql("insert into exercises values('00000000-0000-0000-0000-000000000030','Synthetic exercise','Synthetic',now());")
        sql((BASE / 'supabase/tests/rls_fixture.sql').read_text())
        # Reconstruct only the synthetic local baseline; never replay these on hosted.
        sql(source('20261004000800_provider_profile_update_policy.sql'))
        sql(source('20261007000200_routines_exercise_list_compatibility.sql'))
        sql(source('20261019000100_patient_accounts.sql'))
        sql("update patients set auth_user_id=" + q(PATIENT) + ';')
        catalog = source('20261020000200_catalog_routines_nondestructive.sql')
        sql(catalog[catalog.index('-- Catalog is shared'):catalog.index('-- assign_routine is deliberately')])
        rx = source('20261020000300_routine_prescriptions.sql')
        sql(rx[rx.index('-- Names match'):rx.index('do $verify$')])
        old = source('20261006000100_clarify_schema_names.sql')
        sql(old[old.index('create or replace function public.cancel_routine_assignment'):old.index('create or replace function public.cancel_routine_follow_up')])
        sql('revoke all on function assign_routine(uuid,uuid,date),cancel_routine_assignment(uuid),schedule_routine_follow_up(uuid,timestamptz) from public,anon; grant execute on function assign_routine(uuid,uuid,date),cancel_routine_assignment(uuid),schedule_routine_follow_up(uuid,timestamptz) to authenticated;')
        scheduling = source('20261021000100_patient_routine_scheduling.sql')
        sql(scheduling.replace('hosted_execution_approved constant boolean := false;',
                               'hosted_execution_approved constant boolean := true;'))
        messages = source('20261007000500_messages.sql')
        sql(messages[messages.index('alter table public.messages enable'):messages.index('comment on table public.messages')])
        sql('create trigger create_provider_message_thread_state after insert on provider_patient_profiles for each row execute function public.create_provider_message_thread_state();')
        sql(source('20261027035220_functional_patient_messaging.sql'))
        legacy = source('20261004000300_relationship_patient_profiles.sql')
        sql(legacy[legacy.index('create or replace function public.create_patient'):legacy.index('comment on table public.provider_patient_profiles')])
        sql(source('20261024000100_patient_account_creation.sql'))
        # Reported excessive table grants plus independent column-grant regressions.
        sql('''
grant all on access_requests, medical_practices to anon, authenticated;
grant all on providers to authenticated;
grant select on patients, provider_patient_profiles, routine_assignments, routines to anon;
grant select(id), update(name) on patients to public, anon;
grant insert(id), update(status) on access_requests to public, anon, authenticated;
grant update(id), insert(id) on providers to authenticated;
grant select(id), update(name) on medical_practices to public, anon, authenticated;
grant truncate on all tables in schema public to public, anon, authenticated;
grant all on all tables in schema public to service_role;
grant select on exercises to anon;
create policy "Temporary mobile read exercises" on exercises for select to anon using(true);
''')
        # Prove the fixture exposes the missing provider check before remediation.
        for call in ["create_patient('Before')", "create_patient('Before',null,null)"]:
            act('begin; select ' + call + '; rollback;', OUTSIDER)
        passed('Baseline reproduces non-provider creation through both overloads')
        before, before_policies = public_rows(), policies()
        sql((BASE / 'supabase/audits/scrum92_preflight.sql').read_text())
        fk = sql("select pg_get_constraintdef(oid) from pg_constraint where conrelid='provider_patient_profiles'::regclass and conname='provider_patient_profiles_provider_id_fkey';").stdout
        for name in PATCHES:
            sql(source(name))
        assert public_rows() == before
        assert policies() == before_policies
        assert sql("select pg_get_constraintdef(oid) from pg_constraint where conrelid='provider_patient_profiles'::regclass and conname='provider_patient_profiles_provider_id_fkey';").stdout == fk
        passed('Migrations preserve all baseline rows, policies (including duplicates/catalog), and provider FK')

        for call in ["create_patient('Denied')", "create_patient('Denied',null,null)"]:
            for identity, role in [('', 'anon'), ('', 'authenticated'), (PATIENT, 'authenticated'), (OUTSIDER, 'authenticated')]:
                reject('select ' + call + ';', identity, role)
        assert public_rows() == before
        passed('Both overloads deny anon, missing UID, patient, and authenticated non-provider without writes')

        assert sql("select bool_and(prosecdef and proconfig @> array['search_path=\"\"'] and not has_function_privilege('anon',oid,'execute') and has_function_privilege('authenticated',oid,'execute')) from pg_proc where oid in ('create_patient(text)'::regprocedure,'create_patient(text,text,text)'::regprocedure);").stdout.strip() == 't'
        ids = []
        for call in ["create_patient('  Legacy patient  ')", "create_patient('  Current patient  ',' 123 ',' patient@example.invalid ')", "create_patient(' Default email ', '   ')"]:
            patient_id = value('select ' + call + ';')
            uuid.UUID(patient_id)
            ids.append(patient_id)
            assert value('select count(*) from provider_patient_profiles where patient_id=' + q(patient_id) + ' and provider_id=' + q(A)) == '1'
            assert value('select count(*) from message_thread_state s join provider_patient_profiles p on p.id=s.patient_profile_id where p.patient_id=' + q(patient_id)) == '1'
        assert value('select name from patients where id=' + q(ids[0])) == 'Legacy patient'
        assert value('select name||\'|\'||phone||\'|\'||email||\'|\'||care_status from patients where id=' + q(ids[1])) == 'Current patient|123|patient@example.invalid|pending'
        assert value('select phone is null and email is null from patients where id=' + q(ids[2])) == 't'
        for name in ['null', "''", "'   '"]:
            for args in [name, name + ',null,null']:
                reject('select create_patient(' + args + ');', code='22023')
        passed('Provider creation preserves UUIDs, trimming, defaults, validation, ownership, and thread trigger')

        patient_id = ids[1]
        profile = value('select id from provider_patient_profiles where patient_id=' + q(patient_id))
        assert value('select count(*) from patients where id=' + q(patient_id), B) == '0'
        assert value('select count(*) from provider_patient_profiles where id=' + q(profile), B) == '0'
        reject('update patients set name=\'Denied\' where id=' + q(patient_id), B)
        assert value('with changed as (update provider_patient_profiles set clinical_notes=\'Denied\' where id=' + q(profile) + ' returning id) select count(*) from changed;', B) == '0'
        assert value('with changed as (update provider_patient_profiles set clinical_notes=\'Own notes\' where id=' + q(profile) + ' returning id) select count(*) from changed;') == '1'
        passed('Cross-provider patient reads/writes denied; own clinical-note update preserved')

        for role, identity in [('anon', ''), ('authenticated', OUTSIDER)]:
            act("insert into access_requests(name,email,department,notes) values('Synthetic','public@example.invalid','Synthetic','Hello');", identity, role)
            assert value('select count(*) from medical_practices;', identity, role) == '1'
            reject('select * from access_requests;', identity, role)
            reject("insert into access_requests(name,email,department,status) values('Bad','bad@example.invalid','X','approved');", identity, role)
            reject("insert into access_requests(id,name,email,department) values(gen_random_uuid(),'Bad','bad@example.invalid','X');", identity, role)
            reject("update medical_practices set name='Denied';", identity, role)
        assert sql("select count(*)=2 and bool_and(status='pending') from access_requests;").stdout.strip() == 't'
        passed('Anonymous/authenticated onboarding works; status/ID spoofing and private reads denied')

        fields = "name='Edited', professional_title='PT', initials='EP', contact_email='provider@example.invalid', phone='123', bio='Bio', avatar_url='https://example.invalid/avatar', medical_practice_id='00000000-0000-0000-0000-000000000020', facility='Facility', office_location='Office', work_phone='123', work_phone_extension='1', preferred_contact='email'"
        assert value('update providers set ' + fields + ' where id=' + q(A) + ' returning name;') == 'Edited'
        assert value('select count(*) from providers p join medical_practices m on m.id=p.medical_practice_id;') == '1'
        assert value('with changed as (update providers set name=\'Denied\' where id=' + q(A) + ' returning id) select count(*) from changed;', B) == '0'
        reject('update providers set id=id;')
        reject('insert into providers(id) values(' + q(OUTSIDER) + ');', OUTSIDER)
        reject('delete from providers where id=' + q(A))
        passed('Provider profile fields and joined reads work; identity edits, self-provisioning, and cross-provider edits denied')

        for role in ['anon', 'authenticated']:
            assert sql("select bool_and(not has_table_privilege(" + q(role) + ",oid,'truncate')) from pg_class where relnamespace='public'::regnamespace and relkind='r';").stdout.strip() == 't'
        for table in ['patients', 'provider_patient_profiles', 'routines', 'routine_assignments', 'providers', 'messages']:
            reject('select * from ' + table + ';', '', 'anon')
        reject("update patients set name='Denied';", '', 'anon')
        assert sql("select has_column_privilege('anon','patients','id','select') or has_column_privilege('authenticated','providers','id','update');").stdout.strip() == 'f'
        assert value('select count(*) from exercises;', '', 'anon') == '1'
        assert sql("select bool_and(has_table_privilege('service_role',oid,'truncate')) from pg_class where relnamespace='public'::regnamespace and relkind='r';").stdout.strip() == 't'
        passed('TRUNCATE and residual column grants removed; service-role grants and temporary catalog reads preserved')

        # Use real production RPC bodies under RLS after the new grants.
        exercise = '00000000-0000-0000-0000-000000000030'
        payload = q(json.dumps([{'exercise_id': exercise, 'sets': 3, 'reps': 12}])) + '::jsonb'
        routine = value("select save_routine_prescriptions(null,'Synthetic routine'," + payload + ');')
        value('select save_routine_prescriptions(' + q(routine) + ",'Edited routine'," + payload + ');')
        today = json.loads(value('select get_routine_scheduling_policy();'))['today']
        entries = q(json.dumps([{'date': today, 'routineId': routine}])) + '::jsonb'
        preview = json.loads(value('select preview_routine_schedule(' + q(profile) + ',' + entries + ');'))
        selections = [{k: e[k] for k in ('date', 'routineId', 'token')} for e in preview['entries']]
        request_id = str(uuid.uuid4())
        call = 'select assign_routine_schedule(' + q(profile) + ',' + q(request_id) + ',' + q(json.dumps(selections)) + '::jsonb);'
        receipt = json.loads(value(call))
        assert json.loads(value(call)) == receipt
        assignment = receipt['assignments'][0]['id']
        assert value('select count(*) from routine_assignments where id=' + q(assignment)) == '1'
        assert value('select count(*) from routine_assignments where id=' + q(assignment), B) == '0'
        assert value('select count(*) from routine_assignment_exercises where routine_assignment_id=' + q(assignment)) == '1'
        reject('select assign_routine(' + q(profile) + ',' + q(routine) + ',' + q(today) + ');', B)
        reject('insert into routines(provider_id,name) values(' + q(A) + ",'Bypass');")
        reject('update routine_assignments set status=\'completed\';')
        value('select schedule_routine_follow_up(' + q(assignment) + ",now()+interval '1 day');")
        assert value('select count(*) from routine_follow_ups where routine_assignment_id=' + q(assignment)) == '1'
        # Link this synthetic patient to the synthetic patient Auth user for mobile reads.
        sql('update patients set auth_user_id=null where auth_user_id=' + q(PATIENT) + '; update patients set auth_user_id=' + q(PATIENT) + ' where id=' + q(patient_id))
        assert value('select count(*) from get_my_routine_assignment_prescriptions(' + q(assignment) + ');', PATIENT) == '1'
        assert value('select count(*) from get_my_routine_assignments(' + q(profile) + ');', PATIENT) == '1'
        assert value('select count(*) from get_my_routine_assignment_prescriptions(' + q(assignment) + ');', OUTSIDER) == '0'
        value('select cancel_routine_assignment(' + q(assignment) + ');')
        assert value('select status from routine_follow_ups where routine_assignment_id=' + q(assignment)) == 'cancelled'
        value('select assign_routine(' + q(profile) + ',' + q(routine) + ',' + q(today) + ');')
        passed('Routine create/edit, scheduling preview/receipt/replay, follow-ups, cancellation, legacy assignment, mobile snapshots work')

        message = value('insert into messages(patient_profile_id,sender_kind,body) values(' + q(profile) + ",'provider','Synthetic provider message') returning id;")
        assert value('select count(*) from messages where id=' + q(message), PATIENT) == '1'
        reply = value('select send_my_message(' + q(profile) + ",'Synthetic patient message');", PATIENT)
        value('select read_my_message_thread(' + q(profile) + ',' + q(message) + ');', PATIENT)
        act('update message_thread_state set starred=true,last_read_at=now() where patient_profile_id=' + q(profile))
        assert value('select count(*) from messages where id=' + q(reply)) == '1'
        assert value('select count(*) from messages where patient_profile_id=' + q(profile), B) == '0'
        reject('select send_my_message(' + q(profile) + ",'Denied');", OUTSIDER)
        reject('insert into messages(patient_profile_id,sender_kind,body) values(' + q(profile) + ",'provider','Spoof');", PATIENT)
        assert value('select count(*) from provider_patient_profiles;', PATIENT) == '0'
        passed('Provider/patient messages, patient Realtime SELECT, cursors/stars work; spoofing and notes exposure denied')

        # Replay safety and failed preflight rollback are local-only checks.
        before = public_rows()
        for name in PATCHES:
            sql(source(name))
        assert public_rows() == before and policies() == before_policies
        definition = sql("select pg_get_functiondef('public.create_patient(text)'::regprocedure);").stdout
        sql(definition.replace('Patient name is required', 'Unexpected hosted validation'))
        failure = sql(source(PATCHES[0]), False)
        assert failure.returncode and 'body drift' in failure.stderr
        assert 'Unexpected hosted validation' in sql("select prosrc from pg_proc where oid='public.create_patient(text)'::regprocedure;").stdout
        sql(definition)
        sql("create function public.create_patient(text,text) returns uuid language sql as 'select null::uuid';")
        failure = sql(source(PATCHES[0]), False)
        assert failure.returncode and 'Unexpected create_patient signature' in failure.stderr
        sql('drop function public.create_patient(text,text);')
        passed('Unexpected function body or extra overload blocks deployment without overwriting it')
        sql('alter table public.messages disable row level security; grant truncate on access_requests to anon;')
        failure = sql(source(PATCHES[1]), False)
        assert failure.returncode and 'RLS enabled' in failure.stderr
        assert sql("select has_table_privilege('anon','access_requests','truncate');").stdout.strip() == 't'
        sql('alter table public.messages enable row level security;')
        sql(source(PATCHES[1]))
        passed('Replay preserves data/policies; unexpected RLS state aborts and rolls back all privilege changes')
        report = {'passed_groups': len(checks), 'checks': checks, 'hosted_connection': False,
                  'migration_sha256': {name: hashlib.sha256((MIGRATIONS / name).read_bytes()).hexdigest() for name in PATCHES}}
        (work / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
        print(f'PASS: {len(checks)} PostgreSQL integration groups. Evidence: {work}/results.json', flush=True)
    finally:
        if started:
            run(['pg_ctl', '-D', str(work / 'data'), '-m', 'fast', 'stop'], check=False)


if __name__ == '__main__':
    main()
