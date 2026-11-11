begin;

-- A per-participant archive cursor. Existing read/star state and RLS stay intact.
-- Null means inbox. Otherwise a conversation stays archived only while its most
-- recent message is at or before this cursor. Newer activity returns it to inbox.
alter table public.message_thread_state
  add column archived_through_at timestamptz;

comment on column public.message_thread_state.archived_through_at is
  'Last displayed message timestamp included in this participant archive. Null means inbox; newer messages reopen it. Empty conversations use the Unix epoch. Existing participant and relationship RLS governs access.';

notify pgrst, 'reload schema';
commit;
