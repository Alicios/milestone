# SCRUM-47 Phase 1: authentication hardening

Phase 1 implements application authentication failure handling and regression
coverage. SCRUM-47 remains incomplete: this work does not change or verify hosted
RLS, grants, database functions, token validation, or session configuration.

## Behavior

- Supabase Auth and the existing shared client still own login, registration,
  session persistence, access tokens, and refresh. There is no custom JWT system.
- MFA assurance errors, missing assurance levels, factor lookup failures, and
  missing required TOTP factors deny protected access with a safe error message.
  Accounts with valid AAL1/no-MFA or AAL2 sessions retain their normal login flows.
- Login, restoration, registration with a session, and refresh callbacks verify
  authentication requirements and the current session identity before publishing
  a provider. Generation checks prevent obsolete login, profile, or session
  responses from restoring access after account changes or logout.
- Session checks compare the exact SDK credentials, provider identity, and SDK
  expiry. Assurance is checked for that access token through the SDK. MFA
  completion requires AAL2 and a matching current SDK session. Session replacement
  during MFA invalidates its generation and blocks publication. New interactive
  authentication waits until the old request and local cleanup finish.
- The SDK may save an MFA response before returning it. A response arriving after
  invalidation is quarantined: protected UI stays blocked, denial markers are
  saved, and SDK local sign-out is attempted. The application does not claim to
  prevent the SDK's transient internal write or revoke previously issued JWTs.
- Verified sessions have an expiry timer. Expiration removes protected UI before
  awaiting SDK revalidation; focus and visible-tab events also recheck the SDK
  session. A retryable refresh failure cannot extend authorization past expiry.
  An unchanged verified token remains usable until its actual expiry if a
  proactive SDK refresh fails temporarily.
- Duplicate SIGNED_IN events for an unchanged verified session are ignored.
  Same-account TOKEN_REFRESHED events recheck authentication while preserving the
  mounted workspace and provider object until the prior verified session expires.
  Failed checks and account changes discard authorization and protected UI.
- Protected routes and public-page redirects also check authentication errors,
  pending MFA, and logout state. A failed check cannot reuse an old provider object.
- Logout immediately blocks protected UI and invalidates pending authentication.
  It calls `signOut({ scope: 'global' })`, then `signOut({ scope: 'local' })` only
  when the global attempt returns an error or throws. MFA cancellation uses the
  same flow. Concurrent clicks share one operation.

| Outcome | UI behavior |
| --- | --- |
| Global sign-out succeeds | Navigate home when denial persistence is verified; otherwise remain on login with the persistence warning. |
| Global fails, local succeeds | Login page explains that this browser is signed out and other sessions may remain active. |
| Both fail | Login page explicitly says the session may still exist, blocks protected access, and offers retry. No successful termination is claimed. |

The `milestone.auth.logout` marker contains only a UI denial state, never tokens,
credentials, or patient identity. Writes to localStorage and sessionStorage are
attempted and verified by reading the value back. Restoration checks both stores.
Pending or unrecognized markers and unreadable storage fail closed. Only a fresh
successful password, registration-with-session, or MFA authentication may clear
markers; automatic restoration and SDK callbacks cannot clear an active block.

The sessionStorage fallback protects reloads in the same tab. It does not provide
localStorage's cross-tab notification or persistence after the tab is closed.
If neither store can save a marker, this tab stays blocked and the UI explicitly
warns that reload may restore surviving SDK credentials. There is no guarantee of
reload protection when every persistence mechanism fails. The marker is not a
server authorization boundary or a substitute for RLS.

The locked Supabase SDK may already remove local storage when global logout
returns some errors. The local fallback still runs; it may require no additional
HTTP request. Neither UI denial nor logout should be represented as proof of
immediate rejection of every previously issued JWT by the backend.

## Tests and results

Validation is performed in the integration worktree with synthetic sessions,
intercepted HTTP, and no hosted Supabase access. The permanent suites include
both sequences from `/private/tmp/scrum47-independent-review-s56uxylt`, adapted
from assertions that reproduced defects to assertions that require denial.
The permanent suite has no dependency on that temporary directory.

