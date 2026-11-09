-- Confirm provider-owned routine changes against a fresh, server-generated impact.
-- Preserve immutable assignment snapshots by cancelling and replacing only
-- upcoming, not-started assignments. No existing patient rows are rewritten here.
set local lock_timeout = '5s';

alter table public.routines add column archived_at timestamptz;
alter table public.routines add column editor_document jsonb;
alter table public.routine_assignments add column editor_snapshot jsonb;
comment on column public.routines.archived_at is
  'Removed from the provider library; retained as the source of historical prescriptions.';
create index routine_assignments_routine_id_idx on public.routine_assignments(routine_id);

create schema milestone_routine_changes;
revoke all on schema milestone_routine_changes from public, anon, authenticated;
grant usage on schema milestone_routine_changes to authenticated;

create function milestone_routine_changes.save_document(p_routine_id uuid, p_document jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare
  saved_id uuid; entry jsonb; item jsonb; field text; value text; identity uuid;
  saved_list jsonb[] := array[]::jsonb[]; cleaned jsonb; maximum integer;
begin
  if auth.uid() is null or not exists(select 1 from public.providers where id = auth.uid()) then
    raise exception 'Provider sign-in required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_document) is distinct from 'object' or pg_column_size(p_document) > 2097152
    or jsonb_typeof(p_document->'id') is distinct from 'string'
    or (p_document->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_document->'name') is distinct from 'string'
    or length(btrim(p_document->>'name')) not between 1 and 200
    or jsonb_typeof(p_document->'description') is distinct from 'string'
    or length(p_document->>'description') > 8000
    or jsonb_typeof(p_document->'exercises') is distinct from 'array' then
    raise exception 'Supply a routine name, description and exercise list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_document->'exercises') not between 1 and 100 then
    raise exception 'Choose 1 to 100 exercises' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_document->'exercises') e group by e->>'id' having count(*) > 1) then
    raise exception 'Exercise entries need distinct identities' using errcode = '22023';
  end if;
  if p_routine_id is not null then
    perform id from public.routines where id = p_routine_id and provider_id = auth.uid() and archived_at is null for update;
    if not found then raise exception 'Routine not found' using errcode = 'P0002'; end if;
  end if;
  for entry in select * from jsonb_array_elements(p_document->'exercises') loop
    if jsonb_typeof(entry) is distinct from 'object' or jsonb_typeof(entry->'id') is distinct from 'string'
      or length(entry->>'id') not between 1 and 200 or jsonb_typeof(entry->'name') is distinct from 'string'
      or length(btrim(entry->>'name')) not between 1 and 200 then
      raise exception 'Name each exercise' using errcode = '22023';
    end if;
    foreach field in array array['description', 'notes', 'sets', 'repetitions', 'duration', 'rest'] loop
      if jsonb_typeof(entry->field) is distinct from 'string' or length(entry->>field) > 8000 then
        raise exception 'Exercise fields must be text' using errcode = '22023';
      end if;
    end loop;
    foreach field in array array['sets', 'repetitions', 'duration', 'rest'] loop
      value := entry->>field;
      maximum := case field when 'sets' then 20 when 'repetitions' then 500 else 3600 end;
      if value <> '' then
        if value !~ '^[0-9]{1,10}$' then raise exception 'Invalid dosage' using errcode = '22023'; end if;
        if value::numeric not between 1 and maximum then raise exception 'Dosage is outside supported bounds' using errcode = '22023'; end if;
      end if;
    end loop;
    identity := nullif(entry->>'catalogId', '')::uuid;
    if identity is not null then
      perform id from public.exercises where id = identity for share;
      if not found then raise exception 'Catalog exercise is unavailable' using errcode = '22023'; end if;
    end if;
    if jsonb_typeof(entry->'media') is distinct from 'array' then raise exception 'Invalid media list' using errcode = '22023'; end if;
    if jsonb_array_length(entry->'media') > 5 then raise exception 'Too many media items' using errcode = '22023'; end if;
    for item in select * from jsonb_array_elements(entry->'media') loop
      if jsonb_typeof(item) is distinct from 'object'
        or coalesce(item->>'kind', '') not in ('image', 'uploaded-video', 'youtube', 'vimeo', 'video-link', 'image-link')
        or jsonb_typeof(item->'id') is distinct from 'string' or length(item->>'id') not between 1 and 200
        or jsonb_typeof(item->'name') is distinct from 'string' or length(item->>'name') > 4000
        or jsonb_typeof(item->'caption') is distinct from 'string' or jsonb_typeof(item->'url') is distinct from 'string'
        or length(coalesce(item->>'caption', '')) > 4000 then
        raise exception 'Invalid media item' using errcode = '22023';
      end if;
      if nullif(item->>'storagePath', '') is not null then
        if split_part(item->>'storagePath', '/', 1) <> auth.uid()::text
          or not exists(select 1 from storage.objects o where o.bucket_id = 'routine-media' and o.name = item->>'storagePath') then
          raise exception 'Media file is not owned by this provider' using errcode = '42501';
        end if;
      elsif coalesce(item->>'url', '') !~ '^(https://[^/@[:space:]]+(/[^[:space:]]*)?|/exercise-media/[a-z0-9-]+[.]png)$' then
        raise exception 'Use an uploaded file or an HTTPS media link' using errcode = '22023';
      end if;
      if item->'preview' is not null and item->'preview' <> 'null'::jsonb and coalesce(item->'preview'->>'url', '') !~ '^https://' then
        raise exception 'Invalid media preview' using errcode = '22023';
      end if;
      if nullif(item->>'sourceUrl', '') is not null and item->>'sourceUrl' !~ '^https://' then
        raise exception 'Invalid media source' using errcode = '22023';
      end if;
    end loop;
    saved_list := array_append(saved_list, jsonb_build_object('exercise_id', identity, 'name', btrim(entry->>'name'),
      'sets', nullif(entry->>'sets', '')::integer, 'reps', nullif(entry->>'repetitions', '')::integer,
      'duration_seconds', nullif(entry->>'duration', '')::integer, 'notes', nullif(entry->>'notes', '')));
  end loop;
  saved_id := coalesce(p_routine_id, (p_document->>'id')::uuid);
  cleaned := p_document || jsonb_build_object('id', saved_id, 'name', btrim(p_document->>'name'), 'source', 'provider');
  if p_routine_id is null then
    insert into public.routines(id, provider_id, name, description, exercise_list, editor_document)
      values(saved_id, auth.uid(), cleaned->>'name', cleaned->>'description', saved_list, cleaned)
      on conflict(id) do nothing;
    if not found and not exists(select 1 from public.routines where id = saved_id and provider_id = auth.uid()
      and archived_at is null and editor_document = cleaned) then
      raise exception 'Routine was already saved with different content; reload before editing' using errcode = '40001';
    end if;
  else
    update public.routines set name = cleaned->>'name', description = cleaned->>'description',
      exercise_list = saved_list, editor_document = cleaned where id = saved_id;
  end if;
  return saved_id;
