# Supabase database

The confirmed production baseline has the October 6 renames:
`providers.professional_title`, `routine_follow_ups`, and
`routine_assignment_exercises.exercise_name_snapshot`. It still stores exercise
names in `routine_exercises` and has no `exercises` table. This confirmation was
provided by the team; this change does not contact or update hosted Supabase.

[SCHEMA.md](SCHEMA.md) documents the proposed schema after SCRUM-43. `schema.sql`
is the historical bootstrap, not a fresh-database or production-update script.

## SCRUM-43 migration order

The unpublished `20261005000100_reusable_exercises.sql` draft is retired and
replaced by **`20261007000100_reusable_exercises.sql`**, after:

1. `20261004001000_routines_assignments_followups.sql`
2. `20261004001100_seed_demo_routines.sql`
3. `20261006000100_clarify_schema_names.sql`
4. `20261006000200_document_public_schema.sql`
5. `20261007000100_reusable_exercises.sql`

All earlier applied migrations remain unchanged. For the existing production
baseline, do not replay the historical migrations or seed: only the new pending
migration is required once its deployment is separately approved. The migration
checks the renamed baseline and rejects an already-existing catalog. It runs in
one transaction, takes exclusive locks on routines/memberships for the backfill,
and uses a 10-second lock timeout. A lock timeout or SQL error rolls back the
transaction; inspect the error before retrying. Schedule a low-traffic window
because these locks briefly block routine reads/writes. In-flight requests may
need retrying during the schema transition.

Do not run `supabase db push` against the existing project until its migration
history has been baselined. Local filenames do not establish hosted application
history. An environment where someone applied the old draft needs a separate
repair plan; do not apply this replacement on top of that draft.

## Staged deployment and rollback

This is an **expand-only compatibility stage**, not a coordinated client cutover:

1. After separate approval, back up and record current counts/IDs and schema,
   verify the October 6 baseline, and apply only the new migration.
2. Verify legacy reads, `save_routine` and `assign_routine` still work, and check
   provider isolation with separate accounts. Existing web clients remain usable.
3. Deploy the catalog-aware web client after database verification. Its new
   `save_routine_with_exercises` RPC requires this migration.
4. Keep the old name column/API until all consumers have migrated. Removing them
   requires a separately reviewed forward migration; no removal is scheduled here.

If the new client needs rollback, the old client can still read, assign, create
new routines, and rename existing routines whose submitted exercise list is
unchanged. It cannot structurally edit existing exercise lists: those requests
fail intentionally until the catalog-aware client is restored. Retain the expanded
database; do not drop the catalog or reverse the backfill after writes, which
would lose reusable identities/instructions. An SQL failure before migration
commit rolls the whole migration back. The migration notifies PostgREST to reload
its schema cache on commit; REST behavior still needs deployment smoke tests.

## Catalog, memberships, and legacy compatibility

- `exercises`: provider-owned UUID, nonblank name, instructions (default empty),
  and creation/update timestamps. Names are deliberately not unique.
- `routine_exercises`: existing ID, routine ID, name, and position are preserved;
  a required `exercise_id` foreign key is added. Unique routine/position remains.
- Backfill creates one new catalog record for **every** existing membership,
  including archived routines. Names are never deduplicated across or within
  providers. Catalog timestamps record creation of the catalog records, not the
  original memberships. The historic CSV counts are not hardcoded.
- `routine_exercises.name` is a compatibility mirror. A membership trigger checks
  exercise/routine ownership and derives this value from the catalog. A catalog
  rename trigger updates the mirror in every referencing membership, including
  archived routines. Existing name-based readers continue to work.
- `save_exercise(p_exercise_id, p_name, p_instructions)` creates or edits an owned
  definition. Edits affect current/future template reads, not existing assignments.
- `save_routine_with_exercises(p_routine_id, p_routine_name, p_exercise_ids)` saves
  ordered owned exercise IDs. It supports cross-routine reuse and repeated use
  within a routine. Retained positions keep their membership IDs; IDs identify
  slots, not permanent exercise identity after reordering.
- `save_routine(p_routine_id, p_routine_name, p_exercise_names)` retains its exact
  signature and named arguments under a **transitional conservative policy**:
  - New routines may be created, generating a separate owned definition with
    empty instructions for each nonblank entry. No name-based deduplication.
  - For existing routines, normalize the submitted names by trimming/filtering
    blanks and compare the entire ordered list to the stored ordered names.
    Only an equal list is accepted. A safe save can change the routine name but
    never writes memberships or definitions, even for equal-name entries or
    stored gaps in position values. Pass the current list for name-only changes;
    a null list means an empty list, not "leave exercises unchanged."
  - Adding, removing, renaming, or reordering entries, including stale submissions
    after a catalog rename, is rejected with SQLSTATE `55000` and the message:
    "Legacy exercise-list changes are not supported. Use the catalog-aware routine
    editor." Validation happens before any write; a rejected RPC changes nothing.
  - Equal-name swaps are not representable by this API. An identical name list
    is a no-op for memberships; it cannot swap their IDs or instructions.

