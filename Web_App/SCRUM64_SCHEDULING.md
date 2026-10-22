# SCRUM-64 provider scheduling

Implementation worktree: `/private/tmp/milestone-scrum64-scheduling`.
Branch: `feature/scrum-64-scheduling-integration`, based on catalog commit
`4c459ddf47306d49c32a08b31643c0af475730ac`.
Earlier implementation review: `a012449b71d2c1b47628b045997116d9186f5037`.
Last confirmed HEAD from the resumed-session handoff:
`75a77d0c25d57f1eb906ba4c75bc88744f81aa1f`.

The catalog/prescription worktree and paused assignment worktree were preserved.
The paused branch was not merged. Its duplicate-submit guard, separation of save
success from reload failure, and read-only retry behavior were adapted to the
batch API. The implementation is committed and pushed. No PR has been created or
merged. The scheduling migration was successfully deployed to hosted Supabase on
October 21, 2026, and provider-side hosted acceptance passed as recorded below.
The final readiness audit verdict was **READY WITH CONDITIONS**; the separate
anonymous clinical-read security release blocker remains open. Patient mobile
code was not changed; mobile snapshot consumption remains a separate follow-up.
This resumed task authorizes documentation changes only, with no hosted access
or clinical data changes. Deployment and acceptance results below come from the
handoff; they were not rerun during this documentation update.

## File map

| Area | Files |
| --- | --- |
| Patient/dashboard integration | `src/pages/PatientPage.tsx`, `src/pages/DashboardPage.tsx`, `src/components/DashboardLayout.tsx` |
| Scheduling and cancellation UI | New `src/components/ScheduleRoutineDialog.tsx`, new `src/components/CalendarWeekNavigation.tsx`, updated `src/components/RemoveRoutineDialog.tsx` |
| Expandable assigned prescription details | `src/pages/DashboardPage.tsx`, new `src/components/AssignedRoutineDetails.tsx`, `tests/browser/assignmentDetails.spec.mjs` |
| Calendar/recovery state | New `src/hooks/useAssignmentCalendar.ts`, `src/hooks/useScheduleOperations.ts` |
| Date policy, transport, durable recovery | New `src/lib/scheduling.ts`, `src/lib/schedulingData.ts`, `src/lib/scheduleRecovery.ts` |
| Snapshot loading and session isolation | `src/lib/supabaseData.ts`, `src/lib/week.ts`, `src/auth/AuthContext.tsx` |
| Database | New `supabase/migrations/20261021000100_patient_routine_scheduling.sql`, `supabase/audits/scheduling_preflight.sql`, `supabase/audits/scheduling_verify.sql` |
| Tests | New `supabase/tests/scheduling_integration.py`, `tests/scheduling.test.mjs`, `tests/helpers/modules.mjs`, `tests/browser/fixture.mjs`, `tests/browser/scheduling.spec.mjs`; updated catalog harness in `tests/catalogRoutines.test.mjs` |
| Test configuration and documentation | New `playwright.config.mjs` and this document; `package.json` and `package-lock.json` |
| Hosted recovery procedure | [SCRUM64_RECOVERY.md](SCRUM64_RECOVERY.md) |

## User workflow

The existing patient page has week navigation, a weekly schedule button, and a
single-date assignment button. Both entry points use `ScheduleRoutineDialog` and
the same batch backend. The dashboard's existing date buttons use that dialog
and cannot add another routine to an occupied date.

On the dashboard, selecting an assigned routine expands its read-only details.
The panel shows the assigned routine name and date, ordered exercises, sets,
repetitions, duration, and notes from persisted assignment snapshots. It does not
rebuild prescriptions from the editable template. The panel supports collapse,
loading/error states, a read-only retry, and missing-detail messages. The patient
page also displays assigned prescription snapshots.

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
It is forward-only and transactional, and was deployed on October 21, 2026.
Its source intentionally retains the disabled execution gate; that gate is not
evidence of pending deployment and must remain disabled. **Do not replay this
deployed migration**, enable its source gate, or replay historical migrations.
Any subsequent database correction needs a separately reviewed repair.

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

### Final readiness audit reported in the handoff

| Check | Recorded result |
| --- | --- |
| Scheduling unit tests | 29 passed |
| Routine prescription tests | 28 passed |
| Browser tests | 17 passed |
| TypeScript checks | Passed |
| Production build | Passed |
| Database integration | Historical passing evidence; not a fresh database run in the final readiness audit |

These are the latest reported audit results, not fresh runs in this documentation
session. Exact run timestamps and complete command/output records were not
supplied in the handoff; no additional run or aggregate test count is asserted.
Hosted acceptance is recorded separately below.

### Earlier implementation verification — historical evidence

