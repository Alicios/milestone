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

## Demo login

The login form is prefilled for the prototype. Any password with at least six characters will authenticate successfully. This is mock authentication only and must be replaced before using real patient information.

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
