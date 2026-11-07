# Milestone Provider Web App

Milestone is a physical-therapy organizational tool for providers. It helps care teams create, assign, and manage exercise routines while coordinating patient care between visits.

## Product scope

Providers use Milestone to enroll patients, organize personalized exercise routines, assign routines to specific days, and keep patient progress and communication in one workspace. This reduces the need for paperwork, in-person-only coordination, and disconnected communication such as email.

The broader Milestone product will also include a patient mobile app. Patients will use their provider-created accounts to see which routines are assigned for each day and follow guidance for completing the exercises correctly. The patient mobile app is product scope, but it is not implemented in this web prototype.

## Current implementation

This repository contains the provider-facing web front end, built with:

- React 19 and TypeScript
- Vite
- Material UI and Emotion
- React Router

The current implementation is a provider-facing prototype backed by Supabase Auth and database records for provider profiles, patients, routines, dated routine assignments, assignment follow-ups, and text messages. Other dashboard summary metrics remain local prototype data.

## Getting started

### Prerequisites

- Node.js 20 or newer
- npm

### Install dependencies

```bash
npm install
```

### Start the development server

Before starting, copy `.env.example` to `.env.local` and set your Supabase project URL and publishable key. The local environment file is ignored by Git. Restart Vite after changing these values, and configure the same variables in your deployment environment before building.

This is a Vite React app, so environment variables use the `VITE_` prefix. The shared client persists and refreshes Supabase sessions in the browser. Provider and patient data access lives in `src/lib/supabaseData.ts`.

Only use a publishable key in the browser configuration, never a secret or `service_role` key. Database access must be protected by appropriate Row Level Security policies before connecting application data.

```bash
npm run dev
```

Open the local URL shown by Vite, typically `http://localhost:3000`.

Patient invitation and setup correction endpoints also run under `npm run dev`.
With only the project URL and publishable key configured, those endpoints
forward the signed-in provider's session to the project's `patient-onboarding`
Supabase Edge Function. The function uses its built-in server credentials and
verifies the provider and active patient relationship. Local code generation
does not require copying an admin key into `.env.local`.

If `SUPABASE_SERVICE_ROLE_KEY` is configured, the API executes the same shared
onboarding operations directly on the local/deployment server. Never give this
key a `VITE_` prefix or include it in browser code. Deploy the Edge Function
from `supabase/functions/patient-onboarding` when changing the shared backend.

## Available routes

### Public routes

- `/` — Provider-focused homepage
- `/login` — Mock provider login
- `/register` — Mock provider account creation

### Protected provider routes

- `/dashboard` — Provider patient dashboard
- `/dashboard/patients` — Patient management view
- `/dashboard/patients/new` — Save a patient and generate their app login code
- `/dashboard/patients/:patientId/setup` — Correct onboarding name/email and generate a replacement login code
- `/dashboard/patients/:patientId` — Individual patient overview, weekly routines, and patient actions
- `/dashboard/routines` — Exercise routine management
- `/dashboard/appointments` — Appointment placeholder
- `/dashboard/messages` — Persisted provider-to-patient text messaging
- `/dashboard/profile` — Provider profile
- `/dashboard/settings` — Provider settings

Routes under the dashboard require an active Supabase authentication session.

The dashboard's Patient setup box lists patients who have not yet signed in.
Account creation alone does not complete setup. Email corrections synchronize
the linked sign-in account and clear the previous displayed code; generating a
replacement code is a separate action. Codes generated on patient care and
setup pages are displayed for the provider to relay directly, without email.
New-patient signup emails its code through Resend using the same code displayed
to the provider. Set
`RESEND_API_KEY` and `PATIENT_EMAIL_FROM` (a sender on a verified Resend domain)
in the Supabase Edge Function secrets when using the hosted function, or in
`.env.local` and the deployment's server environment when using a local server
key. Restart local Vite after changing local values. None of
these server secrets should have a `VITE_` prefix. If email is unavailable,
the UI warns the provider to relay the saved code directly. An accepted email
request does not guarantee inbox delivery.

Focused verification:

```bash
node --test tests/patientOnboardingServer.test.mjs tests/patientCreation.test.mjs
npx playwright test tests/browser/patientSetup.spec.mjs tests/browser/patientOnboarding.spec.mjs
```

With the local server and server credentials configured, run
`node scripts/verify-patient-onboarding.mjs` for real Auth/API verification using
disposable synthetic accounts. It checks corrected-email sign-in, old-code
rejection, name-only edits, collisions and setup completion, then removes the
test accounts and patient. Database-only checks in
`supabase/tests/patient_onboarding.sql` must run inside a transaction followed by
`ROLLBACK`.

## Demo authentication

Registration and login use Supabase Auth. If email confirmation is enabled in the Supabase project, the provider must confirm the email before signing in.

## Development commands

Run TypeScript checking:

```bash
npm run lint
```

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Prototype limitations

- Some dashboard summary data remains local mock data; the message inbox and its unread shortcut count use Supabase.
- The initial message history is seeded from twelve sample texts. Sample image attachments are not stored, and patient accounts cannot send messages until trusted patient authentication is implemented.
- Provider profile fields and patient identities/statuses are persisted through Supabase.
- Provider routine templates, ordered exercises, dated patient assignments, immutable assignment snapshots, and assignment follow-ups are persisted through Supabase.
- Session notes are marked “Coming Soon” and are not implemented.
- Authentication and account creation require the Supabase Auth configuration.
- The standalone Appointments route remains a placeholder; routine follow-ups are managed from the patient overview.
- The patient mobile app and provider-to-patient account provisioning backend are not included in this repository.
- Do not enter real protected health information into the prototype.

## Project structure

```text
src/
├── auth/          Mock authentication context
├── components/    Shared layout, branding, dialogs, and route guards
├── data/          Local mock patients, routines, and dashboard data
├── pages/         Public and protected route views
├── App.tsx        Router and route definitions
├── main.tsx       React entry point and theme setup
└── theme.ts       Material UI theme configuration
public/            Static images and other public assets
```
