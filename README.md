# Milestone

Milestone connects provider care planning, provider mobile review, and patient exercise routines through the same Supabase project.

| App | Folder | Start locally |
| --- | --- | --- |
| Provider website | `Web_App` | `npm run dev` |
| Provider companion | `Provider_Mobile_App` | `npm start` (Expo Go), `npm run web` (browser) |
| Patient mobile | `Mobile_App/Milestone` | `npm start` (Expo Go), `npm run web` (browser) |

Run commands from the corresponding app folder. Use Node.js 22.13 or newer and install each app's locked dependencies with `npm ci` when needed. Keep the repository folder structure: some cross-app regression tests import shared contracts from sibling apps.

Each app has an `.env.example`. Configure its public Supabase connection settings in an ignored `.env`; preserve an existing configured file. The mobile apps require an Expo Go version compatible with SDK 58 or a rebuilt development client. Run simultaneous Expo servers on different ports, for example `npm start -- --port 8081` for patient mobile and `npm start -- --port 8082` for provider mobile.

Providers use their registered email/password and enrolled MFA. Patients use their invited email and one-time login code from their provider. An optional patient PIN supplements that sign-in. There are no shared default account credentials.

## Local checks

From `Web_App`:

```powershell
npm run build
node --test --test-timeout=30000 tests/*.test.mjs
npx playwright test
```

From `Provider_Mobile_App`:

```powershell
npm run typecheck
npm test
npm run test:browser
npm run export -- --output-dir .expo/client-review
```

From `Mobile_App/Milestone`:

```powershell
npm run lint
npm run typecheck
npm test -- --runInBand
node node_modules/expo/bin/cli export --platform all --output-dir .expo/client-review
node tests/browser/adaptive-layout.mjs .expo/client-review
node tests/browser/exercise-review.mjs .expo/client-review
```

Browser checks use installed Google Chrome and synthetic API fixtures. They do not verify hosted persistence, send live messages, or create real accounts. Close any server occupying the test ports (4187 and 8090) before running the web/provider browser suites. Native compilation, device biometrics, native keyboard behavior, and signed distribution require their respective device/platform checks.

See [LOCAL_VALIDATION.md](./LOCAL_VALIDATION.md) for the verified local results, each app's README for workflows, and [FINALIZATION_BACKLOG.md](./FINALIZATION_BACKLOG.md) for the live presentation rehearsal and device acceptance work.