The following counts preserve the earlier implementation record and are not the
latest suite totals. In particular, the PostgreSQL integration and prescription
rehearsal results are historical passes, not freshly rerun database checks.
Commands are relative to `Web_App` unless an absolute path is shown. Automated
data writes use memory or newly initialized disposable PostgreSQL clusters.

| Command | Result |
| --- | --- |
| `node --test tests/*.test.mjs` | 84 tests: 28 catalog, 26 scheduling/recovery, 12 patient creation, 18 access-request tooling |
| `node --test tests/routineAssignment.test.mjs` in the original paused worktree | 12 existing assignment regression tests passed, unchanged |
| `python3 supabase/tests/scheduling_integration.py` | 15 real PostgreSQL integration groups |
| `python3 supabase/tests/rehearse_prescriptions.py` | 22 existing catalog/prescription PostgreSQL checks |
| `npx playwright test` | 10 Chrome acceptance tests; actual React UI with intercepted synthetic Supabase responses |
| `npm run lint` | TypeScript build check |
| `npm run build -- --outDir /private/tmp/milestone-scrum64-build` | TypeScript and Vite production build; output outside tracked dist |

The earlier record reported no skipped tests. Automated browser tests block all
external traffic except the intercepted synthetic project; they never use real
login credentials or patients.
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

The earlier build recorded Vite's large-chunk warning (about 998 kB before gzip).
The earlier `npm audit --json` reported two existing high-severity findings:
`vite` 7.3.6 and `source-map-js` 1.2.1. Existing dependency versions and platform metadata were
preserved; the only dependency addition is development-only Playwright. Resolve
the existing dependency findings separately before release. This documentation
update does not provide a fresh dependency audit or evidence of their resolution.

## Hosted deployment and acceptance

### Deployment status and evidence limits

The resumed-session handoff confirms successful hosted Supabase deployment on
October 21, 2026, followed by successful provider-side hosted acceptance. The
exact deployment time, submitted SQL checksum, project reference, operator/reviewer
identities, and complete SQL Editor outputs were not supplied in the handoff;
this update does not invent them or claim fresh hosted inspection. The original
export timestamps below are capture times, not deployment timestamps.

The source migration gate remains disabled intentionally. Do not rerun the
deployed migration or use migration-directory replay or a blanket push to
reconcile migration history. Retain the submitted execution copy and original
deployment evidence privately where available.

### Verified provider-side hosted acceptance

Synthetic patient: **Jaden Shiba**, `05bac18e-b8cf-428e-b591-abd7e80ae4b3`.
Provider: **Milestone Dev**, `924e8b62-4f8f-4226-bd33-bb526756228c`.

The handoff records passing hosted checks for:

- Routine creation and editing, including prescription persistence.
- Scheduling assignments and persistence after browser refresh.
- Assigned prescription details, including the expandable details feature.
- Template edits leaving existing assignment snapshots unchanged.
- Cancellation preserving historical assignment snapshots.
- Replacement creating a new assignment UUID.

For the October 24, 2026 scheduled date, the cancellation/replacement verification
identified these assignments:

| Assignment | UUID | Preserved exercise snapshots |
| --- | --- | ---: |
| Cancelled | `8a570002-2ce4-467f-b38b-74eb3af3cb96` | 3 |
| Replacement | `1a03e5b7-5295-4afd-9318-227bd8665d7a` | 3 |

October 24 is the assignment date; no exact acceptance execution timestamp was
provided. These observations establish provider-side hosted acceptance for the
listed flows. They do not establish patient mobile snapshot consumption or
resolve the separate security release blocker.

### Environment and completed review

Hosted Supabase runs PostgreSQL 17.6 on the Free plan. Deployment uses the
Supabase dashboard SQL Editor with the existing administrator role. A database
password is unavailable and cannot be reset. This procedure needs no password or
direct database connection. No accessible managed backup is available.

The hosted migration-history compatibility, schema/constraint, prescription
helper/RPC, runtime capability, existing-writer, DDL event-trigger, and effective
browser-role permission audits passed. Explicit column-grant and membership
review found no incompatible scheduling write access. The recovery exports below
also passed validation. These are historical review observations, not fresh
checks in this documentation session or a claim that every archived checklist
item below has independently supplied evidence.

**Separate security release blocker:** temporary anonymous SELECT policies remain
on clinical tables. Preserve their captured definitions during this work. SCRUM-64
does not resolve that blocker and this procedure does not authorize policy or
permission changes to resolve it. Application release remains blocked pending a
separately reviewed security change.

### Validated recovery artifacts

Both files were captured through SQL Editor and are stored privately outside Git:

- Application data: `/Users/gerardocamacho/Downloads/Supabase Snippet List Tables and Columns with Data Types (2).csv`
  - SHA-256: `c36566ee01de48246abffd8c705debf7c90e094c19b47de347e9363410a40101`
  - 292 CSV records: 284 application records and eight manifests.
  - Captured `2026-10-21T19:32:42.904876Z`, role `postgres`, timezone UTC.
