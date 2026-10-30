# Milestone HIPAA readiness review and remediation plan

Review date: October 29, 2026 (America/Los_Angeles). Source revision: `2245dd9dc3315650755f20c53622e1b36fc12b95`.

**Recommendation: keep the current system limited to synthetic data until the identity vulnerabilities and the production safeguards below are resolved. The reviewed system is not ready for a real-patient launch.**

This review covers the Expo patient app in `Mobile_App/Milestone`, the React/Vite provider app in `Web_App`, its Vercel invite function, and read-only inspection of their connected hosted Supabase project. It produces a plan; it does not change application behavior, Auth settings, patient records, or database policies. No patient records, message contents, passwords, or active login codes were requested from the hosted database.

## Applicability and evidence limits

The law is **HIPAA**, the Health Insurance Portability and Accountability Act. A health-related app is not automatically subject to HIPAA. Applicability depends on whether its operator is a covered entity or creates, receives, maintains, or transmits PHI for one as a business associate. Milestone's provider/patient care workflows make business-associate operation a reasonable planning assumption; the operator and counsel must confirm the actual arrangement and customer contracts. Other federal and state privacy obligations may apply even outside HIPAA. See [HHS applicability guidance](https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html) and the [FTC health-app tool](https://www.ftc.gov/business-guidance/resources/mobile-health-apps-interactive-tool).

This is an engineering readiness assessment and input to the organization's formal risk analysis. It cannot establish the existence of signed agreements, workforce procedures, physical safeguards, or an effective compliance program. Severity below expresses engineering priority, not a legal determination that a violation or breach occurred.

The [HHS Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) reviewed for this assessment identifies the 2025 cybersecurity changes as proposed. The plan uses the current rule and distinguishes recommended controls from specific legal prescriptions. HIPAA does not specify a universal password length, a universal session timeout, or one required software architecture. Addressable specifications, including encryption and automatic logoff under the current rule, still require a documented assessment and implementation or an appropriate documented alternative. Recheck applicable rules and effective dates before launch.

Evidence labels:

- **Verified hosted:** metadata, function definitions, privileges, settings, or organization information read from Supabase during this review.
- **Verified source:** behavior established in the checked-out code. Deployment of that particular code is not independently established.
- **Unverified:** dashboard configuration, contractual evidence, organizational process, or device behavior that was unavailable to this review.
- **Inferred risk:** a consequence of verified behavior that was not exploited against production accounts.

No production penetration tests, account creation, credential generation, data mutations, physical-device tests, or backup restorations were performed. Existing historical tests are not treated as current security proof.

## Data and service inventory

| Flow or location | Data handled | Boundary to protect |
| --- | --- | --- |
| Provider browser → Supabase REST/RPC/Realtime | Patient identity/contact details, concerns, treatment focus, care dates/status, clinical notes, routines, prescriptions, schedules, messages/read state | Provider identity, care relationship, organization membership, role, session assurance, logging |
| Patient app → Supabase Auth/RPC/Realtime | Authentication tokens, patient profile, assigned care routines, messages/read state | Auth-to-patient identity binding, ownership, device storage and lifecycle |
| Provider browser → `/api/invite-patient` → Supabase Admin API | Provider bearer token, patient ID/name/email, generated login credential | Privileged backend operation, verified target identity, authorization, vendor coverage |
| Native app storage | Supabase session in AsyncStorage; local preferred name, DOB, PIN and preferences in SecureStore; profile-photo files in app documents and image-processing cache | Device theft, backups, cached files, sign-out, account switching, reinstall |
| Mobile browser preview | Auth persistence and local extras, including PIN/DOB/photo, in browser storage | Same-origin scripts, shared browsers, preview access |
| Provider browser storage | Supabase session; scheduling recovery records containing patient relationship IDs, routine IDs, dates and tokens | Persistent identifiers remain sensitive when linkable to care records |
| Supabase Storage | Public `profile-images` bucket; one object matching the provider-avatar path format at review time | Explicitly public provider imagery versus private patient/clinical media |
| Vercel, logs, support and development tooling | Invite traffic/errors; possible diagnostic or support copies of PHI | BAA/service scope, access, redaction, retention, preview isolation |
| Routine editor demo → YouTube/Vimeo | Browser network identifiers and viewing context; editable demo media | Third-party disclosure review before any clinical use |

Names, dates, UUIDs and photos must be assessed in their clinical context. Removing names alone does not establish de-identification. No evidence was gathered that the current hosted records represent real people; the launch recommendation applies before introducing real PHI.

## Existing safeguards to preserve

