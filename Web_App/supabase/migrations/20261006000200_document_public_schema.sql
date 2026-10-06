-- Canonical descriptions for every application-owned public table and column.
-- Apply after 20261006000100_clarify_schema_names.sql.
begin;

comment on table public.access_requests is
  'Public intake requests from prospective providers asking for Milestone access. Requests may be submitted anonymously and are reviewed through trusted administrative tooling.';
comment on column public.access_requests.id is
  'Stable UUID primary key for the access request.';
comment on column public.access_requests.name is
  'Full name supplied by the person requesting access.';
comment on column public.access_requests.email is
  'Contact email supplied for access-request follow-up and account creation.';
comment on column public.access_requests.department is
  'Department or clinical area supplied by the requester.';
comment on column public.access_requests.notes is
  'Optional free-text context supplied with the access request.';
comment on column public.access_requests.created_at is
  'Timezone-aware timestamp when the access request was submitted.';
comment on column public.access_requests.status is
  'Administrative workflow state. It defaults to pending; expected values such as pending and approved are not currently enforced by a check constraint.';

comment on table public.routine_follow_ups is
  'Optional one-to-one provider follow-up for a routine assignment. This is not the general provider appointment calendar.';
comment on column public.routine_follow_ups.id is
  'Stable UUID primary key for the follow-up.';
comment on column public.routine_follow_ups.routine_assignment_id is
  'Routine assignment receiving the follow-up. A unique constraint allows at most one follow-up per assignment.';
comment on column public.routine_follow_ups.scheduled_at is
  'Timezone-aware instant when the follow-up is scheduled.';
comment on column public.routine_follow_ups.status is
  'Follow-up lifecycle state: scheduled, completed, or cancelled.';
comment on column public.routine_follow_ups.created_at is
  'Timezone-aware timestamp when the follow-up row was created.';
comment on column public.routine_follow_ups.updated_at is
  'Timezone-aware timestamp when the supported follow-up workflow last changed the row.';

comment on table public.patient_statuses is
  'Legacy Monday-through-Sunday summary statuses for a provider-specific patient profile. Dated routine activity is stored in routine_assignments.';
comment on column public.patient_statuses.id is
  'Stable UUID primary key for the legacy status row.';
comment on column public.patient_statuses.day_index is
  'Zero-based weekday index: 0 is Monday and 6 is Sunday.';
comment on column public.patient_statuses.status is
  'Legacy summary value: missed, complete, modified, none, or routine.';
comment on column public.patient_statuses.patient_profile_id is
  'Provider-specific patient profile that owns this status. Deleting the profile cascades to its legacy statuses.';

comment on table public.patients is
  'Shared patient identity and basic care information. Provider-private notes, activity, and discharge state belong to provider_patient_profiles.';
comment on column public.patients.id is
  'Stable UUID primary key for the shared patient identity.';
comment on column public.patients.name is
  'Patient full name used for display.';
comment on column public.patients.created_at is
  'Timezone-aware timestamp when the shared patient identity was created.';
comment on column public.patients.email is
  'Optional patient contact email.';
comment on column public.patients.phone is
  'Optional patient telephone number, stored as text to preserve formatting and leading symbols.';
comment on column public.patients.primary_concern is
  'Optional concise summary of the patient concern motivating care.';
comment on column public.patients.treatment_focus is
  'Optional concise summary of the current treatment focus.';
comment on column public.patients.start_of_care is
  'Optional calendar date when care began; it has no time-of-day or timezone.';
comment on column public.patients.care_status is
  'Shared prototype state: active or pending. Provider-specific discharge is represented by provider_patient_profiles.discharged_at.';

comment on table public.provider_patient_profiles is
  'Private provider-patient relationship containing provider-specific clinical context and active or discharged state. Each provider-patient pair is unique.';
comment on column public.provider_patient_profiles.provider_id is
  'Supabase Auth user ID of the provider who owns this relationship.';
comment on column public.provider_patient_profiles.patient_id is
  'Shared patient identity linked to this provider relationship.';
comment on column public.provider_patient_profiles.created_at is
  'Timezone-aware timestamp when the provider-patient relationship was created.';
comment on column public.provider_patient_profiles.id is
  'Stable UUID primary key for the relationship; statuses and assignments reference this provider-specific ID.';
comment on column public.provider_patient_profiles.clinical_notes is
  'Provider-private clinical notes for this relationship; they are not shared with other providers treating the same patient.';
comment on column public.provider_patient_profiles.discharged_at is
  'Soft-discharge timestamp. Null means the relationship is active; a value preserves the relationship as historical care.';

