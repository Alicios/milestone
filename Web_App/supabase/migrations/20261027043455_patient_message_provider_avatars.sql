begin;

-- PostgreSQL requires recreating a function when adding a TABLE return column.
-- The argument list and existing output columns stay compatible with clients.
drop function public.get_my_message_inbox();
create function public.get_my_message_inbox()
returns table (
  patient_profile_id uuid, provider_name text, provider_professional_title text,
  last_body text, last_message_at timestamptz, unread_count bigint,
  provider_avatar_url text
)
language sql stable security definer set search_path = ''
as $$
  select pp.id, pr.name, pr.professional_title, latest.body, latest.created_at,
    (select count(*) from public.messages unread
     where unread.patient_profile_id = pp.id and unread.sender_kind = 'provider'
       and (state.last_read_at is null or unread.created_at > state.last_read_at)),
    pr.avatar_url
  from public.provider_patient_profiles pp
  join public.patients p on p.id = pp.patient_id
  join public.providers pr on pr.id = pp.provider_id
  left join public.message_thread_state state
    on state.patient_profile_id = pp.id and state.participant_user_id = (select auth.uid())
  left join lateral (
    select m.body, m.created_at from public.messages m
    where m.patient_profile_id = pp.id order by m.created_at desc, m.id desc limit 1
  ) latest on true
  where p.auth_user_id = (select auth.uid())
  order by latest.created_at desc nulls last, pr.name, pp.id;
$$;

revoke all on function public.get_my_message_inbox() from public, anon;
grant execute on function public.get_my_message_inbox() to authenticated;
comment on function public.get_my_message_inbox() is
  'Patient-owned inbox summaries with assigned provider photos; includes empty and discharged relationships, excludes provider clinical notes.';
notify pgrst, 'reload schema';
commit;
