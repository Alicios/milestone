import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function compile(path, dependencies) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(name => {
    if (!Object.hasOwn(dependencies, name)) throw Error(`Unexpected dependency ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
function harness(options = {}) {
  const state = { patient: { id: 'patient', name: 'Old Name', email: 'old@example.invalid', auth_user_id: 'auth' },
    authEmail: 'old@example.invalid', updates: [], calls: [], signedIn: false, sync: false, ...options }
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
  const api = compile('../server/patientOnboarding.ts', { '@supabase/supabase-js': { createClient: () => client } })
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
})
test('endpoint rejects invalid input and non-POST methods without database access', async () => {
  const h = harness()
  const endpoint = compile('../api/update-patient-onboarding.ts', { '../server/patientOnboarding': h.api }).default
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this }, end() { return this } }
  await endpoint({ method: 'POST', body: { patientId: 'bad', name: '', email: 'bad' }, headers: {} }, res)
  assert.equal(res.statusCode, 400); assert.equal(res.body.error.code, 'VALIDATION_ERROR')
  assert.equal(h.state.calls.length, 0)
  await endpoint({ method: 'GET' }, res); assert.equal(res.statusCode, 405)
})
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
