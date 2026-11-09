begin;

-- The latest-message lookup uses messages_profile_created_idx. This partial
-- index supports counts of incoming messages after the participant's read cursor.
create index messages_patient_unread_idx
  on public.messages (patient_profile_id, created_at)
  where sender_kind = 'patient';

create function public.get_provider_message_inbox()
returns table (
  patient_profile_id uuid, patient_name text, last_body text,
  last_message_at timestamptz, unread_count bigint, starred boolean
)
language sql stable security invoker set search_path = ''
as $$
  select pp.id, p.name, latest.body, latest.created_at,
    (select count(*) from public.messages unread
     where unread.patient_profile_id = pp.id and unread.sender_kind = 'patient'
       and (state.last_read_at is null or unread.created_at > state.last_read_at)),
    coalesce(state.starred, false)
  from public.provider_patient_profiles pp
  join public.patients p on p.id = pp.patient_id
  left join public.message_thread_state state
    on state.patient_profile_id = pp.id and state.participant_user_id = (select auth.uid())
  left join lateral (
    select m.body, m.created_at from public.messages m
    where m.patient_profile_id = pp.id
    order by m.created_at desc, m.id desc limit 1
  ) latest on true
  where pp.provider_id = (select auth.uid())
  order by latest.created_at desc nulls last, p.name, pp.id;
$$;

revoke all on function public.get_provider_message_inbox() from public, anon;
grant execute on function public.get_provider_message_inbox() to authenticated;
comment on function public.get_provider_message_inbox() is
  'Provider-owned inbox summaries and unread counts, including empty relationships, without transferring message history. Existing row-level policies remain in effect.';
notify pgrst, 'reload schema';
commit;
