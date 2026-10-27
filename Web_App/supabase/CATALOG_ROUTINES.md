# Catalog routines and prescriptions

## Hosted status

Both Sprint 3 migrations were manually deployed through the Supabase SQL Editor
and verified by the project operator:

| Migration | Purpose |
| --- | --- |
| `20261020000200_catalog_routines_nondestructive.sql` | Catalog-based provider routine creation without demo cleanup |
| `20261020000300_routine_prescriptions.sql` | Optional prescriptions, assignment snapshots and an additive patient API |

Catalog creation and browser-refresh persistence were confirmed in the provider
UI. The prescription deployment passed all 21 hosted verification checks; all
seven preservation counts/hashes and the existing-security hash matched preflight.
At migration deployment, no existing application records were modified. The 248
catalog exercises and
UUIDs were preserved. These are operator-confirmed hosted results; they are
separate from synthetic local tests and the remaining browser checks below.

The source migrations retain disabled execution gates and preparation comments
for provenance. Enabled, separately reviewed copies were used for deployment.
Do not replay either source or infer deployment status from an unmodified header.
No historical ledger entries were changed. Future migration bookkeeping requires
separate review; an absent ledger version is not permission to rerun applied SQL.
The superseded `20261020000100` migration and cleanup proposal are not part of
this release and must not be applied. Do not run a general `supabase db push`.

## Provider workflow and architecture

`/dashboard/routines` opens **Saved routines**. The editor demo is an explicit
sample-data preview. Real create/edit operations use the hosted catalog:

1. `src/lib/exerciseData.ts` selects `id,name,desc` from `public.exercises`, ordered
   by name then ID. Empty/error results block saving and offer a retry; there is
   no seed import, CSV fallback or hardcoded catalog-size limit.
2. `src/pages/RoutinesPage.tsx` provides searchable catalog selection, descriptions,
   ordered add/remove/move controls, optional prescriptions and create/edit forms.
   Exercise identity is UUID-based, including when labels repeat. Repeated UUIDs
   are permitted as separate ordered entries.
3. `src/lib/supabaseData.ts` validates/serializes prescription inputs and calls
   `save_routine_prescriptions`. It retrieves `id,name,exercise_list` filtered by
   provider ID; existing RLS remains the authorization boundary.
4. `src/components/DashboardLayout.tsx` reloads saved routines into shared state,
   making them available in the existing patient assignment dialog. A confirmed
   write followed by a failed reload displays a saved-but-not-reloaded warning;
   Retry loading routines performs only reads, avoiding another create request.
5. `AssignRoutineDialog.tsx` previews prescriptions. `PatientPage.tsx` displays the
   stored assignment snapshots, rather than recomputing them from current templates.

A routine requires a nonblank name of at most 200 input characters and 1–100
catalog entries. Optional sets, reps and duration accept positive PostgreSQL
integers or blank values. Notes are optional text. See
[ROUTINE_PRESCRIPTIONS.md](ROUTINE_PRESCRIPTIONS.md) for exact normalization,
validation, compatibility and snapshot behavior.

A lost write response remains an unknown outcome. Inspect saved routines before
retrying a creation whose server response was not received.

## Storage and write contracts

The existing `routines.exercise_list` is a PostgreSQL `jsonb[]`: an array of JSON
values, not a new single-jsonb column or membership table. New entries contain:

```json
{
  "exercise_id": "existing-catalog-uuid",
  "name": "server-resolved catalog name",
  "sets": 3,
  "reps": 12,
  "duration_seconds": null,
  "notes": "Example instruction"
}
```

Current frontend writer:

```text
save_routine_prescriptions(
  p_routine_id uuid,       -- null creates; owned UUID updates
  p_routine_name text,
  p_exercises jsonb        -- ordered objects: UUID and optional prescriptions
) returns uuid
```

The security-definer RPC uses an empty search_path, derives ownership from
`auth.uid()`, and requires a matching provider account. It locks the owned edit
target and catalog rows, validates existing UUIDs, and resolves names server-side.
Clients cannot supply exercise names or arbitrary extra fields. Foreign edit
UUIDs fail with P0002; unauthorized callers with 42501; invalid input with 22023.
No routine operation inserts, updates or deletes catalog rows.

Compatibility writers:

- `save_routine_from_catalog(uuid,text,uuid[])` retains its signature and ordered
  UUID/name-only output, but rejects edits that would erase non-null prescriptions
  or unknown object fields with 55000.
- `save_routine(uuid,text,text[])` supports updates to existing string-only legacy
  templates. It rejects new name-only creation and structured-list overwrites.
- The frontend never falls back to an older writer after a prescription-save error.

JSON UUID references have no database foreign key. An administrator can delete a
catalog row after saving; a later edit requires an explicit replacement. Assignment
uses the saved template name, not assignment-time catalog UUID resolution.

## Legacy and assignment compatibility

Both deployments preserved existing routines, assignments and snapshots.
Legacy strings, malformed-ID objects, alternate name fields and empty templates
retain the existing assignment parser's behavior. No demo record was deleted or
converted based on its format.

The decoder retains unresolved entries instead of silently omitting them.
Legacy/unknown fields require an explicit catalog replacement or removal before
saving. Valid canonical prescription values are retained during replacement;
additional legacy dosage/media fields are not mapped or guessed. Saving explicitly
replaces those fields with the supported contract; cancelling leaves data untouched.

`assign_routine(uuid,uuid,date)` retains its signature, ownership/active relationship
checks, grants and legacy name parser. The catalog deployment left it unchanged;
the later prescription deployment extended it to lock the owned routine and active
relationship and copy optional values into new snapshots. The four nullable
snapshot columns have no defaults or historical backfill. Later template edits do
not change assigned names, order or prescriptions. Cancellation and follow-up
contracts are unchanged. Browser roles have no direct snapshot write grants.

