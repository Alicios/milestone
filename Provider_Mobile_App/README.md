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

- Home: the opening screen summarizes active patients, completed routines, and issues from the last seven days. Difficult exercise feedback, pain of 7/10 or higher, and routine issue reports appear under Needs attention. Tap an issue or completion to open that patient on the recorded assignment date. The overview refreshes when returning, on app resume, and periodically while visible.
- Patients: search and sort the patient list; filter by current-week routine status using the same rules as the website; inspect a separate read-only archive. Tap any patient row to open their care details and routines. No patient-count summary is shown. Patient details are collapsed by default, with primary concern always visible.
- Routines: assign a saved routine to an empty day, replace an unstarted routine with another saved routine, or remove it after confirmation. Prescription previews show the selected exercises and dosage. Colored calendar indicators distinguish completed, completed with issues, in progress, missed, assigned, and critical issues. Monday–Sunday week navigation; saved assignment/exercise prescriptions; shared web status rules; patient routine comments and exercise pain/feeling/explanations with report times.
- Messages: provider inbox, unread counts, starred threads, history, text sends, and read state shared with the website. Swipe a conversation left or right to archive it; Undo is available for seven seconds. Open Archived to read or restore archived conversations. New message activity returns a conversation to the inbox. An explicit archive/restore button and screen-reader actions provide alternatives to swiping. Failed sends preserve the draft; retry is explicit. Message limits count Unicode characters, up to 4,000 after trimming.
- Dock: Home, Patients, Messages, and the provider photo (or initials). The upward-opening photo menu contains Profile, App settings, Lock workspace, and Sign out. Selected dock icons and labels use orange in both themes. The dock remains available on patient and conversation pages and hides while the keyboard is open. Profile and App settings are separate screens; appearance resets when the app process restarts.

Saved-routine exercise editing, onboarding, discharge/reinstatement, push notifications, message attachments, appointment management, and offline care storage are outside this release. The app does not classify pain scores as critical or infer completion from feedback.

The requested Frank Home demonstration adds three historical completed sessions with six exercise responses, including one difficult Feet-Together Balance response. All three assignments carry the `demo` source and appear as Simulated result. The guarded, repeatable data script is [seed-frank-home-demo.sql](./scripts/seed-frank-home-demo.sql); it checks existing-record fingerprints and never overwrites previous results.

## Authentication and local data

Email/password authentication verifies the user with Supabase, checks assurance requirements, completes enrolled TOTP MFA, and loads the user's provider membership before mounting the workspace. Missing assurance information, failed profile lookup, and expired sessions do not grant care access.

Native sessions use a chunked SecureStore adapter. Generation manifests keep the previous committed session intact if a write fails. No unencrypted fallback is used. Care details and message drafts exist only in memory and are discarded when the workspace locks or signs out. Confirmed scheduling requests retain only IDs, date, preview token and assignment version in encrypted native storage until reconciled; records are scoped to the provider and care relationship. They contain no names, clinical notes or exercise prescriptions. Browser recovery stays in memory. Browser previews keep sessions in memory and require sign-in after reload.

The workspace locks after cold restoration or leaving the foreground. Unlock uses device authentication with device-passcode fallback. Devices without enrolled authentication, and browser previews, require provider sign-in instead. Cancellation keeps the workspace locked. An inactive overlay covers care content. A durable sign-out marker blocks restoration after partially failed credential cleanup; failed sign-out offers a retry.

The app refreshes care data on screen focus, unlock, and pull-to-refresh. Messages use Realtime plus 15-second foreground polling. The current backend publishes `messages`; unread/starred changes on another client are picked up by polling. RLS remains the authorization boundary; relationship IDs, rather than patient IDs, identify assignments and conversations. Conversation archiving uses the `archived_through_at` column and its narrow UPDATE grant, added by the two `provider_message_archiv*` migrations in `Web_App/supabase/migrations`. These are applied to the current hosted project; apply the migrations when configuring another database. No server secret is required.

Archive state is per provider participant and persists across sessions. It does not delete messages or change read/starred state. The archive cursor uses the last displayed message timestamp, so an incoming message racing with an archive remains in the inbox. Archived conversations are excluded from the dock unread total until newer activity reopens them. Conversation archiving is separate from patient discharge and the patient archive.

Routine changes use the hosted `20261111174617_provider_quick_routine_replacement` migration. Scheduling follows the server's clinical date, time zone and horizon. Replacement/removal applies only to unstarted current/future assignments with no patient results or feedback. Cancelled snapshots remain in history; existing scheduled follow-ups are cancelled. Assignment changes refresh the saved schedule and become available through the existing web/patient APIs.

A confirmed request is retained before sending. A lost response blocks further changes until its receipt is checked or the same request is explicitly retried. A retry keeps the original UUID, preview token and assignment version; new operations never replace an uncertain request. Replacement cancellation and insertion run in one database transaction, so a failed replacement leaves the original intact.

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
