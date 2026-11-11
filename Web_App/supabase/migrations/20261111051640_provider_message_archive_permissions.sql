begin;

-- The table intentionally grants UPDATE per column, not for the entire row.
-- Extend that existing grant only for the new archive cursor. RLS still checks
-- both participant identity and ownership of the provider-patient relationship.
grant update (archived_through_at) on public.message_thread_state to authenticated;

notify pgrst, 'reload schema';
commit;
