# Supabase database

The model and evidence limits are documented in [SCHEMA.md](SCHEMA.md). The SQL
files in `migrations/` are incremental migrations for the existing hosted
Milestone project; `schema.sql` is only the historical bootstrap that created
the original `profiles` and `access_requests` tables.

SCRUM-50's limited patient-creation changes, local tests and remaining SCRUM-43
dependencies are documented in [SCRUM50_VALIDATION.md](SCRUM50_VALIDATION.md).

## SCRUM-43 local expansion

The shared-catalog prescription migration and frontend are integrated locally
with SCRUM-50 patient validation. The migration has **not** been applied to
hosted Supabase. See [SCRUM43_INTEGRATION.md](SCRUM43_INTEGRATION.md) for the
contract, read-only preflight, bounds, compatibility window, tests, and deployment
procedure requiring separate review. Routine saving requires the new hosted RPC;
legacy reads alone do not make this frontend ready for hosted release.

From `Web_App`, run `npm run lint`, `npm run test:patients`,
`npm run test:exercises`, and `npm run build -- --outDir /tmp/milestone-integration-build`.
Keep build output outside tracked `dist` files. With PostgreSQL tools installed,
run `bash supabase/tests/run-scrum43.sh`; it creates a disposable Unix-socket
cluster, applies the expansion only there, and tests validation, snapshots,
permissions, preflight rollback, and concurrency. Its synthetic fixture is not
proof of the hosted schema. The separate baseline reuse test below exercises
storage without the expansion.

## SCRUM-43 exercise-model baseline

The Sprint 2 baseline documents the existing shared exercise catalog. The local
expansion above adds frontend integration and prescription validation. Hosted
Supabase already contains 248 exercises with a
verified UUID primary key. `routines.exercise_list` is verified as `jsonb[]`.
Routine JSON objects can reuse an existing catalog UUID via `exercise_id`;
multiple routine rows can resolve to one exercise without duplicating it.
JSON references have no conventional foreign key, automatic validation, or
protection against dangling IDs. The local expansion supplies that validation;
hosted behavior is unchanged.

- [baselines/exercises.sql](baselines/exercises.sql): **LOCAL/REFERENCE ONLY**
  catalog DDL, not a migration or full hosted schema dump. The reported columns
  are `id`, `name`, `desc`, and `created_at`; only the UUID PK is confirmed here.
  Other types, defaults, non-PK nullability, constraints, triggers, and effective
  catalog access policies require authoritative schema evidence; see SCHEMA.md.
- [tests/scrum43_reuse.sql](tests/scrum43_reuse.sql): two table-backed routine
  inserts referencing one existing catalog UUID, followed by assertions that
  both resolve and the catalog is unchanged, then `ROLLBACK`.
- [exercises_seed.csv](exercises_seed.csv): byte-for-byte reference copy from
  `a1e083fed28d093972233cf3700a866434cdf706` on
  `feature/scrum-43-shared-catalog-integration`. SHA-256:
  `7e87fd5887b8283695b2314b10ae1c073049123e45a3aa0463e479b63f8bca35`.
  It has 248 records and no UUIDs. **Never reseed the shared catalog**: the CSV
  cannot preserve hosted identity mappings and another import can duplicate data.

The previous read-only simulation proved UUID resolution, not table-backed
storage. The rollback test below verifies storage in a disposable local schema.
The October 8 prescription migration is included locally but remains undeployed.

## Local verification only

Use a disposable local PostgreSQL database with an administrative role. Never
point the test at the shared hosted project, including through a local tunnel.
No hosted connection string or Supabase key is needed. The test rejects remote
TCP server addresses, but this is not proof that a local endpoint is disposable.

For a representative rehearsal, use a separately prepared, reviewed local schema
copy with `public.exercises`, `public.providers`, and the six-column
`public.routines` shape described in SCHEMA.md. It needs at least one existing
exercise and provider, and privileges to read the catalog and insert routines.
Do not load the reference DDL over an existing table or replay migrations to
construct that copy. Unknown constraints/triggers can legitimately fail the test;
inspect them rather than disabling them or modifying the hosted database.

For a minimal model-only check, create an empty disposable local database and
run the following in `psql` from `Web_App/supabase`. These provider/routine tables
are **local test scaffolding**, not claims about hosted DDL, Auth, or policies:

```sql
\i baselines/exercises.sql
create table public.providers (id uuid primary key);
create table public.routines (
  id uuid primary key,
  provider_id uuid references public.providers(id),
  name text,
  created_at date,
  description text,
  exercise_list jsonb[]
);
insert into public.providers (id)
values ('00000000-0000-0000-0000-000000000001');
insert into public.exercises (id, name, "desc")
values ('00000000-0000-0000-0000-000000000043',
        'Local example', 'Synthetic fixture; not a hosted catalog row');
```

The synthetic exercise is prepared before the test; the test only selects an
existing exercise and never seeds the catalog. Do not import the CSV for this
check. With the disposable database already prepared, run from the repository
root, substituting the actual local port/user/database as needed:

```sh
psql -X --host=127.0.0.1 --port=54322 --username=postgres \
  --dbname=scrum43_local --set=ON_ERROR_STOP=1 \
  --file=Web_App/supabase/tests/scrum43_reuse.sql
```

Success prints `PASS: two stored routines resolve one existing UUID; catalog
unchanged`, followed by `ROLLBACK`. Failures exit nonzero; connection closure
rolls back the open transaction. Two distinct routine rows are inserted and
queried inside the transaction; neither is committed. This proves storage and
resolution only for the local schema tested, not commit durability, hosted RLS,
API permissions, frontend behavior, or an exact match to the hosted schema.
Keep these verification gaps explicit even after a minimal fixture passes.

## Historical migrations — do not replay

The migration directory is historical context, not a complete hosted baseline.
The repository has no creation migration for the existing catalog or `exercise_list`.
Hosted routines also diverge from earlier migrations (for example, absent
`archived_at`/`updated_at`), and recorded hosted migration timestamps differ from
repository filenames. Replaying files can fail, alter existing data, or replace
functions with historical definitions. `schema.sql` is not a full reset script.
No migrations are deployed as part of SCRUM-43. Any future deployment needs a
separately reviewed actual schema and migration-history reconciliation.

The historical messaging addition is:

1. `20261007000500_messages.sql` — tables, grants, RLS, and Realtime publication
2. `20261007000600_seed_demo_messages.sql` — twelve idempotent text imports
3. `20261007000700_document_messages.sql` — column descriptions

Do not run `supabase db push` against the existing project until its hosted
migration history has been baselined with an explicitly configured Supabase CLI
or database connection. Local migration files alone do not prove that the
hosted project has been updated.

The rename migration preserves rows and IDs while changing these identifiers:

| Previous identifier | Current identifier |
| --- | --- |
| `appointments` | `routine_follow_ups` |
| `providers.role` | `providers.professional_title` |
| `routine_assignment_exercises.name` | `routine_assignment_exercises.exercise_name_snapshot` |

The web app contains narrow compatibility fallbacks for one release so it can
run immediately before or after this hosted migration. Those fallbacks trigger
only for confirmed missing-table or missing-column errors.

## Verification

The historical table counts are not a current baseline acceptance test. Inspect
an isolated local copy using the description audit in [SCHEMA.md](SCHEMA.md).

Also verify with at least two provider accounts that:

- each provider sees only their own profile, patient relationships, statuses,
  routines, assignments, snapshots, and follow-ups;
- editing a routine does not change existing assignment snapshots;
- cancelling an assignment preserves it and cancels a scheduled follow-up;
- discharging a patient retains the provider-specific history; and
- duplicate active assignments for the same profile, routine, and date fail.
- each provider sees only their own messages and cannot insert a patient-authored
  message; messaging continues after discharge.

## Authentication and ownership

`providers.id` is the corresponding `auth.users.id`. The signup trigger creates
the provider row and accepts `professional_title` metadata, with legacy `role`
metadata as a temporary fallback. `contact_email` is editable professional
contact information and is separate from the Supabase Auth login email.

Patients are shared identities. Private notes, legacy statuses, assignments,
and discharge state belong to `provider_patient_profiles`, one row per unique
provider-patient pair. Additional provider relationships must be created by a
trusted backend or administrator; browser clients cannot claim arbitrary
patients.

Routine and follow-up writes use authenticated security-definer RPCs. Browser
table access remains read-only where required, and RLS traces rows back to the
signed-in provider.

The `messages` table currently links text to provider-patient profiles. The
provider browser may insert only provider-authored live messages. Patient
messaging needs a trusted Auth-to-patient link before patient policies are
added. Provider-to-provider and staff conversations require a later participant
model; the general table name does not grant those capabilities yet.

## Storage

Provider avatars use the public `profile-images` bucket at
`{auth-user-id}/avatar`. Uploads use `upsert: true`, so the matching
`storage.objects` policies need `INSERT`, `UPDATE`, and `SELECT` permissions in
addition to any delete policy. Never expose a `service_role` key in Vite browser
configuration.
