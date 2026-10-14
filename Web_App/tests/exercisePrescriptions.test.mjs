import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Compile into memory; no generated fixtures or additional test dependencies.
const require = createRequire(import.meta.url)
function loadTs(relativePath, mocks = {}) {
  const filename = fileURLToPath(new URL(relativePath, import.meta.url))
  const result = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputText)((name) => name in mocks ? mocks[name] : require(name), module, module.exports)
  return module.exports
}
const api = loadTs('../src/lib/exercisePrescriptions.ts')
const { decodeRoutine, toPrescriptionDraft, buildPrescriptionPayload, parseParameter, prescriptionSummary, errorMessage } = api
const first = '00000000-0000-0000-0000-000000000001'
const second = '00000000-0000-0000-0000-000000000002'
const entry = { exercise_id: first, name: 'Catalog exercise', sets: 3, reps: 10, timer_seconds: 30 }
const catalog = [{ id: first, name: 'Catalog exercise', description: 'Description <not HTML>', createdAt: '2026-10-08' }]
const routine = (list, version = 1) => decodeRoutine({ id: 'routine', name: 'Routine', exercise_list: list, exercise_format_version: version, exercise_revision: 4 })

test('all legacy shapes retain every entry and require explicit resolution', () => {
  const original = ['Leg Stretch', { exercise_id: '1234', reps: 10, sets: 3, timer: 3000 }, null, 7, ['nested'], { title: 'Named legacy' }, entry]
  const decoded = routine(original, 0)
  assert.equal(decoded.exercises.length, original.length)
  assert.deepEqual(decoded.exercises.map((item) => item.original), original)
  assert.deepEqual(decoded.exercises.map((item) => item.position), [0, 1, 2, 3, 4, 5, 6])
  assert.equal(decoded.exercises[0].name, 'Leg Stretch')
  assert.equal(decoded.exercises[5].name, 'Named legacy')
  assert.ok(decoded.exercises.every((item) => !item.resolved && item.exerciseId === null))
  assert.match(decoded.assignmentIssue, /unresolved/)
  assert.equal(toPrescriptionDraft(decoded.exercises[1]).timerSeconds, '')
  assert.equal(toPrescriptionDraft(decoded.exercises[1]).original.timer, 3000)
})

test('null and empty lists are drafts; malformed and future formats are not assignable', () => {
  for (const list of [null, []]) assert.match(routine(list).assignmentIssue, /at least one/)
  for (const list of [[null], ['name'], [{ ...entry, exercise_id: '1234' }], [{ ...entry, timer_seconds: -1 }], [{ ...entry, timer: 3000 }]]) {
    assert.match(routine(list).assignmentIssue, /unresolved/)
    assert.equal(routine(list).exercises.length, list.length)
  }
  assert.match(routine([entry], 2).assignmentIssue, /unresolved/)
  assert.equal(routine({ name: 'Unexpected object' }).exercises.length, 1)
})

test('prescriptions round-trip nulls, bounds, ordering, and repeated catalog IDs', () => {
  const decoded = routine([entry, { ...entry, exercise_id: second, sets: null, reps: null, timer_seconds: null }, entry])
  assert.equal(decoded.assignmentIssue, null)
  assert.equal(decoded.exerciseRevision, 4)
  assert.equal(new Set(decoded.exercises.map((item) => item.id)).size, 3)
  const drafts = decoded.exercises.map(toPrescriptionDraft)
  const payload = buildPrescriptionPayload(' Routine ', [drafts[2], drafts[1], drafts[0]], new Set([first, second]))
  assert.deepEqual(payload, [
    { exercise_id: first, sets: 3, reps: 10, timer_seconds: 30 },
    { exercise_id: second, sets: null, reps: null, timer_seconds: null },
    { exercise_id: first, sets: 3, reps: 10, timer_seconds: 30 },
  ])
  assert.deepEqual(buildPrescriptionPayload('Draft', [], new Set()), [])
  assert.equal(parseParameter('100', 'Sets', 100), 100)
  assert.equal(parseParameter('', 'Sets', 100), null)
})

test('invalid or unresolved submissions reject instead of being filtered', () => {
  const draft = toPrescriptionDraft(routine([entry]).exercises[0])
  for (const value of ['0', '-1', '101', '1.5', '1e2', 'NaN', 'Infinity', ' 3', '999999999999999999999']) {
    assert.throws(() => buildPrescriptionPayload('Routine', [{ ...draft, sets: value }], new Set([first])), /whole number/)
  }
  assert.throws(() => buildPrescriptionPayload('Routine', [{ ...draft, exerciseId: second }], new Set([first])), /every entry/)
  assert.throws(() => buildPrescriptionPayload('Routine', [toPrescriptionDraft(routine(['Name'], 0).exercises[0])], new Set([first])), /every entry/)
  assert.throws(() => buildPrescriptionPayload(' ', [draft], new Set([first])), /name/)
  assert.throws(() => buildPrescriptionPayload('x'.repeat(201), [draft], new Set([first])), /name/)
  assert.throws(() => buildPrescriptionPayload('Routine', Array(101).fill(draft), new Set([first])), /100 exercises/)
})

test('snapshot presentation and Supabase errors preserve useful information', () => {
  assert.equal(prescriptionSummary({ sets: 3, reps: 10, timerSeconds: 30 }), '3 sets · 10 reps per set · 30 sec per set')
  assert.equal(prescriptionSummary({ sets: null, reps: null, timerSeconds: null }), '')
  assert.equal(errorMessage({ code: '40001', message: 'Reload before saving.' }, 'Fallback'), 'Reload before saving.')
  assert.equal(errorMessage(null, 'Fallback'), 'Fallback')
})