**Structural exercise-list editing of migrated/existing routines requires the
new catalog-aware client.** Old clients remain usable only for safe legacy
operations; compatibility does not promise that every historical edit succeeds.
The new ID-based API continues to support structural edits and cross-routine
reuse without guessing identity. Ambiguous legacy requests fail intentionally.

The distinct new RPC name avoids PostgREST overload ambiguity. Catalog creation
in the new editor persists immediately even if the containing edit is cancelled.
The saved editor refreshes the catalog on entry, editor-mode changes, and routine
refreshes, and blocks editing when a referenced definition cannot be reconciled.
Routine loading reports an explicit integrity error for hidden/missing definitions.

## Snapshots and security

`assign_routine` keeps its public signature. It validates the active owned
provider-patient relationship and routine, then copies the current catalog name,
instructions, and membership position into independent snapshot rows. The live
`exercise_name_snapshot` name is retained. New snapshot `instructions` is NOT NULL
with an empty default; existing snapshots receive empty instructions without
rewriting their IDs, names, positions, or parent assignments. There is no catalog
foreign key or catalog lookup when displaying assignment history.

Catalog RLS allows authenticated providers to SELECT only their own definitions.
Browser INSERT/UPDATE/DELETE is not granted; writes use SECURITY DEFINER RPCs with
an empty search path and explicit authenticated ownership checks. New trigger
helpers have no public/anon/authenticated EXECUTE grant. Existing table RLS is
unchanged. Supported exercise saves, both routine writers, and assignment creation
lock the provider row before other writes, serializing these operations per
provider and keeping snapshot/mirror writes consistent. Different providers can
operate independently. Exercise and routine provider ownership is immutable via
parent-table triggers, including for empty routines/unreferenced definitions.
Neither application RPCs nor ordinary privileged UPDATEs can transfer ownership.
Administrators who disable constraints/triggers remain trusted administrative paths.

The renamed follow-up RPCs, patient relationships, profile handling, and existing
Supabase rename fallbacks are retained. Snapshot reads allow missing historical
instructions and never substitute mutable catalog content.

## Frontend scope

Saved routines uses the reusable catalog. The upstream Editor demo remains an
unchanged in-memory prototype with independent temporary IDs, fields, and media
previews. No demo-only sets, repetitions, duration, rest, notes, descriptions, or
media are persisted by this migration. `instructions` is the existing SCRUM-43
reusable definition field. Prescription semantics, catalog deletion/management,
and mobile integration remain separate work.

## Local validation

With PostgreSQL tools (`initdb`, `pg_ctl`, `psql`) and Python 3 available:

```bash
bash Web_App/supabase/tests/run-exercises.sh
```

The runner creates/stops a disposable cluster in `/tmp`, using a private Unix
socket with TCP disabled. It does not load Supabase credentials. It checks file
ordering and runs the real 010, 011, October 6 rename/documentation, and SCRUM-43
migrations in order on a minimal fixture for earlier dependencies. This fixture
is not a complete Supabase baseline and does not test Auth JWT verification,
PostgREST, hosted extensions, or the browser end-to-end.

Tests cover original routines/memberships/assignments/follow-ups and RLS
preservation; archived/equal-name backfill; legacy creation, unchanged lists and
name-only edits; full row equality after rejected first/middle removals, reorders,
equal-name removal, additions, clearing and stale catalog-name submissions; reuse,
ordering, immutable ownership, mirror synchronization, snapshots, and follow-ups.

`exercise_concurrency.py` uses four independent local psql sessions and waits on
`pg_blocking_pids` before releasing competing transactions. Timeouts fail the test;
elapsed time is never evidence of successful synchronization. Tests cover catalog
edit versus assignment, stale legacy save versus an ID edit, a transaction error
after catalog/mirror writes, archive/discharge versus assignment, and independent
progress by another provider. Only standard Python and psql are required. These
are PostgreSQL READ COMMITTED tests, not hosted REST/JWT or load tests. Artifacts
are retained in the printed temporary directory.

From `Web_App`, `npm run lint` runs TypeScript checks and `npm run build` runs
TypeScript plus Vite production bundling. No database migration runs in either.

## Existing ownership and storage

`providers.id` is its Supabase Auth user ID. `professional_title` is display
information, not an authorization role. Signup metadata retains the upstream
legacy `role` fallback; contact email remains separate from login email.

Patients are shared identities; private notes, statuses, assignments, and
discharge state belong to unique provider-patient relationship profiles.
Additional relationships require trusted administrative/backend tooling.

Provider avatars use `profile-images` at `{auth-user-id}/avatar`, with the
existing storage policies. Browser configuration must never contain a service-role
key. No credentials or storage changes are part of SCRUM-43.
