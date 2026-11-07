import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

function compile(path, dependencies, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', ...Object.keys(globals), compiled)(name => {
    if (!Object.hasOwn(dependencies, name)) throw Error(`Unexpected dependency ${name}`)
    return dependencies[name]
  }, module, module.exports, ...Object.values(globals))
  return module.exports
}

// Exercise the emitted ESM, with real imports, as Vercel's Node runtime does.
// Mocked CommonJS loaders and Vite both hide missing file extensions.
test('both deployed API handlers load under Node ESM and handle requests', async () => {
  const parent = fileURLToPath(new URL('../node_modules/.tmp/', import.meta.url))
  mkdirSync(parent, { recursive: true })
  const directory = mkdtempSync(join(parent, 'patient-api-esm-'))
  assert.equal(dirname(resolve(directory)), resolve(parent))
  try {
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}')
    for (const file of ['api/invite-patient', 'api/update-patient-onboarding', 'server/patientOnboarding', 'server/patientEmail',
      'supabase/functions/_shared/patientOnboarding', 'supabase/functions/_shared/patientEmail']) {
      const source = readFileSync(new URL(`../${file}.ts`, import.meta.url), 'utf8')
      const target = join(directory, `${file}.js`)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
    }
    for (const name of ['invite-patient', 'update-patient-onboarding']) {
      const { default: handler } = await import(pathToFileURL(join(directory, 'api', `${name}.js`)).href)
      const res = { setHeader() {}, status(code) { this.code = code; return this }, json(body) { this.body = body; return this }, end() { return this } }
      await handler({ method: 'GET' }, res)
      assert.equal(res.code, 405)
      await handler({ method: 'POST', headers: {}, body: { patientId: 'invalid' } }, res)
      assert.equal(res.code, 400)
      assert.equal(res.body.error.code, 'VALIDATION_ERROR')
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
function harness(options = {}) {
  const state = { patient: { id: 'patient', name: 'Old Name', email: 'old@example.invalid', auth_user_id: 'auth' },
    authEmail: 'old@example.invalid', updates: [], calls: [], emails: [], signedIn: false, sync: false, ...options }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'provider' } } }), admin: {
      getUserById: async () => ({ data: { user: { email: state.authEmail, user_metadata: {}, last_sign_in_at: state.signedIn ? '2026-01-01' : null } } }),
      updateUserById: async (id, body) => {
        state.updates.push(body)
        if (state.conflict && body.email !== 'old@example.invalid') return { error: { code: 'email_exists' }, data: {} }
        if (state.failRestore && state.updates.length === 2) throw Error('secret transport detail')
        state.authEmail = body.email
        return { data: { user: { email: body.email } } }
      },
      generateLink: async () => { state.generated = true; return { data: { user: { id: 'auth' }, properties: { email_otp: '123456' } } } },
    } },
    from(table) { return { select() { return this }, eq() { return this }, async maybeSingle() {
      return { data: table === 'providers' ? (state.noProvider ? null : { id: 'provider' }) : state.patient }
    } } },
    async rpc(name, args) {
      state.calls.push({ name, args })
      if (name === 'begin_patient_onboarding_operation') {
        if (state.denied) return { error: { code: '42501' } }
        if (state.busy) return { error: { code: '55P03' } }
        if (args.p_kind === 'edit' && state.signedIn) return { error: { message: 'SETUP_COMPLETE' } }
        if (args.p_kind === 'invite' && state.sync) return { error: { message: 'RECONCILIATION_REQUIRED' } }
        return { data: { token: 'operation', patient: { ...state.patient }, needsReconciliation: state.sync } }
      }
      if (name === 'complete_patient_onboarding_operation') {
        if (state.failCommit) return { error: { code: 'XX000' } }
        if (args.p_result.email) state.patient = { ...state.patient, name: args.p_result.name, email: args.p_result.email }
        state.sync = false
        if (state.lostCommit) throw Error('lost commit response')
        return {}
      }
      if (name === 'release_patient_onboarding_operation') { state.sync = !args.p_reconciled; return {} }
      throw Error(`Unexpected RPC ${name}`)
    },
  }
  const api = compile('../server/patientOnboarding.ts', {
    '@supabase/supabase-js': { createClient: () => client },
    '../supabase/functions/_shared/patientOnboarding.js': compile('../supabase/functions/_shared/patientOnboarding.ts', {}),
    './patientEmail.js': { sendPatientLoginCode: async (...args) => {
      assert.equal(state.calls.at(-1).name, 'complete_patient_onboarding_operation', 'Email must follow the confirmed database commit')
      state.emails.push(args)
      return state.emailStatus ?? 'sent'
    } },
  })
  return { api, client, state, save: (name = 'Correct Name', email = 'correct@example.invalid') => api.saveOnboarding(client, 'patient', 'provider', name, email) }
}

