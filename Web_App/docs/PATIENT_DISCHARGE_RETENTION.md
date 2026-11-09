# Discharged patient retention

The Patients page defaults to all patients, with **All Patients**, **Current Patients**
and **Discharged Patients** tabs and counts. **Discharged Patients** shows
retained provider profiles, including discharge and deletion dates. Their details
and routine history remain accessible; scheduling, editing and code generation
are disabled until the provider selects **Reinstate patient**.

Viewing discharged profiles does not require the retention migration: the loader
falls back to the existing `discharged_at` column if `retention_ends_at` is absent.
Deletion dates are displayed only when returned by the database. Reinstatement
and scheduled deletion still require the pending migration.

Retention is six calendar months from discharge, calculated in UTC with month-end
clamping. Reinstatement clears the deadline on the existing relationship without
duplicating or resetting history. A later discharge starts a new six-month window.
The RPC checks the signed-in provider and deadline; retries are idempotent.

`20261109023642_patient_discharge_retention.sql` installs a daily Supabase Cron
job at 08:15 UTC. It removes expired relationship profiles, clinical notes,
messages, thread state, statuses, assignments, exercise snapshots, patient
responses, follow-ups and scheduling receipts. Profiles stop being selectable
through relationship RLS at the deadline, ahead of the next cleanup run.
The cleanup function is private and unavailable to browser roles.

Shared patient demographics are deleted only after the last provider relationship
has been removed. Other providers' profiles/history are preserved. The Supabase
Auth identity is separate and is retained; this is clinical-profile deletion,
not account deletion. Existing database backups follow their own retention.

Monitor the `purge-expired-patient-profiles` job and `cron.job_run_details` in the
Supabase Cron dashboard. Changing the retention policy requires a migration;
there is no browser-controlled purge or deadline override.

Validation: execute `supabase/tests/patient_discharge_retention.sql` inside a
transaction and roll it back. The synthetic test covers deadlines, reinstatement,
provider isolation, expired restoration rejection, dependent deletion, snapshot
immutability, and shared-patient protection. Browser tests are in
`tests/browser/patient-discharge.spec.mjs`.
