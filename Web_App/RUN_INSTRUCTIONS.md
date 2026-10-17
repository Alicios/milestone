# Run Instructions

## Prerequisites

- Node.js 20 or newer
- npm

## Install dependencies

From the project directory, run:

```bash
npm install
```

## Start the development server

```bash
npm run dev
```

Open the local URL shown in the terminal, typically:

```text
http://localhost:3000
```

## Available routes

- `/` — Public homepage
- `/login` — Provider login
- `/dashboard` — Protected provider dashboard
- `/dashboard/patients` — Provider patient dashboard
- `/dashboard/appointments` — Appointments placeholder
- `/dashboard/messages` — Messages prototype

## Supabase setup

Login, access requests, provider profiles, patients, routines, dated assignments,
and assignment follow-ups use Supabase. Messages and dashboard summary metrics
remain prototype data.

1. Create a project at supabase.com. In Authentication → Providers, keep Email enabled.
2. For the existing hosted project, have an administrator reconcile the database's migration history with [supabase/migrations](supabase/migrations) before applying any pending changes. Do not replay migrations or run `supabase/schema.sql`; it is the historical bootstrap only. See [supabase/SCHEMA.md](supabase/SCHEMA.md) for the current model.
3. In Project Settings → API, copy the Project URL and anon/publishable key.
4. Copy `.env.example` to `.env.local` and fill in both values, then restart `npm run dev`.
5. Create a provider account in Authentication → Users → Add user (tick "Auto Confirm User"). Include user metadata such as `{"name": "Maya Patel", "professional_title": "Physical Therapist", "medical_practice_id": "<existing-practice-uuid>"}`, replacing the practice placeholder with the UUID of an existing `medical_practices` entry. The signup trigger requires this practice reference and creates a `providers` row automatically. For an existing access request, use the approval workflow below.
6. Sign in at `/login` with that email and password.

Never put the `service_role` key in this app (`src/`). Access requests can be reviewed in the Supabase Table Editor.

## Approving an access request (creating a login)

Turning a row in `access_requests` into an actual provider login needs Supabase's Admin API, which requires the `service_role` key. That key must never ship to the browser, so this is done with local scripts instead of in the app:

1. In Project Settings → API, copy the `service_role` secret key.
2. Add it to `.env.local` as `SUPABASE_SERVICE_ROLE_KEY=...` (no `VITE_` prefix, so Vite never bundles it into the app).
3. Obtain the UUID of the provider's existing `medical_practices` entry from an administrator. The script verifies that it exists and includes it in signup metadata required by the hosted provider trigger. Do not replay migrations: repository and hosted migration histories differ.
4. List pending requests:
   ```bash
   npm run requests:list
   ```
5. In an interactive terminal, approve one, supplying the existing practice UUID:
   ```bash
   npm run requests:approve -- someone@example.com --medical-practice-id <existing-practice-uuid>
   ```
   Replace `<existing-practice-uuid>` with the actual UUID before running the command. Optionally add `--professional-title "Physical Therapist"`; the legacy `--role` alias is still accepted, but not together with `--professional-title`. Otherwise the title uses the request's department.

   Generate and retain a suitable password in your password manager, then enter it twice at the hidden prompts. Nothing you type is echoed. The script does not generate, print, or save passwords, and does not accept password arguments or piped input. Unexpected/duplicate arguments, blank or mismatched passwords, cancellation (Ctrl+C/Ctrl+D), and unavailable input abort before database writes. Invalid arguments and cancelled input are handled before loading administrative credentials. Supabase Auth remains responsible for password-policy enforcement, hashing, and salting; no custom hashing is performed.

   On success, the script creates an email-confirmed Auth user (the trigger creates the matching `providers` row) and marks the request `approved`. Share the password through your secure handoff channel and have the provider sign in at `/login`. This workflow does not send an invitation/reset email or force a password change; the app does not yet implement that flow.

   API/transport failures use fixed messages rather than printing raw responses. If account creation cannot be confirmed, check the Auth user state before retrying. If the account was created but the request update failed, reconcile that request's status without recreating the account. These are separate operations, not one database transaction.

The script is local administrative tooling only; never invoke it from browser code or publish the administrative key.

Run the isolated approval-script tests with `node --test tests/approveAccessRequest.test.mjs` from `Web_App`. They use synthetic inputs and a mocked client, never load `.env.local`, and never contact Supabase or create real users.

## Verify the project

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