test('email correction synchronizes Auth before committing patient details', async () => {
  const h = harness(); const saved = await h.save()
  assert.equal(saved.emailChanged, true); assert.equal(h.state.authEmail, saved.email)
  assert.equal(h.state.patient.email, saved.email)
  assert.equal(h.state.updates.length, 1)
})
test('uninvited patient correction does not create an Auth account', async () => {
  const h = harness({ patient: { id: 'patient', name: 'Old Name', email: null, auth_user_id: null } })
  await h.save(); assert.equal(h.state.updates.length, 0); assert.equal(h.state.patient.email, 'correct@example.invalid')
})
test('name-only correction does not modify Auth or clear a code', async () => {
  const h = harness(); const saved = await h.save('Correct Name', 'old@example.invalid')
  assert.equal(saved.emailChanged, false); assert.equal(h.state.updates.length, 0)
})
test('a failed patient write restores the Auth email before allowing another code', async () => {
  const h = harness({ failCommit: true })
  await assert.rejects(h.save(), { code: 'SAVE_FAILED' })
  assert.equal(h.state.authEmail, 'old@example.invalid'); assert.equal(h.state.sync, false)
  const release = h.state.calls.at(-1).args
  assert.equal(release.p_reconciled, true); assert.equal(release.p_clear_code, true)
})
test('failed compensation persists reconciliation and blocks code generation', async () => {
  const h = harness({ failCommit: true, failRestore: true })
  await assert.rejects(h.save(), { code: 'RECONCILIATION_REQUIRED' })
  assert.equal(h.state.sync, true)
  await assert.rejects(h.api.generatePatientCode(h.client, 'patient', 'provider'), { code: 'RECONCILIATION_REQUIRED' })
  assert.equal(h.state.generated, undefined)
})
test('saving correct details repairs a previous reconciliation failure', async () => {
  const h = harness({ sync: true, authEmail: 'inconsistent@example.invalid' })
  await h.save('Old Name', 'old@example.invalid')
  assert.equal(h.state.authEmail, 'old@example.invalid'); assert.equal(h.state.sync, false)
})
test('email collisions do not merge or replace accounts', async () => {
  const h = harness({ conflict: true })
  await assert.rejects(h.save(), { code: 'EMAIL_CONFLICT' })
  assert.equal(h.state.patient.email, 'old@example.invalid'); assert.equal(h.state.authEmail, 'old@example.invalid')
})
for (const [option, code] of [['signedIn', 'SETUP_COMPLETE'], ['denied', 'FORBIDDEN'], ['busy', 'BUSY']]) {
  test(`${option} blocks edits before Auth writes`, async () => {
    const h = harness({ [option]: true })
    await assert.rejects(h.save(), { code }); assert.equal(h.state.updates.length, 0)
  })
}
test('a lost commit response is confirmed without undoing a saved email', async () => {
  const h = harness({ lostCommit: true }); await h.save()
  assert.equal(h.state.authEmail, 'correct@example.invalid'); assert.equal(h.state.updates.length, 1)
})
test('code generation stores a code only through the serialized commit', async () => {
  const h = harness(); const result = await h.api.generatePatientCode(h.client, 'patient', 'provider')
  assert.equal(result.otp, '123456')
  assert.equal(h.state.calls.at(-1).args.p_result.authUserId, 'auth')
  assert.deepEqual(h.state.emails, [])
  assert.equal(result.emailStatus, undefined)
})
test('endpoint rejects invalid input and non-POST methods without database access', async () => {
  const h = harness()
  const endpoint = compile('../api/update-patient-onboarding.ts', { '../server/patientOnboarding.js': h.api }).default
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this }, end() { return this } }
  await endpoint({ method: 'POST', body: { patientId: 'bad', name: '', email: 'bad' }, headers: {} }, res)
  assert.equal(res.statusCode, 400); assert.equal(res.body.error.code, 'VALIDATION_ERROR')
  assert.equal(h.state.calls.length, 0)
  await endpoint({ method: 'GET' }, res); assert.equal(res.statusCode, 405)
})

