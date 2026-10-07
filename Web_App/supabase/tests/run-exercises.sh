#!/usr/bin/env bash
# Disposable local PostgreSQL only: no DATABASE_URL, Supabase keys, or TCP listener.
set -euo pipefail
test_dir="$(cd "$(dirname "$0")" && pwd)"
# Assert the unpublished draft is retired and the replacement sorts after upstream.
python3 - "$test_dir/../migrations" <<'PYORDER'
from pathlib import Path
import sys
root = Path(sys.argv[1])
names = sorted(p.name for p in root.glob('*.sql'))
assert '20261005000100_reusable_exercises.sql' not in names
assert names.index('20261007000100_reusable_exercises.sql') > names.index('20261006000200_document_public_schema.sql')
print('Migration filename ordering passed.')
PYORDER
test_root="$(mktemp -d /tmp/milestone-exercises.XXXXXX)"
cleanup() {
  if [[ -f "$test_root/data/postmaster.pid" ]]; then
    pg_ctl -D "$test_root/data" -m immediate stop >/dev/null
  fi
  # Retain the isolated cluster/log for inspection; never touch an existing DB.
  printf 'Local test artifacts: %s\n' "$test_root"
}
trap cleanup EXIT
initdb -D "$test_root/data" --username=scrum43_test --auth=trust --no-locale >/dev/null
pg_ctl -D "$test_root/data" -l "$test_root/server.log" \
  -o "-F -k $test_root -p 55443 -c listen_addresses=''" -w start >/dev/null
psql -X --no-password --host="$test_root" --port=55443 --username=scrum43_test \
  --dbname=postgres --set=ON_ERROR_STOP=1 --file="$test_dir/reusable_exercises.sql"

python3 "$test_dir/exercise_concurrency.py" "$test_root"
