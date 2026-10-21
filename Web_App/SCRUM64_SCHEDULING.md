# SCRUM-64 provider scheduling

Implementation worktree: `/private/tmp/milestone-scrum64-scheduling`.
Branch: `feature/scrum-64-scheduling-integration`, based on catalog commit
`4c459ddf47306d49c32a08b31643c0af475730ac`.

The catalog/prescription worktree and paused assignment worktree were preserved.
The paused branch was not merged. Its duplicate-submit guard, separation of save
success from reload failure, and read-only retry behavior were adapted to the
batch API. No hosted migration, patient creation, push, merge, or Jira update was
performed. Patient mobile code was not changed.

## File map

| Area | Files |
| --- | --- |
| Patient/dashboard integration | `src/pages/PatientPage.tsx`, `src/pages/DashboardPage.tsx`, `src/components/DashboardLayout.tsx` |
| Scheduling and cancellation UI | New `src/components/ScheduleRoutineDialog.tsx`, new `src/components/CalendarWeekNavigation.tsx`, updated `src/components/RemoveRoutineDialog.tsx` |
| Calendar/recovery state | New `src/hooks/useAssignmentCalendar.ts`, `src/hooks/useScheduleOperations.ts` |
| Date policy, transport, durable recovery | New `src/lib/scheduling.ts`, `src/lib/schedulingData.ts`, `src/lib/scheduleRecovery.ts` |
| Snapshot loading and session isolation | `src/lib/supabaseData.ts`, `src/lib/week.ts`, `src/auth/AuthContext.tsx` |
| Database | New `supabase/migrations/20261021000100_patient_routine_scheduling.sql`, `supabase/audits/scheduling_preflight.sql`, `supabase/audits/scheduling_verify.sql` |
| Tests | New `supabase/tests/scheduling_integration.py`, `tests/scheduling.test.mjs`, `tests/helpers/modules.mjs`, `tests/browser/fixture.mjs`, `tests/browser/scheduling.spec.mjs`; updated catalog harness in `tests/catalogRoutines.test.mjs` |
| Test configuration and documentation | New `playwright.config.mjs` and this document; `package.json` and `package-lock.json` |

## User workflow

The existing patient page has week navigation, a weekly schedule button, and a
single-date assignment button. Both entry points use `ScheduleRoutineDialog` and
the same batch backend. The dashboard's existing date buttons use that dialog
and cannot add another routine to an occupied date.

Each weekday selector uses the provider's persisted routines. Empty selectors
create no assignments and do not cancel existing ones. Repetition expands the
selected weekday pattern from the selected week through the end of the server's
window. Only dates within the window are included. The preview shows the patient,
exact dates, routine names, ordered prescriptions, count, and conflicts. There
are no writes until explicit confirmation.

Calendar viewing is unrestricted by the creation horizon. Today and the inclusive
last permissible date come from PostgreSQL, initially 14 calendar days in
`America/Los_Angeles`. UTC arithmetic and UTC formatting represent date-only values
without converting them into the browser's timezone. Neither the browser clock
nor elapsed 24-hour intervals decide scheduling eligibility.

## API and database contract

Only `supabase/migrations/20261021000100_patient_routine_scheduling.sql` is new.
It is forward-only, transactional, and disabled in source pending deployment
review. Historical migrations must not be replayed.

| RPC | Contract |
| --- | --- |
| `get_routine_scheduling_policy()` | Server `today`, `lastDate`, `horizonDays`, `timeZone` |
| `get_patient_schedule_occupancy(p_patient_profile_id uuid, p_start_date date, p_end_date date)` | Owned relationship; arbitrary range up to 366 days; occupied dates, with names/assignment IDs only for the calling provider |
| `preview_routine_schedule(p_patient_profile_id uuid, p_entries jsonb)` | Read-only validation; entries `{date,routineId}`; returns prescriptions, content tokens, policy, and conflicts |
| `assign_routine_schedule(p_patient_profile_id uuid, p_request_id uuid, p_entries jsonb)` | Atomic confirmation; entries `{date,routineId,token}`; returns request ID, relationship ID, and dated assignment IDs |
| `get_routine_schedule_request(p_request_id uuid)` | Own durable receipt or NULL; never writes |
| Existing `assign_routine(uuid,uuid,date)` | Same signature and UUID return; delegates to the new validation/snapshot mechanism |
| Existing `cancel_routine_assignment(uuid)` | Owned assignment, shared-patient lock, idempotent cancellation, scheduled follow-ups cancelled |
| Existing `schedule_routine_follow_up(uuid,timestamptz)` | Same API; now shares the cancellation lock to prevent a concurrent follow-up surviving cancellation |