for (const emailStatus of ['sent', 'failed', 'not_configured']) {
  for (const auth_user_id of ['auth', null]) test(`code for ${auth_user_id ? 'existing' : 'new'} patient reports ${emailStatus} delivery without losing the code`, async () => {
    const h = harness({ emailStatus, patient: { id: 'patient', name: 'Patient', email: 'patient@example.invalid', auth_user_id } })
    const code = await h.api.generatePatientCode(h.client, 'patient', 'provider', true)
    assert.equal(code.emailStatus, emailStatus)
    assert.equal(code.otp, '123456')
    assert.deepEqual(h.state.emails, [[code.email, code.otp, code.expiresAt, 'operation']])
    assert.equal(h.state.calls.some(call => call.name === 'release_patient_onboarding_operation'), false)
  })
}

test('invite endpoint only requests email when explicitly enabled', async () => {
  const h = harness()
  const deliveries = []
  const endpoint = compile('../api/invite-patient.ts', { '../server/patientOnboarding.js': {
    ...h.api, providerClient: async () => ({ client: h.client, providerId: 'provider' }),
    forwardOnboarding: async () => null,
    generatePatientCode: async (...args) => { deliveries.push(args[3]); return { otp: '123456' } },
  } }).default
  const res = { setHeader() {}, status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this } }
  const patientId = '00000000-0000-0000-0000-000000000080'
  for (const sendEmail of [undefined, false, true]) {
    await endpoint({ method: 'POST', headers: {}, body: { patientId, sendEmail } }, res)
    assert.equal(res.statusCode, 200)
  }
  assert.deepEqual(deliveries, [false, false, true])
  await endpoint({ method: 'POST', headers: {}, body: { patientId, sendEmail: 'true' } }, res)
  assert.equal(res.statusCode, 400)
  assert.equal(deliveries.length, 3)
})

test('failed code persistence never sends a login credential', async () => {
  const h = harness({ failCommit: true })
  await assert.rejects(h.api.generatePatientCode(h.client, 'patient', 'provider', true))
  assert.deepEqual(h.state.emails, [])
})

const mail = compile('../server/patientEmail.ts', {
  '../supabase/functions/_shared/patientEmail.js': compile('../supabase/functions/_shared/patientEmail.ts', {}),
})
async function withMailEnv(run, configured = true) {
  const keys = ['RESEND_API_KEY', 'PATIENT_EMAIL_FROM']
  const previous = keys.map(key => process.env[key])
  if (configured) { process.env.RESEND_API_KEY = 'fixture-mail-key'; process.env.PATIENT_EMAIL_FROM = 'Milestone <login@example.invalid>' }
  else for (const key of keys) delete process.env[key]
  try { await run() }
  finally { keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index] }) }
}

test('mail sends the exact generated code to the patient and confirms provider acceptance', async () => withMailEnv(async () => {
  const result = await mail.sendPatientLoginCode('patient@example.invalid', '123456', '2099-01-01T00:00:00.000Z', 'operation-token', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails')
    assert.equal(options.headers.Authorization, 'Bearer fixture-mail-key')
    assert.equal(options.headers['Idempotency-Key'], 'patient-login/operation-token')
    const body = JSON.parse(options.body)
    assert.deepEqual(body.to, ['patient@example.invalid'])
    assert.match(body.text, /123456/); assert.match(body.text, /2099-01-01T00:00:00.000Z/)
    assert.ok(options.signal)
    return { ok: true, json: async () => ({ id: 'message-id' }) }
  })
  assert.equal(result, 'sent')
}))

test('unconfigured mail does not attempt a request or claim delivery', async () => withMailEnv(async () => {
  assert.equal(await mail.sendPatientLoginCode('patient@example.invalid', '123456', '2099-01-01', 'operation-token', () => { throw Error('Must not send') }), 'not_configured')
}, false))

for (const failure of ['http', 'transport', 'malformed', 'no-id']) test(`mail ${failure} failure is reported without exposing diagnostics`, async () => withMailEnv(async () => {
  const result = await mail.sendPatientLoginCode('patient@example.invalid', '123456', '2099-01-01', 'operation-token', async () => {
    if (failure === 'transport') throw Error('private mail diagnostic')
    return { ok: failure !== 'http', json: async () => { if (failure === 'malformed') throw Error('private response'); return {} } }
  })
  assert.equal(result, 'failed')
}))
test('provider authentication checks role before patient access', async () => {
  const h = harness({ noProvider: true })
  await assert.rejects(h.api.providerClient({ headers: {} }), { code: 'AUTH_REQUIRED' })
  const previousUrl = process.env.VITE_SUPABASE_URL, previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.VITE_SUPABASE_URL = 'https://fixture.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only'
  try { await assert.rejects(h.api.providerClient({ headers: { authorization: 'Bearer fixture' } }), { code: 'FORBIDDEN' }) }
  finally {
    if (previousUrl === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
  }
})

async function withProxy(fetchImpl, run) {
  const keys = ['SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY']
  const previous = keys.map(key => process.env[key])
  const previousFetch = globalThis.fetch
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.VITE_SUPABASE_URL = 'https://fixture.supabase.co'
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'fixture-public-key'
  globalThis.fetch = fetchImpl
  try { await run() }
  finally {
    globalThis.fetch = previousFetch
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index] })
  }
}

