# Routine prescriptions — deployed and verified

The project operator confirmed successful hosted deployment of both
`20261020000200_catalog_routines_nondestructive.sql` and
`20261020000300_routine_prescriptions.sql`. Prescription verification passed all
21 checks: all seven preservation counts/SHA-256 hashes and the existing-security
hash matched preflight. No existing application records were modified. Catalog
creation and browser-refresh persistence were also operator-confirmed.

The checked-in SQL retains its reviewed disabled execution gate and preparation
comments for provenance; an explicitly enabled review copy was used for deployment.
**Do not rerun these already-applied migrations or a general `supabase db push`.**
No historical ledger entries were changed. Future ledger bookkeeping needs a
separate review and must not replay deployed SQL. See
[CATALOG_ROUTINES.md](CATALOG_ROUTINES.md) for source/executed-copy hashes and
remaining browser acceptance; the broader SCRUM-43 migration remains excluded.

## Storage and API

Continue storing ordered objects in `routines.exercise_list`, a PostgreSQL
`jsonb[]` column. There is no new membership table, catalog change, or change to
`routine_exercises`. Each newly prescribed entry contains:

```json
{
  "exercise_id": "existing-catalog-uuid",
  "name": "server-resolved catalog name",
  "sets": 3,
  "reps": 12,
  "duration_seconds": null,
  "notes": "Move slowly"
}
```

All four prescription fields are optional. Missing/explicit-null numeric fields
become JSON null; positive integers from 1 through 2147483647 are accepted.
This upper bound is PostgreSQL's integer storage limit, not a recommended dose.
Strings, booleans, zero, negatives, fractions, containers, and overflow values
are rejected by the server. Notes accept text or null; surrounding spaces and
empty text are normalized. The browser also normalizes blank/whitespace inputs.

New RPC:

```
save_routine_prescriptions(
  p_routine_id uuid,       -- null creates; owned UUID edits
  p_routine_name text,     -- nonblank, at most 200 characters
  p_exercises jsonb       -- ordered array of 1–100 objects
) → uuid
```

Input objects contain `exercise_id` and optional `sets`, `reps`,
`duration_seconds`, `notes`. Clients cannot supply names or unknown fields.
The server verifies a provider account, locks the owned edit target, validates
and locks catalog UUIDs, and resolves names. Repeated UUIDs remain separate
ordered entries with independent prescriptions. Existing UUID/name-only routines
load with empty optional fields and can be edited without replacement.

The old `save_routine_from_catalog(uuid,text,uuid[])` retains its exact argument
contract and UUID/name-only output shape. A new guard prevents it from overwriting
non-null prescription or unknown object fields (`55000`). This prevents stale
clients from silently erasing details. The older name-only `save_routine` stays
unchanged and still refuses flattening structured templates.

The frontend calls only the new prescription writer. If it is not deployed,
the editor reports that saving is unavailable and retains the form. There is
**no fallback write** that could discard dosage. Snapshot reads can fall back
to the existing name/position fields when the new columns are absent; permission
and other errors remain errors.

Unknown legacy fields (including `timer` and `timer_seconds`) or malformed
prescription values still require explicit catalog replacement/removal before
editing. No units or mappings are guessed. Valid canonical prescription values
are retained during replacement; additional legacy fields are discarded only
on an explicit save, with the existing warning. Cancel does not write.

## Assignment snapshots and SCRUM-43

The forward migration `20261020000300_routine_prescriptions.sql` adds these
nullable columns with no defaults and no backfill:

| JSON field | Snapshot column | Type |
| --- | --- | --- |
| `sets` | `sets_snapshot` | positive integer or NULL |
| `reps` | `reps_snapshot` | positive integer or NULL |
| `duration_seconds` | `timer_seconds_snapshot` | positive integer seconds or NULL |
| `notes` | `notes_snapshot` | text or NULL |

The first three column names and duration units match the proposed SCRUM-43
branch. That branch additionally proposes catalog/description snapshot columns,
format/revision tracking, a different writer, JSON `timer_seconds`, and narrower
ranges (sets ≤100, reps ≤1000, timer ≤86400). Notes are new here.
**The SCRUM-43 migration is not composable as-is:** reconcile overlapping DDL,
validation limits, JSON vocabulary, and function replacement before any later
integration. No merge/cherry-pick or change to that branch was performed.

`assign_routine(uuid,uuid,date)` keeps its existing public contract, owner,
grants, security-definer configuration, relationship/ownership checks, and
legacy name parser. It locks the active relationship and owned routine during
snapshot creation, and inserts prescription fields only for new assignments.
Existing assignment/snapshot rows remain unchanged; historical prescriptions
remain NULL. Later template edits do not update any assignment snapshot.

Historical strings, empty lists, malformed IDs and old name variants remain
assignable as before. Valid canonical prescription fields are copied; malformed
historical dosage becomes NULL rather than inventing a value or making an old
routine unassignable. Noncanonical timer fields are not interpreted.