- `node --test --test-timeout=20000 --test-reporter=spec tests/authentication*.test.mjs tests/scheduling.test.mjs tests/catalogRoutines.test.mjs tests/patientCreation.test.mjs tests/approveAccessRequest.test.mjs`
  — 141 passed, including all 54 authentication unit checks.
- `npm run test:scheduling:browser` — 32 passed, including all 15 authentication
  browser checks plus scheduling, routines, and prescriptions.
- `npm run lint` — TypeScript passed.
- `npm run build` — TypeScript and production build passed. Vite reported its
  existing chunk-size warning. Tracked build output was restored to its pre-build
  contents so generated output is not part of the change.
- `git diff --check` — passed; repeated after the final documentation update.

Permanent authentication coverage includes the same-user AAL1 replacement race,
late MFA responses after account switching, extra MFA events, and the SDK's real
MFA response shape (expires_in without expires_at). Storage tests cover thrown
and silently ignored localStorage writes, verified sessionStorage fallback,
surviving SDK credentials, reload, fresh-auth marker clearing, unreadable or
unremovable markers, and the explicit limitation when both stores fail. Expiry
and resume tests cover retryable HTTP 503 failures with no SDK event, successful
refresh, old-deadline cancellation, and preservation of unexpired authorization.

Browser tests verify unsaved profile values and the actual input DOM node survive
both duplicate SIGNED_IN and same-account TOKEN_REFRESHED events. They also cover
both MFA races, fallback-marker reload protection, total persistence failure,
expiry timers, tab resumption, and the original login/MFA/logout flows.
All external HTTP is mocked or aborted and WebSockets are blocked. These tests do
not establish real JWT signature enforcement or hosted API/RLS denial. No database
tests or migrations were executed.

The interrupted run encountered macOS Desktop read denials. File access was
restored; the browser runner needs approval to bind its local server outside the
sandbox. Final review also corrected an MFA response compatibility issue: the
SDK stores expires_at but its verify response supplies expires_in. The app now
reads the SDK's stored session and compares its credentials before publishing.

## Files in the Phase 1 diff

- `package.json`: complete authentication suite command.
- `src/auth/AuthContext.tsx`: session binding, MFA quarantine, expiry/resume checks,
  stable session-event handling, and durable-denial error reporting.
- `src/auth/mfa.ts`: fail-closed assurance/factor checks bound to the access token.
- `src/auth/session.ts`: opaque SDK credential comparison and expiry checks.
- `src/auth/logoutState.ts`: verified localStorage/sessionStorage writes and reads.
- `src/auth/useRedirectIfAuthenticated.ts`, `src/components/ProtectedRoute.tsx`:
  consistent protected access and redirect conditions.
- `src/pages/LoginPage.tsx`, `src/components/DashboardLayout.tsx`: logout/error UI.
- `tests/authentication.test.mjs`, `tests/authenticationRegression.test.mjs`:
  permanent authentication unit and SDK regression coverage.
- `tests/helpers/auth.mjs`, `tests/helpers/authSdk.mjs`: isolated auth fixtures.
- `tests/browser/authentication.spec.mjs`, `tests/browser/fixture.mjs`:
  browser authentication regressions and explicit initial-session fixtures.
- `tests/scheduling.test.mjs`: session fixtures updated for the stronger checks.
- `SCRUM47_AUTHENTICATION.md`: behavior, limitations, scope, and validation record.

Final diff review found no unrelated source changes or database/migration changes.
Tracked production build artifacts match their pre-build contents. Phase 1 is
ready for final review and a local commit; all changes remain uncommitted.
The persistence and SDK-write limitations above remain explicit. Hosted security
validation belongs to the remaining SCRUM-47 work, which has not been started.

## Remaining work

- Resolve the previously recorded hosted anonymous clinical SELECT exposure after
  a separately authorized inspection of effective policies and grants.
- Address the provider-membership gap in both `create_patient` overloads; Phase 1
  intentionally changes no SQL or database permissions.
- Verify direct API denial for anonymous, malformed/expired-token, non-provider,
  and cross-provider requests, and authorized provider success against the actual
  security configuration. Establish any required backend MFA assurance policy.
- Do not replay the deployed SCRUM-64 scheduling migration. Any future security
  database change needs its own reviewed, narrowly scoped migration.

No commit, push, PR, merge, or deployment is included in this phase.