- All **15 public application tables** inspected have RLS enabled. The private scheduling policy table also has RLS. No public application views were present in that inventory.
- Reviewed patient profile, routine and message RPCs bind reads to `patients.auth_user_id = auth.uid()`; reviewed privileged functions fix their search path and deny anonymous execution.
- Provider reads are generally relationship-scoped. Hosted column privileges deny direct updates to `provider_patient_profiles.patient_id` and `provider_id`; only `clinical_notes` is directly updateable there. A broad-looking UPDATE policy is therefore **not evidence of a relationship-retargeting vulnerability** in the current deployment.
- The hosted patient-details function checks and locks an active relationship before saving. Scheduling has immutable snapshots/receipts, and discharge preserves records.
- Provider web has a functioning MFA challenge path for enrolled users and explicit logout-failure handling. These should be strengthened and retained.
- Native local extras use SecureStore. Camera/microphone collection is disabled in the relevant Expo plugin configuration. The mobile profile-photo flow is local, not an upload to the public bucket.
- The privileged invite key is read only on the server, without a `VITE_` prefix. A limited pattern scan of **216 tracked source/document/configuration files** found no literal Supabase service-role JWT or `sb_secret_` key. Reviewed local environment files expose only public configuration names. This was not a full Git-history or general secret scan.

## Findings and required changes

The queue below assigns proposed owner roles and implementation order. Each finding's detailed acceptance criteria follow it. The operator must assign named owners before execution.

| ID | Priority | Scope | Proposed owner | Phase |
| --- | --- | --- | --- | --- |
| H01 | Critical | Credentials issued for an unbound identity | Backend/Auth lead | 0 containment; 1 repair |
| H02 | Critical | Metadata-based patient claiming | Backend/Auth lead | 0 containment; 1 repair |
| H03 | High | Approved provider membership and roles | Backend/Auth lead + practice administrator | 1 |
| H04 | Launch blocker | Vendor agreements and PHI environment | Operator + infrastructure owner + counsel | 0–3, in parallel |
| H05 | High | Enforced MFA and password/abuse controls | Backend/Auth lead | 1 |
| H06 | High | Native and browser session persistence | Mobile lead + web/Auth lead | 2 |
| H07 | High | Locking, inactivity and revocation | Auth lead + mobile/web leads | 1 policy; 2 implementation |
| H08 | High | Local files, cleanup and device protection | Mobile lead + IT/device owner | 2 |
| H09 | High | Attributable audit and monitoring | Backend lead + security owner | 2 |
| H10 | Medium; high for PHI | Storage classification and uploads | Backend lead + web/mobile leads | 2, before clinical media |
| H11 | Medium | Browser hardening and external media | Web lead + infrastructure/privacy owners | 2 |
| H12 | Medium | Data minimization and diagnostics | Backend lead + web/mobile leads | 2 |
| H13 | High evidence gap | Governance, rights and continuity | Privacy/security owners + clinical owner | 0–3 |
| H14 | Medium evidence gap | Signing, dependency and release assurance | Release/security owner | 2–3 |

### H01 — Critical: the invite function can issue a credential for an unbound Auth identity