The old patient `get_my_routine_assignment_exercises(uuid)` function/return type
is unchanged. An additive `get_my_routine_assignment_prescriptions(uuid)` API
returns id, exercise name/position, and the four snapshot fields, scoped by
`patients.auth_user_id = auth.uid()`. Mobile adoption of that API is separate;
no mobile application changes are included.

The provider assignment dialog previews the saved prescription. Patient detail
reads/displays the stored snapshots, never recalculating them from the template.
Normal browser roles have no direct snapshot write grants. No broad administrator
immutability trigger or unrelated permission change is introduced.

## Deployed safeguards and remaining work

The source is disabled by `hosted_execution_approved := false`. The local runner
changes that literal in memory; the operator deployed a separately approved review
copy. This preserves the reviewed source without making a repository checkout
an automatic deployment. The local runner accepts no hosted credentials/endpoints.

The deployed transaction uses short lock/statement timeouts, pins the reviewed
existing catalog-save and assignment function bodies (normalizing SQL Editor
CRLF line endings), checks security settings,
rejects overlapping SCRUM-43/snapshot schema, and verifies preservation of existing
routine/assignment values and RPC security. Existing RLS policies remain intact.
It does not touch Auth tables, the catalog, legacy routine exercises, or the
migration ledger. A transaction-local baseline table is dropped at commit.

Completed deployment prerequisites included all 15 hosted preflight checks, a
current private targeted recovery export, isolated PostgreSQL 17.11 restoration,
and explicit approval of the standalone SQL. Every exported row, four existing
RPC definitions/permissions and five ledger records restored; data survived restart.
The export is targeted recovery evidence, not a complete schema/Auth/storage
backup; omitted provider/patient/Auth parent records used local stand-ins.

The backend is ready for the frontend. Remaining manual verification to record:

1. Use approved test provider/patient records for browser acceptance:
   create/edit/clear → refresh → assign → edit template → verify unchanged
   snapshots, isolation and old assignment readability.
2. Confirm that saved-reload failure retry reads rather than repeating a write.
3. Release the frontend through the existing approved hosting workflow; a SQL
   deployment alone does not publish the UI. Do not apply this migration again.

There is no destructive rollback. After prescribed routines exist, use a reviewed
forward fix or disable the new writer; restoring a UUID-only writer without its
guard could erase data. Frontend rollback to an old client will prevent edits to
prescribed routines rather than stripping their values.

## Local validation

```
npm run test:routines
npm run test:patients
npm run test:approve-access-request
npm run lint
python3 supabase/tests/rehearse_prescriptions.py
```

Build to a fresh temporary directory to preserve the existing tracked `dist`
changes. The rehearsal requires PostgreSQL 17 tools (default Homebrew location)
and creates a new synthetic cluster with TCP disabled, cleared PG environment,
and a local Unix socket. It shuts the cluster down on completion or failure.
Its report and logs are under ignored `node_modules/.tmp/prescription-pg-*`.

These tests cover application handlers with mocked transport and real SQL in
local PostgreSQL. They do not establish hosted Auth/PostgREST/browser acceptance.

Final local results: TypeScript passed; 28 routine tests, 12 patient tests, and
18 access-request tests passed (58 total); PostgreSQL 17.11 passed 22 rehearsal
checks; production build passed with the existing large-chunk warning
(approximately 982 kB JavaScript). Eight standalone deployment-package checks
also passed with a non-superuser postgres and Supabase-like default function
grants. Source and executed-copy hashes are recorded in
[CATALOG_ROUTINES.md](CATALOG_ROUTINES.md). Deployment artifacts, private evidence
and generated build output are excluded from the PR.

## Implementation files

Paths below are relative to `Web_App` unless indicated otherwise. Existing
catalog work is retained.

| File | Change |
| --- | --- |
| `src/types.ts` | Optional prescription and save-input types |
| `src/lib/prescriptions.ts` (new) | Numeric validation, parsing and display summary |
| `src/lib/supabaseData.ts` | Prescription serialization/loading and snapshot reads with read-only compatibility fallback |
| `src/pages/RoutinesPage.tsx` | Editable optional fields, validation, edit hydration and saved prescription display |
| `src/components/DashboardLayout.tsx` | Pass prescription objects through the existing save/reload flow |
| `src/components/AssignRoutineDialog.tsx` | Preview selected routine prescriptions |
| `src/pages/PatientPage.tsx` | Display historical prescription snapshots |
| `tests/catalogRoutines.test.mjs` | Updated catalog contract coverage and 11 new prescription tests |
| `tests/patientCreation.test.mjs` | Load the real pure prescription helper in the existing isolated service harness |
| `supabase/migrations/20261020000300_routine_prescriptions.sql` (new) | Guarded forward migration, writers, nullable snapshots and additive patient read RPC |
| `supabase/tests/rehearse_prescriptions.py` (new) | Synthetic isolated PostgreSQL integration and preservation tests |
| `supabase/ROUTINE_PRESCRIPTIONS.md` (new) | Contract, compatibility risks, validation and release boundary |

The current feature also includes the catalog loader/editor integration and its
focused test script. No broader SCRUM-43 branch, unrelated SCRUM-64 work, private
handoff, recovery export, deployment package or superseded cleanup migration is
part of the intended PR.
