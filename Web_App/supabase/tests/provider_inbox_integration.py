#!/usr/bin/env python3
"""SCRUM-84 checks using synthetic data in a disposable local PostgreSQL cluster."""
from pathlib import Path
import argparse
import json
import os
import subprocess
import tempfile

BASE = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', default='/opt/homebrew/opt/postgresql@17/bin')
pg = Path(parser.parse_args().pg_bin)

def uid(n):
    return f'00000000-0000-0000-0000-{n:012d}'

with tempfile.TemporaryDirectory(prefix='s84-', dir='/private/tmp') as temp:
    work = Path(temp)
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    env['PGOPTIONS'] = '-c timezone=UTC'
    def run(args, source=None, check=True):
        return subprocess.run([str(pg / args[0]), *args[1:]], input=source, env=env,
                              text=True, capture_output=True, check=check, timeout=60)
    def sql(source, check=True):
        return run(['psql', '-X', '-h', temp, '-p', '55484', '-U', 'postgres', '-d', 'postgres',
                    '-qAt', '-v', 'ON_ERROR_STOP=1'], source, check)
    def inbox(identity):
        result = sql(f"set role authenticated; set request.jwt.claim.sub='{uid(identity)}'; select coalesce(json_agg(t),'[]') from get_provider_message_inbox() t;")
        return json.loads(result.stdout)
    started = False
    try:
        run(['initdb', '-D', str(work/'data'), '-U', 'postgres', '--auth=trust', '--no-locale', '--no-sync'])
        run(['pg_ctl', '-D', str(work/'data'), '-l', str(work/'log'), '-o', f"-k {temp} -h '' -p 55484", 'start'])
        started = True
        fixture = (BASE/'supabase/tests/catalog_routines_fixture.sql').read_text()
        sql(fixture[:fixture.index('-- The reference CSV')])
        # Use actual message tables, indexes, triggers and policies.
        sql('drop table messages, message_thread_state; create publication supabase_realtime; grant select on patients to authenticated;')
        sql((BASE/'supabase/migrations/20261007000500_messages.sql').read_text())
        sql((BASE/'supabase/migrations/20261109040000_scrum84_provider_message_inbox.sql').read_text())
        sql(f"""
          insert into provider_patient_profiles(id,provider_id,patient_id) values('{uid(13)}','{uid(1)}','{uid(10)}');
          insert into messages(patient_profile_id,sender_kind,body,created_at)
            select '{uid(11)}','patient','Incoming ' || n, '2026-11-01T00:00:00Z'::timestamptz + n * interval '1 second'
            from generate_series(1,1001) n;
          insert into messages(patient_profile_id,sender_kind,body,created_at) values
            ('{uid(11)}','provider','Latest reply','2026-11-02T00:00:00Z'),
            ('{uid(12)}','patient','Other provider private history','2026-11-03T00:00:00Z');
        """)
        rows = inbox(1)
        assert len(rows) == 2 and rows[0]['unread_count'] == 1001
        assert rows[0]['last_body'] == 'Latest reply'
        assert rows[1]['last_message_at'] is None and rows[1]['unread_count'] == 0
        print('PASS: 1001 incoming messages counted; outgoing excluded; latest preview and empty relationships retained')
        assert len(inbox(2)) == 1 and inbox(2)[0]['last_body'] == 'Other provider private history'
        assert inbox(3) == []
        assert sql('set role anon; select * from get_provider_message_inbox();', False).returncode != 0
        print('PASS: separate providers, non-provider and anonymous access')
        sql(f"set role authenticated; set request.jwt.claim.sub='{uid(1)}'; update message_thread_state set last_read_at='2026-11-01T00:08:20Z', starred=true where patient_profile_id='{uid(11)}';")
        assert inbox(1)[0]['unread_count'] == 501 and inbox(1)[0]['starred'] is True
        sql(f"update message_thread_state set last_read_at='2026-11-02T00:00:00Z' where patient_profile_id='{uid(11)}';")
        assert inbox(1)[0]['unread_count'] == 0
        sql(f"insert into messages(patient_profile_id,sender_kind,body,created_at) values('{uid(11)}','patient','New after reading','2026-11-04T00:00:00Z');")
        assert inbox(1)[0]['unread_count'] == 1
        sql(f"delete from message_thread_state where patient_profile_id='{uid(11)}';")
        assert inbox(1)[0]['unread_count'] == 1002 and inbox(1)[0]['starred'] is False
        print('PASS: read boundary, starred state, new arrivals and absent read state')
    finally:
        if started:
            run(['pg_ctl', '-D', str(work/'data'), '-m', 'immediate', 'stop'], check=False)
