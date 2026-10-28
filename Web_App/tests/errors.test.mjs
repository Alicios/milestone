import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs, hooks, tick } from './helpers/modules.mjs'

const errors = loadTs('src/lib/errors.ts')
const { AppError, normalizeError, toErrorResponse, errorMessage } = errors
const secret = 'SELECT clinical_notes FROM private.patient; Bearer secret-token /database/path stack trace'

test('standard envelope preserves diagnostics internally and serializes only the public contract', () => {
  const native = Object.freeze({ code: 'P0002', message: secret, details: secret, hint: secret, stack: secret })
  const error = normalizeError(native, { operation: 'saveRoutine', status: 500 })
  assert.ok(error instanceof AppError)
  assert.deepEqual(toErrorResponse(error), { error: { code: 'ROUTINE_NOT_FOUND', message: 'The requested routine could not be found.', details: null } })
  assert.equal(error.cause, native)
  assert.equal(error.sourceCode, 'P0002')
  assert.equal(error.httpStatus, 500) // Keep the actual status, not a fabricated 404.
  assert.equal(normalizeError(error), error)
  assert.equal(JSON.stringify(error), JSON.stringify(toErrorResponse(error)))
  assert.doesNotMatch(JSON.stringify(error), /clinical_notes|secret-token|database|stack|P0002/)
  assert.equal(Object.keys(error).includes('cause'), false)
  assert.equal(Object.keys(error).includes('sourceCode'), false)
  assert.equal(Object.keys(error).includes('httpStatus'), false)
})

for (const [native, context, expected] of [
  [{ code: 'invalid_credentials', status: 400 }, {}, 'INVALID_CREDENTIALS'],
  [{ name: 'AuthSessionMissingError' }, {}, 'AUTH_REQUIRED'],
  [{ code: 'refresh_token_not_found', status: 400 }, {}, 'SESSION_EXPIRED'],
  [{ code: 'PGRST301', status: 401 }, {}, 'AUTH_REQUIRED'],
  [{ code: '42501' }, {}, 'FORBIDDEN'],
  [{ code: '42501' }, { status: 401 }, 'AUTH_REQUIRED'],
  [{ code: '42501' }, { status: 403 }, 'FORBIDDEN'],
  [{ code: 'insufficient_aal' }, {}, 'MFA_REQUIRED'],
  [{ code: 'mfa_verification_failed' }, {}, 'MFA_INVALID_CODE'],
  [{ code: 'over_request_rate_limit', status: 429 }, {}, 'RATE_LIMITED'],
  [{ code: '22023' }, {}, 'VALIDATION_ERROR'],
  [{ code: 'weak_password' }, {}, 'VALIDATION_ERROR'],
  [{ code: 'P0002' }, { operation: 'dischargePatient' }, 'PATIENT_NOT_FOUND'],
  [{ code: 'P0002' }, { operation: 'cancelRoutineAssignment' }, 'ASSIGNMENT_NOT_FOUND'],
  [{ code: 'P0002' }, { operation: 'cancelRoutineFollowUp' }, 'FOLLOW_UP_NOT_FOUND'],
  [{ code: '23505' }, { operation: 'assign_routine_schedule' }, 'SCHEDULE_CONFLICT'],
  [{ code: '23505' }, { operation: 'createPatient' }, 'CONFLICT'],
  [{ code: '40001' }, { operation: 'assign_routine_schedule' }, 'ROUTINE_CHANGED'],
  [{ code: 'PGRST202' }, { status: 404 }, 'SERVICE_UNAVAILABLE'],
  [{ code: 'PGRST205' }, { status: 404 }, 'SERVICE_UNAVAILABLE'],
  [{ code: 'PGRST116' }, { status: 406 }, 'UNEXPECTED_ERROR'],
  [{ code: 'XX000' }, { status: 500 }, 'SERVICE_UNAVAILABLE'],
  [{ code: '' }, { status: 0 }, 'NETWORK_ERROR'],
  [{ name: 'AuthRetryableFetchError' }, {}, 'NETWORK_ERROR'],
  [{ name: 'AuthRetryableFetchError', status: 0 }, {}, 'NETWORK_ERROR'],
  [{ name: 'AuthRetryableFetchError', status: 500 }, {}, 'SERVICE_UNAVAILABLE'],
  [{ name: 'AuthRetryableFetchError', status: 503 }, {}, 'SERVICE_UNAVAILABLE'],
  [{ name: 'AbortError' }, {}, 'REQUEST_ABORTED'],
  [{}, { operation: 'inviteExistingPatient', status: 502 }, 'OTP_UNCONFIRMED'],
  [{}, { operation: 'inviteExistingPatient', status: 400 }, 'VALIDATION_ERROR'],
]) test(`normalizes ${JSON.stringify(native)} ${JSON.stringify(context)} to ${expected}`, () => {
  const input = { ...native, message: secret, details: { fieldErrors: { name: secret } } }
  const result = normalizeError(input, context)
  assert.equal(result.code, expected)
  assert.equal(result.cause, input)
  assert.equal(result.details, null)
  assert.doesNotMatch(JSON.stringify(toErrorResponse(result)), /clinical_notes|secret-token|database|stack/)
})

