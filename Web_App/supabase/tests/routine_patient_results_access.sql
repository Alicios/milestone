-- Read-only access rehearsal; all invalid-write probes are rolled back.
begin;
do $checks$
declare
  target uuid := 'd1c6a599-b207-4b0f-84d8-387409e453ce';
begin
  if not (select relrowsecurity from pg_class where oid = 'public.routine_assignments'::regclass) then
    raise exception 'Assignment RLS must remain enabled';
  end if;
  if has_column_privilege('authenticated', 'public.routine_assignments', 'patient_comment', 'UPDATE')
     or has_column_privilege('anon', 'public.routine_assignments', 'patient_comment', 'UPDATE') then
    raise exception 'Client roles must not gain feedback write privileges';
  end if;
  begin
    update public.routine_assignments set patient_issue_severity = 'unknown' where id = target;
    raise exception 'Invalid issue severity was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.routine_assignments set patient_result_source = 'unknown' where id = target;
    raise exception 'Invalid result source was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.routine_assignments set patient_comment = repeat('x', 4001) where id = target;
    raise exception 'Oversize comment was accepted';
  exception when check_violation then null;
  end;
end;
$checks$;

set local role authenticated;
set local request.jwt.claim.sub = '6acb666a-d294-443e-9f7c-f5478463165d';
do $owner$
begin
  if (select count(*) from public.routine_assignments where id in (
    'd1c6a599-b207-4b0f-84d8-387409e453ce', '147dbaf0-3250-4ed5-a2ee-ca112a8b3b58', '3ca88e1d-235b-4214-94e6-ac090b275be8')) <> 3 then
    raise exception 'Assigning provider cannot read all three results';
  end if;
  perform patient_comment, patient_issue_severity, patient_in_progress, patient_result_source
    from public.routine_assignments where id = 'd1c6a599-b207-4b0f-84d8-387409e453ce';
end;
$owner$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $foreign_user$
begin
  if exists (select 1 from public.routine_assignments where patient_profile_id = '8da61f8b-6980-4c7f-95e7-266ef26b4f48') then
    raise exception 'An unrelated authenticated user can read Frank results';
  end if;
end;
$foreign_user$;

set local role anon;
set local request.jwt.claim.sub = '';
do $anonymous$
begin
  if exists (select 1 from public.routine_assignments where patient_profile_id = '8da61f8b-6980-4c7f-95e7-266ef26b4f48') then
    raise exception 'Anonymous users can read Frank results';
  end if;
end;
$anonymous$;
reset role;
rollback;
select 'Result constraints, owner read, unrelated-user isolation, anonymous isolation and client write restrictions passed' as verification;
