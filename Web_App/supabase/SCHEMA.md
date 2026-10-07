# Milestone Supabase Schema

This describes the proposed application-owned `public` schema after
`20261007000100_reusable_exercises.sql` (SCRUM-43). Production was confirmed at the
October 6 rename baseline; SCRUM-43 has not been deployed as part of this work.
See [README.md](README.md) for the staged rollout and legacy compatibility.
Supabase manages authentication in `auth`; this application never stores password
hashes in `public` tables.

## Relationship overview

```text
auth.users
|-- providers
|   |-- exercises <-----------------+
|   `-- routines                    |
|       `-- routine_exercises ------+
`-- provider_patient_profiles -- patients
    |-- patient_statuses
    `-- routine_assignments -- routines
        |-- routine_assignment_exercises
        `-- routine_follow_ups
```

- A patient identity can be shared by multiple providers.
- Each provider-patient pair has one private relationship profile.
- Routine templates belong to a provider.
- Assignments belong to a provider-specific patient profile and preserve
  immutable routine-name, exercise-name, and instruction snapshots.
- Each routine assignment can have at most one follow-up.

## Data dictionary

### `exercises` (SCRUM-43)

Provider-owned reusable definitions. Equal names never establish shared identity.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Primary key, default `gen_random_uuid()`. |
| `provider_id` | `uuid` | Required owning provider. |
| `name` | `text` | Required nonblank name, deliberately not unique. |
| `instructions` | `text` | Required reusable instructions, default empty string. |
| `created_at` | `timestamptz` | Required catalog creation time, default `now()`. |
| `updated_at` | `timestamptz` | Required catalog update time, default `now()`; updated by `save_exercise`. |


### `access_requests`

Public intake requests from prospective providers asking for Milestone access.
Requests may be submitted anonymously and are reviewed through trusted
administrative tooling.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Stable primary key for the access request. |
| `name` | `text` | Full name supplied by the person requesting access. |
| `email` | `text` | Contact email used for request follow-up and account creation. |
| `department` | `text` | Department or clinical area supplied by the requester. |
| `notes` | `text`, nullable | Optional free-text context supplied with the request. |
| `created_at` | `timestamptz` | Time the request was submitted. |
| `status` | `text` | Administrative workflow state, defaulting to `pending`. Allowed values are not currently constrained. |

### `routine_follow_ups`

Optional one-to-one provider follow-ups for routine assignments. This table is
not the future general provider appointment calendar.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Stable primary key for the follow-up. |
| `routine_assignment_id` | `uuid` | Parent assignment; unique, so an assignment has at most one follow-up. |
| `scheduled_at` | `timestamptz` | Timezone-aware instant when the follow-up is scheduled. |
| `status` | `text` | `scheduled`, `completed`, or `cancelled`. |
| `created_at` | `timestamptz` | Time the follow-up row was created. |
| `updated_at` | `timestamptz` | Time the supported follow-up workflow last changed the row. |

### `patient_statuses`

Legacy Monday-through-Sunday summary statuses for provider-specific patient
profiles. New dated routine activity is represented by `routine_assignments`.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Stable primary key for the legacy status row. |
| `day_index` | `smallint` | Zero-based weekday: `0` is Monday and `6` is Sunday. |
| `status` | `text` | `missed`, `complete`, `modified`, `none`, or `routine`. |
| `patient_profile_id` | `uuid` | Owning provider-specific patient profile. Profile deletion cascades to these statuses. |

### `patients`

Shared patient identity and basic care information. Provider-private notes,
activity, and discharge state belong to `provider_patient_profiles`.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Stable primary key for the shared patient identity. |
| `name` | `text` | Patient full name used for display. |
| `created_at` | `timestamptz` | Time the shared identity was created. |
| `email` | `text`, nullable | Optional patient contact email. |
| `phone` | `text`, nullable | Optional telephone number; text preserves formatting and leading symbols. |
| `primary_concern` | `text`, nullable | Concise summary of the concern motivating care. |
| `treatment_focus` | `text`, nullable | Concise summary of the current treatment focus. |
| `start_of_care` | `date`, nullable | Calendar date when care began; no time or timezone. |
| `care_status` | `text` | Shared prototype state: `active` or `pending`. Provider-specific discharge uses `discharged_at`. |

### `provider_patient_profiles`

Private provider-patient relationships containing provider-specific clinical
context and active or discharged state. Each provider-patient pair is unique.

| Column | Type | Description |
| --- | --- | --- |
| `provider_id` | `uuid` | Supabase Auth user ID of the provider who owns the relationship. |
| `patient_id` | `uuid` | Shared patient identity linked to the relationship. |
| `created_at` | `timestamptz` | Time the relationship was created. |
| `id` | `uuid` | Stable relationship key referenced by statuses and assignments. |
| `clinical_notes` | `text` | Provider-private notes, not shared with other providers treating the patient. |
| `discharged_at` | `timestamptz`, nullable | Soft-discharge time; null means active care. |

### `providers`

Provider profiles linked one-to-one to Supabase Auth users. Authentication and
administrative authorization remain separate concerns.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Supabase Auth user ID and provider-profile primary key. |
| `name` | `text` | Provider full name used for display. |
| `professional_title` | `text` | Editable display title, not an authorization or approval role. |
| `initials` | `text` | Short initials used as an avatar and compact-display fallback. |
| `avatar_url` | `text` | Public URL of the profile image stored in `profile-images`. |
| `contact_email` | `text` | Professional contact address; changing it does not change the Auth login email. |
| `phone` | `text` | Mobile telephone number stored as text. |
| `specialty` | `text` | Clinical specialty used for profile display. |
| `bio` | `text` | Provider-authored short professional biography. |
| `department` | `text` | Department or clinical service. |
| `facility` | `text` | Clinic or facility display text, not a normalized practice relationship. |
| `office_location` | `text` | Building, floor, room, or other office location. |
| `work_phone` | `text` | Work telephone number stored as text. |
| `work_phone_extension` | `text` | Work extension stored as text to preserve leading zeros. |
| `preferred_contact` | `text` | `email`, `phone`, or `in-app`. |

### `routine_assignment_exercises`

Independent ordered name/instruction snapshots copied when a routine is assigned.
Later template/catalog edits do not alter these rows. There is no catalog FK.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Stable primary key for the snapshot row. |
| `routine_assignment_id` | `uuid` | Assignment whose historical exercise list contains this snapshot. |
| `exercise_name_snapshot` | `text` | Exercise name captured at assignment time. |
| `instructions` | `text` | SCRUM-43: recorded instructions; required, default empty for preexisting snapshots. |
| `position` | `integer` | Zero-based display order within the assignment snapshot. |

### `routine_assignments`

Dated prescriptions of provider-owned routines to provider-specific patient
profiles, with immutable routine and exercise snapshots.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Stable primary key for the dated assignment. |
| `patient_profile_id` | `uuid` | Provider-specific patient profile receiving the assignment. |
| `routine_id` | `uuid` | Source provider-owned template. |
| `scheduled_date` | `date` | Performance date with no time or timezone. |
| `status` | `text` | `scheduled`, `completed`, `missed`, `modified`, or `cancelled`. |
| `routine_name_snapshot` | `text` | Routine name captured at assignment time. |
| `created_at` | `timestamptz` | Time the assignment was created. |
| `updated_at` | `timestamptz` | Time the supported assignment workflow last changed the row. |

### `routine_exercises`

Ordered memberships referencing provider-owned exercise definitions. Template
edits do not alter existing assignment snapshots. Existing membership IDs and
positions survive migration. Subsequent saves preserve IDs at retained positions.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Stable primary key for the routine exercise. |
| `routine_id` | `uuid` | Reusable routine template that owns the exercise. |
| `exercise_id` | `uuid` | SCRUM-43: required reference to an exercise owned by the routine provider. |
| `name` | `text` | Retained compatibility mirror of catalog name, maintained by triggers. |
| `position` | `integer` | Zero-based display order within the template. |

### `routines`

Reusable provider-owned routine templates. Templates are archived rather than
deleted so historical assignments remain valid.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Stable primary key for the template. |
| `provider_id` | `uuid` | Provider profile that owns and manages the template. |
| `name` | `text` | Current template display name. |
| `archived_at` | `timestamptz`, nullable | Soft-archive time; null means available for editing and assignment. |
| `created_at` | `timestamptz` | Time the template was created. |
| `updated_at` | `timestamptz` | Time the supported routine workflow last changed the template. |

## Constraints and indexes

Every table has a UUID primary key. The following relationships define delete
behavior at the database boundary:

| Source | Target | On delete |
| --- | --- | --- |
| `providers.id` | `auth.users.id` | Cascade provider-profile deletion with the Auth user. |
| `provider_patient_profiles.provider_id` | `auth.users.id` | Restrict deletion while provider-patient history exists. |
| `provider_patient_profiles.patient_id` | `patients.id` | Cascade relationship deletion with a deleted shared patient. |
| `patient_statuses.patient_profile_id` | `provider_patient_profiles.id` | Cascade legacy statuses with the relationship. |
| `exercises.provider_id` | `providers.id` | Restrict provider deletion while catalog definitions exist. |
| `routine_exercises.exercise_id` | `exercises.id` | Restrict catalog deletion while memberships reference it. |
| `routines.provider_id` | `providers.id` | Restrict provider deletion while templates exist. |
| `routine_exercises.routine_id` | `routines.id` | Cascade current template exercises with the template. |
| `routine_assignments.patient_profile_id` | `provider_patient_profiles.id` | Restrict relationship deletion when assignment history exists. |
| `routine_assignments.routine_id` | `routines.id` | Restrict template deletion when assignment history exists. |
| `routine_assignment_exercises.routine_assignment_id` | `routine_assignments.id` | Restrict assignment deletion when snapshots exist. |
| `routine_follow_ups.routine_assignment_id` | `routine_assignments.id` | Restrict assignment deletion when a follow-up exists. |

Uniqueness, checks, and write guards enforce the application invariants:

- A membership trigger requires matching routine/exercise ownership and derives
  its mirrored name from the catalog. Catalog renames synchronize all mirrors.
- Parent-table triggers make provider ownership immutable for exercises and
  routines, including unreferenced definitions and empty routines.
- Catalog names are not unique; repeated use at different positions is permitted.
- Existing `routine_exercises.name` nonempty and routine/position checks remain.

- `provider_patient_profiles (provider_id, patient_id)` is unique.
- `patient_statuses (patient_profile_id, day_index)` is unique, and
  `day_index` is between 0 and 6.
- Exercise positions are non-negative and unique within each template and
  assignment snapshot; exercise names and routine names cannot be blank.
- `routine_follow_ups.routine_assignment_id` is unique.
- Status checks constrain patients, assignments, follow-ups, legacy statuses,
  and provider contact preferences to the values documented above.

Important non-primary indexes are:

| Index | Purpose |
| --- | --- |
| `provider_patients_patient_id_idx` | Finds every provider relationship for a shared patient. The historical name is retained to avoid an unnecessary catalog rename. |
| `routine_assignments_active_unique_idx` | Rejects duplicate non-cancelled assignments for the same profile, routine, and date while preserving cancelled history. |
| `routine_assignments_profile_date_idx` | Supports patient-profile calendar and date-range loading. |
| `routines_provider_active_idx` | Supports provider routine-name lookup for non-archived templates. |
| `exercises_provider_name_idx` | Nonunique provider/name catalog lookup. |
| `routine_exercises_exercise_id_idx` | Catalog membership lookup and name synchronization. |

## Row Level Security

RLS is enabled on every public table. The effective browser boundaries are:

| Table | Browser access |
| --- | --- |
| `access_requests` | Anonymous and authenticated insert only; no public read policy. |
| `providers` | Authenticated providers select and update their own row. Historical overlapping own-row policies have the same effective boundary. |
| `patients` | Authenticated providers select patients linked through their own relationship profiles. |
| `provider_patient_profiles` | Authenticated providers select and update their own relationships. |
| `patient_statuses` | Authenticated providers manage statuses belonging to their own relationships. |
| `exercises` | Authenticated providers SELECT their own catalog; writes only through ownership-checked RPCs. |
| `routines` | Authenticated providers select their own templates; writes use RPCs. |
| `routine_exercises` | Authenticated providers select exercises from their own templates; writes use RPCs. |
| `routine_assignments` | Authenticated providers select assignments for their own relationships; writes use RPCs. |
| `routine_assignment_exercises` | Authenticated providers select snapshots for their own assignments; writes occur through assignment RPCs. |
| `routine_follow_ups` | Authenticated providers select follow-ups for their own assignments; writes use RPCs. |

The security-definer RPCs validate `auth.uid()` and ownership before changing
routine, assignment, discharge, or follow-up data. The Supabase `service_role`
and database owners remain trusted administrative paths and can bypass normal
RLS behavior.

## Routine write contracts

- `save_exercise(uuid, text, text)` creates/updates an owned reusable definition.
- `save_routine_with_exercises(uuid, text, uuid[])` is the new ID-based writer.
- `save_routine(uuid, text, text[])` is a transitional legacy adapter. New routines
  receive separate catalog definitions with empty instructions. Existing routines
  accept only an unchanged ordered name list (after input trimming/blank filtering);
  only the routine name/timestamp can change. Membership IDs, positions, and
  instructions are never modified by an accepted legacy edit. Structural or stale
  list changes fail with SQLSTATE `55000` before any write. Equal-name swaps cannot
  be expressed; identical lists leave IDs untouched. Use the ID-based API for
  structural edits. No global name matching or deduplication is performed.
- `assign_routine(uuid, uuid, date)` keeps its signature and snapshots catalog
  names/instructions using `exercise_name_snapshot`, `instructions`, and position.

All four RPCs serialize on the authenticated provider row. Assignment creation
also locks the active relationship and routine while taking the snapshot. The
upstream follow-up, archive, and discharge RPCs remain unchanged. Catalog records
are retained when memberships are removed; no public deletion API is introduced and parent-table triggers reject ownership
transfers. Contracting the legacy column/API is a later migration.

## Planning-document mapping

The early class diagram and object/method documents remain useful as product
concepts, but they are not a literal relational schema:

- Supabase Auth replaces `Account`, `ProviderAccount.password`, and locally
  stored password hashes.
- `providers` and `patients` replace class inheritance from a database `User`
  table.
- `provider_patient_profiles` replaces `patient_list[]`, `providers[]`, and a
  single patient-side provider ID while supporting multiple providers safely.
- `exercises` stores reusable definitions; `routine_exercises` stores ordered
  memberships and a temporary name mirror for old clients.
- Assignment snapshots, dated assignments, soft discharge, follow-ups, and RLS
  strengthen the original design.

The following planning concepts are intentionally deferred until an implemented
workflow needs them: provider license numbers, normalized medical practices,
patient invitations and login accounts, sets/repetitions/duration/rest, a full
catalog-management UI, exercise media, persisted messaging, and notifications.

## Verification query

For the documented baseline, the October 6 migrations yield `10` tables and `69`
columns. SCRUM-43 adds one table and eight columns across three tables, yielding
`11` tables and `77` columns if no other team schema changes have intervened.
These are expected schema counts, not claims about the current hosted database:

```sql
select
  count(distinct c.table_name) as public_table_count,
  count(*) as public_column_count
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema
 and t.table_name = c.table_name
where c.table_schema = 'public'
  and t.table_type = 'BASE TABLE';
```

This description audit must return no rows:

```sql
with public_tables as (
  select c.oid, n.nspname as table_schema, c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
), undocumented as (
  select table_schema, table_name, null::text as column_name
  from public_tables
  where nullif(btrim(obj_description(oid, 'pg_class')), '') is null
  union all
  select p.table_schema, p.table_name, a.attname
  from public_tables p
  join pg_attribute a on a.attrelid = p.oid
  where a.attnum > 0
    and not a.attisdropped
    and nullif(btrim(col_description(p.oid, a.attnum)), '') is null
)
select * from undocumented
order by table_name, column_name nulls first;
```
