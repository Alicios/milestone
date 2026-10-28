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
    if (name === './errors' || name === '../lib/errors') return errors
    if (name === './supabase' || name === '../lib/supabaseData') throw new Error('Live Supabase imports are forbidden in tests')
    if (name.startsWith('@mui/icons-material/')) return { default: 'Icon' }
    return require(name)
  }
  new Function('require', 'module', 'exports', outputText)(dependency, module, module.exports)
  return module.exports
}

const errors = loadTs('../src/lib/errors.ts')

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function dataHarness({ rpcResponses = [], session = { access_token: 'token-abc' }, fetchResponses = [] } = {}) {
  const calls = []
  const fetchCalls = []
  const supabase = {
    async rpc(name, args) {
      calls.push({ name, args })
      const next = rpcResponses.shift()
      if (next instanceof Error) throw next
      assert.ok(next, 'Unexpected RPC call')
      return next
    },
    auth: { async getSession() { return { data: { session } } } },
  }
  const fetchImpl = async (url, options) => {
    fetchCalls.push({ url, options })
    const next = fetchResponses.shift()
    if (next instanceof Error) throw next
    assert.ok(next, 'Unexpected fetch call')
    return next
  }
  const data = loadTs('../src/lib/supabaseData.ts', { './supabase': { supabase }, './prescriptions': loadTs('../src/lib/prescriptions.ts') })
  return { ...data, calls, fetchCalls, fetchImpl }
}

test('createPatient requires a name and an email', async () => {
  const { createPatient, calls } = dataHarness()
  for (const name of [undefined, null, 42, {}, [], '', ' \t\n ', ' ']) {
    await assert.rejects(createPatient(name, 'patient@example.com'), { message: 'Patient name is required.' })
  }
  for (const email of [undefined, null, 42, {}, [], '', ' \t\n ']) {
    await assert.rejects(createPatient('Patient', email), { message: 'Patient email is required.' })
  }
  assert.equal(calls.length, 0)
})

test('createPatient sends a null phone and the trimmed email', async () => {
  const { createPatient, calls } = dataHarness({ rpcResponses: [{ data: 'patient-id' }] })
  assert.equal(await createPatient(' Patient ', ' patient@example.com '), 'patient-id')
  assert.deepEqual(calls, [{ name: 'create_patient', args: { patient_name: 'Patient', patient_phone: null, patient_email: 'patient@example.com' } }])
})

test('createPatient normalizes Supabase errors while retaining diagnostics', async () => {
  const error = { code: '42501', message: 'Sign in before creating a patient' }
  const { createPatient, calls } = dataHarness({ rpcResponses: [{ error }] })
  await assert.rejects(createPatient('Patient', 'patient@example.com'), (caught) => caught.cause === error && caught.sourceCode === error.code)
  assert.equal(calls.length, 1)
})

test('inviteExistingPatient requires an active session and never calls fetch without one', async () => {
  const { inviteExistingPatient, PatientInviteError, fetchImpl, fetchCalls } = dataHarness({ session: null })
  await assert.rejects(
    inviteExistingPatient('patient-id', fetchImpl),
    (error) => error instanceof PatientInviteError && error.patientId === 'patient-id' && error.code === 'AUTH_REQUIRED',
  )
  assert.equal(fetchCalls.length, 0)
})

test('inviteExistingPatient posts the patient id with a bearer token and returns the generated code', async () => {
  const { inviteExistingPatient, fetchImpl, fetchCalls } = dataHarness({ fetchResponses: [jsonResponse(200, { email: 'patient@example.com', otp: '123456', expiresAt: '2026-01-01T00:00:00.000Z' })] })
  const code = await inviteExistingPatient('patient-id', fetchImpl)
  assert.deepEqual(code, { email: 'patient@example.com', otp: '123456', expiresAt: '2026-01-01T00:00:00.000Z' })
  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].url, '/api/invite-patient')
  assert.equal(fetchCalls[0].options.method, 'POST')
  assert.equal(fetchCalls[0].options.headers.Authorization, 'Bearer token-abc')
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), { patientId: 'patient-id' })
})

