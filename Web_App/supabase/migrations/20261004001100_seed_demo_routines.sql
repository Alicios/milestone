-- Restore the routine templates that were previously supplied by frontend mock
-- data. These become ordinary provider-owned routines and can be assigned,
-- edited, or archived through the persisted routine workflow.
begin;

with starter_routines(name, exercises) as (
  values
    ('Lower Body', array['Leg Stretch', 'Calf Stretch']::text[]),
    ('Upper Body', array['Arm Stretch', 'Shoulder Stretch']::text[]),
    ('Cardio', array['Swim exercise', 'Running']::text[]),
    ('Underwater Basketweaving Routine', array[]::text[]),
    ('Mongolian Throat Singing Routine', array[]::text[])
),
inserted_routines as (
  insert into public.routines (provider_id, name)
  select provider.id, starter.name
  from public.providers as provider
  cross join starter_routines as starter
  where not exists (
    select 1
    from public.routines as existing
    where existing.provider_id = provider.id
      and lower(btrim(existing.name)) = lower(starter.name)
  )
  returning id, provider_id, name
)
insert into public.routine_exercises (routine_id, name, position)
select inserted.id, exercise.name, exercise.position - 1
from inserted_routines as inserted
join starter_routines as starter on starter.name = inserted.name
cross join lateral unnest(starter.exercises)
  with ordinality as exercise(name, position);

commit;
