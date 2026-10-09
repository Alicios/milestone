# Supabase database

The canonical current model is documented in [SCHEMA.md](SCHEMA.md). The SQL
files in `migrations/` are incremental migrations for the existing hosted
Milestone project; `schema.sql` is only the historical bootstrap that created
the original `profiles` and `access_requests` tables.

## SCRUM-43 local expansion

The shared-catalog prescription migration is implemented locally and has **not**
been applied to hosted Supabase. See [SCRUM43_INTEGRATION.md](SCRUM43_INTEGRATION.md)
for the contract, read-only preflight, bounds, compatibility window, tests, and
reviewed deployment procedure. The hosted database differs from migration history;
do not replay this directory or seed the hosted catalog.

## Historical migration context

These files document incremental changes against reviewed baselines. The messaging addition is:

1. `20261007000500_messages.sql` — tables, grants, RLS, and Realtime publication
2. `20261007000600_seed_demo_messages.sql` — twelve idempotent text imports
3. `20261007000700_document_messages.sql` — column descriptions

For the existing hosted project, use Supabase Dashboard → SQL Editor while
signed in as the database owner. Each migration is transactional. Stop on the
first error and inspect the hosted state before retrying; a browser publishable
key cannot apply schema migrations.

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

After applying the current migrations, verify that the public schema contains
fourteen base tables, including `messages` and `message_thread_state`. Run the
description audit in [SCHEMA.md](SCHEMA.md).

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
