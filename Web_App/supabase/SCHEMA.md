# Milestone Supabase Schema

This is the canonical reference for the application-owned `public` schema after
all migrations through `20261006000200_document_public_schema.sql`. Supabase
manages authentication in `auth`; this application never stores password
hashes in `public` tables.

## Relationship overview

```text
auth.users
|-- providers
|   `-- medical_practices
|   `-- routines
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
  immutable routine and exercise-name snapshots.
- Each routine assignment can have at most one follow-up.

## Data dictionary

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

### `medical_practices`

Reference list of clinical practices available to providers during registration
and profile editing.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Stable primary key for the practice. |
| `name` | `text` | Unique, non-empty practice name shown in selection controls. |
| `description` | `text` | Non-empty description of the practice's service area. |

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
| `bio` | `text` | Provider-authored short professional biography. |
| `medical_practice_id` | `uuid`, nullable | Selected practice reference. It is nullable only for existing providers whose removed department could not be mapped. |
| `facility` | `text` | Clinic or facility display text retained independently of the normalized practice relationship. |
| `office_location` | `text` | Building, floor, room, or other office location. |
| `work_phone` | `text` | Work telephone number stored as text. |
| `work_phone_extension` | `text` | Work extension stored as text to preserve leading zeros. |
| `preferred_contact` | `text` | `email`, `phone`, or `in-app`. |

### `routine_assignment_exercises`

Immutable ordered exercise-name snapshots copied when a routine is assigned.
Later template edits do not alter these rows.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Stable primary key for the snapshot row. |
| `routine_assignment_id` | `uuid` | Assignment whose historical exercise list contains this snapshot. |
| `exercise_name_snapshot` | `text` | Exercise name captured at assignment time. |
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

Legacy normalized template exercises retained for historical compatibility.
Current routine editing stores ordered exercise values in `routines.exercise_list`.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Stable primary key for the routine exercise. |
| `routine_id` | `uuid` | Reusable routine template that owns the exercise. |
| `name` | `text` | Current exercise name in the reusable template. |
| `position` | `integer` | Zero-based display order within the template. |

### `routines`

Reusable provider-owned routine templates. The live routine editor stores the
ordered exercise names in `exercise_list`.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Stable primary key for the template. |
| `provider_id` | `uuid` | Provider profile that owns and manages the template. |
| `name` | `text` | Current template display name. |
| `created_at` | `date`, nullable | Optional calendar date associated with the template. |
| `description` | `text`, nullable | Optional free-text routine description. |
| `exercise_list` | `jsonb[]`, nullable | Ordered exercise values used by the routine editor and copied into assignment snapshots. |

## Constraints and indexes

Every table has a UUID primary key. The following relationships define delete
behavior at the database boundary:

| Source | Target | On delete |
| --- | --- | --- |
| `providers.id` | `auth.users.id` | Cascade provider-profile deletion with the Auth user. |
| `provider_patient_profiles.provider_id` | `auth.users.id` | Restrict deletion while provider-patient history exists. |
| `provider_patient_profiles.patient_id` | `patients.id` | Cascade relationship deletion with a deleted shared patient. |
| `patient_statuses.patient_profile_id` | `provider_patient_profiles.id` | Cascade legacy statuses with the relationship. |
| `routines.provider_id` | `providers.id` | Restrict provider deletion while templates exist. |
| `routine_exercises.routine_id` | `routines.id` | Cascade current template exercises with the template. |
| `routine_assignments.patient_profile_id` | `provider_patient_profiles.id` | Restrict relationship deletion when assignment history exists. |
| `routine_assignments.routine_id` | `routines.id` | Restrict template deletion when assignment history exists. |
| `routine_assignment_exercises.routine_assignment_id` | `routine_assignments.id` | Restrict assignment deletion when snapshots exist. |
| `routine_follow_ups.routine_assignment_id` | `routine_assignments.id` | Restrict assignment deletion when a follow-up exists. |

Uniqueness and checks enforce the application invariants:

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

## Row Level Security

RLS is enabled on every public table. The effective browser boundaries are:

| Table | Browser access |
| --- | --- |
| `access_requests` | Anonymous and authenticated insert only; no public read policy. |
| `providers` | Authenticated providers select and update their own row. Historical overlapping own-row policies have the same effective boundary. |
| `patients` | Authenticated providers select patients linked through their own relationship profiles. |
| `provider_patient_profiles` | Authenticated providers select and update their own relationships. |
| `patient_statuses` | Authenticated providers manage statuses belonging to their own relationships. |
| `routines` | Authenticated providers select their own templates; writes use RPCs. |
| `routine_exercises` | Authenticated providers select exercises from their own templates; writes use RPCs. |
| `routine_assignments` | Authenticated providers select assignments for their own relationships; writes use RPCs. |
| `routine_assignment_exercises` | Authenticated providers select snapshots for their own assignments; writes occur through assignment RPCs. |
| `routine_follow_ups` | Authenticated providers select follow-ups for their own assignments; writes use RPCs. |

The security-definer RPCs validate `auth.uid()` and ownership before changing
routine, assignment, discharge, or follow-up data. The Supabase `service_role`
and database owners remain trusted administrative paths and can bypass normal
RLS behavior.

## Planning-document mapping

The early class diagram and object/method documents remain useful as product
concepts, but they are not a literal relational schema:

- Supabase Auth replaces `Account`, `ProviderAccount.password`, and locally
  stored password hashes.
- `providers` and `patients` replace class inheritance from a database `User`
  table.
- `provider_patient_profiles` replaces `patient_list[]`, `providers[]`, and a
  single patient-side provider ID while supporting multiple providers safely.
- `routines.exercise_list` stores the current ordered exercise list; the
  legacy `routine_exercises` table is retained for compatibility.
- `medical_practices` replaces the provider `department` and `specialty` text
  fields with one selected practice reference.
- Assignment snapshots, dated assignments, soft discharge, follow-ups, and RLS
  strengthen the original design.

The following planning concepts are intentionally deferred until an implemented
workflow needs them: provider license numbers, patient invitations and login
accounts, sets/repetitions/duration, a reusable exercise library, exercise
help/media, persisted messaging, and notifications.

## Verification query

After applying all migrations through `20261007000100_medical_practices.sql`,
this query must return `11` tables and `71` columns:

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
