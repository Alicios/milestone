import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'
const require = createRequire(import.meta.url)

// Real modules compiled in memory, with no configured client or network access.
function loadTs(path, mocks = {}) {
  const filename = fileURLToPath(new URL(path, import.meta.url))
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const module = { exports: {} }
  const dependency = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name === './errors' || name === '../lib/errors') return errors
    if (name.startsWith('.')) throw new Error(`Unmocked application import: ${name}`)
    if (name.startsWith('@mui/icons-material/')) return { default: 'Icon' }
    return require(name)
  }
  new Function('require', 'module', 'exports', outputText)(dependency, module, module.exports)
  return module.exports
}
const a = '00000000-0000-0000-0000-000000000043'
const b = '00000000-0000-0000-0000-000000000044'
const catalog = [{ id: a, name: 'Same label', description: 'First instructions' }, { id: b, name: 'Same label', description: 'Second instructions' }]
const errors = loadTs('../src/lib/errors.ts')
const prescriptions = loadTs('../src/lib/prescriptions.ts')
const input = (exerciseId, values = {}) => ({ exerciseId, sets: null, reps: null, durationSeconds: null, notes: null, ...values })
const payload = (exercise_id, values = {}) => ({ exercise_id, sets: null, reps: null, duration_seconds: null, notes: null, ...values })
function transport(responses = {}, rpcResult = { data: 'routine-id' }) {
  const calls = []
  return { calls, supabase: {
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return rpcResult },
    from(table) {
      const operations = []
      calls.push({ table, operations })
      const chain = {}
      for (const method of ['select', 'eq', 'order', 'in', 'gte', 'lte', 'neq', 'is', 'range']) chain[method] = (...args) => { operations.push([method, ...args]); return chain }
      chain.then = (resolve, reject) => Promise.resolve(typeof responses[table] === 'function' ? responses[table](operations) : responses[table] ?? { data: [] }).then(resolve, reject)
      return chain
    },
  } }
}
const dataModule = (t) => loadTs('../src/lib/supabaseData.ts', { './supabase': t, './prescriptions': prescriptions, './videoPreview': loadTs('../src/lib/videoPreview.ts') })

