# Local client presentation validation

Verified November 17, 2026 on Windows / PowerShell with Node.js 24.15.0. Base revision: `da6e494f4`, plus the uncommitted fixes in this working tree. Scope: provider web, provider mobile, and patient mobile running locally.

## Fixes

- Provider mobile now derives calendar, filter, and Home warnings from exercise feedback using the same thresholds as provider web. Stored critical reports retain precedence, and feedback does not imply completion.
- Web feedback loading preserves the simulated-data source instead of relabeling demonstration records as patient-entered results.
- New web page navigation starts at the top immediately. Hash anchors and history-return navigation retain their existing behavior.
- Web sign-in and registration start with empty identity fields.
- Ctrl+Z cancels the hidden Windows approval password prompt and restores terminal mode.
- Patient dependencies now match the installed Expo SDK: React Native `0.88.1` and safe-area context `5.11.1`. Removed the unused starter screen package that required the older React Native version; updated the lockfile.
- Patient lint excludes generated exports, native projects, and vendored code. Added repeatable patient type checking and a complete web unit-test command.
- Updated stale regression fixtures for the current editor, invitation flow, message inbox, feedback slider, and required exercise responses. Replaced obsolete setup/default-password documentation.

## Results

| App | Verification | Result |
| --- | --- | --- |
| Provider web | Production build and TypeScript checks | Passed |
| Provider web | Unit tests | 296 passed |
| Provider web | Browser scenarios, including public pages and cross-app feedback | 126 unique scenarios passed across the full run and focused reruns |
| Provider mobile | TypeScript and unit tests | Passed; 53 tests |
| Provider mobile | Responsive browser matrix | 144 existing scenarios plus 12 feedback regression scenarios passed |
| Provider mobile | Expo dependency compatibility and Android/iOS/web exports | Passed |
| Patient mobile | Lint and TypeScript | Passed; lint has 0 errors and 54 existing warnings |
| Patient mobile | Jest | 28 suites / 147 tests passed |
| Patient mobile | Expo dependency compatibility and Android/iOS/web exports | Passed after alignment |
| Patient mobile | Adaptive walkthrough | 106 checks across 10 window sizes; state preserved; no runtime errors |
| Patient mobile | Feedback input/review | 10 light/dark layouts; mouse, touch, keyboard, validation, save and reload passed |
| Patient mobile | Exercise controls/media layout | 10 light/dark layouts; controls visible, media enlargement and compact scrolling passed |
| Patient + web | Messaging walkthrough | Phone and desktop passed: sign-in, send, unread/read state, failure/retry, and reload |

The web full run initially passed 121 scenarios and exposed five stale-fixture failures. After correcting those fixtures, all eight scenarios in the affected files passed, including all five previous failures. None of the four opt-in cross-app feedback scenarios were left skipped in that recheck. The provider's 12 new feedback scenarios passed across all six configured layouts.

Screenshots were inspected for provider patient care, patient Home on phone/tablet, public sign-in, and FAQ. The public-page tests also open all three application preview images and check phone/desktop overflow.

## Reproduce and inspect

Startup and standard commands are in [README.md](./README.md). Local ignored evidence logs include:

- `Web_App/build-review-final.log`, `test-results-unit-final.log`, `browser-review-complete.log`, and `browser-review-recheck.log`.
- `Provider_Mobile_App/unit-review-final.log`, `browser-review-final.log`, `browser-feedback-review.log`, and `export-review-final.log`.
- `Mobile_App/Milestone/jest-review-final.log`, `lint-review-final.log`, `compatibility-review-final.log`, `export-review-final.log`, `adaptive-review-final.log`, `exercise-review-final.log`, and `messaging-review-final.log`.

The cross-app feedback suite requires a freshly exported patient web bundle served locally, plus `MILESTONE_MOBILE_EXPORT_URL` pointing to it. For example, serve `.expo/client-review` from the patient folder on `127.0.0.1:4191`, then run the web browser tests with that environment variable. The messaging walkthrough accepts the patient export path: `node tests/browser/messaging.mjs .expo/client-review` from the patient folder; it uses ports 4191 and 4192.

## Remaining presentation/release checks

All browser data was synthetic and intercepted locally. These results do not establish hosted database persistence, email delivery, RLS behavior, or synchronization between real signed-in devices. No hosted records or migrations were changed.

Android/iOS JavaScript exports passed; native applications were not compiled, installed, or exercised on physical devices. Rebuild existing development clients after the native dependency alignment and refresh CocoaPods on macOS. Verify real keyboard behavior, provider biometrics/app lock, background/resume, accessibility services, and video playback on devices.

The website still identifies Appointments and patient Notes as coming soon. Patient reminders are local preference previews. The web build retains a non-failing large-chunk warning; patient lint warnings are primarily style conventions. These are not production-release sign-offs.

Use [FINALIZATION_BACKLOG.md](./FINALIZATION_BACKLOG.md) for the authorized live-account rehearsal, current demonstration dates, device acceptance, and presentation ownership.