comment on table public.providers is
  'Provider profile linked one-to-one to a Supabase Auth user. Authentication and administrative authorization remain separate concerns.';
comment on column public.providers.id is
  'Supabase Auth user ID and primary key for the provider profile.';
comment on column public.providers.name is
  'Provider full name used for display.';
comment on column public.providers.professional_title is
  'Editable professional title used for display, not an authorization or provider-approval role.';
comment on column public.providers.initials is
  'Short provider initials generated for avatar and compact display fallback.';
comment on column public.providers.avatar_url is
  'Public URL of the provider profile image stored in the profile-images bucket.';
comment on column public.providers.contact_email is
  'Professional contact address. Editing it does not change the Supabase Auth login email.';
comment on column public.providers.phone is
  'Provider mobile telephone number, stored as text to preserve formatting.';
comment on column public.providers.specialty is
  'Provider clinical specialty used for profile display.';
comment on column public.providers.bio is
  'Provider-authored short professional biography.';
comment on column public.providers.department is
  'Provider department or clinical service.';
comment on column public.providers.facility is
  'Provider clinic or facility name. It is display text, not a normalized medical-practice relationship.';
comment on column public.providers.office_location is
  'Provider office location such as building, floor, or room.';
comment on column public.providers.work_phone is
  'Provider work telephone number, stored as text to preserve formatting.';
comment on column public.providers.work_phone_extension is
  'Optional work telephone extension, stored as text to preserve leading zeros.';
comment on column public.providers.preferred_contact is
  'Preferred professional contact channel: email, phone, or in-app.';

comment on table public.routine_assignment_exercises is
  'Immutable ordered exercise-name snapshots copied when a routine is assigned. Later template edits do not change these rows.';
comment on column public.routine_assignment_exercises.id is
  'Stable UUID primary key for the assignment exercise snapshot.';
comment on column public.routine_assignment_exercises.routine_assignment_id is
  'Routine assignment whose historical exercise list contains this snapshot.';
comment on column public.routine_assignment_exercises.exercise_name_snapshot is
  'Exercise name captured at assignment time and retained independently of later template edits.';
comment on column public.routine_assignment_exercises.position is
  'Zero-based display order of the exercise within the assignment snapshot.';

comment on table public.routine_assignments is
  'Dated prescription of a provider-owned routine to a provider-specific patient profile, with immutable routine and exercise snapshots.';
comment on column public.routine_assignments.id is
  'Stable UUID primary key for the dated routine assignment.';
comment on column public.routine_assignments.patient_profile_id is
  'Provider-specific patient profile receiving the routine assignment.';
comment on column public.routine_assignments.routine_id is
  'Source provider-owned routine template. Historical display data is preserved separately in snapshot fields.';
comment on column public.routine_assignments.scheduled_date is
  'Calendar date on which the patient is expected to perform the routine; it has no time-of-day or timezone.';
comment on column public.routine_assignments.status is
  'Assignment lifecycle state: scheduled, completed, missed, modified, or cancelled.';
comment on column public.routine_assignments.routine_name_snapshot is
  'Routine name captured at assignment time and retained independently of later template edits.';
comment on column public.routine_assignments.created_at is
  'Timezone-aware timestamp when the routine assignment was created.';
comment on column public.routine_assignments.updated_at is
  'Timezone-aware timestamp when the supported assignment workflow last changed the row.';

comment on table public.routine_exercises is
  'Ordered exercises in a reusable provider routine template. Template edits do not alter existing assignment snapshots.';
comment on column public.routine_exercises.id is
  'Stable UUID primary key for the routine exercise.';
comment on column public.routine_exercises.routine_id is
  'Reusable routine template that owns this exercise.';
comment on column public.routine_exercises.name is
  'Current exercise name in the reusable routine template.';
comment on column public.routine_exercises.position is
  'Zero-based display order of the exercise within the reusable routine template.';

comment on table public.routines is
  'Reusable provider-owned routine templates. Templates are archived rather than deleted so historical assignments remain valid.';
comment on column public.routines.id is
  'Stable UUID primary key for the routine template.';
comment on column public.routines.provider_id is
  'Provider profile that owns and manages this routine template.';
comment on column public.routines.name is
  'Current display name of the reusable routine template.';
comment on column public.routines.archived_at is
  'Soft-archive timestamp. Null means the routine is available for editing and new assignments.';
comment on column public.routines.created_at is
  'Timezone-aware timestamp when the routine template was created.';
comment on column public.routines.updated_at is
  'Timezone-aware timestamp when the supported routine workflow last changed the template.';

commit;