- Database definitions: `/Users/gerardocamacho/Downloads/Supabase Snippet List Tables and Columns with Data Types (3).csv`
  - SHA-256: `aa5556803a5cd4827a4389bc953bd3bae75fde73a5c9a355f47db3f956db2102`
  - 515 CSV records covering definitions, ACLs, RLS, triggers, and dependencies.
  - Captured `2026-10-21T19:35:36.541936Z`, role `postgres`, timezone UTC.

Validation passed strict CSV/JSON parsing, counts, all eight recomputed manifest
fingerprints, original function comparisons, permissions/RLS, constraints,
indexes, triggers, and coverage for targeted recovery. The captures are about
174 seconds apart; their contents alone cannot prove a quiet write window or
identify the project uniquely from the generic database name `postgres`.

These are **targeted recovery exports, not a complete PostgreSQL backup**. They
support preparing an in-place repair in an otherwise intact project. They do not
provide project reconstruction, point-in-time recovery, or a demonstrated restore.
Auth, Storage, other application tables, and later activity are outside their
coverage. See [SCRUM64_RECOVERY.md](SCRUM64_RECOVERY.md) for dependencies,
preservation baselines, exclusions, and repair requirements.

Some metadata `object_name` labels are truncated to 63 bytes and two constraint
labels collide. Recovery must use full identities and definitions from `details`,
not `object_name` alone. The payloads preserve the affected object identities.
Future capture-query revisions should make the label column `text` from the first
UNION branch. Do not change the validated original exports.

### Archived first-deployment checklist — do not execute again

The original checklist is retained as historical procedure and evidence context.
Deployment has completed; these steps are not pending instructions. Retaining
them does not assert that every result set is available in this handoff. Do not
use them to replay the migration. A repair requires the current-state capture and
separate review in [SCRUM64_RECOVERY.md](SCRUM64_RECOVERY.md).

For multi-statement audit snippets, preserve every SELECT output rather than only
the final SQL Editor result grid. If earlier grids are unavailable, capture the
same SELECTs individually through reviewed read-only query copies, recording
their SQL, times, and settings while writers remain quiet. Separate executions
do not share one snapshot. This applies to audit capture only; execute the
migration as one complete transaction.

1. Identify the intended project reference, operator, reviewer, and recovery
   decision-maker. Record the reviewed implementation commit, planned deployment
   copy, and artifact checksums in the private deployment record. Keep an
   independent private copy of the exports and original audit results. Review the
   recovery procedure and explicitly accept its bounded scope before approval.
2. Establish a quiet write window covering fresh capture/preflight, deployment,
   and preservation verification. Account for provider tabs, mobile clients,
   scripts, jobs, and administrator writers. A frontend maintenance message alone
   does not stop existing RPC callers. If writes cannot be held, postpone
   deployment. This requirement does not authorize changing RLS or grants.
3. Confirm artifact checksums, project provenance, and currentness. Through SQL
   Editor, obtain fresh read-only comparisons for all eight datasets and their
   definitions/security state. Use UTC and the recorded fingerprint convention.
   If records or definitions changed, capture and validate a new version of the
   package; preserve the originals. Keep the write window quiet after capture.
4. Run the complete `supabase/audits/scheduling_preflight.sql` through SQL Editor
   immediately before deployment and save every result set. Require zero collision
   groups and zero invalid assignment identities. Supplement its four dataset
   fingerprints with patients, providers, relationships, and follow-ups. Review
   current function bodies/owners/ACLs, columns, constraints, indexes, RLS,
   triggers, default grants, and memberships against the validated definitions.
   Require `jsonb[]` routine storage and deployed prescription APIs. Stop for
   overlapping SCRUM-43 columns, superseded APIs, unexpected scheduling objects,
   drift, or incompatible writers. Any clinical collision resolution needs its
   own approval; it is not migration cleanup.
5. Review the exact source and proposed one-line execution-copy difference. Only
   after explicit deployment approval may a separate copy change the single
   execution gate from false to true. Review and record the final difference,
   keeping the committed source gate disabled. These documents do not enable the
   gate or authorize deployment.
6. In SQL Editor, execute the entire approved migration once, with no partial
   selection. Preserve `BEGIN`, `COMMIT`, the 5-second lock timeout, and the
   120-second statement timeout. Save the submitted SQL, time, and result/error.
   Do not weaken checks, replay historical migrations, or automatically retry.
   Follow the decision tree below for any failure or uncertain outcome.
7. Before any acceptance writes, run the complete
   `supabase/audits/scheduling_verify.sql` through SQL Editor and save all result
   sets. Complete the supplemental verification below. Verification occurs after
   `COMMIT`; a failed check cannot roll back that completed transaction.