**Verified source; inferred account-takeover risk.** [The invite endpoint](../../../Web_App/api/invite-patient.ts#L59) checks that the caller has a relationship with a patient, then calls `admin.generateLink` using that patient's editable email and returns the OTP to the caller. It does not require the generated Auth user's ID to match the patient's existing `auth_user_id`, exclude provider accounts as targets, or verify control of the destination independently. [Patient-details editing](../../../Web_App/supabase/migrations/20261027032029_update_patient_details.sql#L47) changes contact email separately from Auth identity; the corresponding hosted implementation was verified.

An authorized relationship to a patient record does not authorize issuing credentials for whatever Auth account an editable email identifies. This creates a path to credentials for another patient or provider identity if the endpoint is deployed as written. MFA may limit some resulting access, but it does not repair this authorization error. No target account was tested. Supabase documents the privileged API in [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink).

**Plan:** disable provider retrieval of patient authentication credentials before real use. Separate verified login identity from provider-editable contact email. Use a trusted enrollment service with an expiring, single-use invitation bound to the intended patient, intended identity, authorized organization and enrollment purpose. Reject email collisions and provider/other-patient Auth identities. Require verification of any login-identity change; compare the Auth response identity before accepting a new binding. Subsequent patient sign-in should verify possession through a patient-controlled channel or another documented identity-proofing process, without returning the patient's authenticator to a provider.

**Acceptance:** staging tests prove a provider cannot obtain credentials for another patient or provider by changing a contact email or creating a patient with an existing account's email. Reuse, expiry, collision, simultaneous redemption and identity-change cases fail safely; errors do not reveal account existence unnecessarily.

### H02 — Critical: signup trusts user-editable metadata to claim a patient record

**Verified hosted and source.** The active Auth insert trigger `public.handle_new_user` uses `new.raw_user_meta_data.patient_id` to set an unlinked patient's `auth_user_id`. It checks that the patient is unlinked, but does not validate an invitation or verified destination identity. See [the deployed function's migration](../../../Web_App/supabase/migrations/20261026000200_fix_provider_trigger_medical_practice.sql#L33).

If signup is accessible, someone who learns an unlinked patient UUID could supply that metadata and claim the record. Knowing a UUID must not be treated as authorization. Hosted signup enablement and email-confirmation settings were not available through the connected tools, so end-to-end exploitability was not tested. Revoking direct execution of the trigger does not prevent its execution during Auth signup.

**Plan:** remove authorization based on `raw_user_meta_data`. Bind patients through a server-controlled enrollment transaction backed by a validated invitation. If a trigger remains, it must consult trusted enrollment state and fail closed for unmatched accounts. Restrict public signup while this is repaired and reconcile existing bindings through an approved identity review.

**Acceptance:** arbitrary signup metadata cannot select a patient or organization. Missing, forged, expired, reused or mismatched invitations create no privileged membership or patient linkage. Legitimate enrollment remains atomic and cannot overwrite an existing binding.

### H03 — High: provider enrollment and membership are self-asserted

**Verified source and hosted logic; hosted signup settings unverified.** [The public register route](../../../Web_App/src/App.tsx#L33) calls [Auth signup](../../../Web_App/src/auth/AuthContext.tsx#L390) with a self-selected practice. The active trigger creates a provider from that metadata without consulting an approved access request. The approval script does not gate this separate route. Provider profile updates also accept `medical_practice_id`; hosted grants permit that column update. The two hosted `create_patient` overloads require an authenticated UID but do not explicitly require an approved provider, and the relationship provider FK points to `auth.users`.

Current patient access is relationship-scoped, so selecting a practice alone was **not shown to grant access to that practice's patients**. The missing trust boundary is verified membership and role assignment.

**Plan:** require approved/invited provider enrollment, verified practice affiliation, and server-managed active memberships/roles. Keep specialty/title and contact fields editable without letting those fields grant authority. Require active approved provider membership in every provider RPC and privileged endpoint. Define whether practices are security tenants and enforce that decision consistently, including cross-practice care relationships and staff termination.

**Acceptance:** self-signup, profile updates, patient accounts and disabled staff cannot create or elevate provider authority. Cross-provider and cross-practice tests enforce the approved sharing model.

### H04 — Launch blocker: the hosted vendor environment is not established for PHI

**Verified hosted:** Supabase reports this project's organization as `plan: free`, `tier: tier_free`. It also reports AI SQL/log/data generator opt-in tags. **Unverified:** any exceptional written agreement, HIPAA add-on, High Compliance designation, signed BAA, organization MFA enforcement, PITR, network restrictions and SSL enforcement. PostgreSQL `ssl = on` confirms capability, not that every connection must use TLS.

Supabase requires a signed BAA and HIPAA add-on for PHI, with projects configured accordingly. Its current project guidance includes PITR, SSL enforcement, network restrictions and connection logging. The reported Free plan does not establish that setup. See [Supabase HIPAA projects](https://supabase.com/docs/guides/platform/hipaa-projects) and [shared responsibilities](https://supabase.com/docs/guides/deployment/shared-responsibility-model#managing-healthcare-data).

The source uses Vercel Functions for patient identity and credential traffic, so Vercel belongs in the vendor assessment if that deployment is used. Its supported BAA offering is described in [Vercel's HIPAA guide](https://vercel.com/kb/guide/hipaa-compliance-guide-vercel). Signed contracts and account configuration were not inspected.

**Plan:** establish the operator → customer and operator → subprocessor BAA chain; use a supported Supabase HIPAA arrangement or another suitably contracted platform. Verify scope for Auth, database, Storage, Realtime, Functions, backups and logs. Inventory SMTP/SMS, monitoring, support, CI, build/update services and AI tools according to their actual data access. Review the reported AI opt-ins and disable or constrain any data-sharing feature until its permitted data and contractual coverage are established. The flags alone do not prove a disclosure occurred. Separate synthetic development/staging from PHI production.

**Acceptance:** the accountable owner retains executed agreements, a vendor/service inventory, dashboard evidence of required configuration, least-privilege administrative access and a tested production deployment. Encryption or SOC 2 alone is insufficient evidence of HIPAA readiness.

### H05 — High: provider MFA is optional in the UI and unenforced at the data boundary

**Verified source and hosted.** [MFA challenge logic](../../../Web_App/src/auth/mfa.ts#L22) requires a challenge when an enrolled factor makes `nextLevel` equal `aal2`; an account with no factor can continue at `aal1`. [Settings](../../../Web_App/src/components/MfaSettings.tsx#L34) support enrollment and removal. No `aal2` or `session_id` enforcement was found in the inspected application function definitions or public/Storage policy expressions. The invite endpoint does not demand higher assurance. A route guard is not an API security boundary.

The hosted Security Advisor additionally reports **leaked-password protection disabled**. [Registration](../../../Web_App/src/pages/RegisterPage.tsx#L89) accepts six-character passwords in client validation; the actual hosted password policy is unverified.

**Plan:** require provider/admin MFA enrollment and enforce assurance in policies/RPCs and privileged endpoints, with controlled recovery and removal. Apply an approved server-enforced password policy, compromised-password blocking, and abuse controls. Define an accessible patient-authentication policy separately. MFA is a recommended risk control here; the current HIPAA rule does not prescribe this particular implementation for every app.

**Acceptance:** direct API access with a valid `aal1` provider session is denied for protected operations, including invites. Mandatory enrollment/removal cannot be bypassed. Recovery is identity-verified, rate-limited and audited. Supabase administrative accounts also meet the applicable organization MFA requirements.

### H06 — High: persistent session credentials are not adequately protected on devices

**Verified source.** [The active mobile Supabase client](../lib/supabase.js#L11) persists the real Auth session through AsyncStorage, including renewable credentials. SecureStore used elsewhere does not protect this session. React Native describes AsyncStorage as unencrypted storage unsuitable for tokens; see [its security guidance](https://reactnative.dev/docs/security).

[The provider client](../../../Web_App/src/lib/supabase.ts#L11) enables persistent sessions with the SDK's browser storage behavior. Native local extras use SecureStore, while [mobile browser extras](../auth/localPatientExtras.js#L27) save PIN, DOB and photo data in localStorage. Browser compromise or shared-browser access therefore has substantial consequences.

**Plan:** migrate native Auth persistence to a reviewed Keychain/Keystore-backed adapter, handling token size, failures, accessibility, reinstall and old AsyncStorage key removal. Minimize locally retained PHI. For the provider web app, evaluate a same-origin backend-for-frontend with secure, HttpOnly, SameSite cookies, CSRF protection and server-validated sessions. If retaining direct browser Supabase access, document the residual script-accessible token risk and add strong script restrictions and bounded sessions; cookie storage is a design option, not a HIPAA-mandated framework change. Keep patient web previews synthetic until their storage model is approved.

**Acceptance:** native storage inspection finds no reusable Auth credentials in AsyncStorage. Migration removes old copies without cross-account exposure. Browser sessions have tested CSRF/XSS defenses appropriate to the selected design. JavaScript encryption with its key stored beside the ciphertext does not count as a solution.

### H07 — High: local locking, inactivity and revocation do not form a complete session policy

**Verified source; hosted session limits unverified.** [The local unlock function](../auth/deviceUnlock.js#L1) compares a four-digit PIN directly with no retry limit. [The PIN gate](../components/UnlockGate.js#L31) is optional, automatically opens without a PIN, and locks on `background`/hidden transitions only when enabled. It has no foreground inactivity timer. Native inactive/app-switcher privacy behavior is not handled there. A PIN hides the UI; it does not revoke the Supabase session or encrypt its Auth storage.

Provider web tracks token expiry and SDK refresh, but no user-inactivity or absolute session-duration policy was found in source. Refresh is not proof of recent user activity. [Mobile sign-out](../auth/PatientSession.js#L175) does not inspect the SDK's returned error. Existing access tokens can remain usable until expiry unless additional server-side checks reject them; local hiding alone does not establish revocation.

**Plan:** establish risk-based idle/absolute timeouts, background privacy behavior, reauthentication for sensitive operations and loss/offboarding handling. Prefer OS-backed local authentication where appropriate; require and throttle any supported local PIN fallback using an approved design. Check sign-out errors, clear visible protected state promptly and expose accurate recovery when remote revocation fails. Design bounded JWT lifetime and server-side session/account revocation checks where immediate denial is required. Decide explicitly which historical reads remain appropriate after discharge; do not confuse treatment discharge with staff termination.

**Acceptance:** device restart, foreground inactivity, background/inactive transitions, failed unlock attempts, revoked staff membership, offline sign-out, refresh failure and replay of a previously issued token all behave according to a written policy. Verify on physical Android/iOS devices and shared browsers.

### H08 — High: local PHI cleanup and native file protections are incomplete

**Verified source.** [Local photo persistence](../auth/localPatientExtras.js#L55) writes JPEGs to app documents. `clearLocalExtras` deletes only the stored JSON/key, not the JPEG. Normal sign-out does not call that cleanup. Changing/removing a photo does not explicitly remove prior files, and the image-manipulation flow does not establish a cache-cleanup policy. DOB and preferences remain after normal sign-out. Account-scoped keys help prevent accidental UI mixing but do not establish secure disposal.

[Android allows backup](../android/app/src/main/AndroidManifest.xml#L18) and references SecureStore backup rules. The installed rules exclude SecureStore and include shared preferences; this does **not** prove that AsyncStorage or photo documents are included in a backup. Merged release backup behavior, device-transfer behavior, iOS file-protection class and backup exclusion were not verified. No app-specific capture/task-switcher privacy control was found in the reviewed native entry points. OS protection remains relevant; this review does not claim native files lack all disk encryption.

**Plan:** define the data retained for convenience versus erased on sign-out, identity changes, photo removal and account unlinking. Remove obsolete profile files and caches; audit/migrate unused legacy `patientStorage` keys. Configure native file protection, key accessibility and backup exclusions according to that policy. Add tested app-switcher redaction and a documented screenshot policy; the platforms have different capabilities. Retain only necessary permissions.

**Acceptance:** inspect release-build files and approved backups after photo replacement/removal, sign-out, unlinking, account switching, reinstall and device transfer. Previous patient content cannot appear to another account. Intentional retained data and unavoidable platform limits are documented.

### H09 — High: no complete, attributable application access audit trail was established

**Verified hosted:** `log_connections = off`, `log_disconnections = off`, `pgaudit.log = none`. No general application audit table or access-audit trigger/function was found in the inspected application schemas. Message timestamps/read receipts and scheduling receipts exist, but they do not record all PHI access, identity changes or administrative activity. Supabase Auth/platform logs may provide other evidence; their enablement, retention, export and coverage were not verified.

HIPAA requires audit controls appropriate to systems containing ePHI. A particular logging product is not mandated. Supabase separately calls for connection logging in its [HIPAA configuration guidance](https://supabase.com/docs/guides/security/hipaa-compliance).

**Plan:** implement protected, server-attributed events for PHI access, clinical changes, identity binding, invitations, exports, authorization failures, administrative changes and revocation. Capture actor, role/organization, action, resource identifier, time, outcome and request correlation; exclude message bodies, passwords, OTPs and bearer tokens. For direct REST/Realtime reads, choose an architecture that actually observes server-authorized access. Write triggers cannot log SELECTs; client-only events are not sufficient authoritative evidence. Configure selective database/API auditing and any required read RPC/gateway accordingly, with access control, tamper resistance, monitoring and approved retention.

**Acceptance:** reconstruct a test patient's access/change timeline across web, mobile and administrator actions. Unauthorized callers cannot suppress, forge, modify or delete the audit record. Validate alert delivery and log completeness without excessive PHI in diagnostics. Do not simply turn on full SQL statement/body logging everywhere.

### H10 — Medium, high if PHI is introduced: public storage and upload validation need boundaries

**Verified hosted/source.** `profile-images` is public with no bucket-level MIME whitelist or file-size limit. The inventory contains one object matching the provider-avatar format; content was not opened. [The web upload code](../../../Web_App/src/lib/supabaseData.ts#L109) returns a public URL and uploads the original file. [The UI](../../../Web_App/src/pages/ProfilePage.tsx#L121) checks an `image/` MIME prefix and attempts to decode the image; these are not trusted backend content checks.

A public provider headshot is not automatically patient PHI. This is **not evidence of an existing patient-photo leak**. It is an unsafe destination for future patient/clinical media, and upload constraints are weak today.

**Plan:** explicitly classify public provider imagery. Place all patient/clinical media in private buckets with relationship-based authorization and short-lived access as appropriate. Enforce backend MIME/size limits and image decoding/re-encoding, remove unnecessary metadata, restrict active formats such as SVG, and review cached/signed URL lifetimes. If public provider avatars remain intentional, document consent/use and the public-data rule. Update web/mobile avatar delivery together if the bucket becomes private.

**Acceptance:** anonymous access to private clinical media fails; unrelated users cannot read or replace it. Reject oversized, invalid and disguised uploads at the trusted boundary. Verify caches and expired links, while preserving approved avatar behavior.

### H11 — Medium: browser hardening and third-party media need production review

**Verified source; deployment headers unverified.** [Vercel configuration](../../../Web_App/vercel.json#L1) contains routing rewrites but no declared security/cache headers. No CSP, frame restriction or private-response cache policy was found in the reviewed application configuration. The actual CDN may add headers; that was not measured.

[The authenticated routines page exposes an editor demo](../../../Web_App/src/pages/RoutinesPage.tsx#L373), whose [media renderer](../../../Web_App/src/components/RoutineDemo.tsx#L176) loads YouTube/Vimeo iframes. It is sample state, not the saved clinical routine implementation. No general analytics/session-replay SDK was found in the reviewed app dependencies, but network behavior of deployed pages remains unverified. Cookie-reduced embedding does not itself establish permitted PHI handling.

**Plan:** measure production headers and set an appropriate CSP, HTTPS/HSTS policy, frame protection, MIME protection, referrer policy and narrowly scoped permissions. Ensure authenticated responses containing PHI/credentials use suitable no-store/private caching rules; preserve caching for public static assets. Remove or isolate the sample editor from production clinical workflows, and approve media hosts before clinical use. Inventory actual runtime requests, including avatar URLs, SMTP, analytics and support tools. Do not assume every third-party request is a PHI disclosure; assess the data/context sent.

**Acceptance:** production-header and browser-network tests cover both full/narrow layouts, authentication, patient routes and media. Patient identifiers, care details and credentials do not reach unapproved origins or shared caches. CSP changes preserve required functionality.

### H12 — Medium: client data minimization and diagnostic controls need improvement

**Verified source.** [The provider inbox](../../../Web_App/src/lib/messages.ts#L40) retrieves full message histories for linked conversations to build the inbox, increasing the amount of PHI resident in the browser. [Scheduling recovery](../../../Web_App/src/lib/scheduleRecovery.ts#L12) persists patient/routine identifiers and dates in localStorage until resolved, with no time-based expiry. Omitting names does not make that care linkage anonymous. Preserve the recovery mechanism's protection against duplicate scheduling when redesigning storage.

The invite function logs raw backend error objects, and [mobile routine loading](../App.js#L235) logs and displays backend error text. No actual sensitive log payload was inspected. A commented profile debug log is inactive and was not counted as a disclosure. Mobile reminder settings are currently a preview; no implemented push-notification delivery was found in the reviewed flow.

**Plan:** return bounded inbox summaries and fetch paginated message bodies on authorized thread selection. Prefer server-side scheduling recovery or an approved minimal bounded browser record, with a safe way to resolve uncertain writes before expiry. Introduce structured/redacted diagnostics and generic user errors. Define PHI-free email/push previews and authenticate deep links before implementing notifications. Current least-privilege risks should be addressed without mischaracterizing the Privacy Rule's treatment-related minimum-necessary exceptions.

**Acceptance:** inbox network responses contain only required summary data; session/account changes clear protected state. Recovery survives interrupted writes without retaining unresolved identifiers indefinitely or duplicating treatment schedules. Representative error/notification tests reveal no secrets or unnecessary clinical contents.

### H13 — High, evidence gap: governance, patient rights and continuity are not demonstrated

**Unverified organizational controls.** No complete risk-analysis record, policy program, BAA register, training evidence, incident plan, patient-rights process, retention schedule or comprehensive disaster-recovery evidence was found in the reviewed materials. These may exist outside the repository; their absence here is not proof the organization lacks them.

**Plan:** the operator must supply or establish the administrative, physical and privacy controls in the workstream table below. Confirm which records form the designated record set, including care messages and schedules used in clinical decisions. Document whether local-only routine completion/ratings are intended clinical records: [the patient exercise flow](../App.js#L279) currently records progress in React state, so it must not be represented as a durable shared clinical record. Either implement approved persistence/integrity/auditing or clearly delimit the feature's record status.

**Acceptance:** the accountable privacy/security owners approve a documented risk analysis and treatment register, customer/vendor responsibilities, rights procedures, training and a successfully exercised incident/recovery process before launch.

### H14 — Medium, evidence gap: release security and repeatable assurance need work

**Verified source.** [Android release configuration](../android/app/build.gradle#L100) uses the debug signing configuration. The root [.gitignore](../../../.gitignore#L10) ignores most provider tests, with limited exceptions; package scripts refer to additional local tests that are not all in tracked source. No tracked `.github` CI workflow was found. External CI, signing management and deployed build provenance were not available to this review.

[Mobile security documentation](../README.md#L128) describes default credentials, PBKDF2 verifiers, biometric unlock and persistent retry cooldowns that do not match the active PIN code reviewed here. Treat documentation as stale, not as implemented protection.

**Dependency status: unverified.** `npm audit --json --ignore-scripts` could not reach the advisory endpoint in the restricted environment for either app. Automatic approval review rejected network escalation because package names/versions would be sent to the public npm registry. Approval was requested; no current vulnerability count is asserted. No package installation or automatic fixes were run.

**Plan:** establish controlled release signing/secret management, track required tests and enforce checks in CI. Complete approved dependency and full-history secret scans; maintain an SBOM and patch process. Address advisory reachability and affected runtime paths rather than treating all development-tool findings as equivalent. Upgrade Expo dependencies coherently instead of using `npm audit fix --force`. Align README/security claims with actual behavior, and protect production previews and deployment secrets.

**Acceptance:** clean-checkout CI runs required tests/builds/security checks; mobile release artifacts use protected production signing and approved permissions. Vulnerabilities have documented triage/remediation or justified risk treatment. The runtime and documentation agree.

## Operational workstreams and evidence owners

Suggested owner roles below must be assigned to actual people. Implementing a UI is not the only way to satisfy a workflow: a documented, secure, auditable manual process can be appropriate where the law and customer obligations permit it.

| Workstream | Accountable owner | Deliverable and acceptance evidence |
| --- | --- | --- |
| Scope and risk management | Operator + security owner + counsel | Confirm covered-entity/business-associate roles; inventory all ePHI, systems, devices and vendors; document threats, likelihood, impact, safeguards, residual risk, owners and review triggers. Use this review as input, not the entire organizational assessment. |
| Customer/vendor contracts | Operator + counsel | Executed customer BAAs and applicable subcontractor BAAs, service scope, breach obligations, permitted use, return/disposal terms, subprocessor register. |
| Workforce and administrative access | Security owner + practice administrators | Named accounts, approved roles, onboarding/offboarding, periodic access review, training, sanctions, privileged change control and controlled emergency access. |
| Physical and endpoint safeguards | IT/device owner | Device/facility access rules, workstation privacy, OS encryption and locking, asset inventory, patching, lost-device response, remote wipe where appropriate, backup/media disposal and BYOD policy. |
| Patient notices and rights | Privacy owner + treating organizations | Allocate responsibility for Notice of Privacy Practices, required acknowledgments/authorizations, confidential communications, access/copy requests, amendments, restrictions, applicable disclosure accounting, complaints and personal-representative verification. A generic consent checkbox is insufficient. |
| Record lifecycle | Privacy owner + clinical owner + engineering | Approved record-set definition, state/customer retention requirements, legal holds, correction history, permitted destruction, local/cache expiry and disposal verification. Preserve clinical assignment history when access is revoked. |
| Incident and breach response | Security owner + privacy owner + counsel | Reporting channel, on-call contacts, containment, evidence preservation, risk assessment, customer notification and applicable individual/HHS/media reporting procedures; run a tabletop exercise. |
| Business continuity and recovery | Infrastructure owner + clinical owner | Agreed RPO/RTO, encrypted recoverable backups, separate Storage object coverage, Auth/configuration/key dependencies, outage procedures and an isolated end-to-end restore exercise. |
| Ongoing assurance | Security owner + engineering | Vulnerability/secret scanning, alert review, secure change review, periodic testing, incident lessons, renewed vendor evidence and risk review after material changes. |

The legal basis for risk management, workforce, incident and contingency requirements is described in [45 CFR 164.308](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.308). Patient rights and notices are addressed in the [HHS Privacy Rule summary](https://www.hhs.gov/hipaa/for-professionals/privacy/laws-regulations/index.html).

HIPAA requires specified compliance documentation to be retained for six years from creation or last effective date, whichever is later; see [45 CFR 164.316](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.316). That is not a blanket six-year retention rule for all clinical records or every log. Establish those periods using applicable law, contracts and risk analysis; [HHS distinguishes medical-record retention from HIPAA documentation](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-require-covered-entities-to-keep-medical-records-for-any-period/index.html).

Breach procedures must account for notification without unreasonable delay and applicable outer deadlines, generally including a 60-day outside limit for individual notice and business-associate notice to covered entities, with different HHS reporting treatment for smaller breaches and potentially shorter contractual/state deadlines. The [HHS Breach Notification Rule guidance](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html) should drive the counsel-approved runbook; 60 days is not a waiting period.

## Ordered implementation plan

These are sequencing estimates for planning, assuming an assigned engineering team and privacy/security owners. Vendor procurement and organizational readiness may take longer. No elapsed week automatically establishes compliance.

| Phase | Timing | Work | Completion gate |
| --- | --- | --- | --- |
| 0. Contain and establish scope | Immediately, before real PHI | Keep synthetic data only; restrict affected signup/invite paths through an approved change; appoint owners; assess whether any real PHI is already present; begin BAA/platform procurement and preserve relevant evidence. Address H01/H02 exposure first. | Real-patient rollout remains gated. Owners know data scope and how affected identity paths are contained. If real data exists, initiate the documented incident/risk process without assuming a breach. |
| 1. Repair identity and authorization | Approximately weeks 1–2 | Implement H01–H03 trusted enrollment, approved membership, Auth/contact separation; H05 API-enforced provider MFA; define revocation policy. Build abuse and negative authorization tests alongside fixes. | Arbitrary metadata/contact edits cannot claim accounts or mint credentials for unrelated users; approved roles/assurance are enforced through direct API calls. |
| 2. Protect clients and add auditability | Approximately weeks 3–4 | H06–H12 secure token storage, sessions/cleanup, read/write auditing, bounded inbox data, uploads/private media, browser hardening and redacted errors. Preserve current care editing and scheduling behavior. | Both apps pass storage/session/isolation checks; server evidence attributes accesses/changes; physical-device privacy checks are complete. |
| 3. Operational readiness and independent review | Approximately weeks 5–8, contracts in parallel | Finish H04/H13/H14 vendor configuration, policies, rights workflows, dependency/release assurance, restoration and incident exercises. Run independent security assessment in a safe environment. | Launch evidence below is complete; blocking findings are retested; accountable privacy/security/clinical owners approve residual risk and deployment. |
| 4. Maintain | Throughout operation | Review alerts/access, patch dependencies, exercise recovery and response, re-evaluate vendors and data flows, and update risk analysis after relevant changes. | Evidence stays current and material changes receive review. |

## Security acceptance matrix for both apps

Run adversarial tests with synthetic identities in isolated staging. Any later production testing needs a separately scoped, safe procedure. The following are required future checks, not results claimed by this review.

| Area | Minimum cases | Expected evidence |
| --- | --- | --- |
| Identity binding | Forged patient metadata; unlinked/relinked records; wrong destination identity; existing provider/patient email collision; replay/expiry/race; recovery | No unauthorized binding or credential issuance; trusted enrollment and event records |
| API authorization | Anonymous user, patient A/B, provider A/B, different practice, unapproved/disabled provider, `aal1`/`aal2`; guessed patient/thread/assignment IDs | Denial through REST, RPC, Storage, Realtime and invite APIs regardless of frontend navigation |
| Session lifecycle | Idle/absolute expiry, token replay after revocation, sign-out failure/offline, account switch, membership removal, multiple tabs/devices | Server policy and UI agree; protected state is cleared; residual JWT behavior is documented/tested |
| Native storage/privacy | Android/iOS release installs, old-token migration, SecureStore failure/size limits, photo cache, device backup/transfer, reinstall, app-switcher/capture | No unexpected credential/PHI copies; correct OS protection and reauthentication; actual device evidence |
| Web protections | Header/cache inspection, XSS/CSRF tests appropriate to architecture, patient URL/referrer handling, runtime third-party traffic, shared browser | No unapproved disclosures, public caching or cross-account remnants; approved workflows render correctly |
| Integrity | Authorized patient-detail edit, immutable routine snapshots, schedule retry recovery, sender attribution, durable-record boundaries | Authorized web changes are reflected read-only on mobile; no duplicated or silently lost records; attributed corrections |
| Audit and monitoring | Reads, writes, failures, invitation/revocation/admin events, exports, log redaction, audit tamper attempts | Correlated actor/resource/outcome evidence and tested alerts without secret/body logging |
| Operations | Patient access/amendment request, offboarding, lost device, incident tabletop, restore of data/Auth/Storage/configuration | Measured completion, assigned ownership and retained evidence |

Preserve the existing product decision that providers edit shared patient details on web and the mobile app displays those details read-only. Security fixes should not broaden patient editing or replace persisted shared behavior with mocks.

## Launch evidence and unresolved decisions

Do not label the product HIPAA-compliant based only on green tests, TLS, RLS, MFA, a BAA, or this review. Before handling real PHI, retain:

- Resolved/retested critical findings and a reviewed disposition for every other finding.
- Confirmed legal/operator roles, customer agreements, vendor BAAs, supported service configuration and administrative MFA/access evidence.
- An approved data-flow/asset inventory, formal risk analysis and documented risk-treatment decisions, including addressable safeguards.
- Verified native release protections, production web/API checks, appropriately scoped independent security testing and repeatable CI.
- Working audit/monitoring, a successful full recovery exercise and a rehearsed incident plan.
- Assigned and exercised patient-rights, workforce, physical-security and record-retention/disposal processes.

Outstanding decisions for the operator are the business-associate/customer model, whether any actual PHI already exists, production domains and hosting account scope, trusted provider/patient enrollment, practice sharing boundaries, session/recovery rules, clinical record-set scope, RPO/RTO and retention. These can be resolved while engineering proceeds with synthetic staging; the review does not require changing the UI layout to begin that work.

The current dependency advisory scan remains pending explicit approval to transmit dependency metadata to npm. This does not invalidate the confirmed findings above, but dependency risk cannot yet be reported as assessed.
