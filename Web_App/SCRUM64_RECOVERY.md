# SCRUM-64 targeted recovery procedure

Companion to [SCRUM64_SCHEDULING.md](SCRUM64_SCHEDULING.md).
Earlier implementation review:
`a012449b71d2c1b47628b045997116d9186f5037`, branch
`feature/scrum-64-scheduling-integration`, worktree
`/private/tmp/milestone-scrum64-scheduling`.
Last confirmed HEAD from the resumed-session handoff:
`75a77d0c25d57f1eb906ba4c75bc88744f81aa1f`.

SCRUM-64 was successfully deployed to hosted Supabase on October 21, 2026.
Provider-side hosted acceptance passed, including persistent assignments,
expandable assigned prescription details, template-edit snapshot immutability,
and cancellation/replacement. The final readiness verdict was READY WITH
CONDITIONS; the anonymous clinical-read security release blocker remains open.
Mobile snapshot consumption is a separate follow-up, unverified by these
provider-side results. See the companion's acceptance record for the full scope.
These results are from the handoff, not fresh hosted checks during this update;
no exact deployment or acceptance execution timestamp was supplied.

This document describes decisions and evidence needed for a future repair.
It authorizes no hosted SQL execution, deployment, clinical write, permission
change, or migration-gate change. No executable reversal is
provided. Any approved hosted deployment or repair uses Supabase SQL Editor with
the existing administrator role. No database password, credential reset, or
direct connection is required.

**Do not replay the deployed scheduling migration.** Its source intentionally
retains the disabled execution gate; preserve that gate. Any correction requires
a separately reviewed repair based on the deployed state and later activity.

## Recovery package and validation

| Artifact | Private local path | SHA-256 |
| --- | --- | --- |
| Application data | `/Users/gerardocamacho/Downloads/Supabase Snippet List Tables and Columns with Data Types (2).csv` | `c36566ee01de48246abffd8c705debf7c90e094c19b47de347e9363410a40101` |
| Database definitions | `/Users/gerardocamacho/Downloads/Supabase Snippet List Tables and Columns with Data Types (3).csv` | `aa5556803a5cd4827a4389bc953bd3bae75fde73a5c9a355f47db3f956db2102` |

The data capture is `2026-10-21T19:32:42.904876Z`; the definition capture is
`2026-10-21T19:35:36.541936Z`. Both used role `postgres`, UTC, and hosted PostgreSQL
17.6. Their approximately 174-second separation does not establish a shared
transactional snapshot or prove that writers were quiet. The generic database
name `postgres` does not establish project identity; record the intended project
reference separately with the deployment evidence.

Validation passed CSV/JSON integrity, 292 data-export records, 515 definition-export
records, all expected records/manifests, all eight recomputed fingerprints,
original function comparisons, permissions/RLS, constraints, indexes, triggers,
and coverage for targeted recovery. Keep the original files immutable outside Git
with an independent private copy. Verify checksums before use. Checksums identify
these local files; they do not independently authenticate their hosted origin.

The original predeployment data export contains 284 application records and eight
manifests. The counts and fingerprints below are immutable historical baselines,
not current hosted totals or targets to restore by deleting later activity:

| Dataset | Rows | Validated manifest fingerprint |
| --- | ---: | --- |
| `exercises` | 248 | `8813251d00dcc2d6e6857743563064c4` |
| `routines` | 12 | `e58f95e3fdda3088c5a262d20d489338` |
| `routine_assignments` | 4 | `ffc3f54f3169650d340bfc93af3f9751` |
| `routine_assignment_exercises` | 6 | `fa98604593ad2d078d1bbb888e9702af` |
| `patients` | 5 | `1b2bb12edb36fddc31f988544c55ae34` |
| `providers` | 4 | `762e3fce1bbfba8531828d8b5db12a2f` |
| `provider_patient_profiles` | 5 | `40917a70deb31a74af71cb692d81dd6e` |
| `routine_follow_ups` | 0 | `d751713988987e9331980363e24189ce` |

These are the export's ordered JSONB-array fingerprint convention. Preserve the
original generating query and UTC settings with the package. Older historical
hashes use an unconfirmed convention and cannot establish equality without their
original SQL. In particular, an empty-string MD5 differs from the MD5 of `[]`.
File SHA-256 values, row fingerprints, and counts serve different purposes.