test('catalog loads UUIDs and descriptions in stable server order, preserving duplicate labels', async () => {
  const t = transport({ exercises: { data: catalog.map((item) => ({ ...item, desc: item.description })) } })
  const { loadExercises } = loadTs('../src/lib/exerciseData.ts', { './supabase': t, './prescriptions': prescriptions, './videoPreview': loadTs('../src/lib/videoPreview.ts') })
  assert.deepEqual(await loadExercises(), catalog)
  assert.deepEqual(t.calls, [{ table: 'exercises', operations: [['select', 'id, name, desc, exercise_media(media)'], ['order', 'name'], ['order', 'id'], ['range', 0, 499]] }])
})
test('empty catalog and catalog read errors are surfaced without sample-data fallback', async () => {
  for (const result of [{ data: [] }, { error: { code: '42501', message: 'Denied' } }]) {
    const t = transport({ exercises: result })
    const { loadExercises } = loadTs('../src/lib/exerciseData.ts', { './supabase': t, './prescriptions': prescriptions, './videoPreview': loadTs('../src/lib/videoPreview.ts') })
    await assert.rejects(loadExercises(), result.error ? (error) => error.cause === result.error && error.code === 'FORBIDDEN' && error.sourceCode === '42501' : /catalog is unavailable/)
  }
})
test('routine creation and editing send ordered UUIDs to the focused RPC, never labels', async () => {
  const t = transport()
  const { saveRoutine } = dataModule(t)
  assert.equal(await saveRoutine(null, ' New routine ', [input(b), input(a), input(b)]), 'routine-id')
  await saveRoutine('routine-id', 'Edited', [input(a), input(b)])
  assert.deepEqual(t.calls, [
    { rpc: 'save_routine_prescriptions', args: { p_routine_id: null, p_routine_name: 'New routine', p_exercises: [payload(b), payload(a), payload(b)] } },
    { rpc: 'save_routine_prescriptions', args: { p_routine_id: 'routine-id', p_routine_name: 'Edited', p_exercises: [payload(a), payload(b)] } },
  ])
})
test('blank names, empty selections, and invalid UUIDs fail before transport', async () => {
  const t = transport()
  const { saveRoutine } = dataModule(t)
  for (const [name, ids] of [[' ', [a]], ['Named', []], ['Named', ['typed label']]]) await assert.rejects(saveRoutine(null, name, ids.map((id) => input(id))))
  assert.equal(t.calls.length, 0)
})
test('backend ownership and invalid-reference errors propagate without another save attempt', async () => {
  for (const code of ['42501', 'P0002', '22023']) {
    const error = { code, message: 'Rejected' }
    const t = transport({}, { error })
    await assert.rejects(dataModule(t).saveRoutine('foreign-id', 'Named', [input(a)]), (caught) => caught.cause === error && caught.sourceCode === code)
    assert.equal(t.calls.length, 1)
  }
})
test('retrieval scopes to the provider and preserves UUIDs, order, ID-only entries, and unresolved legacy entries', async () => {
  const t = transport({ routines: { data: [{ id: 'r', name: 'Stored', exercise_list: [
    { exercise_id: b, name: 'B' }, { exercise_id: a }, 'Legacy', null, { exercise_id: a, name: 'Dosed', reps: 4 },
  ] }] } })
  const [routine] = await dataModule(t).loadRoutines('provider-a')
  assert.deepEqual(routine.exercises.map((item) => item.exerciseId), [b, a, null, null, a])
  assert.deepEqual(routine.exercises.map((item) => item.position), [0, 1, 2, 3, 4])
  assert.deepEqual(routine.exercises.map((item) => item.requiresReview), [false, false, true, true, false])
  assert.equal(routine.exercises[2].name, 'Legacy')
  assert.ok(t.calls[0].operations.some((op) => op[0] === 'eq' && op[1] === 'provider_id' && op[2] === 'provider-a'))
})
test('existing assignment contract and snapshot reads remain unchanged', async () => {
  const t = transport({
    routine_assignments: { data: [{ id: 'assignment', patient_profile_id: 'profile', routine_id: 'r', scheduled_date: '2026-10-20', status: 'scheduled', routine_name_snapshot: 'Original name' }] },
    routine_assignment_exercises: { data: [{ id: 'snapshot', routine_assignment_id: 'assignment', exercise_name_snapshot: 'Original exercise', position: 0 }] },
  }, { data: 'assignment' })
  const data = dataModule(t)
  await data.assignRoutine('profile', 'r', '2026-10-20')
  assert.deepEqual(t.calls[0], { rpc: 'assign_routine', args: { p_patient_profile_id: 'profile', p_routine_id: 'r', p_scheduled_date: '2026-10-20' } })
  const [assignment] = await data.loadRoutineAssignments(['profile'], '2026-10-20', '2026-10-26')
  assert.deepEqual(assignment.exercises, [{ id: 'snapshot', name: 'Original exercise', position: 0, sets: null, reps: null, durationSeconds: null, notes: null }])
  assert.equal(assignment.routineName, 'Original name')
})

test('prescriptions round-trip through create, reload, edit and clear, retaining repeated UUIDs and order', async () => {
  let saved
  const t = transport({ routines: () => ({ data: saved ? [saved] : [] }) })
  t.supabase.rpc = async (rpc, args) => {
    t.calls.push({ rpc, args })
    saved = { id: args.p_routine_id ?? 'r', name: args.p_routine_name,
      exercise_list: args.p_exercises.map((entry) => ({ ...entry, name: 'Server catalog name' })) }
    return { data: saved.id }
  }
  const service = dataModule(t)
  await service.saveRoutine(null, 'With prescription', [
    input(b, { sets: 3, reps: 12, durationSeconds: 45, notes: '  Slowly\nSecond line  ' }),
    input(a), input(b, { reps: 6 }),
  ])
  let [routine] = await dataModule(t).loadRoutines('provider-a')
  assert.deepEqual(routine.exercises.map(({ exerciseId, sets, reps, durationSeconds, notes }) =>
    ({ exerciseId, sets, reps, durationSeconds, notes })), [
    input(b, { sets: 3, reps: 12, durationSeconds: 45, notes: 'Slowly\nSecond line' }), input(a), input(b, { reps: 6 }),
  ])
  assert.ok(routine.exercises.every(e => !e.requiresReview))
  await service.saveRoutine(routine.id, 'Edited', [input(a, { durationSeconds: 90 }), input(b)])
  ;[routine] = await dataModule(t).loadRoutines('provider-a')
  assert.equal(routine.name, 'Edited')
  assert.deepEqual(routine.exercises.map(e => [e.exerciseId, e.sets, e.durationSeconds, e.notes]),
    [[a, null, 90, null], [b, null, null, null]])
})

