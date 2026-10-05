-- Apply after migrations 001, 002, and 003.
-- Renames the provider-only account table without changing its rows, policies,
-- primary key, or foreign key to auth.users.
begin;

alter table public.profiles rename to providers;

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
  insert into public.providers (
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

comment on table public.providers is
  'Healthcare provider account attributes. Authentication and administrative access remain separate concerns.';

commit;