## Patient mobile read contracts

Existing APIs remain compatible:

1. `get_my_care_relationships()` returns the patient's relationship profile IDs.
2. `get_my_routine_assignments(p_patient_profile_id uuid)` returns assignment
   id, routine_name_snapshot, scheduled_date, status and created_at.
3. `get_my_routine_assignment_exercises(p_routine_assignment_id uuid)` retains
   id, exercise_name_snapshot and ordered exercise_position.

The additive deployed `get_my_routine_assignment_prescriptions(uuid)` returns
those exercise fields plus sets_snapshot, reps_snapshot, timer_seconds_snapshot
and notes_snapshot. Both exercise APIs scope through
`patients.auth_user_id = auth.uid()`; foreign assignments return no rows.
No patient access to provider clinical notes is introduced.

The old API does not provide prescriptions. Neither API adds catalog UUIDs,
exercise descriptions or media. Mobile adoption of the additive API is separate;
no mobile code changes are included. A trusted patient/Auth linkage is required.

## Deployment provenance

The source files are preserved exactly as reviewed:

| Migration | Source SHA-256 |
| --- | --- |
| Catalog `20261020000200` | `8b5e66789514d7045ddeeafd9713d96e329324f0db137e65a1c6c12f96a5e33a` |
| Prescriptions `20261020000300` | `b58ba783d74b61ef2b3faee7384b04a79a57a019cf60b7de6cb45af38f8cf25d` |

Executed review-copy hashes were respectively
`eb355ffd805e7a4f500df5f14d3979a771487811b8e6c96c6a3a6cbea61769aa` and
`aebb5d1500092553f946a09a72c9353af496296ccb2fa44e1051c24f04a47a50`.
The differences were reviewed provenance comments and explicit gate/baseline
bindings; do not edit deployed sources merely to change their preparation labels.

The catalog lock correction uses read-compatible locks on managed Auth/ledger
relations instead of requiring unauthorized write-blocking locks. The prescription
migration locks only the relevant application tables. Neither changes managed
Auth ownership/permissions or migration-ledger rows. Both execute transactionally
and notify PostgREST to reload its schema cache on commit.

Private recovery exports were validated and restored in isolated PostgreSQL 17.11
before deployment. Every exported row and relevant RPC definition/permissions
matched, and restored data survived restart. These targeted exports are not full
Auth/schema/storage backups; omitted parent records used explicit local stand-ins.
Private handoffs, exports, inventories and deployment artifacts are not PR contents.

The broader SCRUM-43 branch is not composable as-is: it overlaps snapshot DDL,
uses JSON timer_seconds instead of duration_seconds, and applies different ranges.
No merge or cherry-pick of that branch is included.

## Validation and remaining browser checks

Completed evidence:

- 58 JavaScript tests: 28 routine, 12 patient, 18 access-request tests.
- TypeScript checking and production build passed; the existing approximately
  982 kB JavaScript chunk warning remains.
- PostgreSQL 17.11 prescription rehearsal: 22 checks passed.
- Standalone deployment-package rehearsal: 8 checks passed as non-superuser postgres.
- Hosted prescription verification: all 21 checks and seven preservation
  fingerprints passed, with unchanged existing security.
- Hosted catalog create/refresh persistence was operator-confirmed.

From `Web_App`, the checked-in tests can be run with:

```sh
npm run test:routines
npm run test:patients
npm run test:approve-access-request
npm run lint
python3 supabase/tests/rehearse_prescriptions.py
```

Build into a fresh temporary output directory to preserve tracked dist changes.
The SQL runner creates a synthetic local Unix-socket cluster, clears inherited PG
endpoints, and stops on exit. Historical definitions are used only for local fixture
construction, never as a hosted deployment sequence. Handler tests use mocked
transport; local SQL uses an Auth test double rather than real hosted Auth.

Remaining browser verification to record with approved provider/patient test data:

- Create/edit/clear each optional field, save and refresh; retain UUIDs/order.
- Assign a prescribed routine and verify ordered prescription snapshots in the
  provider UI and additive patient API; unrelated users receive no data.
- Edit the template after assignment and confirm snapshots stay unchanged.
- Verify legacy readability, cancellation without writes and a failed reload after
  a successful save; retry must not issue a second save RPC.
- Check provider isolation, keyboard/mobile picker behavior and route refresh.

Database deployment does not publish the frontend. Frontend release and browser
acceptance use the existing approved hosting/test workflow. After prescribed
routines exist, prefer a reviewed forward fix or writer containment; never restore
an unguarded older writer or overwrite newer data with a stale recovery export.

## Hosted routine record update log

### 2026-10-26 — Lebron James provider routines

- In Supabase project `lwldkhrsngwtuhztlmul`, converted the first `Cardio` entry to the current prescription-object format. The existing catalog UUID resolves to `Toe Spreading`; sets (3) and reps (10) were preserved, with `duration_seconds` and `notes` null.
- Preserved the routine name and exercise order. No schema, migration, application-code, assignment, or patient-snapshot changes were made.
- Left the other seven entries unchanged for review:
  - `Cardio`: `Seated Lateral Scooting` has legacy `timer: 30`.
  - `Database Test`: `test` has no catalog match.
  - `Jumping Jacks`: `Tip toe` has no exact catalog match.
  - `Lower Body`: `Leg Stretch` and `Calf Stretch` have no exact catalog matches.
  - `Upper Body`: `Arm Stretch` and `Shoulder Stretch` have no exact catalog matches. `Cross-Body Shoulder Stretch` was not substituted.
- Hosted readback confirmed the converted entry matches the catalog and uses supported fields. Focused patient routine tests passed 4/4 fixture-based tests.
