-- Patient-owned Expo push tokens for routine update alerts.
-- This is additive and does not grant patients access to clinical tables.
begin;

create table public.patient_push_tokens (
  expo_push_token text primary key check (expo_push_token like 'ExponentPushToken[%'
    or expo_push_token like 'ExpoPushToken[%'),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

alter table public.patient_push_tokens enable row level security;
revoke all on public.patient_push_tokens from public, anon;
grant select, insert, update, delete on public.patient_push_tokens to authenticated;

create policy "Patients manage their own push tokens"
on public.patient_push_tokens
for all to authenticated
using (
  auth_user_id = (select auth.uid())
  and exists (select 1 from public.patients p where p.auth_user_id = (select auth.uid()))
)
with check (
  auth_user_id = (select auth.uid())
  and exists (select 1 from public.patients p where p.auth_user_id = (select auth.uid()))
);

create index patient_push_tokens_auth_user_id_idx
  on public.patient_push_tokens(auth_user_id);

comment on table public.patient_push_tokens is
  'Expo push tokens keyed to a patient Supabase Auth account. Push content must not include patient or routine details.';

commit;
