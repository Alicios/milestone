# SCRUM-92: client privilege and patient-creation hardening

Prepared from `origin/main` commit `2245dd9dc3315650755f20c53622e1b36fc12b95`.
This change has not been deployed. Hosted findings supplied with the story are
the deployment assumptions; the local fixture is not a hosted schema export.

## Changes

- `20261029000100_scrum92_create_patient_authorization.sql` hardens both
  `create_patient(text)` and `create_patient(text,text,text)`. Each requires a
  non-null `auth.uid()` and an existing `public.providers` row. Both retain
  their original patient insert, relationship insert, validation, UUID return,
  parameter names, and defaults. Functions remain SECURITY DEFINER with an
  empty `search_path`, qualified application relations, authenticated EXECUTE,
  and no PUBLIC/anon EXECUTE. CREATE OR REPLACE preserves their owners.
- `20261029000200_scrum92_client_privileges.sql` removes client TRUNCATE on the
  15 public application tables. It removes PUBLIC/anon table and column grants
  on protected clinical/provider tables, and rebuilds only the three excessive
  authenticated grants identified for onboarding/profile tables.
- Existing RLS policies, including duplicate provider policies, remain intact.
  The `provider_patient_profiles.provider_id` FK still references `auth.users`.
  No patient rows, clinic model, Auth trigger, OTP endpoint, MFA flow, managed
  schema, or storage policy is changed.

The web caller supplies all three patient parameters
(`src/lib/supabaseData.ts:236`). No current application caller of the name-only
overload was found, but deployed older clients are not inventoried. Keeping
and securing it avoids an unnecessary compatibility break.

The first migration checks both signatures and normalized function-body SHA-256
values against the repository baseline/hardened definitions. Additional hosted
logic or an unexpected overload causes a transaction failure before replacement.
Full deployed definitions were not supplied with the hosted findings. Review
any mismatch; do not simply remove the guard or approve an unknown hash.
Baseline sources are `20261004000300_relationship_patient_profiles.sql` and
`20261024000100_patient_account_creation.sql`.

## Effective permissions intended after deployment

| Object | anon | authenticated |
| --- | --- | --- |
| `access_requests` | INSERT `name,email,department,notes` only | Same |
| `medical_practices` | SELECT | SELECT |
| `providers` | None | SELECT and UPDATE of the listed profile fields, under existing own-row policies |
| Clinical, relationship, messaging, routine and scheduling tables | No table/column privileges | Existing grants and RLS retained, except TRUNCATE revoked |
| `exercises` | Existing read policy/grants retained; TRUNCATE revoked | Existing grants/policies retained; TRUNCATE revoked |

`providers` UPDATE permits `name`, `professional_title`, `initials`,
`contact_email`, `phone`, `bio`, `avatar_url`, `medical_practice_id`, `facility`,
`office_location`, `work_phone`, `work_phone_extension`, and `preferred_contact`.
It excludes `id`. The list covers `updateProvider()` in
`src/lib/supabaseData.ts:77-102`, plus the existing descriptive initials field.
The migration requires the current `professional_title` schema; reconcile a
legacy schema before deployment rather than widening grants automatically.

Public access-request submission uses INSERT without RETURNING
(`src/pages/RequestAccessPage.tsx:29`). It does not need SELECT or permission to
set approval status, IDs, or timestamps. Medical-practice listing remains public
(`src/lib/supabaseData.ts:68`). Administrative approval continues through the
service-role client, whose explicit privileges are unchanged.

Column grants are important: revoking table privileges alone leaves separately
granted column privileges in place. The migration revokes both on the targeted
roles/tables before restoring the narrow onboarding/profile grants. Existing
authenticated messaging column grants and clinical-note updates are retained.
The preflight report includes both explicit and effective column permissions;
review inherited role permissions as well as direct ACLs before deployment.

## Exercise catalog compatibility decision

Current main's mobile application does **not** require anonymous catalog reads:

- `Mobile_App/Milestone/App.js:228` calls `loadPatientRoutine`.
- `Mobile_App/Milestone/lib/patientRoutine.js:12-23` reads care relationships,
  assignments, and prescription snapshots through authenticated `get_my_*` RPCs.
  Exercise names, sets, repetitions, durations, and notes come from snapshots.
- `Mobile_App/Milestone/lib/patientApi.js:20-27` uses the same patient RPC surface.
- No direct Supabase `.from('exercises')` or catalog REST request was found in
  the current mobile application source. The provider editor reads the catalog
  while authenticated (`src/lib/exerciseData.ts:7`).

Removing `"Temporary mobile read exercises"` is compatible with these inspected
current clients. Compatibility with installed older mobile builds is
**UNVERIFIED**. This patch therefore leaves that policy and catalog SELECT
grants unchanged. After confirming supported deployed client versions, remove
the temporary policy and excess anonymous catalog grants in a separately
reviewed change, preserving provider catalog reads and patient snapshot RPCs.

## Local validation

Run from `Web_App`:

```sh
npm run test:rls:db
# Or specify an installed PostgreSQL binary directory:
python3 supabase/tests/rls_integration.py --pg-bin /path/to/postgresql/bin

node --test tests/patientCreation.test.mjs tests/patientDetails.test.mjs tests/catalogRoutines.test.mjs tests/scheduling.test.mjs tests/messages.test.mjs tests/approveAccessRequest.test.mjs
```

The database runner creates a fresh cluster and a private Unix socket, disables
TCP listeners, does not read `.env` files, strips inherited PostgreSQL connection
variables, and accepts no database endpoint. It stops its own server in `finally`
and retains temporary logs and `results.json` for inspection. It needs installed
PostgreSQL tools, but no Python third-party dependencies or Supabase credentials.

The synthetic fixture deliberately models the reported `auth.users` FK and
excessive table/column grants. Historical SQL fragments reconstruct a local
baseline only; they are not a deployment recipe. Production routine, scheduling,
and patient messaging function bodies are used to test compatibility.

The 12 PostgreSQL test groups cover:

1. Reproduction of non-provider creation before hardening, for both overloads.
2. Preservation of baseline data, duplicate/catalog policies, and the FK.
3. Denial of anonymous, missing-UID, patient, and non-provider creation.
4. Provider success, UUID results, trimming, default email/phone behavior,
   validation, relationships, and message-state triggers.
5. Cross-provider patient isolation and own clinical-note updates.
6. Public onboarding, pending status, and rejection of approval/ID spoofing.
7. Profile updates and rejection of identity edits/self-provisioning.
8. Removal of TRUNCATE and residual column grants, with service-role grants and
   temporary catalog reads preserved.
9. Routine creation/editing, scheduling previews, receipts/replay, follow-ups,
   cancellation, legacy assignment calls, and mobile prescription snapshots.
10. Provider/patient messaging, the SELECT permission needed by Realtime,
    read cursors/stars, sender spoofing denial, and clinical-note exclusion.
11. Fail-closed behavior for unexpected function bodies or extra overloads.
12. Replay safety and atomic rollback when a required table lacks RLS.

These tests exercise PostgreSQL authorization with synthetic JWT-subject settings.
They do not test hosted API routing, actual JWT validation, WebSocket delivery,
mobile device builds, or OTP issuance. Local success is not a hosted security
certification. The read-only preflight query is also executed on the local fixture.

Validation executed on 2026-10-29:

| Check | Result |
| --- | --- |
| `python3 supabase/tests/rls_integration.py` | 12 groups passed; zero failed |
| Six Node test files in the command above | 139 tests passed; zero failed/skipped |
| Diff whitespace checks, including new files | Passed |
| Original Sprint 3 branch/status and hashes of its seven dirty/untracked files | Unchanged |

The first PostgreSQL launch was blocked by sandbox shared-memory restrictions;
the permitted local run and the final rerun passed. No hosted tests were run.
The Node tests use mocked transports. Existing dependencies were copied into
this worktree from a checkout with an identical package lock; no lockfile was
changed. No mobile device/build or browser end-to-end suite was executed.

## Deployment review (not performed)

1. Run `audits/scrum92_preflight.sql` with an authorized metadata-reading
   connection. It uses a read-only transaction and reads no patient records.
   Save the policy/function/grant definitions for review and rollback.
2. Confirm the target project, all 15 RLS flags, both exact function signatures,
   owners, parameters/defaults, function bodies, effective table/column grants,
   existing ownership policies, and provider profile columns. Review any
   unexpected role inheritance or surviving permissive policy.
3. Reconcile the hosted migration ledger. The repository is not a complete
   reset baseline; do not replay historical migrations or indiscriminately push
   the entire directory. Apply only the two reviewed SCRUM-92 migrations, in
   timestamp order, after explicit approval.
4. Each migration is transactional and has lock/statement timeouts. The second
   aborts if any expected table is missing or lacks RLS. Schema reload is
   requested at commit. No schema/data backfill is required.
5. Verify effective grants again and smoke-test approved synthetic accounts in
   staging: provider creation, onboarding, profile editing, routines/scheduling,
   patient snapshots, and both messaging roles. Check the real Realtime channel
   and current mobile build. Do not use real patient data for destructive tests.

The catalog policy cannot be removed safely for every installed client until
the supported deployed versions are known. The duplicate profile policies are
equivalent in the local fixture, but their exact hosted expressions must be
reviewed before any future consolidation.

## Rollback and remaining risks

A failed migration rolls back its own changes. After deployment, prefer a
reviewed forward correction to missing legitimate privileges; use the captured
definitions for a targeted rollback only if necessary. Do not disable RLS,
restore client TRUNCATE, or restore the non-provider patient-creation hole.
There is no data transformation to reverse.

This patch does not fix SCRUM-84 concerns: patient linking through signup
metadata, OTP generation identity binding, provider approval, or database MFA
enforcement. A provider-row check trusts the existing provider provisioning
process. The existing FK is retained, so this patch does not repair any
historically invalid provider relationships. Other authenticated grants and
policies remain subject to the reviewed hosted baseline. No clinic tenancy
model is introduced.
