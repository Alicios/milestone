# Provider profile schema extension

## Final model: a separate patient profile for each provider

Apply migrations in filename order: `001`, `002`, `003`, then `004`, `005`, and `006` (the suffixes
of the timestamped filenames). If the first three have already been applied,
run `20261004000400_rename_profiles_to_providers.sql`, then `005` and `006`. Migration 003
supersedes the shared-status behavior described in the migration 002 section
below. None of these migrations have been database-tested in this workspace.

- `providers`: the provider's own professional account profile, linked to
  `auth.users.id`. Migration 004 renames the original `profiles` table.
- `patients`: shared patient identity, such as the patient's name.
- `provider_patient_profiles`: a unique `id`, `provider_id`, `patient_id`,
  `clinical_notes`, and `created_at` for each provider-patient relationship.
- `patient_statuses`: references `patient_profile_id`, with one status per
  profile/day index. Different providers' statuses are independent.

The unique `(provider_id, patient_id)` constraint ensures a provider has exactly
one profile for a particular patient whenever that relationship exists. A patient
can have separate profiles with multiple providers. Each provider can see only
their own profiles and statuses, even when they treat the same patient.
Only `clinical_notes` is client-editable on the relationship profile for now;
future routines, treatment plans, and assessments should reference this profile's
ID. This migration does not implement those future tables or UI features.

The shared patient identity is read-only to providers after migration 003.
Identity corrections and additional relationship creation are admin/backend
operations. To assign a second provider, create a fresh relationship profile:

```sql
insert into public.provider_patient_profiles (provider_id, patient_id)
values ('SECOND_PROVIDER_AUTH_UUID', 'EXISTING_PATIENT_UUID');
```

No notes or statuses are copied from another provider. `create_patient` still
returns the shared patient ID; query the caller's relationship profile to get
its ID before writing statuses. The old `provider_patients` table name and
`patient_statuses.patient_id` column no longer exist after migration 003.

Existing statuses migrate automatically only when their patient has exactly one
provider. If existing statuses belong to a patient with zero or multiple
providers, the transaction aborts without changes: an explicit provider mapping
is needed because historical shared statuses contain no provider attribution.

Verify with providers A and B assigned to the same patient, plus unassigned C:
A and B should each see one different profile ID, neither should see the other's
notes/statuses, and C should see neither the patient nor its profiles/statuses.
Writing a status for another provider's profile must fail. Creating duplicate
provider-patient pairs must fail. A new relationship starts with no statuses.
Day indexes are still 0-6; dated progress history remains a separate change.

## Multiple providers per patient

After the profile migration, run
`migrations/20261004000200_provider_patients.sql` once in the SQL Editor.
This second migration is prepared locally and has not been executed against
the hosted database. It replaces `patients.provider_id` with
`provider_patients(provider_id, patient_id, created_at)` and copies every
existing assignment before removing the old column. The combined primary key
prevents duplicate assignments; both directions have an index.

Providers can read and update patients they are assigned to, and manage those
patients' shared statuses. They can read their own assignment rows. RLS uses
the linking table directly, avoiding circular policy dependencies.
Provider IDs still reference `auth.users.id`, matching the supplied schema.
This does not introduce provider verification; authenticated accounts are still
treated as providers, as in the existing ownership model.

New patient creation must use the atomic RPC:

```ts
const { data: patientId, error } = await supabase.rpc('create_patient', {
  patient_name: name,
})
```

The RPC inserts the patient and assigns the signed-in provider in one
transaction. The browser cannot insert assignments, claim arbitrary patients,
delete shared patients, or remove assignments. Adding another provider is a
trusted backend/admin operation, for example in the SQL Editor:

```sql
insert into public.provider_patients (provider_id, patient_id)
values ('SECOND_PROVIDER_AUTH_UUID', 'EXISTING_PATIENT_UUID');
```

Replace those placeholders with real IDs. Deleting a provider account is
restricted while assignments exist, so it cannot accidentally delete shared
patient records. Admin reassignment/removal must preserve at least one provider
per remaining patient. The minimum is guaranteed by the app creation path,
not by a database-wide minimum-count constraint: privileged SQL can still
create an unassigned patient or remove its final assignment.

Any consumers that filter or insert `patients.provider_id` must migrate to the
linking table/RPC. The web app now reads and creates provider patient
relationships through Supabase. This does not implement patient logins, provider
invitations, or a sharing interface.

After migration 004, application queries should use `providers` for provider
attributes. Developer or troubleshooting access should be granted through
separate database/admin roles; a provider row is not an administrator role.

Before deployment, test with three accounts: two assigned to the same patient
must see that patient and its statuses, and an unassigned account must not.
Also verify patient creation, rejected direct assignment writes, duplicate
assignment rejection, and retention of every pre-migration assignment.

`migrations/20261004000100_provider_profile_attributes.sql` extends the existing
hosted schema supplied for Milestone. It is not a complete schema for a new
database. It expects `public.profiles`, `auth.users`, and the existing
`on_auth_user_created` trigger calling `public.handle_new_user()`.

## Apply

Open the migration, copy its entire contents into the project's Supabase SQL
Editor, and run it once as the database owner. It uses one transaction, retains
existing profile IDs and relationships, and leaves the existing RLS policies in
place. No patient, status, or access-request tables are changed. The publishable
browser key cannot apply database migrations.

This file has not been applied to the hosted database or executed locally.
Do not run `supabase db push` against the existing project until its existing
schema and migration history have been baselined with the CLI.

## App mapping

| App field | Profile column |
| --- | --- |
| `id`, `name`, `role`, `initials` | Existing columns with the same names |
| `avatarUrl` | `avatar_url` |
| Profile form `email` | `contact_email` |
| `phone`, `specialty`, `bio`, `department`, `facility` | Columns with the same names |
| `officeLocation` | `office_location` |
| `workPhone` | `work_phone` |
| `workPhoneExtension` | `work_phone_extension` |
| `preferredContact` | `preferred_contact`: `email`, `phone`, or `in-app` |

Optional text fields default to empty strings, matching the current form.
Phone numbers and extensions are text to preserve formatting and leading zeros.
Existing providers receive their current Auth email as the initial contact email
and any existing signup specialty metadata. New signups receive the same fields
through the updated trigger; signup should send `options.data.name` and
`options.data.specialty`.

Contact email is independent of the login email in Supabase Auth. The current
frontend uses a single `User.email` field; authentication integration must keep
the Auth email separate from the profile form's contact email.
`role` remains a self-editable professional title, not an access-control role.
Profile photos require a separate Storage upload implementation; the current
form previews local files as data URLs.

Notification, alert, and appearance preferences remain session-only app settings.
The profile migration prepares storage for provider fields; the web app now
connects its provider profile save handler to Supabase.

## Verify after applying

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;
```

Confirm signup with a test account still creates a profile with the supplied
name and specialty. Check that authenticated users can read and update their
own profile while another account cannot access it. A failing signup trigger
can prevent account creation, so verify this before using the updated flow.
