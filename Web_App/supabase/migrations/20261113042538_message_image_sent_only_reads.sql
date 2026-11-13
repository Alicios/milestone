-- A participant may read a partner's image only after a message references it.
-- The uploader may read their own object while composing or retrying a send.
create or replace function milestone_messaging.can_access_image(p_path text, p_uploader_only boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z0-9-]{12,64}\.(jpg|png|webp)$'
    and (not p_uploader_only or split_part(p_path, '/', 2) = (select auth.uid())::text)
    and exists (
      select 1 from public.provider_patient_profiles pp
      join public.patients p on p.id = pp.patient_id
      where pp.id::text = split_part(p_path, '/', 1)
        and (pp.provider_id = (select auth.uid()) or p.auth_user_id = (select auth.uid()))
    )
    and (
      split_part(p_path, '/', 2) = (select auth.uid())::text
      or (not p_uploader_only and exists (
        select 1 from public.messages m
        where m.patient_profile_id::text = split_part(p_path, '/', 1)
          and m.image_path = p_path
      ))
    );
$$;
