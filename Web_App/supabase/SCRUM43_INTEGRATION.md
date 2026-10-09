# SCRUM-43 shared exercise prescriptions

This is a local implementation, not evidence of hosted deployment. The migration
targets the hosted schema verified by the project owner on October 8, 2026.
No hosted SQL was executed while implementing this change.

## Deployment baseline and remaining evidence

The verified hosted catalog already has 248 rows with `id`, `name`, `desc`, and
`created_at`. RLS is enabled with no catalog policies; anon/authenticated have
broad privileges, including TRUNCATE. Routines have `id`, `provider_id`, `name`,
nullable date `created_at`, nullable `description`, and nullable `jsonb[]`
`exercise_list`. They do not have `archived_at` or `updated_at`.

Repository migrations are incremental historical changes, not a reproducible
hosted baseline. In particular, main never creates the shared catalog or adds
the existing `exercise_list` column. `schema.sql` is only an old bootstrap.
The five reported hosted migration versions are:

| Hosted version | Name |
| --- | --- |
| 20261007223251 | restrict_profile_image_paths |
| 20261007223322 | restrict_trigger_function_execution |
| 20261007225617 | messages |
| 20261007225625 | seed_demo_messages |
| 20261007225818 | document_messages |

These timestamps differ from main's corresponding filenames. Their SQL bodies
must be compared before migration-history reconciliation. Do not mark old
migrations applied based only on names, and do not run `supabase db push` or the
full historical migration directory against this database.

Before a separately authorized hosted deployment, run
[`audits/scrum43_preflight.sql`](audits/scrum43_preflight.sql) manually. It is a
read-only transaction that reports effective privileges (including PUBLIC and
inherited grants), column grants, policies, function bodies/owners, triggers,
constraints, indexes, legacy data shapes, and the migration ledger. Keep the
output private; it contains routine data and deployment metadata.

Review the deployed `save_routine` and `assign_routine` bodies for teammate
changes that are not present in main. Their replacement is intentional, but
unreported business rules must be reconciled first. Also verify provider SELECT
RLS still restricts `providers.id` to the authenticated identity, provider-patient
relationships cannot be claimed by clients, and the API exposes the public
schema but not the new internal `exercise_prescriptions` schema.

The migration fails transactionally on unexpected column types, archive columns,
an existing expansion, catalog population/policies, custom triggers on affected
tables, disabled RLS, unexpected RPC ownership/effective execution, routine or
assignment client write privileges, or a missing active-assignment unique index.
It requires execution as `postgres`. This is deliberately a reviewed, one-time
forward migration, not an idempotent schema repair script. If the catalog grows
before deployment, its strict 248-row precondition must be reviewed, not bypassed.

No previous migrations were renamed. New version `20261008000100` is distinct
from main, old SCRUM-43's conflicting `20261007000100`, and stashed SCRUM-50's
conflicting `20261007000200`. Check version availability again at integration time.

## Data contract

`routines.exercise_list` remains the only active membership storage. Version 1
contains ordered objects:

```json
[{"exercise_id":"catalog-uuid","name":"server-resolved label","sets":3,"reps":10,"timer_seconds":null}]
```

The save API accepts JSON (`jsonb` containing an array) and stores a PostgreSQL
`jsonb[]`; these are different database types. No normalized membership writes
or synchronization are introduced. Array order defines zero-based snapshot
position. Repeated catalog IDs are allowed at different positions. The name is
a compatibility label chosen by the database, never trusted from client input.
Trusted catalog text edits do not rewrite routine labels; assignment always
resolves current catalog names and descriptions under locks.

| Field | Meaning and limit |
| --- | --- |
| `sets` | Whole number 1–100, or null |
| `reps` | Repetitions per set, whole number 1–1,000, or null |
| `timer_seconds` | Seconds per set, whole number 1–86,400, or null |
| Routine entries | 0–100; empty is a draft, never assignable |
| Routine name | Nonblank, at most 200 characters |
| Prescription request | At most 64 KiB of PostgreSQL JSON text |

Null means unspecified, not zero. Both repetitions and time may be supplied.
These are application limits, not clinical dosing recommendations. Existing
`timer` values are not interpreted as seconds, milliseconds, or centiseconds.

The public save signature is:

```text
save_routine_with_prescriptions(
  p_routine_id uuid, p_routine_name text,
  p_exercises jsonb, p_expected_revision bigint
) returns uuid
```

New saves require null ID/revision. Existing saves require the revision read
when editing began. The database trigger increments `exercise_revision` on
updates; a stale request fails with SQLSTATE `40001` without partial changes.
The client must reload before retrying; it must not silently retry with a newer
revision. Invalid prescriptions use `22023`; ownership failures use `42501` or
`P0002`. Duplicate active assignments continue to use the existing `23505` index.

## Legacy preservation and compatibility

