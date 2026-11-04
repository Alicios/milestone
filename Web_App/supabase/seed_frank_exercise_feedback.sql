-- One-time user-requested pain examples for Frank's completed demo routines.
-- Preserve existing responses and leave the missed routine's exercises unrated.
begin;
set local lock_timeout = '5s';
do $seed$
declare changed integer;
begin
  -- Match patient feedback/cancellation lock order before checking for responses.
  perform p.id from public.patients p
    join public.provider_patient_profiles pp on pp.patient_id=p.id
    where pp.id='8da61f8b-6980-4c7f-95e7-266ef26b4f48' for update of p;
  perform id from public.provider_patient_profiles
    where id='8da61f8b-6980-4c7f-95e7-266ef26b4f48' for update;
  perform id from public.routine_assignments
    where id in ('d1c6a599-b207-4b0f-84d8-387409e453ce','147dbaf0-3250-4ed5-a2ee-ca112a8b3b58')
    order by scheduled_date for update;
  if (select count(*) from public.routine_assignment_exercises e
      join public.routine_assignments a on a.id=e.routine_assignment_id
      join public.provider_patient_profiles pp on pp.id=a.patient_profile_id
      join (values
        ('2359747c-aabb-4211-b4cb-cebce82ba17b'::uuid, date '2026-10-26', 'Toe Spreading'),
        ('8e496f63-505f-4207-badb-f8c31472b88f'::uuid, date '2026-10-26', 'Therapy Putty Grip'),
        ('da71b5f2-db3f-41e5-84a7-c9364ecbf989'::uuid, date '2026-10-27', 'Toe Spreading'),
        ('9d9e8cf4-d44e-4c6a-aabc-0398610a9141'::uuid, date '2026-10-27', 'Feet-Together Balance')
      ) expected(id,scheduled_date,name) on expected.id=e.id
      where a.patient_profile_id='8da61f8b-6980-4c7f-95e7-266ef26b4f48'
        and pp.provider_id='6acb666a-d294-443e-9f7c-f5478463165d'
        and a.status='completed' and a.patient_result_source='demo'
        and a.scheduled_date=expected.scheduled_date and e.exercise_name_snapshot=expected.name
        and not exists(select 1 from public.routine_assignment_exercise_feedback f where f.routine_assignment_exercise_id=e.id)) <> 4 then
    raise exception 'Expected four unchanged, unrated exercises in Frank completed demo routines; no scores inserted';
  end if;
  insert into public.routine_assignment_exercise_feedback
    (routine_assignment_exercise_id,pain_score,feeling,explanation)
  values
    ('2359747c-aabb-4211-b4cb-cebce82ba17b',2,'good',null),
    ('8e496f63-505f-4207-badb-f8c31472b88f',3,'good',null),
    ('da71b5f2-db3f-41e5-84a7-c9364ecbf989',5,'neutral','The stretch felt tight, so I slowed down and took a short break.'),
    ('9d9e8cf4-d44e-4c6a-aabc-0398610a9141',8,'difficult','Keeping my balance was uncomfortable. I needed support and would like to review this exercise.');
  get diagnostics changed = row_count;
  if changed <> 4 then raise exception 'Expected exactly four inserted exercise responses'; end if;
end;
$seed$;
commit;