test('optional prescription values accept null/omission and normalize blank notes', async () => {
  const t = transport()
  await dataModule(t).saveRoutine(null, 'Optional', [{ exerciseId: a }, input(b, { notes: '  \n ' })])
  assert.deepEqual(t.calls[0].args.p_exercises, [payload(a), payload(b)])
})

test('invalid numeric or note values are rejected before a write', async () => {
  const t = transport()
  const service = dataModule(t)
  for (const field of ['sets', 'reps', 'durationSeconds']) {
    for (const value of [0, -1, 1.5, NaN, Infinity, '2', true, 2147483648]) {
      await assert.rejects(service.saveRoutine(null, 'Invalid', [input(a, { [field]: value })]), /positive whole numbers/)
    }
  }
  await assert.rejects(service.saveRoutine(null, 'Invalid', [input(a, { notes: {} })]))
  assert.equal(t.calls.length, 0)
  await service.saveRoutine(null, 'Boundaries', [input(a, { sets: 1, reps: 2147483647 })])
})

test('missing prescription backend fails explicitly and never retries through the UUID-only RPC', async () => {
  const t = transport({}, { error: { code: 'PGRST202' } })
  await assert.rejects(dataModule(t).saveRoutine(null, 'Not deployed', [input(a, { sets: 2 })]), /not available on this backend/)
  assert.deepEqual(t.calls.map(call => call.rpc), ['save_routine_prescriptions'])
})

test('malformed and unknown legacy prescription fields require review without treating valid prescriptions as legacy', async () => {
  const entries = [
    { exercise_id: a, name: 'Old' }, { exercise_id: a, sets: null, reps: null, duration_seconds: null, notes: null },
    { exercise_id: a, sets: -1 }, { exercise_id: a, duration_seconds: '30' },
    { exercise_id: a, notes: {} }, { exercise_id: a, timer_seconds: 30 },
  ]
  const t = transport({ routines: { data: [{ id: 'r', name: 'Stored', exercise_list: entries }] } })
  const [routine] = await dataModule(t).loadRoutines('p')
  assert.deepEqual(routine.exercises.map(e => e.requiresReview), [false, false, true, true, true, true])
  assert.equal(routine.exercises[0].durationSeconds, null)
})

test('numeric text validation rejects zero, negatives, decimals and overflow; blank fields remain optional', () => {
  for (const value of ['', ' ', '1', ' 25 ', '2147483647']) assert.equal(prescriptions.validPrescriptionText(value), true)
  for (const value of ['0', '-1', '1.5', '1e2', 'abc', '2147483648']) {
    assert.equal(prescriptions.validPrescriptionText(value), false)
    assert.throws(() => prescriptions.parsePrescriptionText(value))
  }
  assert.equal(prescriptions.parsePrescriptionText(' '), null)
  assert.equal(prescriptions.parsePrescriptionText('30'), 30)
})

test('assignment reads use stored prescription snapshots', async () => {
  const t = transport({
    routine_assignments: { data: [{ id: 'assignment', patient_profile_id: 'profile', routine_id: 'r',
      scheduled_date: '2026-10-20', status: 'scheduled', routine_name_snapshot: 'Original' }] },
    routine_assignment_exercises: { data: [{ id: 'snapshot', routine_assignment_id: 'assignment', exercise_name_snapshot: 'Original exercise',
      position: 0, sets_snapshot: 3, reps_snapshot: 8, timer_seconds_snapshot: 25, notes_snapshot: 'Historical notes' }] },
  })
  const [assignment] = await dataModule(t).loadRoutineAssignments(['profile'], '2026-10-20', '2026-10-26')
  assert.deepEqual(assignment.exercises[0], { id: 'snapshot', name: 'Original exercise', position: 0,
    sets: 3, reps: 8, durationSeconds: 25, notes: 'Historical notes' })
  assert.equal(t.calls.some(c => c.table === 'routines' || c.table === 'exercises'), false)
})

