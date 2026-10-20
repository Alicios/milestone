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
const tick = () => new Promise((resolve) => setImmediate(resolve))
function transport(responses = {}, rpcResult = { data: 'routine-id' }) {
  const calls = []
  return { calls, supabase: {
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return rpcResult },
    from(table) {
      const operations = []
      calls.push({ table, operations })
      const chain = {}
      for (const method of ['select', 'eq', 'order', 'in', 'gte', 'lte', 'neq']) chain[method] = (...args) => { operations.push([method, ...args]); return chain }
      chain.then = (resolve, reject) => Promise.resolve(typeof responses[table] === 'function' ? responses[table](operations) : responses[table] ?? { data: [] }).then(resolve, reject)
      return chain
    },
  } }
}
const dataModule = (t) => loadTs('../src/lib/supabaseData.ts', { './supabase': t, './prescriptions': prescriptions })

test('catalog loads UUIDs and descriptions in stable server order, preserving duplicate labels', async () => {
  const t = transport({ exercises: { data: catalog.map((item) => ({ ...item, desc: item.description })) } })
  const { loadExercises } = loadTs('../src/lib/exerciseData.ts', { './supabase': t, './prescriptions': prescriptions })
  assert.deepEqual(await loadExercises(), catalog)
  assert.deepEqual(t.calls, [{ table: 'exercises', operations: [['select', 'id, name, desc'], ['order', 'name'], ['order', 'id']] }])
})
test('empty catalog and catalog read errors are surfaced without sample-data fallback', async () => {
  for (const result of [{ data: [] }, { error: { code: '42501', message: 'Denied' } }]) {
    const t = transport({ exercises: result })
    const { loadExercises } = loadTs('../src/lib/exerciseData.ts', { './supabase': t, './prescriptions': prescriptions })
    await assert.rejects(loadExercises(), result.error ? (error) => error === result.error : /catalog is unavailable/)
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
    await assert.rejects(dataModule(t).saveRoutine('foreign-id', 'Named', [input(a)]), (caught) => caught === error)
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

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten)
  if (node == null || typeof node === 'boolean') return []
  return [node, ...flatten(node.props?.children)]
}
const text = (node) => flatten(node).filter((item) => typeof item === 'string').join(' ')
function hooks() {
  const state = []; const effects = []; let cursor = 0; let mounted = false
  return {
    react: {
      useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value }] },
      useRef(initial) { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index] },
      useMemo: (fn) => fn(), useCallback: (fn) => fn,
      useEffect: (effect) => { if (!mounted) effects.push(effect) },
    },
    render(fn) { cursor = 0; return flatten(fn()) },
    mount() { mounted = true; effects.splice(0).forEach((effect) => effect()) },
  }
}
const mui = Object.fromEntries(['Alert', 'Autocomplete', 'Box', 'Button', 'IconButton', 'InputAdornment', 'OutlinedInput', 'Stack', 'TextField', 'Typography', 'AppBar', 'Avatar', 'Container', 'Divider', 'Menu', 'MenuItem', 'Toolbar'].map((name) => [name, name]))
mui.useTheme = () => ({ palette: { mode: 'light', divider: '#ddd', background: { paper: '#fff' }, text: { primary: '#000' } } })
function pageHarness({ routines = [], saveRoutine = async () => {}, loadExercises = async () => catalog } = {}) {
  const hook = hooks()
  const page = loadTs('../src/pages/RoutinesPage.tsx', {
    react: hook.react, '@mui/material': mui,
    'react-router-dom': { useOutletContext: () => ({ routines, saveRoutine }) },
    '../components/RoutineDemo': { RoutineDemo: 'RoutineDemo' },
    '../lib/exerciseData': { loadExercises }, '../lib/errors': errors, '../lib/prescriptions': prescriptions,
  })
  const render = () => hook.render(page.SavedRoutinesPage)
  render(); hook.mount()
  return { page, render, button: (label) => render().find((node) => node.type === 'Button' && text(node) === label)?.props,
    field: (label) => render().find((node) => node.type === 'TextField' && node.props.label === label)?.props,
    editor: () => render().find((node) => node.type === page.ExerciseEditor)?.props,
  }
}
test('Routines page opens the Supabase saved editor by default', () => {
  const h = pageHarness()
  const root = hooks().render(h.page.RoutinesPage)
  assert.equal(root.find((node) => node.type === 'RoutineDemo'), undefined)
  assert.equal(root.find((node) => node.type === 'Box' && node.props.children?.type === h.page.SavedRoutinesPage).props.sx.display, 'block')
})
test('searchable exercise controls select by UUID, distinguish duplicate labels, and preserve reorder/remove operations', () => {
  const h = pageHarness()
  let selections = [{ key: '1', exerciseId: a }, { key: '2', exerciseId: b }]
  const render = () => flatten(h.page.ExerciseEditor({ exercises: selections, catalog, disabled: false, onChange: (next) => { selections = next } }))
  let controls = render().filter((node) => node.type === 'Autocomplete')
  assert.equal(controls[0].props.freeSolo, undefined)
  assert.equal(controls[0].props.getOptionKey(catalog[0]), a)
  assert.equal(controls[0].props.isOptionEqualToValue(catalog[0], catalog[1]), false)
  controls[0].props.onChange(null, catalog[1])
  assert.equal(selections[0].exerciseId, b)
  render().find((node) => node.props?.['aria-label'] === 'Move exercise 2 up').props.onClick()
  assert.equal(selections[0].key, '2')
  render().find((node) => node.props?.['aria-label'] === 'Remove exercise 1').props.onClick()
  assert.equal(selections.length, 1)
})
test('create form requires catalog selection and sends UUIDs in selected order', async () => {
  const saves = []
  const h = pageHarness({ saveRoutine: async (...args) => saves.push(args) })
  await tick()
  h.button('New Routine').onClick()
  h.field('Routine name').onChange({ target: { value: 'My routine' } })
  assert.equal(h.button('Create Routine').disabled, true)
  h.editor().onChange([{ key: '1', exerciseId: b }, { key: '2', exerciseId: a }])
  assert.equal(h.button('Create Routine').disabled, false)
  h.button('Create Routine').onClick(); await tick()
  assert.deepEqual(saves, [[null, 'My routine', [input(b), input(a)]]])
  assert.ok(h.button('New Routine'))
})
test('edit form retains saved catalog UUIDs and requires explicit replacements for legacy data', async () => {
  for (const legacy of [false, true]) {
    const saves = []
    const h = pageHarness({ routines: [{ id: 'r', name: 'Stored', exercises: [{ id: 'slot', name: 'Saved label', position: 0, exerciseId: legacy ? null : a, requiresReview: legacy }] }], saveRoutine: async (...args) => saves.push(args) })
    await tick()
    h.button('Edit Routine').onClick()
    h.render().find((node) => typeof node.props?.onClick === 'function' && node.props.routine?.id === 'r').props.onClick()
    assert.equal(h.editor().exercises[0].exerciseId, legacy ? null : a)
    assert.equal(h.button('Finish Editing').disabled, legacy)
    if (legacy) h.editor().onChange([{ key: 'slot', exerciseId: b }])
    h.button('Finish Editing').onClick(); await tick()
    assert.deepEqual(saves, [['r', 'Stored', [input(legacy ? b : a)]]])
  }
})
test('catalog failures block saves and display the original backend error', async () => {
  const h = pageHarness({ loadExercises: async () => { throw { message: 'Catalog permission denied' } } })
  await tick(); h.button('New Routine').onClick()
  h.field('Routine name').onChange({ target: { value: 'Name' } })
  h.editor().onChange([{ key: '1', exerciseId: a }])
  assert.equal(h.button('Create Routine').disabled, true)
  assert.match(text(h.render()), /Catalog permission denied/)
})
async function layoutHarness({ save = async () => 'new-id', load = async () => [] } = {}) {
  const hook = hooks(); const writes = []; const reads = []
  const user = { id: 'provider-a', name: 'Provider' }
  const { DashboardLayout } = loadTs('../src/components/DashboardLayout.tsx', {
    react: hook.react, '@mui/material': mui,
    'react-router-dom': { Link: 'Link', Outlet: 'Outlet', useLocation: () => ({ pathname: '/dashboard/routines' }) },
    '../auth/AuthContext': { useAuth: () => ({ user, logout() {} }) },
    '../lib/week': { getCurrentWeekDates: () => ['2026-10-20', '', '', '', '', '', '2026-10-26'] },
    '../lib/errors': errors,
    '../lib/supabaseData': {
      loadPatients: async () => [], loadRoutineAssignments: async () => [],
      loadRoutines: async (...args) => { reads.push(args); return load(reads.length) },
      saveRoutine: async (...args) => { writes.push(args); return save() },
    },
  })
  const render = () => hook.render(DashboardLayout)
  const context = () => render().find((node) => node.type === 'Outlet').props.context
  render(); hook.mount(); await tick()
  return { render, context, writes, reads }
}
test('successful persistence reloads routines into the existing assignment context', async () => {
  const saved = { id: 'new-id', name: 'Saved', exercises: [] }
  const h = await layoutHarness({ load: async (count) => count === 1 ? [] : [saved] })
  await h.context().saveRoutine(null, 'Saved', [input(a)])
  assert.deepEqual(h.context().routines, [saved])
  assert.deepEqual(h.writes, [[null, 'Saved', [input(a)]]])
  assert.deepEqual(h.reads, [['provider-a'], ['provider-a']])
})
test('failed reload after a confirmed save resolves as saved; retry only reads and exposes the saved routine', async () => {
  const saved = { id: 'new-id', name: 'Saved', exercises: [] }
  const h = await layoutHarness({ load: async (count) => {
    if (count === 2) throw new Error('Read failed')
    return count > 2 ? [saved] : []
  } })
  await h.context().saveRoutine(null, 'Saved', [input(a)])
  const warning = h.render().find((node) => node.type === 'Alert' && node.props.severity === 'warning')
  assert.match(text(warning), /Routine saved successfully/)
  warning.props.action.props.onClick(); await tick()
  assert.equal(h.writes.length, 1)
  assert.equal(h.reads.length, 3)
  assert.deepEqual(h.context().routines, [saved])
  assert.equal(h.render().find((node) => node.type === 'Alert' && node.props.severity === 'warning'), undefined)
})
test('save failures propagate without a reload or success message', async () => {
  const failure = { message: 'Provider access denied' }
  const h = await layoutHarness({ save: async () => { throw failure } })
  await assert.rejects(h.context().saveRoutine(null, 'Saved', [input(a)]), (error) => error === failure)
  assert.equal(h.reads.length, 1)
  assert.equal(h.render().find((node) => node.type === 'Alert' && node.props.severity === 'warning'), undefined)
})