test('inviteExistingPatient normalizes the server error without exposing text on a non-2xx response', async () => {
  const { inviteExistingPatient, PatientInviteError, fetchImpl } = dataHarness({ fetchResponses: [jsonResponse(409, { error: 'This patient already has an account.' })] })
  await assert.rejects(
    inviteExistingPatient('patient-id', fetchImpl),
    (error) => error instanceof PatientInviteError && error.patientId === 'patient-id' && error.code === 'CONFLICT' && error.httpStatus === 409 && !error.message.includes('This patient already'),
  )
})

test('inviteExistingPatient falls back to a generic message when the response has no error field', async () => {
  const { inviteExistingPatient, PatientInviteError, fetchImpl } = dataHarness({ fetchResponses: [jsonResponse(500, {})] })
  await assert.rejects(inviteExistingPatient('patient-id', fetchImpl), (error) => error instanceof PatientInviteError && error.code === 'SERVICE_UNAVAILABLE' && error.httpStatus === 500)
})

test('inviteExistingPatient rejects a 2xx response missing an otp', async () => {
  const { inviteExistingPatient, PatientInviteError, fetchImpl } = dataHarness({ fetchResponses: [jsonResponse(200, { email: 'patient@example.com' })] })
  await assert.rejects(inviteExistingPatient('patient-id', fetchImpl), (error) => error instanceof PatientInviteError && error.code === 'OTP_UNCONFIRMED' && error.httpStatus === 200)
})

test('createPatientAndInvite creates the patient, then invites them, returning the patient id and code', async () => {
  const { createPatientAndInvite, fetchImpl, calls, fetchCalls } = dataHarness({
    rpcResponses: [{ data: 'patient-id' }],
    fetchResponses: [jsonResponse(200, { email: 'patient@example.com', otp: '123456', expiresAt: '2026-01-01T00:00:00.000Z' })],
  })
  const result = await createPatientAndInvite('Patient', 'patient@example.com', fetchImpl)
  assert.equal(result.patientId, 'patient-id')
  assert.equal(result.code.otp, '123456')
  assert.equal(calls.length, 1)
  assert.equal(fetchCalls.length, 1)
})

test('createPatientAndInvite never calls fetch if creating the patient fails', async () => {
  const error = { code: '22023', message: 'Patient name is required' }
  const { createPatientAndInvite, fetchImpl, fetchCalls } = dataHarness({ rpcResponses: [{ error }] })
  await assert.rejects(createPatientAndInvite('Patient', 'patient@example.com', fetchImpl), (caught) => caught.cause === error && caught.sourceCode === error.code)
  assert.equal(fetchCalls.length, 0)
})

test('createPatientAndInvite surfaces a PatientInviteError carrying the new patient id when only the invite fails', async () => {
  const { createPatientAndInvite, PatientInviteError, fetchImpl } = dataHarness({
    rpcResponses: [{ data: 'patient-id' }],
    fetchResponses: [jsonResponse(502, { error: 'The invitation could not be confirmed.' })],
  })
  await assert.rejects(
    createPatientAndInvite('Patient', 'patient@example.com', fetchImpl),
    (error) => error instanceof PatientInviteError && error.patientId === 'patient-id' && error.code === 'OTP_UNCONFIRMED' && error.httpStatus === 502,
  )
})

test('error messages sanitize Error instances and Supabase objects without changing native codes', () => {
  const error = Object.freeze({ code: '42501', message: 'Sign in before creating a patient' })
  assert.equal(errors.errorMessage(error, 'Fallback'), 'You do not have permission to perform this action.')
  assert.equal(error.code, '42501')
  assert.equal(errors.errorMessage(new Error('Connection failed'), 'Fallback'), 'Fallback')
  for (const unknown of [null, undefined, {}, 'failure', { message: 42 }, { message: '' }, { message: ' \n' }]) {
    assert.equal(errors.errorMessage(unknown, 'Fallback'), 'Fallback')
  }
})