test('editor renders original unresolved entries and seconds with accessible controls', () => {
  const { RoutineExerciseEditor } = loadTs('../src/components/RoutineExerciseEditor.tsx', { '../lib/exercisePrescriptions': api })
  const drafts = routine([{ name: 'Old exercise', sets: 3, timer: 3000 }], 0).exercises.map(toPrescriptionDraft)
  const unresolved = renderToStaticMarkup(React.createElement(RoutineExerciseEditor, { exercises: drafts, catalog, disabled: false, onChange() {} }))
  assert.match(unresolved, /Old exercise/)
  assert.match(unresolved, /original unit unverified/)
  assert.match(unresolved, /Seconds per set/)
  assert.match(unresolved, /Move exercise 1 up/)
  const resolved = renderToStaticMarkup(React.createElement(RoutineExerciseEditor, { exercises: routine([entry]).exercises.map(toPrescriptionDraft), catalog, disabled: false, onChange() {} }))
  assert.match(resolved, /Description &lt;not HTML&gt;/)
  const empty = renderToStaticMarkup(React.createElement(RoutineExerciseEditor, { exercises: [], catalog, disabled: false, onChange() {} }))
  assert.match(empty, /saved as drafts/)
})

test('assignment selector blocks legacy and empty routines while retaining them visibly', () => {
  const { AssignRoutineDialog } = loadTs('../src/components/AssignRoutineDialog.tsx', {
    '../lib/exercisePrescriptions': api,
    '../lib/week': { formatCalendarDate: () => 'October 8, 2026' },
    // Render the actual dialog content in SSR without MUI Portal hiding it.
    '@mui/material': { ...require('@mui/material'), Dialog: ({ children }) => React.createElement('div', null, children) },
  })
  const html = renderToStaticMarkup(React.createElement(AssignRoutineDialog, {
    patientName: 'Local fixture', weekday: 'Thursday', scheduledDate: '2026-10-08',
    routines: [routine(['Legacy'], 0), { ...routine([]), id: 'empty' }, { ...routine([entry]), id: 'valid' }],
    onCancel() {}, async onAssign() {},
  }))
  assert.match(html, /replace unresolved entries/)
  assert.match(html, /at least one exercise/)
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3)
  assert.equal((html.match(/disabled=""[^>]*type="radio"/g) ?? []).length, 2)
})

function dataHarness() {
  const calls = []
  const queue = []
  const supabase = {
    from(table) {
      const chain = new Proxy({}, { get(_, method) {
        if (method === 'then') return (resolve, reject) => Promise.resolve(queue.shift()).then(resolve, reject)
        return (...args) => { calls.push([table, method, ...args]); return chain }
      } })
      return chain
    },
    async rpc(name, args) { calls.push([name, args]); return queue.shift() },
  }
  const data = loadTs('../src/lib/supabaseData.ts', { './supabase': { supabase }, './exercisePrescriptions': api })
  return { calls, queue, data }
}

test('routine data access uses the new RPC and preserves legacy reads without broad error swallowing', async () => {
  const { calls, queue, data } = dataHarness()
  queue.push({ error: { code: '42703', message: 'exercise_format_version does not exist' } }, { data: [{ id: 'r', name: 'Legacy', exercise_list: ['Old', { exercise_id: '1234' }] }] })
  const [legacy] = await data.loadRoutines()
  assert.equal(legacy.exercises.length, 2)
  assert.match(legacy.assignmentIssue, /unresolved/)
  queue.push({ error: { code: '42501', message: 'Permission denied' } })
  await assert.rejects(data.loadRoutines(), (error) => error.code === '42501')
  const payload = [{ exercise_id: first, sets: null, reps: 10, timer_seconds: 30 }]
  queue.push({ data: 'saved-id', error: null })
  assert.equal(await data.saveRoutine('r', ' Name ', payload, 4), 'saved-id')
  assert.deepEqual(calls.at(-1), ['save_routine_with_prescriptions', { p_routine_id: 'r', p_routine_name: 'Name', p_exercises: payload, p_expected_revision: 4 }])
})

test('assignment reads render stored snapshots without catalog lookups, including older schema fallback', async () => {
  const { calls, queue, data } = dataHarness()
  const assignment = { id: 'a', patient_profile_id: 'profile', routine_id: 'r', scheduled_date: '2026-10-08', status: 'scheduled', routine_name_snapshot: 'Historical routine' }
  queue.push({ data: [assignment] }, { data: [{ id: 's', routine_assignment_id: 'a', exercise_name_snapshot: 'Historical name', position: 0, description_snapshot: 'Original help', sets_snapshot: 2, reps_snapshot: null, timer_seconds_snapshot: 45, exercise_id_snapshot: first }] }, { data: [] })
  const [current] = await data.loadRoutineAssignments(['profile'], '2026-10-05', '2026-10-11')
  assert.equal(current.exercises[0].description, 'Original help')
  assert.equal(current.exercises[0].timerSeconds, 45)
  assert.equal(current.exercises[0].reps, null)
  queue.push({ data: [assignment] }, { error: { code: '42703', message: 'description_snapshot does not exist' } }, { data: [] }, { data: [{ id: 'old', routine_assignment_id: 'a', exercise_name_snapshot: 'Name only', position: 0 }] })
  const [legacy] = await data.loadRoutineAssignments(['profile'], '2026-10-05', '2026-10-11')
  assert.equal(legacy.exercises[0].name, 'Name only')
  assert.equal(legacy.exercises[0].description, null)
  assert.equal(legacy.exercises[0].sets, null)
  assert.ok(calls.every(([table]) => table !== 'exercises'))
})
