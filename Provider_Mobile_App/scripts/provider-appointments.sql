-- Provider visits are separate from assigned home exercise routines.
create extension if not exists btree_gist with schema extensions;
create table public.provider_appointments (
  id uuid primary key,
  provider_id uuid not null references public.providers(id),
  patient_profile_id uuid not null references public.provider_patient_profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 300),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint appointment_duration check (ends_at > starts_at and ends_at <= starts_at + interval '8 hours'),
  constraint provider_appointments_no_overlap exclude using gist
    (provider_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status = 'scheduled')
);
create index provider_appointments_upcoming on public.provider_appointments(provider_id, starts_at, id) where status = 'scheduled';
create index provider_appointments_patient on public.provider_appointments(patient_profile_id);
alter table public.provider_appointments enable row level security;
revoke all on public.provider_appointments from anon, authenticated;
grant select, insert on public.provider_appointments to authenticated;
grant update(status) on public.provider_appointments to authenticated;
create policy appointments_read_own on public.provider_appointments for select to authenticated
  using (provider_id = (select auth.uid()));
create policy appointments_create_own on public.provider_appointments for insert to authenticated
  with check (provider_id = (select auth.uid()) and status = 'scheduled' and starts_at > now()
    and exists (select 1 from public.provider_patient_profiles p where p.id = patient_profile_id
      and p.provider_id = (select auth.uid()) and p.discharged_at is null));
create policy appointments_cancel_own on public.provider_appointments for update to authenticated
  using (provider_id = (select auth.uid()))
  with check (provider_id = (select auth.uid()) and status = 'cancelled');