test('without a local admin key the API forwards the session and uses the hosted code operation', async () => {
  const h = harness()
  const code = { email: 'patient@example.invalid', otp: '123456', expiresAt: '2099-01-01T00:00:00Z' }
  let forwards = 0
  await withProxy(async (url, options) => {
    forwards++
    assert.equal(url, 'https://fixture.supabase.co/functions/v1/patient-onboarding')
    assert.equal(options.headers.Authorization, 'Bearer signed-in-provider')
    assert.equal(options.headers.apikey, 'fixture-public-key')
    assert.deepEqual(JSON.parse(options.body), { action: 'generate-code', patientId: '00000000-0000-0000-0000-000000000080', sendEmail: false })
    return { ok: true, json: async () => code }
  }, async () => {
    const endpoint = compile('../api/invite-patient.ts', { '../server/patientOnboarding.js': h.api }).default
    const res = { setHeader() {}, status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this } }
    await endpoint({ method: 'POST', headers: { authorization: 'Bearer signed-in-provider' }, body: { patientId: '00000000-0000-0000-0000-000000000080' } }, res)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, code)
  })
  assert.equal(forwards, 1)
  assert.deepEqual(h.state.calls, [])
})

test('proxy rejects missing sessions and leaves configured local admin execution available', async () => {
  await withProxy(() => { throw Error('Must not call fetch') }, async () => {
    const h = harness()
    await assert.rejects(h.api.forwardOnboarding({ headers: {} }, {}), { code: 'AUTH_REQUIRED' })
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only'
    assert.equal(await h.api.forwardOnboarding({ headers: {} }, {}), null)
  })
})

test('proxy preserves known authorization failures without exposing endpoint diagnostics', async () => {
  await withProxy(async () => ({ ok: false, status: 403, json: async () => ({ error: { code: 'FORBIDDEN', message: 'private diagnostic' } }) }), async () => {
    const h = harness()
    await assert.rejects(h.api.forwardOnboarding({ headers: { authorization: 'Bearer fixture' } }, {}), error => error.code === 'FORBIDDEN' && error.status === 403 && !error.message.includes('private diagnostic'))
  })
})

function edgeHarness(options = {}) {
  const h = harness(options)
  let handler
  if (options.invalidSession) h.client.auth.getUser = async () => ({ data: { user: null }, error: { message: 'private diagnostic' } })
  compile('../supabase/functions/patient-onboarding/index.ts', {
    '@supabase/supabase-js': { createClient: () => h.client },
    '../_shared/patientOnboarding.ts': compile('../supabase/functions/_shared/patientOnboarding.ts', {}),
    '../_shared/patientEmail.ts': { sendPatientLoginCode: () => { throw Error('Patient-page generation must not send email') } },
  }, { Deno: { env: { get: name => ({ SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'edge-fixture-only' })[name] }, serve: fn => { handler = fn } } })
  return { ...h, request: body => handler(new Request('https://fixture.supabase.co/functions/v1/patient-onboarding', {
    method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify(body),
  })) }
}

for (const [option, status] of [['invalidSession', 401], ['noProvider', 403], ['denied', 403]]) {
  test(`hosted endpoint rejects ${option} before generating an Auth credential`, async () => {
    const h = edgeHarness({ [option]: true })
    const response = await h.request({ action: 'generate-code', patientId: '00000000-0000-0000-0000-000000000080' })
    assert.equal(response.status, status)
    assert.equal(h.state.generated, undefined)
    assert.doesNotMatch(await response.text(), /private diagnostic/)
  })
}

test('hosted code generation uses the verified provider and returns a code without mail', async () => {
  const h = edgeHarness()
  const response = await h.request({ action: 'generate-code', patientId: '00000000-0000-0000-0000-000000000080', providerId: 'injected-provider' })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).otp, '123456')
  assert.equal(h.state.calls[0].args.p_provider_id, 'provider')
})
