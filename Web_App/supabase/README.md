# Supabase database

The canonical current model is documented in [SCHEMA.md](SCHEMA.md). The SQL
files in `migrations/` are incremental migrations for the existing hosted
Milestone project; `schema.sql` is only the historical bootstrap that created
the original `profiles` and `access_requests` tables.

## SCRUM-43: reusable exercises

**Integration in progress: do not apply the SCRUM-43 migration or run this
branch's migrations in filename order.** The original
`migrations/20261005000100_reusable_exercises.sql` is preserved unchanged for the
next migration-design step; it has not been applied as part of this integration.
It sorts before the team's `20261006...` migrations and is incompatible with them:
the rename migration replaces its catalog-aware `assign_routine`, the documentation
migration references the removed `routine_exercises.name`, and the original
assignment writer targets `name` instead of `exercise_name_snapshot`.

Retimestamping/redesign and the client rollout strategy require a separate review.
The saved-routine editor now expects the reusable catalog schema; it is not ready
for end-to-end use against the upstream database schema. The upstream rename
fallbacks remain in place but do not bridge the name-array versus exercise-ID
`save_routine` contracts. `SCHEMA.md` describes the upstream baseline, not the
pending reusable exercise model below.

The preserved SCRUM-43 design provides:

- `exercises` is the provider-private catalog: UUID, provider UUID, nonblank name,
  instructions, and creation/update timestamps. Names are intentionally not unique.
- `routine_exercises` retains its membership UUID, routine UUID, position, and
  unique routine/position constraint. Its required `exercise_id` references the
  catalog; its old `name` column is removed. Repeated use at different positions
  is allowed, including within the same routine.
- Backfill creates **one catalog row per existing membership**, including entries
  in archived routines. Matching names are never deduplicated. Membership IDs and
  ordering are preserved. The previously applied seed migration must not be rerun
  against the new association schema.
- `save_exercise(p_exercise_id, p_name, p_instructions)` creates a catalog entry
  when its ID is null, or updates an owned entry and its `updated_at` timestamp.
  `save_routine(p_routine_id, p_routine_name, p_exercise_ids)` accepts an ordered
  UUID array, validates every exercise's ownership, and preserves retained slot
  IDs. Empty routines remain supported. Routine changes do not delete catalog rows.
- Authenticated clients have SELECT-only catalog access with provider RLS. Writes
  use authenticated SECURITY DEFINER RPCs with explicit ownership validation and
  an empty search path. There is no public catalog access or browser admin key.
- `assign_routine` copies current catalog names and instructions into independent
  assignment snapshots. Existing snapshots keep their names/order and receive
  empty instructions because no historical instructions were recorded. There is
  deliberately no catalog foreign key on assignment exercise snapshots.
- Catalog edits affect future template reads/assignments across referencing
  routines, but never rewrite existing assignment snapshots. The RPC/data layer
  supports editing; a catalog-editing/deletion UI is outside this story.

The Saved routines editor can select an existing exercise, reorder memberships, or
create an exercise with instructions inline. Creation persists immediately to the
library, even if the routine is subsequently cancelled. Equal-name entries remain
separate choices. The upstream Editor demo remains an independent in-memory
prototype, with its original fields and temporary IDs; it does not use catalog
IDs or persist to Supabase. No full library-management page or mobile integration
is added.

Persisted sets, reps, duration, rest, timer mode, and estimates are deferred.
The new Editor demo includes dosage fields, notes, descriptions, and media, but
does not establish a database prescription contract (including per-set versus
whole-exercise timing). When agreed, prescription values belong on the routine
membership, with their effective values copied into assignment snapshots.

### Preserved database tests (not run during this integration)

`tests/run-exercises.sh` and `tests/reusable_exercises.sql` retain the original
SCRUM-43 tests. They do not include the new `20261006...` migrations and must be
updated before they can establish compatibility with the integrated schema.
Database validation is deferred to the next approved migration-design step.

The original runner creates/stops a disposable PostgreSQL cluster in `/tmp`,
using a private Unix socket and no TCP listener. It never reads a hosted database
URL or Supabase key.
It applies migrations 010, 011, and the new migration to a **minimal test fixture**,
not to the team's database. The fixture is not a replacement for the missing
complete baseline. Tests cover backfill without deduplication, seed preservation,
reuse/repetition/order, invalid references, ownership/RLS/grants, removal/archive
behavior, and immutable snapshots after catalog edits. Test artifacts are retained
in the printed temporary directory for inspection.

## Upstream migration reference

The following describes the upstream baseline only. The SCRUM-43 warning above
takes precedence for this feature branch; do not apply the combined migration
set as-is. Upstream's ordered migration sequence ends with:

1. `20261006000100_clarify_schema_names.sql`
2. `20261006000200_document_public_schema.sql`

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

The web app retains upstream's narrow compatibility fallbacks for these renames.
Those fallbacks trigger only for confirmed missing-table or missing-column
errors. Snapshot reads also allow absent pre-SCRUM-43 instructions, representing
unrecorded instructions as empty strings rather than reading mutable catalog
content. These fallbacks do not make the catalog editor compatible with a
database lacking SCRUM-43.

## Verification

After applying both migrations, verify that the public schema contains ten base
tables, including `routine_follow_ups` and excluding `appointments`. Run the
description audit in [SCHEMA.md](SCHEMA.md); it must return no rows.

Also verify with at least two provider accounts that:

- each provider sees only their own profile, patient relationships, statuses,
  routines, assignments, snapshots, and follow-ups;
- editing a routine does not change existing assignment snapshots;
- cancelling an assignment preserves it and cancels a scheduled follow-up;
- discharging a patient retains the provider-specific history; and
- duplicate active assignments for the same profile, routine, and date fail.

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

## Storage

Provider avatars use the public `profile-images` bucket at
`{auth-user-id}/avatar`. Uploads use `upsert: true`, so the matching
`storage.objects` policies need `INSERT`, `UPDATE`, and `SELECT` permissions in
addition to any delete policy. Never expose a `service_role` key in Vite browser
configuration.
