# Patient routine update push notifications

This feature has three runtime pieces:

1. The patient signs in to the mobile app with the account created from the
   provider invitation email and grants OS notification permission.
2. The mobile app gets an Expo push token and stores it in
   \`public.patient_push_tokens\` under the authenticated patient's own user ID.
3. After the provider saves an edit to an existing routine, the web app calls a
   Vercel endpoint. The endpoint verifies the provider and routine, finds active
   patient assignments for that routine, and sends a generic Expo push.

The push title/body deliberately omit patient names, routine names, exercise
names, and prescription details.

## Deployment checklist

- Apply \`migrations/20261026000100_patient_routine_push_tokens.sql\` through the
  reviewed Supabase migration process. This is additive; it does not open direct
  patient access to clinical tables.
- Keep \`VITE_SUPABASE_URL\` and \`SUPABASE_SERVICE_ROLE_KEY\` in the Vercel API
  environment. Never put the service-role key in the mobile app.
- Create or select the EAS project for the mobile app and set
  \`EXPO_PUBLIC_EAS_PROJECT_ID\` for its build environment.
- Configure APNs credentials for iOS and FCM credentials for Android in EAS.
- Build and install a development or production app. Remote push notifications
  are not supported in Expo Go on Android.

If the migration or server configuration is missing, saving a routine still
succeeds; the provider API logs a notification-request failure without
reversing the routine update.