All existing routines retain their exact `exercise_list`; adding the format
marker labels them version 0 without converting entries. Every legacy entry is
displayed, including unnamed objects, scalar values, and null elements. Even
UUID-shaped version-0 entries require explicit provider review, because their
parameter units and original contract are unverified.

The editor does not match names or generate new catalog records. Providers
select catalog replacements and enter prescription values, or explicitly remove
entries. Saving requires all remaining entries to be resolved. The first change
to a version-0 list captures its original contents in `legacy_exercise_list`,
with `legacy_preserved_at` distinguishing an originally SQL-null list from no
preservation event. These provenance fields cannot subsequently be overwritten.
This is recovery provenance, not a second active membership source.

The old `save_routine(uuid,text,text[])` signature remains callable. It supports
legacy name-only creation/editing, but those routines cannot be assigned until
reviewed in the catalog editor. It rejects structured legacy saves rather than
flattening them. For version-1 routines it permits a rename only when the ordered
submitted names equal the stored labels, leaving prescriptions intact. A changed
list fails with `55000`. There is no ambiguous overloaded `save_routine` signature.

`assign_routine(uuid,uuid,date)` keeps its signature, ownership rules, active
patient check, routine-name snapshot, ordering, and duplicate protection. It now
rejects version-0/unresolved routines and empty drafts before inserting anything.
Existing assignments remain readable and cancellable regardless of template
format. Historical snapshot fields added by this migration remain null; they
are never filled from today's catalog.

New snapshots include catalog UUID provenance, name, description, sets, reps,
and timer seconds, plus position. They are independent rows with no catalog FK.
Updates, deletes, and truncation of snapshot content are blocked by triggers;
assignment status and follow-up operations remain unchanged. Any exceptional
historical correction requires a separately reviewed administrative procedure.

## Security and concurrent operations

Authenticated catalog SELECT requires a matching provider row. Anonymous SELECT
and all client catalog mutations are revoked at both table and column level;
effective privileges are checked again before commit. Provider titles, practice
selection, and client metadata do not grant authorization.

RPCs check a real provider identity, routine ownership, and an active owned
patient relationship. They are postgres-owned SECURITY DEFINER functions with
an empty search path; PUBLIC and anon execution are revoked. Internal helpers
are in a private schema with no public/authenticated access. Client write access
to routine and assignment tables is not expanded.

JSON IDs cannot have conventional foreign keys. A routine write trigger validates
the complete version-1 list against the catalog for every ordinary SQL writer.
Catalog UUID changes, hard deletion, and truncation are prohibited, including
ordinary service-role SQL. Trusted administrators can edit catalog text. A
database owner capable of disabling triggers remains a trusted administrator,
as with other database integrity mechanisms.

Lock order is relationship → routine → catalog UUID order. Assignment locks the
active relationship and routine FOR SHARE, then catalog rows FOR SHARE. Saving
an existing routine takes its row lock before catalog locks. This coordinates
with existing discharge updates and trusted catalog text edits. It does not
serialize all providers behind one provider or global catalog lock. The existing
partial unique assignment index remains the authority for duplicate requests.

## Rollout and recovery

1. Review the read-only report, compare deployed RPC bodies, reserve the new
   version, and capture a recoverable database backup/schema export using the
   team's approved process. No such backup or hosted inspection was performed
   automatically by this implementation.
2. Rehearse against an isolated copy of the real deployment baseline. The local
   fixture exercises reported shapes, but is not a complete Supabase clone.
3. After explicit hosted approval, apply only
   `migrations/20261008000100_shared_exercise_prescriptions.sql` in the reviewed
   deployment workflow. Do not apply old SCRUM-43 or SCRUM-50 migrations.
4. Deploy the new provider frontend promptly. Between database and frontend
   rollout, old clients can still view history and cancel assignments, but must
   use the new editor to resolve legacy routines before new assignments.
5. Verify with two providers and a non-provider account: catalog reads, foreign
   patient/routine denial, legacy replacement, empty-draft blocking, prescriptions,
   history stability, cancellation/follow-ups, messages, and profile/practice flows.
6. Record the migration under its actual version through the reviewed deployment
   process. Do not fabricate historical ledger entries.

The transaction rolls back on preflight or migration failure. After successful
deployment and new writes, do not drop the new columns or restore the old
assignment parser: that would discard prescriptions or re-enable malformed
snapshots. Prefer a forward fix. An older frontend can read version-1 labels,
but its exercise-list edits are intentionally blocked. Restoring original legacy
lists, if ever necessary, is an explicit administrative recovery operation, not
an automatic downgrade or a destructive down migration.

The stale `archive_routine` remains unchanged and has no caller on main. Restored
archiving, custom exercises, media persistence, mobile authentication, and mock
cleanup remain outside this ticket. The mobile runner still uses local data;
future integration should consume assignment snapshots through a separately
approved patient-auth identity and RLS model.

## CSV provenance