end;
$$;
revoke all on function milestone_routine_changes.save_document(uuid,jsonb) from public, anon, authenticated;

create function milestone_routine_changes.eligible(p_routine_id uuid)
returns setof public.routine_assignments language sql stable set search_path = '' as $$
  select a.* from public.routine_assignments a
  join public.provider_patient_profiles pp on pp.id = a.patient_profile_id
  where a.routine_id = p_routine_id and pp.provider_id = auth.uid() and pp.discharged_at is null
    and a.scheduled_date >= (milestone_scheduling.policy_at(statement_timestamp())->>'today')::date
    and a.status in ('scheduled', 'modified') and not a.patient_in_progress
    and a.patient_result_source is null and a.patient_comment is null and a.patient_issue_severity = 'none'
    and not exists (
      select 1 from public.routine_assignment_exercises e
      join public.routine_assignment_exercise_feedback f on f.routine_assignment_exercise_id = e.id
      where e.routine_assignment_id = a.id
    );
$$;
revoke all on function milestone_routine_changes.eligible(uuid) from public, anon, authenticated;

create function milestone_routine_changes.preview(p_routine_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  routine public.routines; affected jsonb; assignment_ids jsonb; kept bigint; result jsonb;
begin
  if auth.uid() is null then raise exception 'Provider sign-in required' using errcode = '42501'; end if;
  select * into routine from public.routines r
    where r.id = p_routine_id and r.provider_id = auth.uid() and r.archived_at is null;
  if not found then raise exception 'Routine not found' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(a.id order by a.id), '[]'::jsonb) into assignment_ids
    from milestone_routine_changes.eligible(p_routine_id) a;
  select coalesce(jsonb_agg(to_jsonb(grouped) order by grouped.name, grouped.id), '[]'::jsonb) into affected
    from (
      select pp.id, p.name, count(*) as "assignmentCount", jsonb_agg(a.scheduled_date order by a.scheduled_date) as dates
      from milestone_routine_changes.eligible(p_routine_id) a
      join public.provider_patient_profiles pp on pp.id = a.patient_profile_id
      join public.patients p on p.id = pp.patient_id
      group by pp.id, p.name
    ) grouped;
  select count(*) - jsonb_array_length(assignment_ids) into kept
    from public.routine_assignments a where a.routine_id = p_routine_id;
  result := jsonb_build_object('routineId', routine.id, 'name', routine.name,
    'patients', affected, 'assignmentCount', jsonb_array_length(assignment_ids), 'preservedCount', kept);
  return result || jsonb_build_object('token', encode(sha256(convert_to(
    jsonb_build_object('routine', to_jsonb(routine), 'assignments', assignment_ids,
      'impact', result, 'today', milestone_scheduling.policy_at(statement_timestamp())->>'today')::text, 'UTF8')), 'hex'));
