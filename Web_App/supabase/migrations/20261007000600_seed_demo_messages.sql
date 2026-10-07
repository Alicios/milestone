-- Import the web inbox's twelve text messages once. Sample images are not
-- uploaded; they were bundled page assets rather than patient attachments.
do $seed$
declare
  inserted_count integer;
begin
  if exists (
    select 1
    from (values
      ('John Patientman'), ('Katherine Varela'),
      ('Neal Terrell'), ('Frank Murgolo')
    ) as expected(patient_name)
    left join public.patients p on p.name = expected.patient_name
    left join public.provider_patient_profiles pp on pp.patient_id = p.id
    left join public.providers pr on pr.id = pp.provider_id
      and lower(pr.name) = 'lebron james'
    group by expected.patient_name
    having count(pr.id) <> 1
  ) then
    raise exception 'Demo message seed needs exactly one Lebron James relationship for each of the four named patients';
  end if;

  with sample(seed_key, patient_name, sender_kind, body, age) as (
    values
      ('demo:john:1', 'John Patientman', 'patient', 'Hi, I finished the first week of my routine. My knee feels much better.', interval '26 minutes'),
      ('demo:john:2', 'John Patientman', 'provider', 'That is great progress, John! Keep the movements slow and controlled.', interval '22 minutes'),
      ('demo:john:3', 'John Patientman', 'patient', 'I had a question about my routine. Should I do the leg stretches on rest days too?', interval '19 minutes'),
      ('demo:john:4', 'John Patientman', 'provider', 'Yes, gentle stretching is perfect on rest days. Stop if you feel sharp pain, and send me a photo if you want feedback on your setup.', interval '16 minutes'),
      ('demo:john:5', 'John Patientman', 'patient', 'I tried the stretch next to the couch like you showed me. It feels much steadier this way.', interval '10 minutes'),
      ('demo:john:6', 'John Patientman', 'provider', 'That setup looks good. Keep your shoulders relaxed and hold for 20 seconds, three times. I''ll update your routine with that cue.', interval '5 minutes'),
      ('demo:katherine:1', 'Katherine Varela', 'provider', 'How is your shoulder feeling after the new exercises?', interval '1 day 27 minutes'),
      ('demo:katherine:2', 'Katherine Varela', 'patient', 'Much better. Thank you for checking in!', interval '1 day 23 minutes'),
      ('demo:katherine:3', 'Katherine Varela', 'provider', 'Wonderful. Try to keep the movement comfortable and let me know if the soreness lasts longer than a day.', interval '1 day 19 minutes'),
      ('demo:katherine:4', 'Katherine Varela', 'patient', 'I''ll keep that in mind. I''m going to practice it after work and send you an update tomorrow.', interval '1 day 14 minutes'),
      ('demo:neal:1', 'Neal Terrell', 'patient', 'I uploaded my progress photos.', interval '2 days'),
      ('demo:frank:1', 'Frank Murgolo', 'patient', 'Can we reschedule my appointment?', interval '3 days')
  )
  insert into public.messages (patient_profile_id, sender_kind, body, created_at, source, seed_key)
  select pp.id, sample.sender_kind, sample.body, now() - sample.age, 'demo_seed', sample.seed_key
  from sample
  join public.patients p on p.name = sample.patient_name
  join public.provider_patient_profiles pp on pp.patient_id = p.id
  join public.providers pr on pr.id = pp.provider_id and lower(pr.name) = 'lebron james'
  on conflict (seed_key) do nothing;

  get diagnostics inserted_count = row_count;

  -- Set the initial mock inbox state only on a complete first import.
  -- A rerun must not restore unread markers after a provider has read them.
  if inserted_count = 12 then
    update public.message_thread_state state
    set last_read_at = case p.name
      when 'John Patientman' then (select created_at from public.messages where seed_key = 'demo:john:2')
      when 'Katherine Varela' then (select created_at from public.messages where seed_key = 'demo:katherine:4')
      when 'Frank Murgolo' then (select created_at from public.messages where seed_key = 'demo:frank:1')
      else null
    end,
    starred = p.name = 'John Patientman'
    from public.provider_patient_profiles pp
    join public.patients p on p.id = pp.patient_id
    join public.providers pr on pr.id = pp.provider_id
    where state.patient_profile_id = pp.id
      and state.participant_user_id = pp.provider_id
      and lower(pr.name) = 'lebron james'
      and p.name in ('John Patientman', 'Katherine Varela', 'Neal Terrell', 'Frank Murgolo');
  end if;
end;
$seed$;
