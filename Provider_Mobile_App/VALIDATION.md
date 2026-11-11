# Provider companion validation

## Executed checks

- TypeScript application checks passed.
- Expo dependency compatibility check passed against SDK 58.
- 20 automated tests passed: web routine-status parity across 90 combinations; calendar boundaries; Unicode message limits; paginated data reads; provider/MFA/session gates; partial feedback failure; chunked storage and fault recovery; device-auth result handling; and sign-out cleanup under storage/network failure.
- Android and iOS Hermes JavaScript exports and web export succeeded. These validate bundling, not compiled native applications.
- 42 browser checks passed across six layouts. Tests exercise real app screens against intercepted synthetic Supabase responses, including patient/archive navigation, weekly routine feedback, failed sends/retry, read/star state, MFA, provider-membership denial, foreground locking, and pending requests after sign-out.
- Rendered phone, tablet, dark, wide, and reduced-height surfaces were inspected. Patient-detail spacing and reduced-height conversation layout were corrected from screenshots.
- Hosted schema inspection confirmed the selected columns, provider inbox RPC, provider-scoped RLS, and current Realtime publication. Read-only transaction assertions checked own-provider relationship access and foreign provider/profile/message/assignment/feedback/inbox denial where existing rows were available; the transaction was rolled back. No data or policies changed.

## Remaining acceptance checks

These require devices/build accounts or authenticated provider/patient test sessions and have not been established by browser fixtures:

- Install compiled iOS and Android development builds, including tablet/rotation and large accessibility text.
- Test Face ID, Touch ID, Android biometrics, passcode-only devices, cancellation, lockout, backgrounding during the system prompt, and cold session restoration. Confirm foreground refresh after a long background interval.
- Verify keyboard avoidance with real Android and iOS keyboards, particularly landscape, small screens, and multiline drafts.
- Verify SecureStore on physical devices, including a large real session, relaunch, sign-out, and credential deletion. Browser tests use in-memory storage.
- With designated test accounts, verify web edits appear on provider mobile; patient feedback appears in both provider clients; messages travel between patient and provider devices; and unread/starred state converges across provider clients.
- Verify live password/MFA authentication, token refresh/expiry, recovery through the provider website, offline/reconnect behavior, and runtime RLS denial for a second provider using actual client sessions.
- Configure EAS project ownership, public environment values, Apple/Android signing, and internal distribution before producing installable releases. No store publication has been performed.