test('unknown errors and forged application payloads never supply user-facing text', () => {
  for (const input of [null, undefined, secret, {}, 42, new Error(secret), { error: { code: 'FORBIDDEN', message: secret } }, { code: 'FORBIDDEN', message: secret }]) {
    assert.equal(normalizeError(input).code, 'UNEXPECTED_ERROR')
    assert.equal(errorMessage(input, 'Unable to save.'), 'Unable to save.')
    assert.equal(toErrorResponse(input).error.details, null)
    assert.doesNotMatch(JSON.stringify(toErrorResponse(input)), /secret-token/)
  }
  assert.equal(normalizeError(new TypeError('Failed to fetch')).code, 'NETWORK_ERROR')
  assert.equal(normalizeError(new TypeError('Cannot read properties of undefined')).code, 'UNEXPECTED_ERROR')
})

test('validation details allow only known fields and issue codes, not supplied text or values', () => {
  const error = new AppError('VALIDATION_ERROR', { details: {
    fieldErrors: { name: 'REQUIRED', email: secret, password: 'INVALID', clinical_notes: 'INVALID' },
    sql: secret, patientId: secret,
  } })
  assert.deepEqual(toErrorResponse(error).error.details, { fieldErrors: { name: 'REQUIRED', password: 'INVALID' } })
  assert.doesNotMatch(JSON.stringify(error), /secret-token|clinical_notes|patientId/)
  assert.equal(new AppError('FORBIDDEN', { details: { fieldErrors: { name: 'REQUIRED' } } }).details, null)
})

function query(result) {
  const chain = {}
  for (const method of ['select', 'order', 'eq', 'insert', 'update', 'in', 'single']) chain[method] = () => chain
  chain.then = (resolve, reject) => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject)
  return chain
}

test('real data boundaries normalize returned and thrown transport failures without retrying', async () => {
  for (const result of [{ error: { code: '', message: secret }, status: 0 }, new TypeError('Failed to fetch'), { error: { code: 'XX000', message: secret }, status: 500 }]) {
    let calls = 0
    const supabase = { from: () => { calls++; return query(result) }, rpc: async () => { calls++; if (result instanceof Error) throw result; return result } }
    const mocks = { './supabase': { supabase }, './errors': errors }
    const data = loadTs('src/lib/supabaseData.ts', mocks)
    const catalog = loadTs('src/lib/exerciseData.ts', mocks)
    const messaging = loadTs('src/lib/messages.ts', mocks)
    for (const operation of [() => data.createPatient('Patient', 'patient@example.invalid'), () => data.loadRoutines('provider'), () => catalog.loadExercises(), () => messaging.sendProviderMessage('relationship', 'Hello')]) {
      const before = calls
      await assert.rejects(operation(), error => error instanceof AppError && error.cause === (result.error ?? result)
        && error.code === (result.status === 500 ? 'SERVICE_UNAVAILABLE' : 'NETWORK_ERROR'))
      assert.equal(calls, before + 1)
    }
  }
})

