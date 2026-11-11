# Provider companion validation

## Executed checks

- TypeScript application checks passed.
- Expo dependency compatibility check passed against SDK 58.
- 40 automated tests passed: web routine-status parity across 90 combinations; calendar boundaries; Unicode message limits; paginated data reads; provider/MFA/session gates; partial feedback failure; chunked storage and fault recovery; device-auth result handling; sign-out cleanup under storage/network failure; receipt verification, scoped recovery records, change eligibility, combined completion/issue labels, and the single atomic replacement RPC.
- Android and iOS Hermes JavaScript exports and web export succeeded. These validate bundling, not compiled native applications.
- 120 browser checks passed across six layouts. Tests exercise real app screens against intercepted synthetic Supabase responses, including patient/archive navigation, weekly routine feedback, failed sends/retry, read/star state, MFA, provider-membership denial, foreground locking, and pending requests after sign-out. Archive checks cover both swipe directions using simulated touch, Undo, manual restore, session persistence, failed writes, and new-message races. Added checks cover patient status filters (including query failure), touch navigation into patient pages, the provider photo menu, separate profile/settings pages, dock availability on detail screens; collapsed patient details; orange selected navigation; combined completion/issue indicators; assignment, replacement, removal, stale-confirmation handling, lost-response reconciliation, and retrying the exact same request.
- Rendered phone, tablet, dark, wide, and reduced-height surfaces were inspected. Patient-detail spacing and reduced-height conversation layout were corrected from screenshots.
- Hosted schema inspection confirmed the selected columns, provider inbox RPC, provider-scoped RLS, and current Realtime publication. Read-only transaction assertions checked own-provider relationship access and foreign provider/profile/message/assignment/feedback/inbox denial where existing rows were available; the transaction was rolled back. No messages or existing policies changed. The archive feature adds a nullable per-participant cursor and UPDATE permission only on that new column. `Web_App/supabase/tests/provider_conversation_archive.sql` passed against the hosted database: own archive/restore, unchanged read/star state, and foreign-provider/unrelated-identity denial. Its metadata writes were rolled back. Identity reassignment remains denied at the column grant level.

## Remaining acceptance checks

These require devices/build accounts or authenticated provider/patient test sessions and have not been established by browser fixtures:

- Install compiled iOS and Android development builds, including tablet/rotation and large accessibility text.
- Test Face ID, Touch ID, Android biometrics, passcode-only devices, cancellation, lockout, backgrounding during the system prompt, and cold session restoration. Confirm foreground refresh after a long background interval.
- Verify keyboard avoidance with real Android and iOS keyboards, particularly landscape, small screens, and multiline drafts.
- Verify SecureStore on physical devices, including a large real session, relaunch, sign-out, and credential deletion. Browser tests use in-memory storage.
- With designated test accounts, verify web edits appear on provider mobile; patient feedback appears in both provider clients; messages travel between patient and provider devices; and unread/starred state converges across provider clients.
- Verify live password/MFA authentication, token refresh/expiry, recovery through the provider website, offline/reconnect behavior, and runtime RLS denial for a second provider using actual client sessions.
- Configure EAS project ownership, public environment values, Apple/Android signing, and internal distribution before producing installable releases. No store publication has been performed.


## Archive verification details

The current migration history contains `20261111051500_provider_message_archiving` and `20261111051640_provider_message_archive_permissions`. The second migration preserves existing column-level UPDATE restrictions and grants only `archived_through_at`.

Archive comparisons retain PostgreSQL microsecond precision. Empty threads use the Unix epoch cursor. Backend state-read failures surface as errors rather than silently showing archived threads in the inbox.

Security Advisor results matched the pre-change baseline; this feature introduced no new finding. Existing findings remain: [two private tables with RLS and no policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [35 authenticated SECURITY DEFINER RPCs](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Physical Android/iOS swipe, vertical-scroll interaction, and TalkBack/VoiceOver archive actions still require device verification. Browser touch simulation and native JavaScript exports do not establish physical-device behavior.

## Saved-routine scheduling verification

The hosted `20261111174617_provider_quick_routine_replacement` migration is applied. `Web_App/supabase/tests/provider_quick_routine_replacement.sql` passed with all test writes rolled back. The authenticated-role checks cover atomic replacement and removal, rollback on failed replacement, stale previews and versions, replay identity, original snapshot retention, receipt forgery denial, foreign identity isolation and protection of started care. The public RPC delegates to a private implementation, with own-provider SELECT-only receipt access. Security Advisor findings remained at the documented baseline.

Mobile scheduling uses the server clinical date and scheduling horizon, previews saved prescriptions, retains confirmed request IDs/tokens/versions in native SecureStore, and checks receipts before explicit retries. Refresh failures after a confirmed save do not resubmit the change. Removal and replacement preserve old snapshots and cancel the old routine's scheduled follow-ups.

The full 120-check browser matrix passed before the final calendar auto-scroll/text refinement. The focused calendar/patient/scheduling checks were rerun across all six layouts for that refinement. Physical-device scheduling, process-restart recovery, calendar scrolling and TalkBack/VoiceOver remain acceptance checks; browser fixtures and rolled-back SQL transactions do not establish actual cross-device sessions.