Confirmation authenticates a provider, normalizes and sorts the dated selections,
rejects duplicate dates, and locks the provider/request key. An existing receipt
with the same canonical payload returns its original IDs before checking today's
horizon or current template. A changed payload with the same key is rejected.

New operations lock the shared patient, active owned relationship, and owned
routine templates (routines in UUID order). After waiting for locks, the database
checks the current scheduling window, all ownership, all preview content tokens,
all prescription values, and all conflicts. It inserts every assignment, snapshot,
and receipt in one transaction. Any failure rolls back the entire operation.

The partial unique index `routine_assignments_patient_date_active_idx` enforces
`(patient_id, scheduled_date) WHERE status <> 'cancelled'` across providers.
Assignments retain `patient_profile_id` and gain `patient_id`, backfilled only from
their existing relationship. A composite foreign key prevents those identities
from disagreeing. Both identities remain available for a future policy change;
change the unique index and `milestone_scheduling.occupied` together, without
re-keying historical assignments. The previous routine-specific index is retained.

Snapshots retain routine name, exercise name/order, sets, reps,
`timer_seconds_snapshot` sourced from `duration_seconds`, notes, and the new
nullable `exercise_id_snapshot`. There is no new hold-duration field. Existing
snapshot UUIDs stay NULL: the migration never reconstructs them from templates.
Template edits cannot update snapshot rows. Triggers prohibit snapshot/receipt
updates or deletion, assignment identity/date/name changes, and reactivation of
cancelled assignments. Browser DML on assignment/snapshot tables is revoked.

Faithfully representable name-only legacy exercises remain assignable with an
unknown UUID. Empty, malformed, ambiguous, unsupported-field, or invalid-dosage
templates are rejected with an error directing the provider to review the routine.
Historical assignments are retained. Existing prescription/catalog writer bodies
are not replaced.

`routine_schedule_requests` has provider-scoped SELECT RLS and no browser write
grants. All public scheduling APIs require authenticated providers, are security
definers with an empty search path, and do not grant anonymous execution. Private
helpers/policy tables are inaccessible to browser roles. Missing policy fails
closed. Administrator-only changes to `milestone_scheduling.policy` configure the
timezone and horizon; the initial values remain Los Angeles and 14 days.

## Reliability and recovery

- A synchronous single-flight guard prevents rapid duplicate confirmations,
  cancellations, and reloads. The database independently handles concurrent tabs,
  providers, and identical request IDs.
- Before sending a confirmed batch, the browser durably stores its provider,
  relationship, request ID, dates, routine IDs, and content tokens in localStorage.
  It stores no patient names or prescriptions. Each request has its own key, so
  tabs cannot overwrite each other's recovery records. If persistence fails, no
  write is sent.
- A lost or unverifiable response retains the original operation. Refresh/sign-in
  only checks receipts automatically. The provider can explicitly retry the exact
  same confirmed request. There is no automatic duplicate write or new request ID.
- A receipt replay after cancellation returns the original IDs and cannot recreate
  cancelled assignments. Successful writes followed by failed reloads stay
  successful; retry controls only reload. Corrupt recovery data fails closed.
- A lost cancellation response can be resolved by reloading or retrying the same
  cancellation. Cancellation is idempotent and never reactivates an assignment.
- Read generations, provider-keyed layout state, auth generation checks, calendar
  range keys, and mutation invalidation prevent stale responses from replacing
  newer state. Same-browser tabs broadcast only an invalidation marker. Focus and
  a visible-tab 60-second read refresh cover other sessions and policy changes.
  These refreshes never create assignments.