The definition export includes eight tables, 62 columns, 37 constraints, 15
indexes, 33 functions, 18 policies, two table triggers, six event triggers, two
schemas, six default ACL entries, 30 roles, 24 memberships, 24 effective-table-access
entries, one context record, and 247 dependency entries. Seven dependency tuples
repeat; they are redundant references, not additional distinct objects.

## What the package protects

The package preserves the eight datasets' original IDs and values, including
historical prescriptions, relationships, routine arrays, status, and timestamps.
Routine exports include both JSON data and PostgreSQL `jsonb[]` text; retain the
array text to preserve distinctions lost through JSON conversion alone.

It preserves original affected-table column definitions, defaults, nullability,
constraints, indexes, comments, trigger bodies/enablement, RLS flags/policies,
owners, and table/column ACLs. Function definitions include exact signatures,
configuration, security mode, and separate ownership/ACL evidence. Role names,
memberships, and default grants support access review without exporting passwords.
The three original replaced RPC bodies match their committed predecessors after
line-ending normalization.

This is sufficient input for preparing an in-place function fix, a coordinated
schema repair, or selective reconstruction of captured records inside an otherwise
intact project. Definitions and CSV rows must first be converted into a reviewed
repair appropriate to the current state. They are not ready-to-run restoration SQL.

## Limitations and excluded recovery scenarios

These are targeted recovery exports, not a complete PostgreSQL backup. Supabase
Free provides no accessible managed backup for this procedure. No full restore or
targeted restoration rehearsal has been demonstrated. The package provides no
point-in-time recovery or guaranteed recovery time and cannot reconstruct later
activity unless that activity is captured separately.

External dependencies that must remain intact include:

- `auth.users`, referenced by provider identities and relationship provider IDs.
  Auth account contents, credentials, sessions, and platform configuration are not
  exported. Exporting provider records does not recreate Auth accounts.
- `medical_practices`; three captured providers contain non-null practice IDs.
- `message_thread_state`, `messages`, `patient_statuses`, and `routine_exercises`.
  Incoming foreign keys and dependency references are captured, but these tables'
  complete definitions, policies, and records are outside the package.
- Supabase services, Storage files/metadata, other application tables, and
  platform-managed roles/extensions beyond the captured evidence.

Restoring a relationship row can fire `create_provider_message_thread_state` and
write to an excluded table. Updating patient authentication identity can fire
`backfill_patient_message_thread_state`. Review those side effects before any
record reconstruction. Dependency descriptions alone cannot recreate excluded
objects. Do not drop/recreate source tables or use cascading drops as a shortcut.

Project loss, damaged Auth/Storage, missing external records, lost administrator
access, platform-role restoration, or an exact database-wide rollback requires
administrator assistance and a broader recovery plan. Capturing a role definition
does not confer authority to recreate or modify that role.

### Metadata identities and permissions

Some `object_name` labels are truncated to 63 bytes. Two different snapshot
constraints share a label. Use the full `details` payload: function definition and
signature, constraint `conname`/table, policy schema/table/`policyname`, and other
catalog identity fields. Captured OIDs help correlate entries within this capture;
do not assume those OIDs survive recreation or move to another project.

Never key a restoration solely by `object_name`. For future exports, force that
UNION column to `text` from the first branch; casting only the final result cannot
restore already truncated text. Keep these validated originals unchanged.

Function DDL does not restore ownership or grants by itself. Preserve separate
ACLs, grantors/options, column grants, schema access, role membership, and default
privileges. A null ACL represents defaults, not necessarily zero privileges.
For example, authenticated UPDATE of `clinical_notes` is a column grant, and the
three original RPC ACLs also include service-role execution.

Temporary anonymous clinical SELECT policies are a separate security release
blocker. Capture and compare them as evidence. This procedure does not authorize
changing or automatically recreating those policies, broadening grants, or
declaring the application ready for release.

## Deployed activity that recovery must preserve

Hosted acceptance used synthetic patient Jaden Shiba
(`05bac18e-b8cf-428e-b591-abd7e80ae4b3`) and provider Milestone Dev
(`924e8b62-4f8f-4226-bd33-bb526756228c`). The October 24, 2026 scheduled-date
cancellation/replacement verification recorded cancelled assignment
`8a570002-2ce4-467f-b38b-74eb3af3cb96` and replacement assignment
`1a03e5b7-5295-4afd-9318-227bd8665d7a`. Both retain three exercise snapshots.
October 24 identifies the assignment date, not an asserted execution timestamp.