8. After verification passes, record this one deployment and its evidence in the
   team ledger. The migration does not write Supabase migration history; any
   history reconciliation requires separate review. Do not use migration-directory
   replay or a blanket push to reconcile it.
9. Use only the public Supabase URL/key in the application. Verify signed-in
   provider policy/occupancy reads. Hosted acceptance involving clinical writes
   requires its own approved scope; do not create patients or run disposable
   fixtures as part of deployment. Resume writers only after the operator and
   reviewer accept verification. Keep the separate security release blocker open.

### Original supplemental postdeployment verification requirements

These requirements describe the original deployment window. Acceptance has now
created later activity: zero receipts and global predeployment fingerprints are
not current-state expectations. Preserve the original baselines and compare
original rows by ID while reconciling later changes, assignments, snapshots,
follow-ups, and receipts. Never delete later activity to reproduce old counts.

The committed verification SQL is necessary but does not cover every requirement:

- Compare all eight datasets against the fresh deployment-window baseline before
  acceptance writes. The SQL projects away only assignment `patient_id` and
  snapshot `exercise_id_snapshot` for historical comparisons. Preserve every
  original field, including IDs, timestamps, status, order, dosage, and notes.
  Compare fingerprints only under the same generating SQL and session settings;
  retain older hashes without treating different conventions as equivalent.
- Require complete, non-null assignment patient identities matching their
  relationships, zero active patient/date collisions, and all new composite
  constraints validated. Confirm the new partial unique index is valid/ready
  with the exact predicate, and original indexes remain intact. Check receipt
  primary/foreign keys against the migration and confirm the new snapshot UUID
  column remains nullable with no catalog foreign key.
- Require historical snapshot catalog IDs to remain NULL, zero receipts before
  acceptance, and exactly one policy row with 14 days / `America/Los_Angeles`.
- Verify all five new public RPCs, three replaced RPCs, and eight private helpers
  exist with expected signatures/bodies and owners. Check public security-definer
  settings, empty search paths, authenticated execution, and no anonymous
  execution. Preserve original RPC ACLs, including service-role grants. Confirm
  prescription/catalog writers and patient read APIs are unchanged.
- Check all three new immutability triggers, their target tables, enablement,
  timing/events, and helper bodies. Compare the two existing table triggers and
  six captured platform event triggers with baseline.
- Verify existing RLS enabled/forced flags and policies are preserved. Confirm
  receipt RLS and provider-scoped SELECT, no browser receipt writes, no browser
  assignment/snapshot INSERT/UPDATE/DELETE/TRUNCATE or column write path, and no
  browser access to private scheduling schema/policy/helpers. Check effective
  permissions as well as raw ACLs, column grants, defaults, and memberships.
- Confirm PostgREST exposes the expected signatures after its schema reload.
  Missing APIs require inspection; do not resubmit the migration to refresh them.

### Recovery decision tree

| Observed outcome | Required response |
| --- | --- |
| Transaction fails before `COMMIT` | Keep writers quiet, save the error, and confirm the original transaction has ended. Verify original definitions and data remain intact. An aborted transaction cannot commit its migration changes; retry requires diagnosis and renewed review. |
| Commit outcome is unknown | Do not rerun. Inspect execution/session status and the complete deployment markers described in the recovery procedure. A still-running transaction may be invisible to another session. Escalate unresolved or mixed state to the administrator. |
| Verification fails after `COMMIT`, with no later writes | Preserve current state and investigate the difference. Prepare a separately reviewed forward fix or coordinated reversal; there is no automatic rollback after commit. |
| Failure follows new scheduling or other application activity | Re-establish the quiet window and export current assignments, snapshots, follow-ups, receipts, policy, and changed records/definitions before repair. Reconcile activity and request identities; prefer a compatible forward fix when it preserves valid records. Reversal needs explicit review of every affected later record. |

Restoring only the original RPCs is unsafe: the original assignment writer omits
the new required `patient_id`, and the old cancellation/follow-up bodies lack the
new shared-patient locking. A repair must coordinate functions, schema,
constraints, triggers, receipts, and callers. Use
[SCRUM64_RECOVERY.md](SCRUM64_RECOVERY.md); no executable reversal is authorized or
included here.

Provider-side browser-to-hosted acceptance has passed for the flows listed above.
The readiness verdict remains READY WITH CONDITIONS, including the separate
anonymous clinical-read release blocker and the recorded evidence limitations.

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

## Mobile snapshot consumption — separate follow-up

Patient mobile code was not changed. Provider-side acceptance does not verify
that the mobile client consumes persisted assignment snapshots. Track mobile
snapshot loading/display, refresh persistence, and behavior after template edits,
cancellation, and replacement separately. Do not mark that follow-up complete
from these provider results. Mobile notifications, new patient authentication,
and unrelated stories remain outside this implementation.