// Exercise the real form handlers using a small hook/component stub. This checks
// form props and state transitions, not browser layout or Supabase integration.
function pageHarness({ createPatientAndInvite, PatientInviteError }) {
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
    '../lib/supabaseData': { createPatientAndInvite, PatientInviteError }, '../lib/errors': errors,
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

const samplePatientLoginCode = { email: 'patient@example.com', otp: '123456', expiresAt: '2026-01-01T00:00:00.000Z' }

test('patient form requires both a name and an email before the submit button enables', () => {
  const { PatientInviteError } = dataHarness()
  const page = pageHarness({ createPatientAndInvite: async () => ({ patientId: 'patient-id', code: samplePatientLoginCode }), PatientInviteError })
  assert.equal(page.button().disabled, true)
  assert.equal(page.field('Patient name').required, true)
  assert.equal(page.field('Patient email').required, true)
  page.change('Patient name', 'Patient')
  assert.equal(page.button().disabled, true)
  page.change('Patient email', 'patient@example.com')
  assert.equal(page.button().disabled, false)
})

test('an invalid email is rejected client-side before calling createPatientAndInvite', async () => {
  const { PatientInviteError } = dataHarness()
  let called = false
  const page = pageHarness({ createPatientAndInvite: async () => { called = true; return { patientId: 'patient-id', code: samplePatientLoginCode } }, PatientInviteError })
  page.change('Patient name', 'Patient')
  page.change('Patient email', 'not-an-email')
  await page.submit()
  assert.equal(called, false)
  assert.match(page.field('Patient email').helperText, /valid email/)
})

test('a successful submission shows the invited confirmation screen with the generated code', async () => {
  const { PatientInviteError } = dataHarness()
  const page = pageHarness({ createPatientAndInvite: async () => ({ patientId: 'patient-id', code: samplePatientLoginCode }), PatientInviteError })
  page.change('Patient name', 'Patient')
  page.change('Patient email', 'patient@example.com')
  await page.submit()
  assert.match(page.text(), /Pending account created/)
  assert.match(page.text(), /Give this code to\s+Patient/)
  assert.match(page.text(), /123456/)
})

test('a PatientInviteError still shows the patient as saved, with a code-not-generated message', async () => {
  const { PatientInviteError } = dataHarness()
  const page = pageHarness({
    createPatientAndInvite: async () => { throw new PatientInviteError('patient-id', 'The code could not be generated.') },
    PatientInviteError,
  })
  page.change('Patient name', 'Patient')
  page.change('Patient email', 'patient@example.com')
  await page.submit()
  assert.match(page.text(), /Patient saved, code unconfirmed/)
  assert.match(page.text(), /login code could not be confirmed/)
})

test('a creation failure (not an invite failure) shows the generic save error with no success screen', async () => {
  const { PatientInviteError } = dataHarness()
  const page = pageHarness({
    createPatientAndInvite: async () => { throw { code: '42501', message: 'Sign in before creating a patient' } },
    PatientInviteError,
  })
  page.change('Patient name', 'Patient')
  page.change('Patient email', 'patient@example.com')
  await page.submit()
  assert.match(page.text(), /You do not have permission/)
  assert.doesNotMatch(page.text(), /Pending account created/)
  assert.equal(page.button().disabled, false)
})

test('invalid name cannot create a patient even if the form handler is invoked directly', async () => {
  const { createPatientAndInvite, PatientInviteError } = dataHarness()
  const page = pageHarness({ createPatientAndInvite, PatientInviteError })
  page.change('Patient name', ' \t ')
  page.change('Patient email', 'patient@example.com')
  await page.submit()
  assert.match(page.text(), /Patient name is required/)
})

test('a Supabase rejection during creation shows the error and allows a successful retry', async () => {
  const error = { code: '42501', message: 'Sign in before creating a patient' }
  const { createPatientAndInvite, PatientInviteError, fetchImpl } = dataHarness({
    rpcResponses: [{ error }, { data: 'patient-id' }],
    fetchResponses: [jsonResponse(200, samplePatientLoginCode)],
  })
  const page = pageHarness({ createPatientAndInvite: (name, email) => createPatientAndInvite(name, email, fetchImpl), PatientInviteError })
  page.change('Patient name', 'Patient')
  page.change('Patient email', 'patient@example.com')
  await page.submit()
  assert.match(page.text(), /You do not have permission/)
  assert.equal(page.button().disabled, false)
  await page.submit()
  assert.match(page.text(), /Pending account created/)
  assert.match(page.text(), /123456/)
})

for (const failure of [new TypeError('Failed to fetch'), new Error('private SQL path and token')]) {
  test(`invitation transport rejection preserves the saved patient (${failure.name})`, async () => {
    const h = dataHarness({ rpcResponses: [{ data: 'saved-patient-id' }], fetchResponses: [failure] })
    await assert.rejects(h.createPatientAndInvite('Patient', 'patient@example.com', h.fetchImpl), error => {
      assert.ok(error instanceof h.PatientInviteError)
      assert.equal(error.patientId, 'saved-patient-id')
      assert.equal(error.code, failure instanceof TypeError ? 'NETWORK_ERROR' : 'UNEXPECTED_ERROR')
      assert.equal(error.cause.cause, failure)
      assert.doesNotMatch(JSON.stringify(error), /private SQL|saved-patient-id|patient@example|token/)
      return true
    })
    assert.equal(h.calls.length, 1); assert.equal(h.fetchCalls.length, 1)
  })
}

test('real invitation network failure displays partial success and does not offer creation retry', async () => {
  const h = dataHarness({ rpcResponses: [{ data: 'saved-patient-id' }], fetchResponses: [new TypeError('Failed to fetch')] })
  const page = pageHarness({ createPatientAndInvite: (name, email) => h.createPatientAndInvite(name, email, h.fetchImpl), PatientInviteError: h.PatientInviteError })
  page.change('Patient name', 'Patient'); page.change('Patient email', 'patient@example.com')
  await page.submit()
  assert.match(page.text(), /Patient saved, code unconfirmed/)
  assert.match(page.text(), /do not create this patient again/)
  assert.doesNotMatch(page.text(), /Failed to fetch|The patient could not be saved/)
  assert.equal(h.calls.length, 1); assert.equal(h.fetchCalls.length, 1)
})

for (const mode of ['returned', 'thrown']) test(`session ${mode} failure after creation remains a PatientInviteError`, async () => {
  let creates = 0; let invites = 0
  const failure = { code: 'refresh_token_not_found', message: 'private refresh token' }
  const supabase = { rpc: async () => { creates++; return { data: 'saved-patient-id' } }, auth: { getSession: async () => {
    if (mode === 'thrown') throw failure
    return { data: { session: null }, error: failure }
  } } }
  const api = loadTs('../src/lib/supabaseData.ts', { './supabase': { supabase }, './prescriptions': loadTs('../src/lib/prescriptions.ts') })
  await assert.rejects(api.createPatientAndInvite('Patient', 'patient@example.com', async () => { invites++ }), error => {
    assert.ok(error instanceof api.PatientInviteError)
    assert.equal(error.code, 'SESSION_EXPIRED'); assert.equal(error.patientId, 'saved-patient-id')
    assert.doesNotMatch(JSON.stringify(error), /private refresh token|saved-patient-id/)
    return true
  })
  assert.equal(creates, 1); assert.equal(invites, 0)
})

test('a malformed success response cannot claim invitation delivery or lose partial success', async () => {
  const h = dataHarness({ rpcResponses: [{ data: 'saved-patient-id' }], fetchResponses: [jsonResponse(200, {})] })
  await assert.rejects(h.createPatientAndInvite('Patient', 'patient@example.com', h.fetchImpl), error => error instanceof h.PatientInviteError && error.code === 'OTP_UNCONFIRMED')
  assert.equal(h.calls.length, 1); assert.equal(h.fetchCalls.length, 1)
})

for (const payload of [null, { email: 'patient@example.com', otp: '123456' }, { email: 'patient@example.com', otp: 123456, expiresAt: '2026-01-01' }, { email: 'patient@example.com', otp: 'secret text', expiresAt: '2026-01-01' }, { email: '', otp: '123456', expiresAt: '2026-01-01' }, { email: 'patient@example.com', otp: '123456', expiresAt: 'not-a-date' }]) test(`malformed OTP payload ${JSON.stringify(payload)} preserves the saved patient`, async () => {
  const h = dataHarness({ rpcResponses: [{ data: 'saved-patient-id' }], fetchResponses: [jsonResponse(200, payload)] })
  await assert.rejects(h.createPatientAndInvite('Patient', 'patient@example.com', h.fetchImpl), e => e instanceof h.PatientInviteError && e.patientId === 'saved-patient-id' && e.code === 'OTP_UNCONFIRMED' && e.httpStatus === 200 && !JSON.stringify(e).includes('patient@example.com'))
  assert.equal(h.calls.length, 1); assert.equal(h.fetchCalls.length, 1)
})