test('pre-deployment snapshot reads fall back only for missing columns, not authorization failures', async () => {
  const rows = { data: [{ id: 'assignment', patient_profile_id: 'profile', routine_id: 'r', scheduled_date: '2026-10-20',
    status: 'scheduled', routine_name_snapshot: 'Old' }] }
  for (const code of ['42703', '42501']) {
    const failure = { code, message: 'sets_snapshot unavailable' }
    const t = transport({ routine_assignments: rows, routine_assignment_exercises: operations =>
      operations.find(op => op[0] === 'select')[1].includes('sets_snapshot')
        ? { error: failure } : { data: [{ id: 's', routine_assignment_id: 'assignment', exercise_name_snapshot: 'Old', position: 0 }] } })
    if (code === '42501') await assert.rejects(dataModule(t).loadRoutineAssignments(['profile'], '2026-10-20', '2026-10-26'), e => e.cause === failure && e.code === 'FORBIDDEN' && e.sourceCode === '42501')
    else {
      const [assignment] = await dataModule(t).loadRoutineAssignments(['profile'], '2026-10-20', '2026-10-26')
      assert.equal(assignment.exercises[0].sets, null)
    }
    assert.equal(t.calls.filter(c => c.table === 'routine_assignment_exercises').length, code === '42703' ? 2 : 1)
  }
})

test('deletion uses the ownership-checked delete RPC and propagates failures', async () => {
  const t = transport()
  await dataModule(t).deleteRoutine('routine-id')
  assert.deepEqual(t.calls, [{ rpc: 'delete_routine', args: { p_routine_id: 'routine-id' } }])
  const failure = { code: 'P0002', message: 'Routine not found' }
  await assert.rejects(dataModule(transport({}, { error: failure })).deleteRoutine('foreign-id'), e => e.code === 'ROUTINE_NOT_FOUND' && e.sourceCode === 'P0002' && e.cause === failure)
})

test('routine retrieval hides removed templates while retaining provider scope', async () => {
  const t = transport()
  await dataModule(t).loadRoutines('provider-a')
  assert.ok(t.calls[0].operations.some(op => op[0] === 'is' && op[1] === 'archived_at' && op[2] === null))
  assert.ok(t.calls[0].operations.some(op => op[0] === 'eq' && op[1] === 'provider_id' && op[2] === 'provider-a'))
})

test('routine reads tolerate missing editor columns without losing the provider scope or available archive filter', async () => {
  for (const missing of [['editor_document'], ['archived_at'], ['editor_document', 'archived_at']]) {
    const t = transport({ routines: (operations) => {
      const columns = operations.find(([method]) => method === 'select')[1]
      const archiveFilter = operations.some(([method, column]) => method === 'is' && column === 'archived_at')
      const absent = missing.find((column) => column === 'editor_document' ? columns.includes(column) : archiveFilter)
      return absent ? { error: { code: '42703', message: `column routines.${absent} does not exist` } }
        : { data: [{ id: 'r', name: 'Existing routine', exercise_list: [] }] }
    } })
    const [routine] = await dataModule(t).loadRoutines('provider-a')
    assert.equal(routine.name, 'Existing routine')
    assert.equal(t.calls.length, missing.length + 1)
    assert.ok(t.calls.every(({ operations }) => operations.some(([method, column, id]) => method === 'eq' && column === 'provider_id' && id === 'provider-a')))
    assert.equal(t.calls.at(-1).operations.some(([method]) => method === 'is'), !missing.includes('archived_at'))
  }
})

test('routine reads do not retry authorization failures as schema compatibility reads', async () => {
  const t = transport({ routines: { error: { code: '42501', message: 'Denied editor_document access' } } })
  await assert.rejects(dataModule(t).loadRoutines('provider-a'), (error) => error.code === 'FORBIDDEN')
  assert.equal(t.calls.length, 1)
})

test('undeployed editor writes explain the missing database update instead of claiming success', async () => {
  const t = transport({}, { error: { code: 'PGRST202', message: 'Missing RPC' } })
  await assert.rejects(dataModule(t).loadRoutineChangeImpact('r'), /waiting for the database update/)
})

test('deletion of assigned routines explains the history protection', async () => {
  const t = transport({}, { error: { code: '23503', message: 'Foreign key violation' } })
  await assert.rejects(dataModule(t).deleteRoutine('assigned-id'), /patient assignments and cannot be deleted/)
  assert.equal(t.calls.length, 1)
})

