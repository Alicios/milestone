# Milestone patient app

The Expo / React Native patient app for assigned routines, exercise feedback, and provider messaging.

## Expo SDK 58

Use Node.js 22.13 or newer. Install dependencies with `npm ci`, then start Metro with `npx expo start --clear`. Expo Go must support SDK 58; existing native development builds need rebuilding after this upgrade.

The checked-in Android and iOS projects are maintained alongside `app.json`. Run `npx expo prebuild --no-clean` on the appropriate host after changing native app configuration. On macOS, run `npx pod-install` before building iOS to update CocoaPods and `ios/Podfile.lock` for SDK 58. CocoaPods and native device builds were not validated on Windows.

## Exercise demonstrations

Assigned exercises now read the approved shared media through `get_my_routine_assignment_media`. Demonstrations appear in expanded routine information, the exercise preview, and the active exercise screen. Pictures can be enlarged; YouTube/Vimeo videos play inline through WebView, and MP4s use expo-video. Source links and independent retry remain available if a resource fails. Playback closes when leaving its screen or backgrounding the app. Successfully retried media survives navigation within the signed-in patient's session.

The 29 generated illustrations are bundled in `assets/exercise-media`; `lib/exerciseMediaAssets.js` maps their shared paths. Update the approved manifests in Web_App and run `node scripts/prepare-exercise-media.mjs --sync-mobile-assets` there to regenerate the seed SQL and synchronize illustrations. Apply the generated seed only after reviewing media changes. Patient prescriptions, exercise order, dosage, and feedback snapshots are preserved.

Install dependencies and rebuild an existing native development client to include expo-video and react-native-webview; a Metro reload cannot add native modules. The expo-video config plugin uses default foreground-only settings. iOS CocoaPods/builds must be updated on macOS.

Run focused checks with `npm test -- --runInBand __tests__/ExerciseVideo.test.js __tests__/ExerciseDemonstration.test.js __tests__/exerciseDemonstrations.test.js __tests__/patientRoutine.test.js __tests__/assignedExercises.test.js __tests__/assignedRoutineFlow.test.tsx __tests__/App.test.tsx`. Export this app with `node node_modules/expo/bin/cli export --platform all --output-dir .expo/media-final`, then run `node scripts/prepare-exercise-media.mjs` and `node scripts/test-patient-media.mjs ../Mobile_App/milestone/.expo/media-final` from Web_App. Browser checks use fixture patient data and real approved public media. Physical iOS/Android playback and CocoaPods builds still require a device/macOS check.

## Tablets, foldables, and resizable windows

Layouts follow the current app window and safe-area insets, updating on rotation, folding, and split-screen resizing. At 840 points of usable width (adjusted for the system text scale), Home uses two columns and Messages shows the inbox beside the selected conversation. Narrower windows use the existing stacked screens. Forms and exercise screens retain bounded reading widths. Short windows with at least 600 points of readable width place the exercise timer beside instructions and controls. Profile and Settings opens as a centered dialog on larger windows and a bottom sheet on phones or short landscape windows. Conversation drafts, selected providers, profile edits, and active routine state survive size changes while those screens remain open.

iPad support is enabled in `app.json` and both Xcode build configurations. All orientations and iPad multitasking are allowed. Android's main activity explicitly supports resizing and already handles size/orientation configuration changes. Native modals support portrait and landscape. Rebuild the native apps to pick up the device-family and manifest changes; a Metro reload alone cannot update them.

Run the responsive unit checks with `npm test -- --runInBand __tests__/adaptiveLayout.test.js __tests__/App.test.tsx __tests__/assignedRoutineFlow.test.tsx`. Export web with `node node_modules/expo/bin/cli export --platform web --output-dir .expo/adaptive-web`, then run `node tests/browser/adaptive-layout.mjs`. The browser test uses Chrome and the existing `Web_App` Playwright dependency, intercepts all remote traffic with synthetic data, and saves screenshots/results under `.expo/adaptive-check`.

Before a device release, check native iPad portrait/landscape and Split View, Android tablet multi-window, a foldable cover and expanded display, rotation with the keyboard open, large system text, and profile dialogs during resizing. Browser resizing and JavaScript exports do not validate native keyboard behavior or hardware postures. These layouts adapt to window dimensions; they do not consume hinge-position or tabletop-posture APIs, so a separating physical hinge needs device-specific validation before claiming spanning support.

