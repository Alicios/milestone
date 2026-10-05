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
- `/dashboard/patients` — Patients placeholder
- `/dashboard/appointments` — Appointments placeholder
- `/dashboard/messages` — Messages placeholder

## Supabase setup

Login and "Request access" use Supabase. Patients, routines, messages and dashboard metrics are still mock data.

1. Create a project at supabase.com. In Authentication → Providers, keep Email enabled.
2. In the SQL Editor, run [supabase/schema.sql](supabase/schema.sql). It creates `profiles` and `access_requests` with Row Level Security.
3. In Project Settings → API, copy the Project URL and anon/publishable key.
4. Copy `.env.example` to `.env.local` and fill in both values, then restart `npm run dev`.
5. Create a provider account in Authentication → Users → Add user (tick "Auto Confirm User"). To set the display name, add user metadata such as `{"name": "Maya Patel", "role": "Physical Therapist"}`. A `profiles` row is created automatically.
6. Sign in at `/login` with that email and password.

Never put the `service_role` key in this app (`src/`). Access requests can be reviewed in the Supabase Table Editor.

## Approving an access request (creating a login)

Turning a row in `access_requests` into an actual provider login needs Supabase's Admin API, which requires the `service_role` key. That key must never ship to the browser, so this is done with local scripts instead of in the app:

1. In Project Settings → API, copy the `service_role` secret key.
2. Add it to `.env.local` as `SUPABASE_SERVICE_ROLE_KEY=...` (no `VITE_` prefix, so Vite never bundles it into the app).
3. If your `access_requests` table was created before the `status` column existed, run [supabase/migrations/0002_access_requests_status.sql](supabase/migrations/0002_access_requests_status.sql) once in the SQL Editor.
4. List pending requests:
   ```bash
   npm run requests:list
   ```
5. Approve one, creating a confirmed login for that email:
   ```bash
   npm run requests:approve -- someone@example.com
   ```
   This prints a temporary password (or pass your own as a second argument, e.g. `npm run requests:approve -- someone@example.com "TempPass123"`). It creates the Auth user (which auto-creates a `profiles` row via the trigger) and marks the request `approved`. Share the password with the provider out of band and have them sign in at `/login`.

Alternatively, do this by hand in the dashboard: Authentication → Users → Add user, then mark the request approved yourself in the Table Editor.

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
