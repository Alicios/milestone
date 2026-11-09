// Disposable embedded PostgreSQL, no connection string or hosted writes.
// Setup: npm install --prefix test-results/routine-change-db --no-save --package-lock=false @electric-sql/pglite@0.3.14
// Run: node supabase/tests/routine_changes_integration.mjs
import { PGlite } from '../../test-results/routine-change-db/node_modules/@electric-sql/pglite/dist/index.js'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const slice = (file, start, end) => { const source = read(file); return source.slice(source.indexOf(start), source.indexOf(end)) }
const A = '00000000-0000-0000-0000-000000000001'
const B = '00000000-0000-0000-0000-000000000002'
const P = '00000000-0000-0000-0000-000000000011'
const E = '00000000-0000-0000-0000-000000000020'
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`
const value = async (sql) => Object.values((await db.query(sql)).rows[0])[0]
const act = async (sql, user = A) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub',${quote(user)},false)`)
  try { return await value(sql) } finally { await db.exec('reset role') }
}
const reject = async (sql, code, user = A) => assert.rejects(act(sql, user), (error) => error.code === code)
const exercise = (changes = {}) => ({ id: crypto.randomUUID(), catalogId: E, name: 'Catalog exercise', description: 'Saved instructions', sets: '3', repetitions: '8', duration: '30', rest: '15', notes: 'Saved notes', media: [], ...changes })
const document = (name = 'Original') => ({ id: crypto.randomUUID(), name, description: 'Saved routine description', source: 'provider', exercises: [exercise()] })
try {
  await db.exec(read('tests/catalog_routines_fixture.sql').split('-- The reference CSV')[0])
  await db.exec(`insert into exercises values('${E}','Catalog exercise','Catalog instructions',now());
    alter table routine_assignments add column updated_at timestamptz default now();
    alter table routine_follow_ups add column updated_at timestamptz default now();
    alter table routine_follow_ups alter column id set default gen_random_uuid(), alter column status set default 'scheduled';
    alter table routine_follow_ups add unique(routine_assignment_id);
    alter table routine_assignments alter column patient_profile_id set not null, alter column routine_id set not null;
    alter table routines alter column provider_id set not null;`)
  await db.exec(read('migrations/20261007000200_routines_exercise_list_compatibility.sql'))
  await db.exec(read('migrations/20261019000100_patient_accounts.sql'))
  await db.exec(slice('migrations/20261020000200_catalog_routines_nondestructive.sql', '-- Catalog is shared', '-- assign_routine is deliberately'))
  await db.exec(slice('migrations/20261020000300_routine_prescriptions.sql', '-- Names match', 'do $verify$'))
  await db.exec(slice('migrations/20261006000100_clarify_schema_names.sql', 'create or replace function public.cancel_routine_assignment', 'create or replace function public.cancel_routine_follow_up'))
  await db.exec('revoke all on function assign_routine(uuid,uuid,date),cancel_routine_assignment(uuid),schedule_routine_follow_up(uuid,timestamptz) from public,anon; grant execute on function assign_routine(uuid,uuid,date),cancel_routine_assignment(uuid),schedule_routine_follow_up(uuid,timestamptz) to authenticated;')
  await db.exec(read('migrations/20261021000100_patient_routine_scheduling.sql').replace('hosted_execution_approved constant boolean := false;', 'hosted_execution_approved constant boolean := true;'))
  await db.exec(read('migrations/20261104015905_routine_patient_results.sql'))
  await db.exec(`create table routine_assignment_exercise_feedback(routine_assignment_exercise_id uuid primary key references routine_assignment_exercises, pain_score integer);
    create table exercise_media(exercise_id uuid primary key references exercises, media jsonb);
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select,insert on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`)
  await db.exec(read('migrations/20261109224647_confirmed_routine_patient_changes.sql'))
  console.log('PASS migration compiles against the scheduling/prescription baseline')
  const doc = document()
  const routine = await act(`select save_editor_routine(null,${json(doc)},null)`)
  assert.equal(await act(`select save_editor_routine(null,${json(doc)},null)`), routine)
  assert.equal(await value(`select count(*)::int from routines where id='${routine}'`), 1)
  const today = await value("select (milestone_scheduling.policy_at(now())->>'today')::date::text")
  const assignment = await act(`select assign_routine('${P}','${routine}',${quote(today)}::date + 1)`)
  const inProgress = await act(`select assign_routine('${P}','${routine}',${quote(today)}::date + 2)`)
  const completed = await act(`select assign_routine('${P}','${routine}',${quote(today)}::date + 3)`)
  const past = await value(`insert into routine_assignments(patient_profile_id,patient_id,routine_id,scheduled_date,routine_name_snapshot) values('${P}','00000000-0000-0000-0000-000000000010','${routine}',${quote(today)}::date-1,'Past') returning id`)
  await db.exec(`update routine_assignments set patient_in_progress=true where id='${inProgress}'; update routine_assignments set status='completed' where id='${completed}';`)
  await act(`select schedule_routine_follow_up('${assignment}',${quote(today)}::date + interval '4 days 12 hours')`)
  const preserved = await value(`select jsonb_agg(to_jsonb(a) order by id) from routine_assignments a where id in ('${inProgress}','${completed}','${past}')`)
  let impact = await act(`select preview_routine_change('${routine}')`)
  assert.equal(impact.assignmentCount, 1)
  assert.equal(impact.patients.length, 1)
  assert.equal(impact.preservedCount, 3)
  await reject(`select preview_routine_change('${routine}')`, 'P0002', B)
  await reject(`select save_editor_routine('${routine}',${json(document('Foreign'))},${quote(impact.token)})`, 'P0002', B)
  await reject(`select apply_routine_change('${routine}','delete',${quote(impact.token)})`, 'P0002', B)
  console.log('PASS accurate patient impact and cross-provider isolation')
  const changed = document('Edited'); changed.exercises[0].rest = '45'; changed.exercises[0].description = 'Revised instructions'
  await reject(`select save_editor_routine('${routine}',${json(changed)},'stale')`, '40001')
  assert.equal(await value(`select name from routines where id='${routine}'`), 'Original')
  await act(`select save_editor_routine('${routine}',${json(changed)},${quote(impact.token)})`)
  assert.equal(await value(`select status from routine_assignments where id='${assignment}'`), 'cancelled')
  const replacement = await value(`select id from routine_assignments where routine_id='${routine}' and scheduled_date=${quote(today)}::date+1 and status='scheduled'`)
  assert.notEqual(replacement, assignment)
  assert.equal(await value(`select editor_snapshot->'exercises'->0->>'rest' from routine_assignments where id='${replacement}'`), '45')
  assert.equal(await value(`select count(*)::int from routine_follow_ups where routine_assignment_id='${replacement}' and status='scheduled'`), 1)
  assert.equal(await value(`select status from routine_follow_ups where routine_assignment_id='${assignment}'`), 'cancelled')
  assert.deepEqual(await value(`select jsonb_agg(to_jsonb(a) order by id) from routine_assignments a where id in ('${inProgress}','${completed}','${past}')`), preserved)
  await assert.rejects(db.exec(`update routine_assignments set editor_snapshot='{}' where id='${replacement}'`), (error) => error.code === '23514')
  console.log('PASS edits replace only eligible prescriptions, retain follow-ups, and preserve history')
  impact = await act(`select preview_routine_change('${routine}')`)
  await db.exec(`update routine_assignments set patient_in_progress=true where id='${replacement}'`)
  await reject(`select apply_routine_change('${routine}','delete',${quote(impact.token)})`, '40001')
  await db.exec(`update routine_assignments set patient_in_progress=false where id='${replacement}'`)
  impact = await act(`select preview_routine_change('${routine}')`)
  await act(`select apply_routine_change('${routine}','delete',${quote(impact.token)})`)
  assert.ok(await value(`select archived_at from routines where id='${routine}'`))
  assert.equal(await value(`select status from routine_assignments where id='${replacement}'`), 'cancelled')
  assert.deepEqual(await value(`select jsonb_agg(to_jsonb(a) order by id) from routine_assignments a where id in ('${inProgress}','${completed}','${past}')`), preserved)
  await reject(`select assign_routine('${P}','${routine}',${quote(today)}::date+5)`, '22023')
  await reject(`select save_editor_routine('${routine}',${json(changed)},${quote(impact.token)})`, 'P0002')
  console.log('PASS deletion cancels only eligible work; stale impact and archived assignment attempts fail')
  const custom = document('Custom'); delete custom.exercises[0].catalogId
  custom.exercises[0].name = 'Provider custom exercise'
  await act(`insert into storage.objects(bucket_id,name) values('routine-media','${A}/private.png') returning name`)
  custom.exercises[0].media = [{ id: 'media', kind: 'image', url: '', storagePath: `${A}/private.png`, name: 'Private picture', caption: 'Picture caption' }]
  const customId = await act(`select save_editor_routine(null,${json(custom)},null)`)
  const customAssignment = await act(`select assign_routine('${P}','${customId}',${quote(today)}::date+5)`)
  assert.equal(await value(`select editor_snapshot->'exercises'->0->>'name' from routine_assignments where id='${customAssignment}'`), 'Provider custom exercise')
  await db.exec("update patients set auth_user_id='00000000-0000-0000-0000-000000000003' where id='00000000-0000-0000-0000-000000000010'")
  const patientMedia = await act(`select to_jsonb(m) from get_my_routine_assignment_media('${customAssignment}') m`, '00000000-0000-0000-0000-000000000003')
  assert.match(patientMedia.instructions, /Saved instructions\nRest: 15 seconds/)
  assert.equal(patientMedia.media[0].storagePath, `${A}/private.png`)
  assert.equal(await act("select count(*)::int from storage.objects", '00000000-0000-0000-0000-000000000003'), 1)
  assert.equal(await act("select count(*)::int from storage.objects", B), 0)
  const foreignMedia = document('Foreign media')
  foreignMedia.exercises[0].media = custom.exercises[0].media
  await reject(`select save_editor_routine(null,${json(foreignMedia)},null)`, '42501', B)
  console.log('PASS immutable patient media instructions and private provider/patient file access')

  const partial = await act(`select assign_routine('${P}','${customId}',${quote(today)}::date+6)`)
  await db.exec(`insert into routine_assignment_exercise_feedback select id,3 from routine_assignment_exercises where routine_assignment_id='${partial}'`)
  assert.equal((await act(`select preview_routine_change('${customId}')`)).assignmentCount, 1)
  const atomic = document('Atomic original')
  const atomicId = await act(`select save_editor_routine(null,${json(atomic)},null)`)
  const atomicAssignment = await act(`select assign_routine('${P}','${atomicId}',${quote(today)}::date+7)`)
  const atomicImpact = await act(`select preview_routine_change('${atomicId}')`)
  atomic.name = 'Should roll back'; atomic.exercises[0].name = 'Deliberate failure'
  await db.exec("create function fail_replacement() returns trigger language plpgsql as $$begin if new.exercise_name_snapshot='Deliberate failure' then raise exception 'Synthetic failure'; end if; return new; end$$; create trigger fail_replacement before insert on routine_assignment_exercises for each row execute function fail_replacement();")
  await reject(`select save_editor_routine('${atomicId}',${json(atomic)},${quote(atomicImpact.token)})`, 'P0001')
  assert.equal(await value(`select name from routines where id='${atomicId}'`), 'Atomic original')
  assert.equal(await value(`select status from routine_assignments where id='${atomicAssignment}'`), 'scheduled')
  await db.exec('drop trigger fail_replacement on routine_assignment_exercises; drop function fail_replacement()')
  console.log('PASS partial exercise feedback preserves history and late failures roll back the whole change')
  const invalid = document(); invalid.exercises[0].sets = '0'
  await reject(`select save_editor_routine(null,${json(invalid)},null)`, '22023')
  invalid.exercises[0].sets = '3'; invalid.exercises[0].media = [{ kind: 'image', url: 'javascript:alert(1)' }]
  await reject(`select save_editor_routine(null,${json(invalid)},null)`, '22023')
  await db.exec('set role anon')
  await assert.rejects(db.query(`select preview_routine_change('${routine}')`), (error) => error.code === '42501')
  await db.exec('reset role')
  console.log('PASS custom exercises, server dosage/media validation and anonymous denial')
} catch (error) {
  console.error('FAIL', error.code, error.message, error.detail ?? '', error.where ?? '', error.position ?? '')
  process.exitCode = 1
} finally { await db.close() }