test('repeated loading failures retain confirmed-save status and never repeat the write', async () => {
  const h = await layoutHarness({ load: async (count) => {
    if (count > 1 && count < 4) throw { message: 'Read denied' }
    return []
  } })
  await h.context().saveRoutine(null, 'Saved', [input(a)])
  const warning = () => h.render().find((node) => node.type === 'Alert' && node.props.severity === 'warning')
  warning().props.action.props.onClick(); await tick()
  assert.match(text(warning()), /Routine saved successfully/)
  warning().props.action.props.onClick(); await tick()
  assert.equal(warning(), undefined)
  assert.equal(h.writes.length, 1)
  assert.equal(h.reads.length, 4)
})
test('rapid create submissions share the UI save guard', async () => {
  let resolveSave
  const pending = new Promise((resolve) => { resolveSave = resolve })
  const writes = []
  const h = pageHarness({ saveRoutine: (...args) => { writes.push(args); return pending } })
  await tick(); h.button('New Routine').onClick()
  h.field('Routine name').onChange({ target: { value: 'Named' } })
  h.editor().onChange([{ key: '1', exerciseId: a }])
  const submit = h.button('Create Routine').onClick
  submit(); submit()
  assert.equal(writes.length, 1)
  assert.equal(h.button('Creating…').disabled, true)
  resolveSave(); await tick()
  assert.ok(h.button('New Routine'))
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

test('exercise controls retain all prescription values when selecting, moving and removing entries', () => {
  const h = pageHarness()
  let selections = [{ key: '1', exerciseId: a, sets: '2', reps: '8', durationSeconds: '30', notes: 'First' },
    { key: '2', exerciseId: b, sets: '3', notes: 'Second' }]
  const render = () => flatten(h.page.ExerciseEditor({ exercises: selections, catalog, disabled: false, onChange: next => { selections = next } }))
  render().find(n => n.type === 'TextField' && n.props.label === 'Reps — exercise 1').props.onChange({ target: { value: '12' } })
  render().find(n => n.type === 'Autocomplete').props.onChange(null, catalog[1])
  assert.equal(selections[0].reps, '12')
  assert.equal(selections[0].notes, 'First')
  render().find(n => n.props?.['aria-label'] === 'Move exercise 1 down').props.onClick()
  assert.equal(selections[1].durationSeconds, '30')
  render().find(n => n.props?.['aria-label'] === 'Remove exercise 1').props.onClick()
  assert.equal(selections[0].notes, 'First')
})

test('create form blocks invalid prescriptions and submits optional numeric values and notes', async () => {
  const saves = []
  const h = pageHarness({ saveRoutine: async (...args) => saves.push(args) })
  await tick(); h.button('New Routine').onClick()
  h.field('Routine name').onChange({ target: { value: 'Prescription' } })
  for (const field of ['sets', 'reps', 'durationSeconds']) {
    h.editor().onChange([{ key: '1', exerciseId: a, [field]: '0' }])
    assert.equal(h.button('Create Routine').disabled, true)
    h.button('Create Routine').onClick(); await tick()
  }
  assert.equal(saves.length, 0)
  h.editor().onChange([{ key: '1', exerciseId: a, sets: '2', reps: '8', durationSeconds: '', notes: 'Control movement' }])
  h.button('Create Routine').onClick(); await tick()
  assert.deepEqual(saves, [[null, 'Prescription', [input(a, { sets: 2, reps: 8, notes: 'Control movement' })]]])
})

test('edit form hydrates stored prescriptions, supports clearing duration, and cancel does not save', async () => {
  const saves = []
  const routines = [{ id: 'r', name: 'Stored', exercises: [{ id: 'slot', name: 'Catalog', position: 0,
    ...input(a, { sets: 2, reps: 10, durationSeconds: 30, notes: 'Original notes' }) }] }]
  const h = pageHarness({ routines, saveRoutine: async (...args) => saves.push(args) })
  await tick()
  const open = () => {
    h.button('Edit Routine').onClick()
    h.render().find(n => n.props?.routine?.id === 'r').props.onClick()
  }
  open()
  assert.deepEqual(h.editor().exercises[0], { key: 'slot', exerciseId: a, originalName: 'Catalog',
    sets: '2', reps: '10', durationSeconds: '30', notes: 'Original notes' })
  h.editor().onChange([{ ...h.editor().exercises[0], durationSeconds: '', notes: '' }])
  h.button('Cancel').onClick()
  assert.equal(saves.length, 0)
  open()
  h.editor().onChange([{ ...h.editor().exercises[0], durationSeconds: '', notes: 'Changed' }])
  h.button('Finish Editing').onClick(); await tick()
  assert.deepEqual(saves, [['r', 'Stored', [input(a, { sets: 2, reps: 10, notes: 'Changed' })]]])
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
    if (code === '42501') await assert.rejects(dataModule(t).loadRoutineAssignments(['profile'], '2026-10-20', '2026-10-26'), e => e === failure)
    else {
      const [assignment] = await dataModule(t).loadRoutineAssignments(['profile'], '2026-10-20', '2026-10-26')
      assert.equal(assignment.exercises[0].sets, null)
    }
    assert.equal(t.calls.filter(c => c.table === 'routine_assignment_exercises').length, code === '42703' ? 2 : 1)
  }
})
