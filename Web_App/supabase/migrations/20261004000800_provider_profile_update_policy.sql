-- Allow an authenticated provider to update only their own provider profile.
begin;

alter table public.providers enable row level security;

revoke all on public.providers from public, anon;
grant select, update on public.providers to authenticated;

drop policy if exists "Providers read own profile" on public.providers;
create policy "Providers read own profile"
on public.providers for select to authenticated
using (id = (select auth.uid()));

drop policy if exists "Providers update own profile" on public.providers;
create policy "Providers update own profile"
on public.providers for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

commit;
