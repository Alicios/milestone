import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)

// Compile the real application modules in memory. The configured Supabase client
// is always replaced; these tests load no credentials and make no network calls.
function loadTs(path, mocks = {}) {
  const filename = fileURLToPath(new URL(path, import.meta.url))
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const module = { exports: {} }
  const dependency = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name === './supabase' || name === '../lib/supabaseData') throw new Error('Live Supabase imports are forbidden in tests')
    if (name.startsWith('@mui/icons-material/')) return { default: 'Icon' }
    return require(name)
  }
  new Function('require', 'module', 'exports', outputText)(dependency, module, module.exports)
  return module.exports
}

const errors = loadTs('../src/lib/errors.ts')

function dataHarness(responses = []) {
  const calls = []
  const supabase = { async rpc(name, args) {
    calls.push({ name, args })
    const next = responses.shift()
    if (next instanceof Error) throw next
    assert.ok(next, 'Unexpected RPC call')
    return next
  } }
  const data = loadTs('../src/lib/supabaseData.ts', { './supabase': { supabase }, './prescriptions': loadTs('../src/lib/prescriptions.ts') })
  return { ...data, calls }
}

test('omitted, null, empty and whitespace phone values send null', async () => {
  for (const args of [[], [undefined], [null], [''], [' \t\n ']]) {
    const { createPatient, calls } = dataHarness([{ data: 'patient-id', error: null }])
    assert.equal(await createPatient(' Patient ', ...args), 'patient-id')
    assert.deepEqual(calls, [{ name: 'create_patient', args: { patient_name: 'Patient', patient_phone: null } }])
  }
})

test('provided phone formatting is preserved apart from surrounding whitespace', async () => {
  const { createPatient, calls } = dataHarness([{ data: 'patient-id' }])
  await createPatient(' Patient ', ' (562) 555-1234 ')
  assert.equal(calls[0].args.patient_phone, '(562) 555-1234')
})

test('missing, wrong-type and blank names fail before any RPC call', async () => {
  const { createPatient, calls } = dataHarness()
  for (const name of [undefined, null, 42, {}, [], '', ' \t\n ', '\u00a0']) {
    await assert.rejects(createPatient(name), { message: 'Patient name is required.' })
  }
  assert.equal(calls.length, 0)
})

test('both existing missing-function codes fall back to the name-only overload', async () => {
  for (const code of ['PGRST202', '42883']) {
    for (const phone of [null, '(562) 555-1234']) {
      const { createPatient, calls } = dataHarness([{ error: { code } }, { data: 'legacy-id' }])
      assert.equal(await createPatient(' Patient ', phone), 'legacy-id')
      assert.deepEqual(calls, [
        { name: 'create_patient', args: { patient_name: 'Patient', patient_phone: phone } },
        { name: 'create_patient', args: { patient_name: 'Patient' } },
      ])
    }
  }
})

test('validation, authorization and other errors propagate unchanged without fallback', async () => {
  for (const code of ['22023', '42501', '23502', '23505', '22P02', 'PGRST203', 'unexpected']) {
    const error = { code, message: 'Request rejected', details: 'Original details', hint: null }
    const { createPatient, calls } = dataHarness([{ error }])
    await assert.rejects(createPatient('Patient'), (caught) => caught === error)
    assert.equal(calls.length, 1)
    assert.equal(error.code, code)
  }
})

test('name-only fallback errors propagate unchanged with no further retries', async () => {
  const error = { code: '22023', message: 'Patient name is required' }
  const { createPatient, calls } = dataHarness([{ error: { code: 'PGRST202' } }, { error }])
  await assert.rejects(createPatient('Patient'), (caught) => caught === error)
  assert.equal(calls.length, 2)
})

test('transport failures are preserved without compatibility retries', async () => {
  const error = new Error('Network unavailable')
  const { createPatient, calls } = dataHarness([error])
  await assert.rejects(createPatient('Patient'), (caught) => caught === error)
  assert.equal(calls.length, 1)
})

test('error messages support Error instances and Supabase objects without changing codes', () => {
  const error = Object.freeze({ code: '42501', message: 'Sign in before creating a patient' })
  assert.equal(errors.errorMessage(error, 'Fallback'), error.message)
  assert.equal(error.code, '42501')
  assert.equal(errors.errorMessage(new Error('Connection failed'), 'Fallback'), 'Connection failed')
  for (const unknown of [null, undefined, {}, 'failure', { message: 42 }, { message: '' }, { message: ' \n' }]) {
    assert.equal(errors.errorMessage(unknown, 'Fallback'), 'Fallback')
  }
})

