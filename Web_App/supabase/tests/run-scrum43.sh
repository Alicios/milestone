#!/usr/bin/env bash
# No TCP, external connection URLs, hosted keys, or pre-existing databases.
set -euo pipefail
test_dir="$(cd "$(dirname "$0")" && pwd)"
while IFS= read -r variable; do unset "$variable"; done < <(compgen -v PG)
test_root="$(mktemp -d /tmp/milestone-scrum43.XXXXXX)"
cleanup() {
  if [[ -f "$test_root/data/postmaster.pid" ]]; then
    pg_ctl -D "$test_root/data" -m immediate stop >/dev/null
  fi
  printf 'Disposable test artifacts retained: %s\n' "$test_root"
}
trap cleanup EXIT
initdb -D "$test_root/data" --username=postgres --auth=trust --no-locale >/dev/null
pg_ctl -D "$test_root/data" -l "$test_root/server.log" \
  -o "-F -k $test_root -p 55443 -c listen_addresses='' -c wal_level=logical" -w start >/dev/null
cd "$test_dir"
psql -X -q --no-password --host="$test_root" --port=55443 --username=postgres \
  --dbname=postgres --set=ON_ERROR_STOP=1 --file=scrum43_fixture.sql
python3 -B scrum43_preflight_tests.py "$test_root"
psql -X -q --no-password --host="$test_root" --port=55443 --username=postgres \
  --dbname=postgres --set=ON_ERROR_STOP=1 --file=../migrations/20261008000100_shared_exercise_prescriptions.sql
psql -X -q --no-password --host="$test_root" --port=55443 --username=postgres \
  --dbname=postgres --set=ON_ERROR_STOP=1 --file=scrum43_prescriptions.sql
python3 -B scrum43_concurrency.py "$test_root"
