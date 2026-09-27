-- Run in Supabase Dashboard -> SQL Editor.
-- Patient, routine and message data are still mock data in the web app, so only
-- provider profiles and access requests are stored for now.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  role text not null default 'Physical Therapist',
  initials text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  department text not null,
  notes text,
  status text not null default 'pending', -- 'pending' | 'approved'
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.access_requests enable row level security;

-- Providers can read/update only their own profile.
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Anyone (including signed-out visitors) may submit an access request, but nobody
-- can read or update them through the public API — only the service_role key used
-- by scripts/*.mjs (or the Supabase dashboard) can, since RLS has no select/update
-- policy for anon/authenticated here.
create policy "access_requests_insert_anyone" on public.access_requests
  for insert to anon, authenticated with check (true);

-- Create a profile row automatically whenever a user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  full_name text := coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, name, role, initials)
  values (
    new.id,
    full_name,
    coalesce(new.raw_user_meta_data ->> 'role', 'Physical Therapist'),
    upper(left(full_name, 1)) || upper(coalesce(nullif(left(split_part(full_name, ' ', 2), 1), ''), ''))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