Later scheduling activity is confirmed. Recovery must preserve these distinct
assignment UUIDs, cancelled status/history, and both snapshot sets, together with
all other legitimate new assignments, snapshots, follow-ups, and durable receipts.
The original four-assignment/six-snapshot export is not a complete recovery source
for the deployed application. Capture and reconcile current data before repair;
do not overwrite it with the original export, reactivate cancelled assignments,
rebuild snapshots from current templates, or remove receipts to match old counts.
No current aggregate counts, follow-up counts, or receipt IDs were supplied in
the handoff, so none are inferred here.

## Preconditions and incident capture

Before any repair, review this procedure, identify the operator/reviewer and
recovery decision-maker, record project provenance, and accept the bounded recovery
scope. Establish a quiet write window across all clients, scripts, jobs, and
administrator writers. Obtain fresh preservation evidence through SQL Editor,
using queries reviewed for the deployed schema. The archived first-deployment
preflight is not a repair script and must not prompt migration replay. Capture
and validate a new version of the package for the current state; retain every
original version and its checksums.

On an incident, keep or re-establish that window. Do not retry deployment,
overwrite an export, clear pending browser recovery pointers, regenerate request
IDs, cancel assignments for cleanup, or start repair before preserving evidence.
Capture the submitted SQL, SQL Editor outcome, timestamps, project/operator,
current definitions/security state, and current rows. Read-only incident queries
must be reviewed for the observed schema; this document does not execute them.

Scheduling has run. Preserve complete current assignments, snapshots,
follow-ups, `routine_schedule_requests`, and `milestone_scheduling.policy`, plus
changed templates, relationships, patients, and providers. The original data
export query does not include the new receipts or policy and must be supplemented.
Retain receipt provider/request IDs, exact payload/result, assignment references,
and creation times. Capture pending request identities securely where available.

Reconcile by original row ID and full values. Do not rely solely on creation times:
cancellation changes existing assignments/follow-ups. Empty receipts do not prove
there were no later writes. Record legitimate new activity separately from the
defect; retain original snapshots and unknown historical catalog IDs. Never
regenerate historical prescriptions from current templates.

## Determine commit outcome during an incident

The October 21 deployment is recorded as successful and hosted acceptance has
written later activity. The diagnostic procedure below is retained for an incident
with an uncertain transaction outcome; it does not reopen that deployment as
pending or authorize replay. The confirmed later-activity branch of the recovery
decision tree applies to the known deployed state.

First determine whether the original SQL Editor execution and its transaction have
ended. Browser timeout, cancellation, or lost output alone does not establish
rollback. An active, uncommitted transaction may be invisible to another session.
Use administrator assistance if execution/session status cannot be resolved.

Once execution has ended, inspect the complete state against the fresh baseline:

- New `milestone_scheduling` schema, seeded policy, and eight private helpers.
- New receipt table, its policy/permissions, and five new public RPCs.
- Assignment `patient_id` backfill/NOT NULL, composite constraints, active-date
  unique index, and snapshot `exercise_id_snapshot`.
- All three new immutability triggers and the exact three replaced RPC bodies.
- Existing records, original definitions, and permissions compared with baseline.

All reviewed new objects and bodies present and consistent support a committed
deployment. Their absence, original bodies restored/preserved, matching baseline
data, and a confirmed ended transaction support no committed migration changes.
One marker, an empty receipt table, a ledger entry, or an SQL Editor message is
insufficient alone. Mixed state requires investigation of drift, partial/manual
execution, or later changes; do not replay the migration to complete it.

The source is one explicit transaction. A transaction that aborts before commit
cannot commit its migration changes. Confirm transaction closure and data state;
any session termination or transaction-cleanup command needs operational approval.
The migration itself does not record an applied version in Supabase history.
An absent history entry does not justify replaying this deployed migration.

## Recovery decision tree

| State | Decision and next action |
| --- | --- |
| Confirmed failure before `COMMIT` | Preserve error/evidence, confirm transaction ended and baseline unchanged, diagnose the cause. A subsequent deployment attempt needs fresh preflight and approval; no automatic retry or weakened checks. |
| Unknown commit outcome | Resolve original execution/session status and inspect all deployment markers. Keep writers quiet. Do not run deployment or reversal while the state is uncertain. Escalate unresolved or mixed state. |
| Committed; verification fails; no later activity | Export current state and identify the exact failed comparison. Prepare a compatible forward fix or coordinated reversal from the captured originals and current definitions. Review/authorize the exact script before execution. |
| Committed; new scheduling or other writes occurred | Preserve receipts and all affected current records first. Reconcile legitimate activity, including changes to old rows. Prefer a compatible forward fix that retains records and request semantics. A reversal needs an explicit disposition for every later record and dependency. |

