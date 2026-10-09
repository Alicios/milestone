"""Negative deployment tests against the disposable baseline, before expansion."""
import os
from pathlib import Path
import subprocess
import sys

socket = Path(sys.argv[1]).resolve()
if socket.parent != Path('/tmp').resolve() or not socket.name.startswith('milestone-scrum43.'):
    raise SystemExit('Disposable local socket required')
args = ['psql', '-X', '-qAt', '--no-password', '--host', str(socket), '--port', '55443',
        '--username', 'postgres', '--dbname', 'postgres', '--set', 'ON_ERROR_STOP=1']
env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
migration = (Path(__file__).parent / '../migrations/20261008000100_shared_exercise_prescriptions.sql').read_text()

cases = [
    ("grant execute on function public.assign_routine(uuid,uuid,date) to anon;", 'Unexpected effective RPC privileges'),
    ("grant update(name) on public.routines to authenticated;", 'Unexpected client write access'),
    ("drop index public.routine_assignments_active_unique_idx;", 'Required active-assignment uniqueness index'),
    ("create policy unexpected_read on public.exercises for select using (true);", 'Review catalog population and policies'),
    ("alter table public.routines alter column created_at type timestamptz using created_at::timestamptz;", 'routines.created_at must be date'),
    ("delete from public.exercises where id=(select id from public.exercises limit 1);", 'Review catalog population and policies'),
]
for change, expected in cases:
    # Failure closes the session with its entire outer transaction rolled back.
    result = subprocess.run(args, input='begin;\n' + change + '\n' + migration,
                            text=True, capture_output=True, env=env, timeout=30)
    assert result.returncode != 0 and expected in result.stderr, result.stderr
    verification = subprocess.run(args, input="""
      select to_regnamespace('exercise_prescriptions') is null
        and not exists (select 1 from information_schema.columns where table_schema='public'
          and table_name='routines' and column_name='exercise_format_version')
        and (select count(*) from public.exercises)=248
        and to_regclass('public.routine_assignments_active_unique_idx') is not null
        and not has_function_privilege('anon','public.assign_routine(uuid,uuid,date)','EXECUTE');
    """, text=True, capture_output=True, check=True, env=env, timeout=10)
    assert verification.stdout.strip() == 't', verification.stdout
    print('PASS: preflight rejects and rolls back:', expected)
