"""Independent local psql sessions; synchronize on observed database locks, not sleeps.

Only run from run-scrum43.sh against its disposable Unix-socket cluster.
"""
import os
import json
from pathlib import Path
from queue import Queue, Empty
import subprocess
import sys
from threading import Thread
import time
from uuid import uuid4, UUID

socket_dir = Path(sys.argv[1])
if not socket_dir.is_dir() or not socket_dir.name.startswith('milestone-scrum43.'):
    raise SystemExit('Expected the disposable test cluster socket directory')
args = ['psql', '-X', '-qAt', '--no-password', '--host', str(socket_dir), '--port', '55443',
        '--username', 'postgres', '--dbname', 'postgres', '--set', 'ON_ERROR_STOP=1']
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


def literal(value):
    return "'" + value.replace("'", "''") + "'"


sessions = []
try:
    for _ in range(5):
        sessions.append(Session())
    observer, writer, reader, other, admin = sessions
    provider_a = '00000000-0000-0000-0000-000000000001'
    provider_b = '00000000-0000-0000-0000-000000000002'
    profile = "'00000000-0000-0000-0000-000000000011'"
    for session, provider in [(writer, provider_a), (reader, provider_a), (other, provider_b)]:
        session.execute(f"set role authenticated; select set_config('request.jwt.claim.sub', '{provider}', false);")
    exercise = observer.execute('select id from public.exercises order by id limit 1;')[0]
    second = observer.execute('select id from public.exercises order by id offset 1 limit 1;')[0]

    def payload(exercise_id=exercise, reps=10):
        return literal(json.dumps([{'exercise_id': exercise_id, 'sets': 3, 'reps': reps, 'timer_seconds': None}]))

    routine = quoted_uuid(writer.execute(f"select public.save_routine_with_prescriptions(null,'Concurrent',{payload()},null);")[0])
    writer.execute(f"begin; select public.save_routine_with_prescriptions({routine},'Committed edit',{payload(reps=20)},0);")
    pending = reader.send(f"select public.assign_routine({profile},{routine},'2031-01-01');")
    wait_for_block(observer, reader, writer)
    other.execute(f"select public.save_routine_with_prescriptions(null,'Independent provider',{payload()},null);")
    writer.execute('commit;')
    assignment = quoted_uuid(reader.finish(pending)[0])
    assert observer.execute(f'select reps_snapshot from public.routine_assignment_exercises where routine_assignment_id={assignment};') == ['20']
    print('PASS: assignment waits for routine edit; another provider proceeds.')

    writer.execute(f"begin; select public.save_routine_with_prescriptions({routine},'Winning edit',{payload(reps=30)},1);")
    pending = reader.send(expect_error(f"public.save_routine_with_prescriptions({routine},'Stale edit',{payload()},1)", '40001'))
    wait_for_block(observer, reader, writer)
    writer.execute('commit;')
    reader.finish(pending)
    assert observer.execute(f'select name from public.routines where id={routine};') == ['Winning edit']
    print('PASS: concurrent stale save rejects without overwriting the winner.')

    old_name = observer.execute(f'select name from public.exercises where id={quoted_uuid(exercise)};')[0]
    writer.execute(f"begin; select public.save_routine_with_prescriptions({routine},'Changed selection',{payload(second)},2);")
    pending = reader.send(expect_error(f"public.save_routine({routine},'Stale names',array[{literal(old_name)}])", '55000'))
    wait_for_block(observer, reader, writer)
    writer.execute('commit;')
    reader.finish(pending)
    assert observer.execute(f"select exercise_list[1]->>'exercise_id' from public.routines where id={routine};") == [second]
    print('PASS: a waiting name-only client cannot flatten a changed prescription.')

    admin.execute(f"begin; update public.exercises set name='Concurrent catalog name',\"desc\"='Concurrent description' where id={quoted_uuid(second)};")
    pending = reader.send(f"select public.assign_routine({profile},{routine},'2031-01-02');")
    wait_for_block(observer, reader, admin)
    admin.execute('commit;')
    assignment = quoted_uuid(reader.finish(pending)[0])
    assert observer.execute(f"select exercise_name_snapshot || '|' || description_snapshot from public.routine_assignment_exercises where routine_assignment_id={assignment};") == ['Concurrent catalog name|Concurrent description']
    print('PASS: assignment waits for catalog updates and captures committed help content.')

    writer.execute(f"begin; select public.save_routine_with_prescriptions({routine},'Rollback',{payload(reps=99)},3);")
    pending = reader.send(f"select public.assign_routine({profile},{routine},'2031-01-03');")
    wait_for_block(observer, reader, writer)
    writer.execute('rollback;')
    assignment = quoted_uuid(reader.finish(pending)[0])
    assert observer.execute(f'select reps_snapshot from public.routine_assignment_exercises where routine_assignment_id={assignment};') == ['10']
    print('PASS: rolled-back edits never enter waiting assignment snapshots.')

    writer.execute(f"begin; select public.assign_routine({profile},{routine},'2031-01-04');")
    pending = reader.send(expect_error(f"public.assign_routine({profile},{routine},'2031-01-04')", '23505'))
    wait_for_block(observer, reader, writer)
    writer.execute('commit;')
    reader.finish(pending)
    assert observer.execute(f"select count(*) from public.routine_assignments where routine_id={routine} and scheduled_date='2031-01-04';") == ['1']
    print('PASS: concurrent duplicate assignments preserve the unique-index protection.')

    writer.execute("begin; select public.discharge_patient('00000000-0000-0000-0000-000000000021');")
    pending = reader.send(expect_error(f"public.assign_routine({profile},{routine},'2031-01-05')", '42501'))
    wait_for_block(observer, reader, writer)
    writer.execute('commit;')
    reader.finish(pending)
    assert observer.execute(f"select count(*) from public.routine_assignments where routine_id={routine} and scheduled_date='2031-01-05';") == ['0']
    print('PASS: assignment waits for discharge and rejects the inactive relationship.')
finally:
    for session in sessions:
        session.close()
