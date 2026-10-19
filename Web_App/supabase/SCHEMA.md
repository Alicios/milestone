# Milestone Supabase Schema

This reference combines historical application schema documentation through
`20261007000700_document_messages.sql` with the SCRUM-43 hosted evidence below.
It is not a complete hosted schema dump or a reproducible migration baseline.
Historical migrations must not be replayed; see [README.md](README.md). Supabase
manages authentication in `auth`; this application never stores password
hashes in `public` tables.

## Relationship overview

```text
auth.users
|-- providers
|   `-- medical_practices
|   `-- routines
`-- patients -- auth.users (optional, nullable auth_user_id)
    `-- provider_patient_profiles
        |-- patient_statuses
        |-- messages -- message_thread_state
        `-- routine_assignments -- routines
            |-- routine_assignment_exercises
            `-- routine_follow_ups
```

- A patient identity can be shared by multiple providers.
- A patient identity optionally links to its own Supabase Auth account
  (`patients.auth_user_id`), set administratively via the Supabase Admin API
  as part of a provider-invited account-creation flow. Most patients have no
  account; no such flow is implemented in this repo yet.
- Each provider-patient pair has one private relationship profile.
- Routine templates belong to a provider.
- Assignments belong to a provider-specific patient profile and preserve
  immutable routine and exercise-name snapshots.
- Each routine assignment can have at most one follow-up.
- Text messages currently belong to one provider-patient relationship. Future
  provider, administrator, and IT conversations need a broader participant model.

## Data dictionary

### `exercises` — SCRUM-43 shared catalog

The existing hosted catalog contains **248 exercises**. `public.exercises.id`
is a **verified UUID primary key**. These facts and the verified
`public.routines.exercise_list` type (`jsonb[]`) are supplied project evidence;
no hosted SQL was executed for this baseline.

| Column | Evidence and meaning |
| --- | --- |
| `id` | Verified `uuid` primary key; identifies one reusable catalog exercise. |
| `name` | Reported catalog column; display label, not an identity key. |
| `desc` | Reported catalog column; reusable exercise instructions. |
| `created_at` | Reported catalog column; creation timestamp. |

The four-column shape is recorded in the integration branch at `a1e083fed` in
`Web_App/supabase/SCRUM43_INTEGRATION.md`. Its local fixture and proposed October 8
migration do not establish hosted defaults, constraints, or access guarantees.
[baselines/exercises.sql](baselines/exercises.sql) is **LOCAL/REFERENCE ONLY**,
outside `migrations/`. It represents the catalog using `text` for `name`/`desc`
and `timestamptz` for `created_at` as explicitly local choices. Exact hosted types
for those three columns, non-PK nullability, defaults, additional indexes/checks,
triggers, and effective grants/RLS policies remain to be confirmed from an
authoritative schema export. No name uniqueness, automatic UUID generation,
automatic timestamps, or catalog write protection is claimed by this baseline.

A routine can store a catalog identity in an element of its PostgreSQL `jsonb[]`:

```sql
array[jsonb_build_object('exercise_id', '<existing catalog UUID>'::uuid)]::jsonb[]
```

Two routines can store the same `exercise_id` and resolve it by unnesting their
lists and joining `(entry ->> 'exercise_id')::uuid` to `exercises.id`. This reuses
one exercise row without copying or inserting a catalog exercise. A prior
read-only simulation demonstrated resolution; persisted reuse has **not yet
been verified**. [tests/scrum43_reuse.sql](tests/scrum43_reuse.sql) adds the pending
local test: insert two actual routine rows, read them back, assert both resolve
one existing catalog UUID and the entire catalog is unchanged, then roll back.
Here “persisted” means table-backed inserts within a transaction, not committed
records or a durability test. Local setup is documented in [README.md](README.md).

`jsonb[]` is a PostgreSQL array of JSON values, not a single `jsonb` JSON array.
JSON object keys do not provide foreign keys: missing/invalid UUIDs, dangling
references, and duplicate entries are possible without separate validation.
Casting malformed UUID text can fail; deleting a catalog row can leave an
unresolved reference. Labels may change independently of the identity. This
baseline adds no validation triggers, delete protection, normalization, or API
contract. Existing routine entries may contain names or other legacy values;
this example does not migrate them or change the name-based frontend/RPC flow.
Frontend/backend integration belongs to Sprint 3.

`exercises_seed.csv` is an unchanged reference copy from the integration commit.
It has 248 name/description records and **no UUIDs**. Do not reseed the shared
hosted catalog: importing it again could duplicate exercises or replace their
identity mappings. It cannot restore existing UUIDs. The October 8 prescription
migration is not deployed and is excluded from this deliverable; assignment,
prescription, and SCRUM-50 changes are outside this baseline.

### `messages`

Provider-patient text messages. `patient_profile_id` references the
provider-specific relationship, so a shared patient has a separate conversation
with each provider. `sender_kind` is `provider` or `patient`; only providers
can send through the browser today. `body` must contain 1–4000 non-whitespace
characters. Messages are immutable to browser clients.

