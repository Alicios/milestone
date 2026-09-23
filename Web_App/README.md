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

The current implementation is a front-end prototype. It uses local mock data and mock authentication only. There is no backend, database, API integration, or real patient information.

## Getting started

### Prerequisites

- Node.js 20 or newer
- npm

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

Open the local URL shown by Vite, typically `http://localhost:3000`.

## Available routes

### Public routes

- `/` — Provider-focused homepage
- `/login` — Mock provider login
- `/register` — Mock provider account creation

### Protected provider routes

- `/dashboard` — Provider patient dashboard
- `/dashboard/patients` — Patient management view
- `/dashboard/patients/new` — Add a pending patient locally
- `/dashboard/routines` — Exercise routine management
- `/dashboard/appointments` — Appointment placeholder
- `/dashboard/messages` — Patient messaging prototype
- `/dashboard/profile` — Provider profile
- `/dashboard/settings` — Provider settings

Routes under the dashboard require the mock authentication state.

## Demo authentication

The login form is prefilled for the prototype. Any password with at least six characters authenticates successfully. The registration form creates a mock provider account and signs the provider in immediately. This is mock authentication and must be replaced with a secure backend authentication flow before real patient information is used.

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

- Patient, routine, dashboard, and message data are local mock data.
- Changes are held in front-end state and are not persisted to a server.
- Authentication and account creation do not connect to a real service.
- Appointment functionality is currently represented by a placeholder route.
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