Verification after `COMMIT` cannot undo that commit. A previous application build
also does not reverse database behavior; older clients call the replaced RPCs.

## Choose a forward fix or coordinated reversal

A forward fix is appropriate when a bounded change can repair behavior while
retaining valid identities, snapshots, receipts, and the current schema contract.
Specify affected function signatures/objects, intended behavior, permissions,
transaction boundaries, and verification before requesting authorization.

A reversal is a separately reviewed migration, not a replay of historical SQL.
It must address new columns/constraints/indexes, triggers, helpers, receipts,
public RPCs, permissions, and callers in dependency order. Confirm excluded
objects will remain intact. Prefer a transaction for a bounded repair where all
operations permit it; review its failure behavior and locking/timeouts explicitly.
Do not erase later clinical activity to make old fingerprints match. Original
assignment `status` and `scheduled_date` were already NOT NULL; reversal must not
relax original constraints simply because the migration restated them.

Restoring only original RPC bodies is unsafe:

- The old assignment writer omits new `patient_id`, which is required after
  deployment. It also bypasses the new receipt flow and scheduling validation.
- Old cancellation/follow-up implementations omit shared-patient serialization.
- New triggers, uniqueness, policy, and pending client requests still impose the
  deployed contract. Snapshot/receipt triggers can block privileged repairs too.

Reconcile those contracts together. Any proposed trigger change must state its
scope, duration, original definition, and restoration/verification requirements;
this document authorizes no disabling or bypassing of enforcement.

## Authorization boundaries

Documentation preparation and local artifact inspection do not authorize hosted
changes. Deployment approval covers only its exact reviewed execution copy.
Separate explicit authorization is required for a repair/forward-fix/reversal,
record import or clinical change, object removal, session termination, enforcement
change, permission/RLS change, role/platform intervention, and acceptance involving
writes. Existing approval remains valid within its specified scope; do not expand
it to incident repair. The security blocker requires its own reviewed release.

No migration gate is enabled here. Do not replay historical migrations, reset
credentials, run hosted test fixtures, or treat captured definitions as an approved
restoration script. Administrator assistance is needed when required authority
or excluded dependencies are unavailable.

## Verify a completed repair

Before execution, the approved repair must define expected post-repair records,
definitions, and permissions. After execution, keep writers quiet until the
following comparisons are accepted:

1. Reconcile all eight baseline datasets by identity and full original values,
   accounting explicitly for every authorized later change. Match original
   prescription content/order, dosage, notes, status, timestamps, and unknown IDs.
   Use the same fingerprint convention/settings and exclude only reviewed added
   columns. A forward fix retaining legitimate activity will not reproduce global
   predeployment hashes; verify original-ID projections and reconciled additions.
2. Check patient/relationship identity consistency, required values, uniqueness,
   validated constraints, valid/ready indexes, and intact external references
   against the approved target contract. Where scheduling remains deployed, check
   shared-patient active-date uniqueness. Verify any retained receipts still
   resolve to the preserved IDs and exact payload/result; do not create new request
   identities to bypass a defect.
3. Compare all affected function signatures/bodies, owners, security modes, search
   paths, and ACLs with the approved target. Confirm unchanged writers and patient
   read APIs remain intact. For reversal, verify the agreed original contract; for
   forward fix, verify the retained scheduling contract and documented changes.
4. Verify intended trigger definitions/enablement, RLS flags/policies, schema and
   table/column access, default grants, and role memberships. Confirm no unintended
   anonymous execution or browser write path and no change to the separate
   anonymous SELECT security blocker.
5. When scheduling remains deployed, verify policy values, private helper access,
   receipt ownership RLS, and all scheduling APIs through the expanded runbook
   requirements. Use zero-receipt/all-snapshot-ID-NULL checks only before new
   activity; afterward inspect captured historical IDs and reconcile new rows.
6. Confirm PostgREST schema visibility and read-only application behavior. Any
   write acceptance needs its own approved scope. Preserve repair SQL, approval,
   outcomes, before/after exports/checksums, and verification in the private ledger.

Resume writers only after reviewer acceptance. Unresolved record differences,
uncertain commit state, incompatible permissions, or missing dependencies keep
operational recovery blocked. Successful repair does not resolve the separate
security release blocker or establish full-project restore capability.