`exercises_seed.csv` is copied verbatim from
`78a330eeb8b8764915f936ffb029bfd1a57281c3^3:Web_App/supabase/exercises_seed.csv`.
SHA-256: `7e87fd5887b8283695b2314b10ae1c073049123e45a3aa0463e479b63f8bca35`.
It has 248 unique names and populated descriptions. It is loaded only by the
disposable fixture. It contains no UUIDs, so it cannot restore hosted identity
mappings. Never run it as a hosted seed/upsert. No other stash files were restored.

## Local validation

From `Web_App`, run `npm run test:exercises` and `npm run lint`. Run
`bash Web_App/supabase/tests/run-scrum43.sh` from the repository root. PostgreSQL
tools must be installed; the runner uses a unique temporary Unix socket, disables
TCP, strips inherited libpq variables, and never reads an external DATABASE_URL.
The temporary cluster is stopped on exit and retained for inspection.

The fixture loads the verified CSV and real upstream routine, rename, medical
practice, compatibility, and messaging migrations. Explicit fixture-only DDL
models the reported hosted divergence. Supabase Auth is represented by a local
`auth.uid()` test double; PostgREST, browser authentication, Storage, and actual
hosted privileges are not integration-tested by this fixture.

Tests cover negative deployment preflight, preservation, effective ACLs, provider
isolation, legacy shapes, validation, repeated exercises/order, optional values,
stale writes, immutable snapshots, duplicate assignment/cancellation, follow-ups,
messaging, and lock-synchronized concurrent operations. Frontend tests cover
decoding/payloads, rendered editor/assignment controls, and data-access behavior.
Production build output should go to a temporary directory because this repo
historically tracks some files under `dist`.

SCRUM-50 must be reconciled separately: its preserved migration still references
removed provider fields, archive columns, and normalized routine writes. Applying
or renumbering it unchanged would replace the new contract. Its stash and the old
SCRUM-43 branch must remain intact.

## Implementation report

Base: fetched `origin/main` at `d81675a2ece5c0e8106665ca2bd770bd81c51434`.
Branch: `feature/scrum-43-shared-catalog-integration`. Changes remain uncommitted;
no push, merge, PR, or hosted deployment was performed.

The old feature branch remains at
`a3fbb42a982676dbb507b5927255fe40349b8552`. The SCRUM-50 stash remains at
`78a330eeb8b8764915f936ffb029bfd1a57281c3`; all nine tracked and nine untracked
preserved blobs were hash-verified again after implementation.

Validation completed with Node 22.20.0 and local PostgreSQL 14.17:

| Check | Result |
| --- | --- |
| `npm run test:exercises` | 9 tests passed: parsing, payload validation, rendered controls, routine and snapshot data access. |
| `npm run lint` | TypeScript project checks passed. |
| `bash Web_App/supabase/tests/run-scrum43.sh` | All SQL assertions, six rejected-baseline scenarios, and seven synchronized concurrency scenarios passed. |
| `npm run build -- --outDir /tmp/milestone-scrum43-web.6iD5nr --emptyOutDir` | Production TypeScript/Vite build passed. |
| Diff, migration versions, CSV and preserved Git objects | Clean whitespace check; 22 unique migration versions; CSV byte-identical to stash; original feature/stash unchanged. |

The production build emitted warnings for duplicate `requests:list` and
`requests:approve` keys already present in main's package.json, and a JavaScript
chunk above 500 kB (974.01 kB, 290.37 kB gzip). No unrelated package cleanup or
bundle restructuring was included. Build output did not modify tracked `dist`
files. Local database test clusters were stopped; final successful test artifacts
are retained at `/tmp/milestone-scrum43.5THdv9`.

Files modified (paths relative to `Web_App`):

- `package.json`
- `src/components/AssignRoutineDialog.tsx`
- `src/components/DashboardLayout.tsx`
- `src/lib/supabaseData.ts`
- `src/pages/PatientPage.tsx`
- `src/pages/RoutinesPage.tsx`
- `src/types.ts`
- `supabase/README.md`
- `supabase/SCHEMA.md`

Files created:

- `src/components/RoutineExerciseEditor.tsx`
- `src/lib/exerciseData.ts`
- `src/lib/exercisePrescriptions.ts`
- `supabase/SCRUM43_INTEGRATION.md`
- `supabase/audits/scrum43_preflight.sql`
- `supabase/exercises_seed.csv`
- `supabase/migrations/20261008000100_shared_exercise_prescriptions.sql`
- `supabase/tests/run-scrum43.sh`
- `supabase/tests/scrum43_concurrency.py`
- `supabase/tests/scrum43_fixture.sql`
- `supabase/tests/scrum43_preflight_tests.py`
- `supabase/tests/scrum43_prescriptions.sql`
- `tests/exercisePrescriptions.test.mjs`

No further architectural decision is required for this local implementation.
Hosted deployment remains a separate approval gate after the read-only evidence
and actual-baseline rehearsal described above. Authenticated browser/PostgREST
integration against the real deployment has not been tested.