end;
$$;
revoke all on function milestone_routine_changes.preview(uuid) from public, anon, authenticated;
grant execute on function milestone_routine_changes.preview(uuid) to authenticated;

create function public.preview_routine_change(p_routine_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select milestone_routine_changes.preview(p_routine_id);
$$;
revoke all on function public.preview_routine_change(uuid) from public, anon, authenticated;
grant execute on function public.preview_routine_change(uuid) to authenticated;

create function milestone_routine_changes.apply_change(
  p_routine_id uuid, p_action text, p_token text, p_routine_name text, p_exercises jsonb, p_document jsonb default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  provider uuid := auth.uid(); impact jsonb; old_assignment public.routine_assignments;
  new_assignment uuid; saved_list jsonb[]; follow_up timestamptz;
begin
  if provider is null or not exists(select 1 from public.providers where id = provider) then
    raise exception 'Provider sign-in required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('edit', 'delete') or nullif(p_token, '') is null then
    raise exception 'Review the routine change first' using errcode = '22023';
  end if;
  if not exists(select 1 from public.routines where id = p_routine_id and provider_id = provider and archived_at is null) then
    raise exception 'Routine not found' using errcode = 'P0002';
  end if;
  -- Match scheduling, discharge and feedback lock order: patient -> relationship
  -- -> routine -> assignment. A concurrent newly assigned patient changes the
  -- impact token and aborts this entire operation before any write.
  perform p.id from public.patients p where p.id in (
    select a.patient_id from public.routine_assignments a where a.routine_id = p_routine_id
  ) order by p.id for update;
  perform pp.id from public.provider_patient_profiles pp where pp.provider_id = provider and pp.id in (
    select a.patient_profile_id from public.routine_assignments a where a.routine_id = p_routine_id
  ) order by pp.id for update;
  perform id from public.routines where id = p_routine_id and provider_id = provider and archived_at is null for update;
  if not found then raise exception 'Routine not found' using errcode = 'P0002'; end if;
  perform a.id from public.routine_assignments a where a.routine_id = p_routine_id order by a.id for update;
  impact := milestone_routine_changes.preview(p_routine_id);
  if impact->>'token' is distinct from p_token then
    raise exception 'Routine or affected assignments changed; review again' using errcode = '40001';
  end if;
  if p_action = 'edit' then
    if p_document is null then
      perform public.save_routine_prescriptions(p_routine_id, p_routine_name, p_exercises);
    else
      perform milestone_routine_changes.save_document(p_routine_id, p_document);
    end if;
    select exercise_list into saved_list from public.routines where id = p_routine_id;
  end if;
  for old_assignment in select * from milestone_routine_changes.eligible(p_routine_id) order by id loop
    select scheduled_at into follow_up from public.routine_follow_ups
      where routine_assignment_id = old_assignment.id and status = 'scheduled' for update;
    perform public.cancel_routine_assignment(old_assignment.id);
    if p_action = 'edit' then
      insert into public.routine_assignments(patient_profile_id, patient_id, routine_id, scheduled_date, routine_name_snapshot, status)
        values(old_assignment.patient_profile_id, old_assignment.patient_id, p_routine_id,
          old_assignment.scheduled_date, btrim(p_routine_name), 'scheduled') returning id into new_assignment;
      insert into public.routine_assignment_exercises(routine_assignment_id, exercise_name_snapshot, position,
        sets_snapshot, reps_snapshot, timer_seconds_snapshot, notes_snapshot, exercise_id_snapshot)
      select new_assignment, entry->>'name', (ordinality - 1)::integer,
        (entry->>'sets')::integer, (entry->>'reps')::integer, (entry->>'duration_seconds')::integer,
        entry->>'notes', (entry->>'exercise_id')::uuid
        from unnest(saved_list) with ordinality items(entry, ordinality);
      if follow_up is not null then
        insert into public.routine_follow_ups(routine_assignment_id, scheduled_at, status)
          values(new_assignment, follow_up, 'scheduled');
      end if;
    end if;
  end loop;
  if p_action = 'delete' then
    update public.routines set archived_at = clock_timestamp() where id = p_routine_id;
  end if;
  return p_routine_id;
end;
$$;
revoke all on function milestone_routine_changes.apply_change(uuid,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function milestone_routine_changes.apply_change(uuid,text,text,text,jsonb,jsonb) to authenticated;

create function milestone_routine_changes.save_editor(p_routine_id uuid, p_document jsonb, p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if p_routine_id is null then return milestone_routine_changes.save_document(null, p_document); end if;
  return milestone_routine_changes.apply_change(p_routine_id, 'edit', p_token, p_document->>'name', null, p_document);
end;
$$;
revoke all on function milestone_routine_changes.save_editor(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function milestone_routine_changes.save_editor(uuid,jsonb,text) to authenticated;
create function public.save_editor_routine(p_routine_id uuid, p_document jsonb, p_token text default null)
returns uuid language sql security invoker set search_path = '' as $$
  select milestone_routine_changes.save_editor(p_routine_id, p_document, p_token);
$$;
revoke all on function public.save_editor_routine(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.save_editor_routine(uuid,jsonb,text) to authenticated;

create function public.apply_routine_change(p_routine_id uuid, p_action text, p_token text,
  p_routine_name text default null, p_exercises jsonb default null)
returns uuid language sql security invoker set search_path = '' as $$
  select milestone_routine_changes.apply_change(p_routine_id, p_action, p_token, p_routine_name, p_exercises);
$$;
revoke all on function public.apply_routine_change(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.apply_routine_change(uuid,text,text,text,jsonb) to authenticated;

-- Legacy clients must not assign or modify a removed library routine.
create function milestone_routine_changes.reject_archived_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform id from public.routines where id = new.routine_id and archived_at is null for share;
  if not found then raise exception 'Routine is no longer available' using errcode = '22023'; end if;
  return new;
end;
$$;
create trigger reject_archived_routine_assignment before insert on public.routine_assignments
  for each row execute function milestone_routine_changes.reject_archived_assignment();
create function milestone_routine_changes.reject_archived_edit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.archived_at is not null then raise exception 'Routine is no longer available' using errcode = '22023'; end if;
  return new;
end;
$$;
create trigger reject_archived_routine_edit before update on public.routines
  for each row execute function milestone_routine_changes.reject_archived_edit();
revoke all on function milestone_routine_changes.reject_archived_assignment(), milestone_routine_changes.reject_archived_edit() from public, anon, authenticated;

create function milestone_routine_changes.capture_editor_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.editor_snapshot is distinct from old.editor_snapshot then
      raise exception 'Assigned editor snapshots are immutable' using errcode = '23514';
    end if;
  else
    select editor_document into new.editor_snapshot from public.routines where id = new.routine_id;
  end if;
  return new;
end;
$$;
revoke all on function milestone_routine_changes.capture_editor_snapshot() from public, anon, authenticated;
create trigger capture_routine_editor_snapshot before insert or update on public.routine_assignments
  for each row execute function milestone_routine_changes.capture_editor_snapshot();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values('routine-media', 'routine-media', false, 52428800,
    array['image/jpeg','image/png','image/webp','video/mp4','video/webm']);
create function milestone_routine_changes.can_read_media(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.routine_assignments a
    join public.patients p on p.id = a.patient_id
    where p.auth_user_id = auth.uid() and jsonb_path_exists(a.editor_snapshot,
      '$.exercises[*].media[*] ? (@.storagePath == $path)', jsonb_build_object('path', p_path))
  );
$$;
revoke all on function milestone_routine_changes.can_read_media(text) from public, anon, authenticated;
grant execute on function milestone_routine_changes.can_read_media(text) to authenticated;
create function public.can_read_routine_media(p_path text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select milestone_routine_changes.can_read_media(p_path);
$$;
revoke all on function public.can_read_routine_media(text) from public, anon, authenticated;
grant execute on function public.can_read_routine_media(text) to authenticated;
create policy routine_media_read on storage.objects for select to authenticated
  using(bucket_id = 'routine-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.can_read_routine_media(name)));
create policy routine_media_insert on storage.objects for insert to authenticated
  with check(bucket_id = 'routine-media' and (storage.foldername(name))[1] = auth.uid()::text
    and exists(select 1 from public.providers where id = auth.uid()));
-- Saved media objects are immutable. Removing them from a routine keeps files
-- referenced by completed/in-progress assignment history readable.

create or replace function public.get_my_routine_assignment_media(p_routine_assignment_id uuid)
returns table(assignment_exercise_id uuid, exercise_id uuid, instructions text, media jsonb)
language sql stable security definer set search_path = '' as $$
  select e.id, c.id,
    coalesce(d.item->>'description', c.instructions, '') ||
      case when nullif(d.item->>'rest', '') is not null then E'\nRest: ' || (d.item->>'rest') || ' seconds.' else '' end,
    case when d.item is not null then coalesce((
      select jsonb_agg(jsonb_build_object('kind', case when media_item->>'kind' in ('youtube', 'vimeo', 'uploaded-video') then 'video-link' else media_item->>'kind' end,
        'url', media_item->>'url', 'title', media_item->>'name', 'source', coalesce(media_item->>'caption', ''),
        'sourceUrl', media_item->>'sourceUrl', 'storagePath', media_item->>'storagePath', 'preview',
          case when media_item->>'kind' = 'uploaded-video' then jsonb_build_object('kind', 'video', 'url', media_item->>'url') else media_item->'preview' end))
      from jsonb_array_elements(d.item->'media') media_entries(media_item)
    ), '[]'::jsonb) else coalesce(m.media, '[]'::jsonb) end
  from public.routine_assignment_exercises e
  join public.routine_assignments a on a.id = e.routine_assignment_id
  join public.provider_patient_profiles pp on pp.id = a.patient_profile_id
  join public.patients p on p.id = pp.patient_id
  left join lateral (select a.editor_snapshot->'exercises'->e.position as item) d on true
  left join lateral (
    select (array_agg(x.id))[1] as id, (array_agg(x."desc"))[1] as instructions from public.exercises x
    where case when e.exercise_id_snapshot is not null then x.id = e.exercise_id_snapshot
      else lower(btrim(x.name)) = lower(btrim(e.exercise_name_snapshot)) end having count(*) = 1
  ) c on true
  left join public.exercise_media m on m.exercise_id = c.id
  where e.routine_assignment_id = p_routine_assignment_id and p.auth_user_id = (select auth.uid())
  order by e.position;
$$;
notify pgrst, 'reload schema';