test('schema compatibility happens before normalization and never falls back for authorization', async () => {
  for (const code of ['42703', '42501']) {
    let calls = 0
    const native = { code, message: 'professional_title unavailable' }
    const supabase = { from: () => query(++calls === 1 ? { error: native, status: 400 } : { data: { id: 'provider' } }) }
    const data = loadTs('src/lib/supabaseData.ts', { './supabase': { supabase }, './errors': errors })
    if (code === '42703') assert.deepEqual(await data.updateProvider('provider', {}), { id: 'provider' })
    else await assert.rejects(data.updateProvider('provider', {}), error => error.code === 'FORBIDDEN' && error.cause === native)
    assert.equal(calls, code === '42703' ? 2 : 1)
  }
})

test('avatar failures keep native diagnostics without exposing storage paths or authentication IDs', async () => {
  const native = { message: secret, statusCode: '403' }
  const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'private-provider-id' } } }) }, storage: { from: () => ({ upload: async () => ({ error: native }) }) } }
  const data = loadTs('src/lib/supabaseData.ts', { './supabase': { supabase }, './errors': errors })
  await assert.rejects(data.uploadProviderAvatar('private-provider-id', { type: 'image/png' }), error => {
    assert.equal(error.code, 'FORBIDDEN'); assert.equal(error.cause, native)
    assert.doesNotMatch(JSON.stringify(error), /secret-token|private-provider|profile-images/)
    return true
  })
})

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten)
  if (!node || typeof node !== 'object') return []
  return [node, ...flatten(node.props?.children)]
}
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : node?.props ? text(node.props.children) : ''

for (const returned of [true, false]) test(`MFA settings handles ${returned ? 'returned' : 'thrown'} factor errors without claiming MFA is off`, async () => {
  const hook = hooks(); let failing = true
  const failure = { code: 'unexpected_failure', status: 500, message: secret }
  const supabase = { auth: { mfa: { listFactors: async () => {
    if (failing) { if (returned) return { error: failure }; throw failure }
    return { data: { totp: [], all: [] } }
  } } } }
  const mui = Object.fromEntries(['Alert','Box','Button','CircularProgress','Stack','TextField','Typography'].map(key => [key, key]))
  const { MfaSettings } = loadTs('src/components/MfaSettings.tsx', { react: hook.react, '@mui/material': mui, '../lib/supabase': { supabase }, '../lib/errors': errors })
  hook.render(() => MfaSettings()); await tick()
  assert.match(text(hook.flush()), /temporarily unavailable/)
  assert.doesNotMatch(text(hook.flush()), /authentication is off|secret-token/)
  failing = false
  flatten(hook.flush()).find(node => node.type === 'Button' && text(node) === 'Retry authenticator settings').props.onClick()
  await tick(); assert.match(text(hook.flush()), /authentication is off/)
  hook.unmount()
})

test('failed MFA cancellation keeps the pending enrollment available for retry and hides native errors', async () => {
  const hook = hooks(); let cancels = 0
  const supabase = { auth: { mfa: {
    listFactors: async () => ({ data: { totp: [], all: [] } }),
    enroll: async () => ({ data: { id: 'factor', totp: { qr_code: 'qr-fixture', secret: 'synthetic-enrollment-key' } } }),
    unenroll: async () => { cancels++; return { error: { code: 'unexpected_failure', status: 500, message: secret } } },
  } } }
  const mui = Object.fromEntries(['Alert','Box','Button','CircularProgress','Stack','TextField','Typography'].map(key => [key, key]))
  const { MfaSettings } = loadTs('src/components/MfaSettings.tsx', { react: hook.react, '@mui/material': mui, '../lib/supabase': { supabase }, '../lib/errors': errors })
  hook.render(() => MfaSettings()); await tick()
  const button = label => flatten(hook.flush()).find(node => node.type === 'Button' && text(node) === label)
  await button('Set up authenticator app').props.onClick()
  await button('Cancel').props.onClick()
  assert.equal(cancels, 1)
  assert.match(text(hook.flush()), /Scan this QR code/)
  assert.match(text(hook.flush()), /temporarily unavailable/)
  assert.doesNotMatch(text(hook.flush()), /secret-token/)
  assert.ok(button('Cancel')); hook.unmount()
})
