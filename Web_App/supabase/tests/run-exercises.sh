#!/usr/bin/env bash
# Disposable local PostgreSQL only: no DATABASE_URL, Supabase keys, or TCP listener.
set -euo pipefail
test_dir="$(cd "$(dirname "$0")" && pwd)"
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