Clearing browser storage loses that browser's recovery pointer. Database receipts
and uniqueness remain intact; the provider should reload and inspect assignments
before proposing a new schedule. Receipts are intentionally not expired or pruned.

## Verification

Run from `Web_App` unless an absolute path is shown. All automated data writes
are either in memory or in newly initialized disposable PostgreSQL clusters.

| Command | Result |
| --- | --- |
| `node --test tests/*.test.mjs` | 84 tests: 28 catalog, 26 scheduling/recovery, 12 patient creation, 18 access-request tooling |
| `node --test tests/routineAssignment.test.mjs` in the original paused worktree | 12 existing assignment regression tests passed, unchanged |
| `python3 supabase/tests/scheduling_integration.py` | 15 real PostgreSQL integration groups |
| `python3 supabase/tests/rehearse_prescriptions.py` | 22 existing catalog/prescription PostgreSQL checks |
| `npx playwright test` | 10 Chrome acceptance tests; actual React UI with intercepted synthetic Supabase responses |
| `npm run lint` | TypeScript build check |
| `npm run build -- --outDir /private/tmp/milestone-scrum64-build` | TypeScript and Vite production build; output outside tracked dist |

No tests are skipped. Browser tests block all external traffic except the
intercepted synthetic project; they never use real login credentials or patients.
They exercise provider-created catalog routines, weekly repetition/rest, permanent
prescription preview, conflict blocking, template-change rejection, browser refresh,
sign-out/sign-in, cross-tab invalidation, navigation/stale responses, save/reload
failure, and cancellation/replacement. Node tests additionally cover storage
failures, account changes during requests, malformed receipts, date/DST arithmetic,
and exact RPC arguments.

PostgreSQL tests use separate real sessions for concurrent requests, late INSERT
failure for full batch rollback, and a database restart for durable receipts and
snapshots. They verify ownership/RLS/grants, shared-patient conflicts, identity FKs,
old API rules, malformed legacy data, midnight/DST/year boundaries, policy changes,
preview-token rejection, cancellation/replay, follow-up concurrency, and unchanged
historical records/prescription RPCs. The script accepts a local `--pg-bin` path
(default Homebrew PostgreSQL 17), never a database connection URL. Fixture schema
is reconstructed explicitly in a fresh cluster; it is not a deployment recipe.

The build retains Vite's large-chunk warning (about 998 kB before gzip).
`npm audit --json` reports two existing high-severity findings: `vite` 7.3.6 and
`source-map-js` 1.2.1. Existing dependency versions and platform metadata were
preserved; the only dependency addition is development-only Playwright. Resolve
the existing dependency findings separately before release.

## Hosted preflight and deployment — approval still required