const editorDocument = () => ({ id: 'draft', name: 'Saved editor plan', description: 'Routine instructions', source: 'provider', exercises: [{
  id: 'exercise', name: 'Custom exercise', description: 'Movement instructions', sets: '3', repetitions: '8', duration: '30', rest: '45', notes: 'Provider notes', media: [],
}] })

test('main editor persists the full document and passes the reviewed impact token for edits', async () => {
  const t = transport()
  const doc = editorDocument()
  assert.equal(await dataModule(t).saveRoutineDocument(null, doc), 'routine-id')
  await dataModule(t).saveRoutineDocument('routine-id', doc, 'reviewed-token')
  assert.deepEqual(t.calls, [
    { rpc: 'save_editor_routine', args: { p_routine_id: null, p_document: doc, p_token: null } },
    { rpc: 'save_editor_routine', args: { p_routine_id: 'routine-id', p_document: doc, p_token: 'reviewed-token' } },
  ])
})

test('deletion sends the reviewed token and stale impact errors require a new confirmation', async () => {
  const t = transport()
  await dataModule(t).deleteRoutine('routine-id', 'reviewed-token')
  assert.deepEqual(t.calls, [{ rpc: 'apply_routine_change', args: { p_routine_id: 'routine-id', p_action: 'delete', p_token: 'reviewed-token' } }])
  const failure = transport({}, { error: { code: '40001', message: 'Untrusted backend message' } })
  await assert.rejects(dataModule(failure).saveRoutineDocument('r', editorDocument(), 'stale'), (error) => error.code === 'CONFLICT' && error.sourceCode === '40001' && /Review the refreshed list/.test(error.message))
  assert.equal(failure.calls.length, 1)
})

test('impact reads fail closed instead of treating errors or malformed responses as an empty patient list', async () => {
  for (const result of [{ data: null }, { data: { patients: [] } }, { error: { code: '42501' } }]) {
    const t = transport({}, result)
    await assert.rejects(dataModule(t).loadRoutineChangeImpact('r'))
    assert.equal(t.calls[0].rpc, 'preview_routine_change')
  }
})

test('private media resolves for viewing and stores durable paths rather than expiring signed URLs', async () => {
  const doc = editorDocument()
  doc.exercises[0].media = [{ id: 'media', kind: 'image', name: 'Picture', caption: 'Caption', storagePath: 'provider/file.png', url: '' }]
  const t = transport({ routines: { data: [{ id: 'r', name: doc.name, description: doc.description, editor_document: doc, exercise_list: [] }] } })
  const signed = []
  t.supabase.storage = { from: (bucket) => ({ createSignedUrl: async (path, seconds) => { signed.push([bucket, path, seconds]); return { data: { signedUrl: 'https://example.invalid/signed.png?token=temporary' } } } }) }
  const [loaded] = await dataModule(t).loadRoutines('provider')
  assert.equal(loaded.editorDocument.exercises[0].media[0].url, 'https://example.invalid/signed.png?token=temporary')
  await dataModule(t).saveRoutineDocument('r', loaded.editorDocument, 'reviewed')
  const persisted = t.calls.at(-1).args.p_document.exercises[0].media[0]
  assert.equal(persisted.storagePath, 'provider/file.png')
  assert.equal(persisted.url, '')
  assert.equal(loaded.editorDocument.exercises[0].media[0].url, 'https://example.invalid/signed.png?token=temporary')
  assert.deepEqual(signed, [['routine-media', 'provider/file.png', 3600]])
})

test('patient media loader signs private assignment files and preserves uploaded video playback', async () => {
  const calls = []
  const { loadAssignmentDemonstrations } = loadTs('../../Mobile_App/milestone/lib/exerciseDemonstrations.js', { './supabase': { supabase: {
    rpc: async () => ({ data: [{ assignment_exercise_id: 'snapshot', instructions: 'Instructions', media: [{ kind: 'video-link', storagePath: 'provider/file.mp4', url: '', title: 'Video', preview: { kind: 'video', url: '' } }] }] }),
    storage: { from: (bucket) => ({ createSignedUrl: async (path) => { calls.push([bucket, path]); return { data: { signedUrl: 'https://example.invalid/video.mp4?token=temporary' } } } }) },
  } } })
  const result = await loadAssignmentDemonstrations('assignment')
  assert.equal(result.get('snapshot').media[0].preview.url, 'https://example.invalid/video.mp4?token=temporary')
  assert.deepEqual(calls, [['routine-media', 'provider/file.mp4']])
})
