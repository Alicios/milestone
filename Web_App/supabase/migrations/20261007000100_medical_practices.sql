-- Normalize provider practice selection and retire legacy specialty and
-- department text fields. Apply after the existing 20261006 migrations.
begin;

create table public.medical_practices (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  description text not null check (btrim(description) <> '')
);

insert into public.medical_practices (name, description)
values
  ('Physical Therapy', 'Rehabilitation services that improve movement, strength, and function.'),
  ('Occupational Therapy', 'Therapeutic services that support daily activities and independent living.'),
  ('Sports Medicine', 'Care focused on preventing, diagnosing, and treating activity-related injuries.'),
  ('Orthopedics', 'Musculoskeletal care for bones, joints, muscles, ligaments, and tendons.'),
  ('Neurological Rehabilitation', 'Rehabilitation supporting function after neurological illness or injury.'),
  ('Pediatric Therapy', 'Therapy services tailored to children and their developmental needs.'),
  ('Cardiopulmonary Rehabilitation', 'Rehabilitation supporting heart and lung health, endurance, and recovery.');

alter table public.providers
  add column medical_practice_id uuid references public.medical_practices(id) on delete restrict;

-- Preserve a definite existing selection before retiring the source column.
update public.providers as provider
set medical_practice_id = practice.id
from public.medical_practices as practice
where provider.department = practice.name;

alter table public.medical_practices enable row level security;
revoke all on public.medical_practices from public;
grant select on public.medical_practices to anon, authenticated;
grant all on public.medical_practices to service_role;

create policy "Anyone can view medical practices"
on public.medical_practices for select to anon, authenticated
using (true);

-- A new provider must select one of the seeded practices at registration.
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
  provider_title text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'professional_title'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'role'), ''),
    'Physical Therapist'
  );
  selected_medical_practice_id uuid := nullif(
    btrim(new.raw_user_meta_data ->> 'medical_practice_id'), ''
  )::uuid;
begin
  if selected_medical_practice_id is null then
    raise exception 'Select a medical practice before creating a provider account'
      using errcode = '22023';
  end if;

  insert into public.providers (
    id, name, professional_title, initials, contact_email, medical_practice_id
  )
  values (
    new.id,
    full_name,
    provider_title,
    upper(left(full_name, 1)) ||
      upper(coalesce(nullif(left(split_part(full_name, ' ', 2), 1), ''))),
    coalesce(new.email, ''),
    selected_medical_practice_id
  );
  return new;
end;
$function$;

alter table public.providers
  drop column department,
  drop column specialty;

comment on table public.medical_practices is
  'Reference list of clinical practices. A provider may select one practice.';
comment on column public.providers.medical_practice_id is
  'Selected medical practice for the provider. Existing providers may be unassigned until they choose one.';

commit;