A read-only REST collision inspection at `2026-10-21T03:58:02Z` observed four
assignments and five provider relationships, with zero conflicting patient/date
groups and zero invalid assignment identities. No names or prescriptions were
requested. Evidence is `/private/tmp/scrum64-hosted-rest-collisions.json` (private,
outside Git). It used the existing administrator secret in an `apikey` header as
documented by [Supabase](https://supabase.com/docs/guides/getting-started/api-keys).
This was a pair of GET reads, not a transactionally consistent SQL snapshot.

The direct PostgreSQL connection was rejected with `28P01` (authentication
failure). Therefore hosted function definitions, privileges, triggers, migration
history, and complete schema compatibility remain unverified. Local migration
files do not prove hosted deployment. Obtain a working administrator SQL
connection before deployment; do not infer success from the REST collision check.

After explicit deployment approval, perform these steps in order:

1. Take the normal database backup and establish a quiet write window for the
   before/after fingerprints. Confirm the intended Supabase project. Configure
   `SCRUM64_DATABASE_URL` securely with a working administrator PostgreSQL URL;
   do not print it or put it in browser configuration.
2. Run only the read-only preflight:

   ```sh
   psql "$SCRUM64_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
     -f supabase/audits/scheduling_preflight.sql \
     -o /private/tmp/scrum64-sql-preflight.txt
   ```

   Require zero collision rows and zero invalid identities. Review current
   columns, indexes, constraints, function definitions, RLS, grants, and triggers
   against the catalog/prescription baseline. The migration expects `jsonb[]`
   routine storage and the prescription helper/writer already deployed. Stop for
   SCRUM-43 revision/format columns, superseded SCRUM-50 assignment definitions,
   unexpected snapshot triggers, or other incompatible drift. Resolve any
   collisions by a separately approved clinical decision, never migration cleanup.
3. Review the exact new migration. Only after approval, make a deployment copy
   with its single `hosted_execution_approved constant boolean := false;` changed
   to `true`. Keep the source gate disabled. For example:

   ```sh
   python3 - <<'PY'
   from pathlib import Path
   source = Path('supabase/migrations/20261021000100_patient_routine_scheduling.sql').read_text()
   gate = 'hosted_execution_approved constant boolean := false;'
   assert source.count(gate) == 1
   Path('/private/tmp/scrum64-approved.sql').write_text(source.replace(gate, gate.replace('false', 'true')))
   PY
   diff -u supabase/migrations/20261021000100_patient_routine_scheduling.sql /private/tmp/scrum64-approved.sql
   ```

4. Apply **only** the reviewed copy:

   ```sh
   psql "$SCRUM64_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f /private/tmp/scrum64-approved.sql
   ```

   It rechecks collisions while holding table locks, uses a 5-second lock timeout,
   and commits atomically. Any mismatch/error requires review; do not replay the
   migration directory or automatically retry with weaker checks. Do not apply
   superseded SCRUM-43/SCRUM-50 SQL over the prescription implementation.
5. Before any acceptance writes, run:

   ```sh
   psql "$SCRUM64_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
     -f supabase/audits/scheduling_verify.sql \
     -o /private/tmp/scrum64-sql-verification.txt
   ```

   Compare all preflight fingerprints/counts. Require unchanged routines, catalog,
   and historical assignments/snapshots (excluding the two new columns), consistent
   shared identities, zero collisions, zero new historical catalog identities,
   and zero receipts before acceptance testing. Verify the new partial index,
   14-day/Los Angeles policy, RPC authentication/grants, receipt RLS, and immutability
   triggers. The migration sends the PostgREST schema-cache reload notification.
6. Record this single applied migration in the team's deployment ledger after
   success. Reconcile the existing hosted migration history separately; do not
   use a blanket `supabase db push` or migration-directory replay.
7. Configure the integration web app with only the public Supabase URL/key. Start
   it against the updated project and verify policy/occupancy reads while signed
   in as the provider. Then, after separate patient-data approval, perform manual
   acceptance of creation/edit/schedule/cancel/replacement, two tabs, two providers
   sharing a patient, refresh/sign-in, future snapshots, and dates at the horizon.
   Never run the disposable test fixtures against hosted Supabase.

No full browser-to-hosted-PostgREST acceptance has been performed. Passing local
PostgreSQL plus intercepted browser tests does not establish production readiness.

## Test patients — separate follow-up

The existing paused-worktree `scripts/seed-demo-data.mjs` can be adapted, but must
not run unchanged: it currently creates four differently named patients and three
name-only routines. Its deterministic provider-scoped IDs, dry-run mode, ownership
checks, transaction, and insert-only behavior are reusable. Remove all routine
inspection/insertion, use new immutable keys for Alice Patient, Bob Patient,
Charlie Patient, and Diana Patient, and retain only patient/profile inserts.

Validate the exact existing Milestone Dev provider UUID independently, preserve
existing patient/profile pairs, and fail on partial pairs or ownership mismatches.
Leave patient `auth_user_id` NULL; do not create authentication accounts. Add
patients-only seeder tests and obtain explicit approval before hosted execution.
The seeder was inspected only and was not copied, changed, or executed here.

Provider scheduling has no dependency on mobile notifications, new patient auth,
or patient mobile UI work. Existing patient snapshot reads remain compatible;
mobile acceptance and unrelated stories are outside this implementation.
