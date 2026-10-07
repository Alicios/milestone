"""Independent local psql sessions; synchronize on observed database locks, not sleeps.

Only run from run-exercises.sh against its disposable Unix-socket cluster.
"""
import os
from pathlib import Path
from queue import Queue, Empty
import subprocess
import sys
from threading import Thread
import time
from uuid import uuid4, UUID

socket_dir = Path(sys.argv[1])
if not socket_dir.is_dir() or not socket_dir.name.startswith('milestone-exercises.'):
    raise SystemExit('Expected the disposable test cluster socket directory')
args = ['psql', '-X', '-qAt', '--no-password', '--host', str(socket_dir), '--port', '55443',
        '--username', 'scrum43_test', '--dbname', 'postgres', '--set', 'ON_ERROR_STOP=1']
# Explicit local connection arguments plus no inherited libpq connection settings.
env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}


class Session:
    def __init__(self):
        self.process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.STDOUT, text=True, bufsize=1, env=env)
        self.lines = Queue()
        Thread(target=self.read_output, daemon=True).start()
        self.execute("set statement_timeout = '20s'; set idle_in_transaction_session_timeout = '30s';")
        self.pid = int(self.execute('select pg_backend_pid();')[0])

    def read_output(self):
        for line in self.process.stdout:
            self.lines.put(line.rstrip('\n'))
        self.lines.put(None)

    def send(self, sql):
        marker = 'DONE_' + uuid4().hex
        self.process.stdin.write(sql + '\n\\echo ' + marker + '\n')
        self.process.stdin.flush()
        return marker

    def finish(self, marker):
        output = []
        deadline = time.monotonic() + 25
        while True:
            try:
                line = self.lines.get(timeout=max(0.01, deadline - time.monotonic()))
            except Empty as error:
                raise AssertionError(f'psql session timed out: {output}') from error
            if line is None:
                raise AssertionError(f'psql exited before completion: {output}')
            if line == marker:
                return output
            output.append(line)

    def execute(self, sql):
        return self.finish(self.send(sql))

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()


def quoted_uuid(value):
    return "'" + str(UUID(value)) + "'"


def expect_error(call, code):
    return f"do $$ begin perform {call}; raise exception 'Expected SQLSTATE {code}'; exception when sqlstate '{code}' then null; end $$;"


def wait_for_block(observer, waiter, blocker):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if observer.execute(f'select {blocker.pid} = any(pg_blocking_pids({waiter.pid}));') == ['t']:
            return
        if waiter.process.poll() is not None:
            raise AssertionError('Waiting session exited before the expected lock was observed')
        # Poll an explicit predicate; elapsed time never determines test success.
        time.sleep(0.02)
    raise AssertionError('Expected database lock dependency was not observed')


sessions = []
try:
    for _ in range(4):
        sessions.append(Session())
    observer, writer, reader, other_provider = sessions
    provider_a = '00000000-0000-0000-0000-000000000001'
    provider_b = '00000000-0000-0000-0000-000000000002'
    profile = "'00000000-0000-0000-0000-000000000011'"
    for session, provider in [(writer, provider_a), (reader, provider_a), (other_provider, provider_b)]:
        session.execute(f"set role authenticated; select set_config('request.jwt.claim.sub', '{provider}', false);")
    observer.execute(f'update public.provider_patient_profiles set discharged_at = null where id = {profile};')
    first = quoted_uuid(writer.execute("select public.save_exercise(null, 'Concurrency first', 'Original');")[0])
    second = quoted_uuid(writer.execute("select public.save_exercise(null, 'Concurrency second', 'Second instructions');")[0])
    routine = quoted_uuid(writer.execute(f"select public.save_routine_with_exercises(null, 'Concurrency routine', array[{first}::uuid]);")[0])

    # An assignment waits for a catalog edit; another provider need not wait.
    writer.execute(f"begin; select public.save_exercise({first}, 'Committed rename', 'Committed instructions');")
    pending = reader.send(f"select public.assign_routine({profile}, {routine}, '2030-01-01');")
    wait_for_block(observer, reader, writer)
    other_provider.execute("select public.save_exercise(null, 'Independent provider', '');")
    writer.execute('commit;')
    assignment = quoted_uuid(reader.finish(pending)[0])
    assert observer.execute(f"select exercise_name_snapshot || '|' || instructions from public.routine_assignment_exercises where routine_assignment_id = {assignment};") == ['Committed rename|Committed instructions']
    print('PASS: assignment waits for catalog commit; different provider proceeds.')

    # A waiting stale legacy save must observe the committed ID-based edit and reject.
    writer.execute(f"begin; select public.save_routine_with_exercises({routine}, 'ID winner', array[{second}::uuid]);")
    pending = reader.send(expect_error(f"public.save_routine({routine}, 'Must not persist', array['Committed rename'])", '55000'))
    wait_for_block(observer, reader, writer)
    writer.execute('commit;')
    reader.finish(pending)
    assert observer.execute(f'select name from public.routines where id = {routine};') == ['ID winner']
    assert observer.execute(f'select exercise_id::text from public.routine_exercises where routine_id = {routine};') == [second.strip("'")]
    print('PASS: concurrent legacy save rejects after ID-based edit without overwriting it.')

    # An actual database error after a successful mutation aborts the transaction;
    # the waiting assignment snapshots only the previously committed definition.
    writer.execute(f"begin; select public.save_exercise({second}, 'Must roll back', 'Must roll back');")
    pending = reader.send(f"select public.assign_routine({profile}, {routine}, '2030-01-02');")
    wait_for_block(observer, reader, writer)
    writer.execute('\\set ON_ERROR_STOP off')
    error_output = writer.execute('select 1 / 0;')
    assert any('division by zero' in line for line in error_output)
    writer.execute('rollback;\n\\set ON_ERROR_STOP on')
    assignment = quoted_uuid(reader.finish(pending)[0])
    assert observer.execute(f"select exercise_name_snapshot || '|' || instructions from public.routine_assignment_exercises where routine_assignment_id = {assignment};") == ['Concurrency second|Second instructions']
    assert observer.execute(f'select name from public.routine_exercises where routine_id = {routine};') == ['Concurrency second']
    print('PASS: transaction error rolls back catalog and mirror writes before waiting assignment.')

    # Existing archive and discharge writers do not take the provider lock;
    # assignment creation must also respect their routine/profile row locks.
    writer.execute(f'begin; select public.archive_routine({routine});')
    pending = reader.send(expect_error(f"public.assign_routine({profile}, {routine}, '2030-01-03')", 'P0002'))
    wait_for_block(observer, reader, writer)
    writer.execute('commit;')
    reader.finish(pending)
    assert observer.execute(f"select count(*) from public.routine_assignments where routine_id = {routine} and scheduled_date = '2030-01-03';") == ['0']
    print('PASS: assignment waits for archive and rejects the archived routine.')

    active_routine = quoted_uuid(writer.execute(f"select public.save_routine_with_exercises(null, 'Discharge race', array[{first}::uuid]);")[0])
    writer.execute("begin; select public.discharge_patient('00000000-0000-0000-0000-000000000021');")
    pending = reader.send(expect_error(f"public.assign_routine({profile}, {active_routine}, '2030-01-04')", '42501'))
    wait_for_block(observer, reader, writer)
    writer.execute('commit;')
    reader.finish(pending)
    assert observer.execute(f'select count(*) from public.routine_assignments where routine_id = {active_routine};') == ['0']
    print('PASS: assignment waits for discharge and rejects the inactive relationship.')
finally:
    for session in sessions:
        session.close()
