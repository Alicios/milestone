-- Matches the live routines schema; does not require archive/timestamp columns.
-- Assignment foreign keys remain RESTRICT to preserve patient history.
begin;
create or replace function public.delete_routine(p_routine_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  if auth.uid() is null then
    raise exception 'Sign in before deleting a routine' using errcode = '42501';
  end if;
  delete from public.routines where id = p_routine_id and provider_id = auth.uid();
  if not found then
    raise exception 'Routine not found' using errcode = 'P0002';
  end if;
end;
$function$;
revoke all on function public.delete_routine(uuid) from public, anon;
grant execute on function public.delete_routine(uuid) to authenticated;
commit;
