"""Real PostgreSQL feedback tests in a NEW socket-only cluster, never hosted.

Requires --pg-bin pointing to local PostgreSQL binaries. No endpoint or inherited
database credentials are accepted. Cancellation uses the repository definition.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import argparse
import json
import os
import re
import subprocess
import tempfile
import time

BASE = Path(__file__).resolve().parents[2]
P = '00000000-0000-0000-0000-000000000001'
OTHER = '00000000-0000-0000-0000-000000000002'
PATIENT = '00000000-0000-0000-0000-000000000010'
PROFILE = '00000000-0000-0000-0000-000000000020'
UID = '00000000-0000-0000-0000-000000000030'

def ident(number):
    return f'00000000-0000-0000-0000-{number:012d}'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', required=True)
    pg = Path(parser.parse_args().pg_bin)
    work = Path(tempfile.mkdtemp(prefix='exercise-feedback-pg-'))
    env = {k:v for k,v in os.environ.items() if not k.startswith('PG') and k not in ('DATABASE_URL','SUPABASE_DB_URL')}
    env.update(PGHOST=str(work), PGPORT='55579', PGUSER='postgres', PGDATABASE='postgres')
    def run(program, args, text=None, check=True):
        result = subprocess.run([str(pg / program), *args], input=text, text=True, capture_output=True, env=env, timeout=30)
        if check and result.returncode: raise AssertionError(result.stderr)
        return result
    def sql(text, check=True):
        return run('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],text,check)
    def act(text, actor=UID, check=True, role='authenticated'):
        return sql(f"set role {role}; set request.jwt.claim.sub='{actor}';\n" + text, check)
    def save(snapshot, score=3, feeling='good', explanation='null'):
        return f"select * from public.save_my_routine_exercise_feedback('{snapshot}',{score},'{feeling}',{explanation});"
    checks=[]
    def passed(label):
        checks.append(label); print('PASS:',label,flush=True)
    def reject(command, code, actor=UID):
        result=act(command,actor,False)
        assert result.returncode and code in result.stderr, result.stderr
    def wait_sleep(name):
        deadline=time.monotonic()+8
        while time.monotonic()<deadline:
            if sql(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event='PgSleep';").stdout.strip()=='1': return
            time.sleep(.03)
        raise AssertionError('Race transaction did not reach synchronization point')
    started=False
    try:
        run('initdb',['-D',str(work/'data'),'-U','postgres','-A','trust','--no-locale','--encoding=UTF8'])
        run('pg_ctl',['-D',str(work/'data'),'-l',str(work/'log'),'-o',f"-F -c listen_addresses='' -k {work} -p 55579",'-w','start'])
        started=True
        sql((BASE/'supabase/tests/exercise_feedback_fixture.sql').read_text())
        source=(BASE/'supabase/migrations/20261021000100_patient_routine_scheduling.sql').read_text()
        cancellation=re.search(r'create or replace function public.cancel_routine_assignment\(.*?\$function\$;',source,re.S).group()
        sql(cancellation)
        sql('revoke all on function public.cancel_routine_assignment(uuid) from public,anon; grant execute on function public.cancel_routine_assignment(uuid) to authenticated;')
        migration=next((BASE/'supabase/migrations').glob('*_exercise_pain_feedback.sql'))
        sql('begin;\n'+migration.read_text()+'\ncommit;')
        for followup in sorted((BASE/'supabase/migrations').glob('*_exercise_feedback_nonblank_reason.sql')):
            sql('begin;\n'+followup.read_text()+'\ncommit;')
        sql(f"insert into providers values('{P}'),('{OTHER}'); insert into patients values('{PATIENT}','{UID}'); insert into provider_patient_profiles values('{PROFILE}','{P}','{PATIENT}',null);")
        today="(now() at time zone 'America/Los_Angeles')::date"
        for index in range(1,7):
            day=today+'+1' if index==3 else today
            status='cancelled' if index==4 else 'scheduled'
            sql(f"insert into routine_assignments(id,patient_id,patient_profile_id,scheduled_date,status) values('{ident(100+index)}','{PATIENT}','{PROFILE}',{day},'{status}'); insert into routine_assignment_exercises values('{ident(200+index)}','{ident(100+index)}','Repeated stretch',0);")
        baseline=sql("select md5(jsonb_agg(to_jsonb(a) order by id)::text) from routine_assignments a;").stdout
        s1,s2=ident(201),ident(202)
        for score in ['null','0','11','1.5']:
            result=act(save(s1,score),check=False)
            assert result.returncode, result.stdout
        reject(save(s1,3,'unknown'),'22023')
        reject(save(s1,3,'neutral',"'  '"),'22023')
        reject(save(s1,3,'neutral',"E'\\n\\t'"),'23514')
        reject(save(s1,3,'difficult',"repeat('x',4001)"),'22023')
        passed('database validates scores, feelings and required bounded explanations')
        act(save(s1,1,'good',"'discard this'"))
        assert json.loads(act(f"select row_to_json(f) from get_my_routine_exercise_feedback('{ident(101)}') f;").stdout)['explanation'] is None
        act(save(s1,6,'neutral',"' Needed a break. '"))
        act(save(s2,10,'difficult',"'Review this exercise.'"))
        assert sql('select count(*) from routine_assignment_exercise_feedback;').stdout.strip()=='2'
        row=json.loads(act(f"select row_to_json(f) from get_my_routine_exercise_feedback('{ident(101)}') f;").stdout)
        assert row['pain_score']==6 and row['explanation']=='Needed a break.' and row['reported_at']
        passed('latest upsert, bounds 1/10, server timestamp and duplicate exercise names use snapshot IDs')
        assert act('select count(*) from routine_assignment_exercise_feedback;',P).stdout.strip()=='2'
        assert act('select count(*) from routine_assignment_exercise_feedback;',OTHER).stdout.strip()=='0'
        assert act('select count(*) from routine_assignment_exercise_feedback;').stdout.strip()=='0'
        reject(save(s1), '42501', OTHER)
        reject(f"select * from get_my_routine_exercise_feedback('{ident(101)}');",'42501',OTHER)
        result=act(save(s1),check=False,role='anon'); assert result.returncode
        reject(f"update routine_assignment_exercise_feedback set pain_score=9 where routine_assignment_exercise_id='{s1}';",'42501',P)
        passed('owner provider reads; unrelated users, anonymous callers and direct client writes denied')
        reject(save(ident(203)),'22023'); reject(save(ident(204)),'22023')
        sql(f"update provider_patient_profiles set discharged_at=now() where id='{PROFILE}';")
        reject(save(s1),'42501')
        sql(f"update provider_patient_profiles set discharged_at=null where id='{PROFILE}';")
        assert baseline==sql("select md5(jsonb_agg(to_jsonb(a) order by id)::text) from routine_assignments a;").stdout
        passed('future/cancelled/discharged saves denied; feedback never changes routine states')
        with ThreadPoolExecutor(max_workers=2) as pool:
            # Real cancellation holds patient/assignment locks, then commits.
            first=pool.submit(act,f"begin; set local application_name='feedback-cancel-wins'; select cancel_routine_assignment('{ident(105)}'); select pg_sleep(1.5); commit;",P)
            wait_sleep('feedback-cancel-wins')
            began=time.monotonic(); rejected=act(save(ident(205)),check=False)
            assert time.monotonic()-began>.5 and rejected.returncode and '22023' in rejected.stderr
            first.result()
            # A successful save holds the same lock until its own commit.
            first=pool.submit(act,"begin; set local application_name='feedback-save-wins'; "+save(ident(206))+"select pg_sleep(1.5); commit;")
            wait_sleep('feedback-save-wins')
            began=time.monotonic(); act(f"select cancel_routine_assignment('{ident(106)}');",P)
            assert time.monotonic()-began>.5
            first.result()
        assert sql(f"select count(*) from routine_assignment_exercise_feedback where routine_assignment_exercise_id='{ident(205)}';").stdout.strip()=='0'
        assert sql(f"select count(*) from routine_assignment_exercise_feedback where routine_assignment_exercise_id='{ident(206)}';").stdout.strip()=='1'
        passed('both cancellation races serialize: cancel wins rejects save; save wins remains preserved')
        print(f'{len(checks)} integration groups passed; disposable PostgreSQL only',flush=True)
    finally:
        if started: run('pg_ctl',['-D',str(work/'data'),'-m','immediate','-w','stop'],check=False)

if __name__=='__main__': main()
