-- One-time, user-requested demo results for Frank's EXISTING active assignments.
-- This is deliberately separate from the general schema migration.
-- Fails rather than replacing subsequently recorded results or cancelled rows.
begin;
set local lock_timeout = '5s';
do $seed$
declare
  changed integer;
begin
  perform id from public.routine_assignments
    where id in ('d1c6a599-b207-4b0f-84d8-387409e453ce', '147dbaf0-3250-4ed5-a2ee-ca112a8b3b58', '3ca88e1d-235b-4214-94e6-ac090b275be8')
    for update;

  if (select count(*) from public.routine_assignments a
      join public.provider_patient_profiles pp on pp.id = a.patient_profile_id
      join (values
        ('d1c6a599-b207-4b0f-84d8-387409e453ce'::uuid, date '2026-10-26', 'Cardio'),
        ('147dbaf0-3250-4ed5-a2ee-ca112a8b3b58'::uuid, date '2026-10-27', 'Feet Fun'),
        ('3ca88e1d-235b-4214-94e6-ac090b275be8'::uuid, date '2026-10-28', 'Feet Fun')
      ) expected(id, scheduled_date, routine_name) on expected.id = a.id
      where a.patient_profile_id = '8da61f8b-6980-4c7f-95e7-266ef26b4f48'
        and pp.provider_id = '6acb666a-d294-443e-9f7c-f5478463165d'
        and a.scheduled_date = expected.scheduled_date and a.routine_name_snapshot = expected.routine_name
        and a.status = 'scheduled' and not a.patient_in_progress
        and a.patient_issue_severity = 'none' and a.patient_comment is null and a.patient_result_source is null) <> 3 then
    raise exception 'Expected exactly three unchanged Frank assignments without existing results; no seed applied';
  end if;

  update public.routine_assignments
  set status = case when scheduled_date = date '2026-10-28' then 'missed' else 'completed' end,
      patient_in_progress = false,
      patient_issue_severity = case when scheduled_date = date '2026-10-27' then 'noncritical' else 'none' end,
      patient_comment = case scheduled_date
        when date '2026-10-26' then 'I completed both exercises and the routine felt manageable.'
        when date '2026-10-27' then E'I completed the exercises, but the feet-together balance was difficult.\nI needed a few breaks and would like to review it at my next visit.'
        when date '2026-10-28' then 'I was not able to fit the routine in today.'
      end,
      patient_result_source = 'demo', updated_at = now()
  where id in ('d1c6a599-b207-4b0f-84d8-387409e453ce', '147dbaf0-3250-4ed5-a2ee-ca112a8b3b58', '3ca88e1d-235b-4214-94e6-ac090b275be8');
  get diagnostics changed = row_count;
  if changed <> 3 then raise exception 'Expected exactly three result updates'; end if;
end;
$seed$;
commit;