`source` and `seed_key` are internal provenance fields for the twelve imported
sample messages. They are not displayed in the inbox. `created_at` is a server
timestamp, and `id` is a UUID. Sample image attachments are not stored.

### `message_thread_state`

Per-participant read cursor and starred state, keyed by
`(patient_profile_id, participant_user_id)`. Existing provider relationships
were backfilled, and a trigger creates provider state for new relationships.
The browser can update only its own `last_read_at` and `starred` values.

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
| `auth_user_id` | `uuid`, nullable, unique | Supabase Auth user backing this patient's own login (Mobile_App). Set administratively, not by a client-facing flow; null means the patient has no account yet. |

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
ordered exercise names in `exercise_list`. Its hosted `jsonb[]` type can also
represent catalog UUID objects as described above; this baseline does not change
the editor or claim deployed UUID validation.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Stable primary key for the template. |
| `provider_id` | `uuid` | Provider profile that owns and manages the template. |
| `name` | `text` | Current template display name. |
| `created_at` | `date`, nullable | Optional calendar date associated with the template. |
| `description` | `text`, nullable | Optional free-text routine description. |
| `exercise_list` | `jsonb[]`, nullable | Ordered exercise values used by the routine editor and copied into assignment snapshots. |

## Patient accounts and RPCs

A signed-in patient (identified by `patients.auth_user_id = auth.uid()`) gets
no direct RLS policy on any table — unlike providers, who read
`provider_patient_profiles`, `routine_assignments`, etc. directly. Instead,
every patient-facing read or write is a `security definer` function (added in
`20261019000100_patient_accounts.sql`) that checks ownership internally and
returns only patient-safe columns. This is what keeps
`provider_patient_profiles.clinical_notes` unreachable by a patient even
though providers and patients share the single `authenticated` Postgres role:
RLS can restrict which *rows* a role sees, not which *columns*, so any direct
table policy for patients would also hand over clinical notes. Routing through
functions sidesteps that entirely.

| Function | Purpose |
| --- | --- |
| `get_my_patient_profile()` | The calling patient's own `patients` row. |
| `get_my_care_relationships()` | The calling patient's provider relationships (excludes `clinical_notes`). |
| `get_my_routine_assignments(patient_profile_id)` | Assigned routines for one of the caller's own relationships. |
| `get_my_routine_assignment_exercises(routine_assignment_id)` | Exercise snapshot for one of the caller's own assignments. |
| `get_my_routine_follow_ups(patient_profile_id)` | Follow-ups for one of the caller's own relationships. |
| `get_my_messages(patient_profile_id)` | Conversation history for one of the caller's own relationships. |
| `send_my_message(patient_profile_id, body)` | The only patient write in this round: inserts a `sender_kind = 'patient'` message. |
| `get_my_message_thread_state(patient_profile_id)` / `mark_my_messages_read(patient_profile_id)` / `set_my_message_thread_starred(patient_profile_id, starred)` | Read-cursor and starred state for the caller's own conversation. |

`message_thread_state` needs a row with `participant_user_id = auth.uid()`
before any of the three functions above can act on it. Two triggers create
that row, covering both possible orderings: `create_provider_message_thread_state`
(on `provider_patient_profiles` insert) now also seeds the patient's row if the
patient already has an account, and `backfill_patient_message_thread_state`
(on `patients.auth_user_id` transitioning from null) seeds rows for every
relationship the patient already had.

Mutating anything beyond sending a message (e.g. marking a routine assignment
complete) is intentionally out of scope for this round; see
`20261019000100_patient_accounts.sql`'s header comment.

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
| `messages.patient_profile_id` | `provider_patient_profiles.id` | Restrict relationship deletion while message history exists. |
| `message_thread_state.patient_profile_id` | `provider_patient_profiles.id` | Cascade participant state with the relationship. |

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

The historical application model documents the browser boundaries below.
Effective hosted catalog privileges and policies remain unverified for this
baseline; no catalog access policy is introduced here.

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
| `messages` | Authenticated providers select messages for their own relationships and insert provider-authored live text; patient inserts, edits, and deletes are denied. |
| `message_thread_state` | Authenticated providers select and update their own read/starred state. |

The security-definer RPCs validate `auth.uid()` and ownership before changing
routine, assignment, discharge, or follow-up data. The Supabase `service_role`
and database owners remain trusted administrative paths and can bypass normal
RLS behavior.

The table above describes provider browser access only. A signed-in patient
has no entry in it by design — every table keeps its provider-only policies
unchanged, and patient access is exclusively through the RPCs listed in
"Patient accounts and RPCs" above, not a browser RLS policy on any of these
tables.

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
accounts, sets/repetitions/duration, frontend integration of the existing shared
exercise catalog, exercise help/media, patient-authenticated messaging, and notifications.

## Verification query

The historical documentation recorded `14` tables and `86` columns. These are
not current acceptance criteria and must not motivate replaying migrations. On
an isolated local schema copy, this read-only query reports the actual counts:

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

This description audit reports any missing column descriptions. The new
messaging tables have documented descriptions; older columns may lack comments.
Inspect the local copy rather than assuming a fixed number:

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
