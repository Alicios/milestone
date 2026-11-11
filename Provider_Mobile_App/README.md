# Milestone Provider

A separate Expo / React Native companion for existing Milestone providers. Supports iOS and Android phones and tablets, with a browser preview for development. The patient app remains in `Mobile_App/milestone`; this app uses the same Supabase project and provider accounts as `Web_App`.

## Run locally

Requires Node 22.13+ and npm.

```powershell
cd C:\Users\hasee\source\milestone\Provider_Mobile_App
npm ci
Copy-Item .env.example .env # Only when .env does not already exist.
# Fill in the existing project's public Supabase URL and publishable client key.
npm start
```

Scan the QR code with the matching SDK 58 Expo Go app. For a LAN connection problem, run `npm start -- --tunnel`. `npm run web` opens the browser preview. This workspace already has an ignored `.env` populated from the web app's existing public connection settings.

Only public client settings belong in `EXPO_PUBLIC_*`. Never add a service-role or secret key. The legacy `EXPO_PUBLIC_SUPABASE_ANON_KEY` name is also accepted. Optionally set `EXPO_PUBLIC_PROVIDER_WEB_URL` to the HTTPS provider website to enable account-management links. Existing registration, recovery, and MFA enrollment remain on that website.

## Included workflows

- Patients: search active patients; inspect a separate read-only archive; view existing personal and care details.
- Routines: Monday–Sunday week navigation; saved assignment/exercise prescriptions; shared web status rules; patient routine comments and exercise pain/feeling/explanations with report times.
- Messages: provider inbox, unread counts, starred threads, history, text sends, and read state shared with the website. Failed sends preserve the draft; retry is explicit. Message limits count Unicode characters, up to 4,000 after trimming.
- Account: provider profile, system/light/dark appearance, manual lock, and sign-out on this device. Appearance resets when the app process restarts.

Care-plan editing, onboarding, discharge/reinstatement, push notifications, message attachments, appointment management, and offline care storage are outside this release. The app does not classify pain scores as critical or infer completion from feedback.

## Authentication and local data

Email/password authentication verifies the user with Supabase, checks assurance requirements, completes enrolled TOTP MFA, and loads the user's provider membership before mounting the workspace. Missing assurance information, failed profile lookup, and expired sessions do not grant care access.

Native sessions use a chunked SecureStore adapter. Generation manifests keep the previous committed session intact if a write fails. No unencrypted fallback is used. Provider data and drafts exist only in memory and are discarded when the workspace locks or signs out. Browser previews keep sessions in memory and require sign-in after reload.

The workspace locks after cold restoration or leaving the foreground. Unlock uses device authentication with device-passcode fallback. Devices without enrolled authentication, and browser previews, require provider sign-in instead. Cancellation keeps the workspace locked. An inactive overlay covers care content. A durable sign-out marker blocks restoration after partially failed credential cleanup; failed sign-out offers a retry.

The app refreshes care data on screen focus, unlock, and pull-to-refresh. Messages use Realtime plus 15-second foreground polling. The current backend publishes `messages`; unread/starred changes on another client are picked up by polling. RLS remains the authorization boundary; relationship IDs, rather than patient IDs, identify assignments and conversations. No schema migration or server secret is required.

## Native development and internal builds

Face ID requires an iOS development build; Expo Go does not validate that path. A QR/Metro startup or JavaScript export is not a compiled or device-tested application.

```powershell
# Local native builds require Android SDK/Java or macOS/Xcode respectively.
npm run android
npm run ios

# Once a development build is installed:
npm run start:dev

# Cloud builds require your Expo account and EAS project configuration.
npx eas-cli build:configure
npx eas-cli build --profile development --platform android
npx eas-cli build --profile development --platform ios
```

`eas.json` includes development and internal preview profiles. Configure the same public environment variables for EAS builds; ignored local `.env` files are not a substitute for cloud environment configuration. iOS internal distribution requires Apple signing and registered test devices. No cloud build or store submission is triggered by this repository.

The bundle/application identifier is `com.milestone.provider`, separate from the patient app. Installation icons reuse the existing Milestone vector mark. To regenerate icons, install a Playwright browser and run `node scripts/generate-icons.cjs` (or set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome).

## Validation

```powershell
npm run typecheck
npm test
npx expo install --check
npm run export

# Browser tests intercept every Supabase request and use synthetic accounts/data.
npx playwright install chromium
npm run test:browser
# Alternatively, with installed Chrome on Windows:
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run test:browser
```

The status parity test compares against the sibling `Web_App` implementation, so keep the monorepo folder layout for that check. The browser matrix covers 320px/390px phones, dark mode, 740×360 landscape, tablet, and wide layouts. Screenshots and traces are written to ignored `test-results`.

See [VALIDATION.md](./VALIDATION.md) for executed evidence and remaining native and authenticated integration checks.