// Exercise the real form handlers using a small hook/component stub. This checks
// form props and state transitions, not browser layout or Supabase integration.
function pageHarness(createPatient) {
  const state = []
  let cursor = 0
  const react = { useState(initial) {
    const slot = cursor++
    if (!(slot in state)) state[slot] = initial
    return [state[slot], (value) => { state[slot] = typeof value === 'function' ? value(state[slot]) : value }]
  } }
  const mui = Object.fromEntries(['Alert', 'Box', 'Button', 'Card', 'Stack', 'TextField', 'Typography'].map((name) => [name, name]))
  mui.useTheme = () => ({ palette: { mode: 'light', divider: '#ddd', background: { paper: '#fff' }, text: { primary: '#000' } } })
  const { NewPatientPage } = loadTs('../src/pages/NewPatientPage.tsx', {
    react, '@mui/material': mui, 'react-router-dom': { Link: 'Link' },
    '../lib/supabaseData': { createPatient }, '../lib/errors': errors,
  })
  function flatten(node) {
    if (Array.isArray(node)) return node.flatMap(flatten)
    if (node == null || typeof node === 'boolean') return []
    return [node, ...flatten(node.props?.children)]
  }
  function render() { cursor = 0; return flatten(NewPatientPage()) }
  const find = (predicate) => render().find((node) => node.props && predicate(node.props))
  return {
    field: (label) => find((props) => props.label === label).props,
    change: (label, value) => find((props) => props.label === label).props.onChange({ target: { value } }),
    submit: () => find((props) => props.component === 'form').props.onSubmit({ preventDefault() {} }),
    button: () => find((props) => props.type === 'submit').props,
    text: () => render().filter((node) => typeof node === 'string').join(' '),
  }
}

test('patient form permits a blank phone and has an accurate no-phone success state', async () => {
  const { createPatient, calls } = dataHarness([{ data: 'patient-id' }])
  const page = pageHarness(createPatient)
  assert.equal(page.button().disabled, true)
  assert.equal(page.field('Patient name').required, true)
  assert.notEqual(page.field('Phone number').required, true)
  page.change('Patient name', 'Patient')
  page.change('Phone number', ' \t ')
  assert.equal(page.button().disabled, false)
  await page.submit()
  assert.equal(calls[0].args.patient_phone, null)
  assert.match(page.text(), /Pending account created/)
  assert.match(page.text(), /No phone number was provided/)
  assert.doesNotMatch(page.text(), /notification.*sent/)
})

test('patient form validates a supplied phone and preserves valid formatting', async () => {
  const { createPatient, calls } = dataHarness([{ data: 'patient-id' }])
  const page = pageHarness(createPatient)
  page.change('Patient name', 'Patient')
  page.change('Phone number', '123')
  await page.submit()
  assert.equal(calls.length, 0)
  assert.match(page.field('Phone number').helperText, /valid 10-digit/)
  page.change('Phone number', '(562) 555-1234')
  await page.submit()
  assert.equal(calls[0].args.patient_phone, '(562) 555-1234')
  assert.match(page.text(), /Pending account created/)
})

test('invalid name cannot create a patient even if the form handler is invoked directly', async () => {
  const { createPatient, calls } = dataHarness()
  const page = pageHarness(createPatient)
  page.change('Patient name', ' \t ')
  await page.submit()
  assert.equal(calls.length, 0)
  assert.match(page.text(), /Patient name is required/)
})

test('patient form displays Supabase rejection and allows a successful retry', async () => {
  const error = { code: '42501', message: 'Sign in before creating a patient' }
  const { createPatient, calls } = dataHarness([{ error }, { data: 'patient-id' }])
  const page = pageHarness(createPatient)
  page.change('Patient name', 'Patient')
  await page.submit()
  assert.match(page.text(), /Sign in before creating a patient/)
  assert.equal(page.button().disabled, false)
  assert.equal(calls.length, 1)
  assert.equal(error.code, '42501')
  await page.submit()
  assert.match(page.text(), /Pending account created/)
})
