# SCRUM-50: Sprint 2 patient validation

Base: `origin/main` at `3f6bae215f6592da580db9272a982c8b2fa3dbb9`.
This implementation is limited to patient creation and its error handling.
It adds no database migrations, dependencies, phone uniqueness, or phone
canonicalization rules.

## Patient contract

- Patient name is required and trimmed. The client rejects missing/non-string
  and whitespace-only names before sending a request. Both hosted patient RPCs
  already validate authentication and nonblank names, as confirmed by the team.
- Phone is optional. Omitted, null, empty and whitespace-only values are sent
  as SQL-null input through the SDK. Supplied strings are trimmed without changing
  their internal formatting. The form retains its existing phone-format check
  only for nonblank input; this is client feedback, not a new database rule.
- The client first calls `create_patient(patient_name, patient_phone)` and retains
  the name-only `create_patient(patient_name)` fallback for `PGRST202` or `42883`.
  The legacy overload cannot store the supplied phone. No validation or
  authorization failure triggers that fallback.
- Supabase errors are thrown unchanged, preserving codes, details and hints.
  A small shared `errorMessage()` helper displays messages from both ordinary
  Error instances and Supabase objects, with a fallback for missing messages.

## Git integration versus hosted deployment

Main contains SCRUM-43's catalog baseline, not its advanced prescription work.
The full implementation remains on `feature/scrum-43-shared-catalog-integration`
at `a1e083fed`. This SCRUM-50 change does not import or alter that implementation.
Hosted Supabase does not currently expose `save_routine_with_prescriptions`.

Catalog-reference/prescription validation and rejection of empty or unresolved
routine assignments remain dependent on SCRUM-43 integration and its separately
reviewed database deployment. SCRUM-50 does not close those gaps or prove that
rejected assignments leave no partial writes. Existing routine behavior is
unchanged. Hosted migration history differs from repository history: merging
Git code is not evidence of deployment, and historical migrations must not be
replayed as an assumed hosted baseline.

## Local verification and acceptance limits

From `Web_App`, run `npm run test:patients` and `npm run lint`.
The tests use the existing Node test runner and TypeScript compiler, compile
modules in memory, and substitute a mocked Supabase transport. They load no
credentials, contact no database, execute no migrations and generate no fixtures.
Form tests exercise real handlers with lightweight hook/component stubs; they
are not browser integration tests.

Coverage includes optional phones, preserved formatting, invalid required names,
both fallback codes, no fallback for validation/authorization errors, preserved
error objects, form feedback and retry behavior. Database authentication,
overload binding and transaction atomicity are not demonstrated by these mocks.
Advanced exercise/assignment tests belong to the full SCRUM-43 implementation.
Hosted acceptance remains pending until that work is integrated and its database
migration is safely deployed through a separately approved process.
