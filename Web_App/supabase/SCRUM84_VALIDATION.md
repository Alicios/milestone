# SCRUM-84: provider inbox summaries

The provider inbox now obtains unread counts, the latest message preview, names,
and starred state from `get_provider_message_inbox()`. It no longer downloads
message histories to calculate counts. Empty relationships remain available in
Compose. History is fetched separately for the displayed conversation only;
on narrow screens the list alone fetches no history. Failed or superseded history
requests cannot mark an unseen conversation read. Existing realtime, focus,
reconnect, and polling refreshes continue to update the inbox and open thread.

The database function uses the authenticated provider identity and existing row
policies (`security invoker`). Counts include only patient messages newer than
the provider's read timestamp. A partial index supports these lookups. History
for the open thread retains the existing 500-row paging behavior.

## Deployment order

Apply `migrations/20261109040000_scrum84_provider_message_inbox.sql` through the
team's normal database migration process before deploying the web app.
Review the target schema and apply this single new migration only. The repository
README documents differences in the hosted migration ledger; do not bulk replay
historical migrations or run an unreviewed `supabase db push`. The
migration adds a function and index without changing existing message rows or
patient messaging APIs. Do not fall back to downloading all histories when the
function is unavailable: surface the existing error display instead.

No hosted migration or application deployment was performed for this change.

## Local validation

- `npm run build`
- `npm run test:messages` — summary-only loading, pagination, errors, long
  histories, validation, mobile list behavior, conversation switches and read
  receipts after successful loading.
- `npm run test:messages:db` — temporary local PostgreSQL with synthetic data:
  1,001 unread messages, outgoing exclusion, previews, empty relationships,
  provider isolation, anonymous rejection, read boundaries, starred state,
  new arrivals, and missing state. Uses Homebrew PostgreSQL 17 by default;
  pass `-- --pg-bin /path/to/bin` to override. Never connects to hosted data.

For a deployed smoke test, sign in as a provider, inspect the inbox network
requests, open a conversation, and receive a patient reply. Confirm that inbox
requests return summaries, only the open conversation requests message rows,
and unread counts update after the history is displayed. Repeat on a narrow
screen where the initial list must not mark any conversation read.

## Release checklist and rollback

1. Confirm the target database has the existing message tables, provider/patient
   relationships, read-state policies, and `messages_profile_created_idx` index.
   Confirm the new function and partial index have not already been installed.
2. Apply the single SCRUM-84 migration. It creates the index inside a transaction;
   schedule for a quiet period if the message table is large because index
   creation can temporarily block writes.
3. Validate summaries with authenticated provider accounts (an admin SQL Editor
   session without a provider identity returns no inbox rows).
4. Deploy the web app and perform the smoke test above on desktop and mobile.
5. If the web release must be reverted, redeploy the previous frontend. The new
   function and index are additive and can remain installed. Do not remove them
   while any deployed frontend still calls the summary function.

The local tests use a synthetic schema, not a copy of the hosted database.
Hosted schema verification and the signed-in browser smoke test remain release
steps; neither is claimed by the automated test results.
