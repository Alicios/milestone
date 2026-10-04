-- Incremental migration for the existing Milestone schema, not a baseline.
-- Run once in the Supabase SQL Editor as the database owner.
begin;

alter table public.profiles
  add column avatar_url text not null default '',
  add column contact_email text not null default '',
  add column phone text not null default '',
  add column specialty text not null default '',
  add column bio text not null default '',
  add column department text not null default '',
  add column facility text not null default '',
  add column office_location text not null default '',
  add column work_phone text not null default '',
  add column work_phone_extension text not null default '',
  add column preferred_contact text not null default 'email',
  add constraint profiles_preferred_contact_check
    check (preferred_contact in ('email', 'phone', 'in-app'));

comment on column public.profiles.contact_email is
  'Professional contact address. Editing this does not change the Supabase Auth login email.';
comment on column public.profiles.role is
  'Editable professional title for display, not an authorization or provider-approval role.';
comment on column public.profiles.avatar_url is
  'Profile image URL. Uploading images to Storage requires a separate integration.';

-- Initialize existing providers without changing their current profile fields.
update public.profiles as p
set contact_email = coalesce(u.email, ''),
    specialty = coalesce(u.raw_user_meta_data ->> 'specialty', '')
from auth.users as u
where u.id = p.id;

-- The existing on_auth_user_created trigger continues to call this function.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  full_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'New user'
  );
begin
  insert into public.profiles (
    id, name, role, initials, contact_email, specialty
  )
  values (
    new.id,
    full_name,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'role'), ''), 'Physical Therapist'),
    upper(left(full_name, 1)) ||
      upper(coalesce(nullif(left(split_part(full_name, ' ', 2), 1), ''), '')),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'specialty', '')
  );
  return new;
end;
$function$;

commit;
