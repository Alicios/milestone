-- SCRUM-92: retain both deployed contracts, including the legacy name-only RPC.
-- Review live definitions against the documented baseline before deployment.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
  if to_regprocedure('public.create_patient(text)') is null
     or to_regprocedure('public.create_patient(text,text,text)') is null then
    raise exception 'SCRUM-92 expects both deployed create_patient overloads';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_patient'
      and (p.oid not in ('public.create_patient(text)'::regprocedure,
                        'public.create_patient(text,text,text)'::regprocedure)
           or not p.prosecdef or p.prorettype <> 'uuid'::regtype
           or pg_get_userbyid(p.proowner) in ('anon', 'authenticated', 'authenticator'))
  ) then
    raise exception 'Unexpected create_patient signature or security; reconcile before deployment';
  end if;
  -- The supplied hosted findings describe behavior, not full function bodies.
  -- Accept the repository baselines or this migration's hardened bodies only;
  -- never overwrite additional hosted validation/workflow logic silently.
  if exists (
    select 1 from pg_proc p
    where p.oid in ('public.create_patient(text)'::regprocedure,
                    'public.create_patient(text,text,text)'::regprocedure)
      and encode(sha256(convert_to(btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g')), 'UTF8')), 'hex')
        not in (
          '10feacff67957d9628e45baa90c39cc0cd257c6830ad905f143e35dca4b55e37', -- legacy baseline
          '6b85dfb9e60ac0c841bcb30dca557afce8200f1ebf18ea37005bd50fa0aded1b', -- current baseline
          '08f6cce93c0ad3a806ef3bf6121bc671df193f147ccf01d37d3814acf9130c91', -- hardened legacy
          '1eb89344482c7d5ae9b118da1a91160c2da3bd467c5a748fea1b4b3edbf04220'  -- hardened current
        )
  ) then
    raise exception 'create_patient body drift: compare live definitions before deployment; do not bypass this check';
  end if;
end;
$preflight$;

create or replace function public.create_patient(patient_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_provider uuid := auth.uid();
  new_patient_id uuid;
begin
  if current_provider is null then
    raise exception 'Sign in before creating a patient' using errcode = '42501';
  end if;
  if not exists (select 1 from public.providers where id = current_provider) then
    raise exception 'A provider account is required to create a patient' using errcode = '42501';
  end if;
  if nullif(btrim(patient_name), '') is null then
    raise exception 'Patient name is required' using errcode = '22023';
  end if;
  insert into public.patients (name)
  values (btrim(patient_name)) returning id into new_patient_id;
  insert into public.provider_patient_profiles (provider_id, patient_id)
  values (current_provider, new_patient_id);
  return new_patient_id;
end;
$function$;

create or replace function public.create_patient(
  patient_name text, patient_phone text, patient_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_provider uuid := auth.uid();
  new_patient_id uuid;
begin
  if current_provider is null then
    raise exception 'Sign in before creating a patient' using errcode = '42501';
  end if;
  if not exists (select 1 from public.providers where id = current_provider) then
    raise exception 'A provider account is required to create a patient' using errcode = '42501';
  end if;
  if nullif(btrim(patient_name), '') is null then
    raise exception 'Patient name is required' using errcode = '22023';
  end if;
  insert into public.patients (name, phone, email, care_status)
  values (btrim(patient_name), nullif(btrim(patient_phone), ''),
          nullif(btrim(patient_email), ''), 'pending')
  returning id into new_patient_id;
  insert into public.provider_patient_profiles (provider_id, patient_id)
  values (current_provider, new_patient_id);
  return new_patient_id;
end;
$function$;

-- CREATE OR REPLACE preserves the existing owner and other explicit ACLs.
revoke all on function public.create_patient(text), public.create_patient(text,text,text)
  from public, anon;
grant execute on function public.create_patient(text), public.create_patient(text,text,text)
  to authenticated;
notify pgrst, 'reload schema';
commit;
