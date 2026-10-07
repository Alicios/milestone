-- Text conversations currently belong to one provider-patient relationship.
-- The table name leaves room for other conversation types in a later migration.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.provider_patient_profiles(id) on delete restrict,
  sender_kind text not null check (sender_kind in ('provider', 'patient')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  source text not null default 'live' check (source in ('live', 'demo_seed')),
  seed_key text unique,
  constraint messages_seed_source_check check (
    (source = 'demo_seed' and seed_key is not null)
    or (source = 'live' and seed_key is null)
  )
);

create index messages_profile_created_idx
  on public.messages (patient_profile_id, created_at, id);

create table public.message_thread_state (
  patient_profile_id uuid not null references public.provider_patient_profiles(id) on delete cascade,
  participant_user_id uuid not null references auth.users(id) on delete restrict,
  last_read_at timestamptz,
  starred boolean not null default false,
  primary key (patient_profile_id, participant_user_id)
);

-- A provider gets their own inbox state whenever a relationship is created.
create function public.create_provider_message_thread_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  insert into public.message_thread_state (patient_profile_id, participant_user_id)
  values (new.id, new.provider_id);
  return new;
end;
$function$;

revoke execute on function public.create_provider_message_thread_state() from public, anon, authenticated;

create trigger create_provider_message_thread_state
after insert on public.provider_patient_profiles
for each row execute function public.create_provider_message_thread_state();

insert into public.message_thread_state (patient_profile_id, participant_user_id)
select id, provider_id from public.provider_patient_profiles
on conflict do nothing;

alter table public.messages enable row level security;
alter table public.message_thread_state enable row level security;

create policy "Providers read messages for own relationships"
on public.messages for select to authenticated
using (exists (
  select 1 from public.provider_patient_profiles pp
  where pp.id = messages.patient_profile_id
    and pp.provider_id = (select auth.uid())
));

create policy "Providers send own messages"
on public.messages for insert to authenticated
with check (
  sender_kind = 'provider' and source = 'live' and seed_key is null
  and exists (
    select 1 from public.provider_patient_profiles pp
    where pp.id = messages.patient_profile_id
      and pp.provider_id = (select auth.uid())
  )
);

create policy "Providers read own message state"
on public.message_thread_state for select to authenticated
using (
  participant_user_id = (select auth.uid())
  and exists (
    select 1 from public.provider_patient_profiles pp
    where pp.id = message_thread_state.patient_profile_id
      and pp.provider_id = (select auth.uid())
  )
);

create policy "Providers update own message state"
on public.message_thread_state for update to authenticated
using (
  participant_user_id = (select auth.uid())
  and exists (
    select 1 from public.provider_patient_profiles pp
    where pp.id = message_thread_state.patient_profile_id
      and pp.provider_id = (select auth.uid())
  )
)
with check (
  participant_user_id = (select auth.uid())
  and exists (
    select 1 from public.provider_patient_profiles pp
    where pp.id = message_thread_state.patient_profile_id
      and pp.provider_id = (select auth.uid())
  )
);

revoke all on public.messages from public, anon, authenticated;
grant select on public.messages to authenticated;
grant insert (patient_profile_id, sender_kind, body) on public.messages to authenticated;

revoke all on public.message_thread_state from public, anon, authenticated;
grant select on public.message_thread_state to authenticated;
grant update (last_read_at, starred) on public.message_thread_state to authenticated;

comment on table public.messages is
  'Text messages for a provider-patient relationship in the initial messaging phase. Future conversation types require a broader participant model.';
comment on column public.messages.source is
  'Internal provenance: live browser message or imported demo history. Not displayed in the inbox.';
comment on table public.message_thread_state is
  'Read cursor and starred state for one authenticated conversation participant.';

-- Realtime Postgres Changes is RLS-filtered for authenticated subscribers.
alter publication supabase_realtime add table public.messages;
