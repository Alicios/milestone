# Provider profile schema extension

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
linking table/RPC. The current web app still uses mock patients. This does not
implement patient logins, provider invitations, or a sharing interface.

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
This migration prepares storage for profile fields; it does not connect the
current mock authentication or profile save handler to Supabase.

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