Implementation references: [React Native window dimensions](https://reactnative.dev/docs/usewindowdimensions), [Expo tablet configuration](https://docs.expo.dev/versions/latest/config/app/#supportstablet), and [Android resizability](https://developer.android.com/develop/adaptive-apps/guides/app-orientation-aspect-ratio-resizability).

## Patient accounts and messaging

Configure `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the ignored `.env` using the existing Supabase project URL and public API key. Never put a service-role key in the mobile app. Restart Expo with `npx expo start --clear` after changing configuration.

Patients sign in with their invited email address and a one-time login code. The provider creates the patient with **Create & Invite Patient** or uses **Generate login code** on an existing patient. Give the patient the code directly if email delivery is unavailable or unconfirmed. The account must be linked through `patients.auth_user_id`; entering a phone number or a client patient UUID cannot grant access. There is no sample patient or automatic mock sign-in.

The app restores the Supabase Auth session and loads shared details through `get_my_patient_profile`. Optional photo, preferred name, PIN, and preferences stay on this device under the authenticated user's storage key. Native photos use a separate file per account. Signing out clears the active app, including conversations and drafts. If PIN protection is enabled in Settings, backgrounding locks the dashboard; the PIN supplements account sign-in.

### Messages

Home shows the actual unread count and latest conversation preview. **Messages** lists the patient's linked providers, including conversations without messages. Open a provider to read history or send a reply (up to 4000 characters). A failed send keeps the draft for retry. Incoming messages use Supabase Realtime and reconcile every 15 seconds while active, on reconnect, and when returning to the foreground. Only an open, visible conversation advances the patient's read cursor. History is fetched in pages to avoid the API's row limit. Provider and patient read states remain separate.

Conversations use `provider_patient_profiles.id`, so a shared patient has separate histories with each provider. The database checks the caller's `auth.uid()` against the patient account; patients cannot impersonate providers or read other conversations or clinical notes. Messaging remains available after discharge. Messages persist in Supabase; no messages are seeded or generated by the UI.

The additive migration is `../../Web_App/supabase/migrations/20261027035220_functional_patient_messaging.sql`. It adds the patient inbox/read RPCs and patient message SELECT policy for Realtime, backfills missing thread state, deletes only messages marked `source = 'demo_seed'`, and removes the temporary anonymous patient/routine read policies. Existing live messages are retained. It builds on the existing patient-account and prescription RPCs. The migration was applied to the configured project; do not rerun it manually on the same database.

### Database routines

The authenticated patient RPCs load the first scheduled assignment for the device's local date and its saved exercise prescription snapshots. Cancelled assignments are excluded. Without an assignment, Home and Messages remain available and Routines shows `No routines today`. A routine loading error also leaves navigation available. Exercise completion remains local to this session.

### Verification

Run `npm test -- --runInBand` for account, PIN, profile, routine, and messaging regressions. `../../Web_App/supabase/tests/messaging.sql` checks real database persistence, both participants' access, validation, unread state, and isolation inside a transaction that rolls back all test writes. It needs an existing invited patient with a linked provider.

For browser integration, export this app with `node node_modules/expo/bin/cli export --platform web --output-dir .messaging-work/web`, build `Web_App`, then run `node tests/browser/messaging.mjs` from this folder. This uses Chrome and the provider app's Playwright dependency. API fixtures exist only in the test process; the apps have no mock fallback. It checks both app surfaces at phone and desktop widths, sign-in, replies, unread state, send failure/retry, and persistence across reloads. Physical Android/iOS keyboard and background behavior still need a device check.

### Profile and Settings panel

Tap the avatar on the dashboard or routine page to open the sliding bottom panel. Shared name, email, phone, primary concern, treatment focus, start of care, and care status are read-only and managed through **Edit patient details** on the provider web patient overview. They refresh after setup, whenever the profile opens, on returning to the foreground, or with **Refresh patient details**. Failed refreshes retain the last loaded values and offer retry. Blank database fields display `Not provided`.

Patients can still save local changes to their photo and preferred name. Unsaved local drafts survive database refreshes, tab switches, and PIN locking. Closing a modified draft asks whether to discard it. Photo, preferred name, birth date, PIN, and preferences are not shared database fields.

Settings offers PIN protection (the current PIN is required to change or disable it), Light/Dark/Follow device appearance, and mock exercise reminders. Appearance applies throughout the app and defaults to Follow device; dark colors match the web app. Reminders default to off, all weekdays selected, at `09:00` in device-local time. They only preview preferences and never schedule notifications or request notification access.

`PatientSessionProvider` owns the authenticated profile, local PIN, and preferences. Updates retain the current routine and serialize account-specific local storage writes. Existing saved settings receive default appearance/reminder preferences. Storage errors show a warning while the app continues in memory.

## Run and verify locally

```powershell
npm start
# Browser preview:
npm run web
# Source checks:
npm run lint
npm run typecheck
npm test -- --runInBand
# Production JavaScript bundles for all platforms:
node node_modules/expo/bin/cli export --platform all --output-dir .expo/client-review
# Responsive and feedback checks against that bundle, using installed Chrome:
node tests/browser/adaptive-layout.mjs .expo/client-review
node tests/browser/exercise-review.mjs .expo/client-review
```

Use `npm run android` for a native Android development build. iOS development builds require macOS, Xcode, and CocoaPods. A JavaScript bundle export does not compile or install a native app.

## Optional PIN lock

Patients can enable a four-digit PIN in Profile and Settings after account sign-in. That patient-chosen PIN locks the app when backgrounded and pauses exercise timers. There is no shared default PIN or password and no biometric unlock in the current patient sign-in screen. Signing out returns to account sign-in.

## Hidden LeTeam selector

While unlocked, hold the bottom **Home** button for three seconds to reveal the
easter egg. Select either LeBron image, or tap the large image to flip between
them. Use **Play sound** / **Pause sound** for the same clip as the web app.
On phones, the large image tilts with the accelerometer. Its opening position is
the neutral angle; rotating the screen recalibrates it. Motion is smoothed and
limited to 12 degrees. Both images support tilt. Reduce Motion disables the
effect, and closing the selector or backgrounding stops sensor updates. The
browser preview and devices without an accelerometer keep the image still.
Closing the selector or locking the app stops playback. A normal Home tap keeps
its usual navigation behavior.

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
