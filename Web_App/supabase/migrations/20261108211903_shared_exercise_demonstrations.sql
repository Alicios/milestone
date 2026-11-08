-- Shared, non-patient-specific resources. App clients can only read this catalog.
create table public.exercise_media (
  exercise_id uuid primary key references public.exercises(id) on delete cascade,
  media jsonb not null check (jsonb_typeof(media) = 'array'),
  updated_at timestamptz not null default now()
);
comment on table public.exercise_media is 'Approved shared exercise demonstrations. Relative /exercise-media paths identify illustrations bundled with both clients.';
alter table public.exercise_media enable row level security;
revoke all on public.exercise_media from public, anon, authenticated;
grant select on public.exercise_media to authenticated;
grant all on public.exercise_media to service_role;
create policy "Providers read shared exercise media" on public.exercise_media
  for select to authenticated using (exists (select 1 from public.providers p where p.id = (select auth.uid())));

-- Separate from prescription snapshots: media can improve without rewriting a prescription.
-- Patients cannot enumerate other patients' assignments or use this as a global catalog API.
create function public.get_my_routine_assignment_media(p_routine_assignment_id uuid)
returns table (assignment_exercise_id uuid, exercise_id uuid, instructions text, media jsonb)
language sql stable security definer set search_path = ''
as $$
  select e.id, c.id, coalesce(c.instructions, ''), coalesce(m.media, '[]'::jsonb)
  from public.routine_assignment_exercises e
  join public.routine_assignments a on a.id = e.routine_assignment_id
  join public.provider_patient_profiles pp on pp.id = a.patient_profile_id
  join public.patients p on p.id = pp.patient_id
  left join lateral (
    select (array_agg(x.id))[1] as id, (array_agg(x."desc"))[1] as instructions
    from public.exercises x
    where case when e.exercise_id_snapshot is not null then x.id = e.exercise_id_snapshot
      else lower(btrim(x.name)) = lower(btrim(e.exercise_name_snapshot)) end
    having count(*) = 1
  ) c on true
  left join public.exercise_media m on m.exercise_id = c.id
  where e.routine_assignment_id = p_routine_assignment_id
    and p.auth_user_id = (select auth.uid())
  order by e.position;
$$;
revoke all on function public.get_my_routine_assignment_media(uuid) from public, anon;
grant execute on function public.get_my_routine_assignment_media(uuid) to authenticated;
comment on function public.get_my_routine_assignment_media(uuid) is 'Patient-owned assignment media, matched by catalog UUID or one unambiguous legacy name. Does not modify prescription or feedback snapshots.';
notify pgrst, 'reload schema';
