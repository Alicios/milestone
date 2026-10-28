import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/modules.mjs'
const errors = loadTs('src/lib/errors.ts')
const secret = 'SQL clinical_notes Bearer secret-token patient@example.invalid'
function harness({ pages = [{ data: [] }], failureTable, failure, thrown } = {}) {
  const calls = []
  const supabase = { from(table) {
    const call = { table, operations: [] }; calls.push(call)
    const chain = {}
    for (const method of ['select', 'in', 'eq', 'order', 'range', 'insert', 'update']) chain[method] = (...args) => { call.operations.push([method, ...args]); return chain }
    chain.then = (resolve, reject) => {
      if (thrown) return Promise.reject(thrown).then(resolve, reject)
      const result = table === failureTable ? failure : table === 'provider_patient_profiles' ? { data: [{ id: 'profile', patient_id: 'patient' }] }
        : table === 'patients' ? { data: [{ id: 'patient', name: 'Patient' }] }
          : table === 'messages' && call.operations.some(([name]) => name === 'range') ? pages.shift() : { data: [] }
      assert.ok(result, 'unexpected extra request')
      return Promise.resolve(result).then(resolve, reject)
    }
    return chain
  } }
  return { ...loadTs('src/lib/messages.ts', { './supabase': { supabase }, './errors': errors }), calls }
}
const row = id => ({ id: String(id), patient_profile_id: 'profile', sender_kind: 'patient', body: `Message ${id}`, created_at: '2026-10-27T12:00:00Z' })
test('provider history loads 1001 messages in ordered 500-row pages without truncating unread counts', async () => {
  const h = harness({ pages: [{ data: Array.from({ length: 500 }, (_, i) => row(i)) }, { data: Array.from({ length: 500 }, (_, i) => row(i + 500)) }, { data: [row(1000)] }] })
  const [thread] = await h.loadMessageConversations('provider')
  assert.equal(thread.messages.length, 1001); assert.equal(thread.unread, 1001)
  assert.equal(thread.preview, 'Message 1000')
  const history = h.calls.filter(c => c.operations.some(([name]) => name === 'range'))
  assert.deepEqual(history.map(c => c.operations.find(([name]) => name === 'range')), [['range', 0, 499], ['range', 500, 999], ['range', 1000, 1499]])
  for (const call of history) assert.deepEqual(call.operations.filter(([name]) => name === 'order'), [['order', 'created_at', { ascending: true }], ['order', 'id', { ascending: true }]])
})
for (const [table, code, status, expected] of [['provider_patient_profiles', '42501', 403, 'FORBIDDEN'], ['patients', 'XX000', 503, 'SERVICE_UNAVAILABLE'], ['message_thread_state', '42501', 403, 'FORBIDDEN']]) test(`conversation ${table} failures retain status and hide diagnostics`, async () => {
  const native = { code, message: secret }
  const h = harness({ failureTable: table, failure: { error: native, status } })
  await assert.rejects(h.loadMessageConversations('provider'), e => e.code === expected && e.cause === native && e.sourceCode === code && e.httpStatus === status && !JSON.stringify(e).includes(secret))
})
for (const mode of ['returned', 'thrown']) test(`later history page ${mode} failure rejects the whole read without retry`, async () => {
  const native = { code: 'XX000', status: 503, message: secret }
  const second = mode === 'returned' ? { error: native, status: 503 } : { then: (_, reject) => reject(native) }
  const h = harness({ pages: [{ data: Array.from({ length: 500 }, (_, i) => row(i)) }, second] })
  await assert.rejects(h.loadMessageConversations('provider'), e => e.code === 'SERVICE_UNAVAILABLE' && e.httpStatus === 503 && e.cause === native && !JSON.stringify(e).includes(secret))
  assert.equal(h.calls.filter(c => c.table === 'messages').length, 2)
})
test('message validation counts Unicode code points and performs no write for invalid text', async () => {
  const h = harness()
  for (const text of [' ', 'x'.repeat(4001), '😀'.repeat(4001)]) await assert.rejects(h.sendProviderMessage('profile', text), e => e.code === 'VALIDATION_ERROR' && e.details.fieldErrors.body === 'INVALID')
  assert.equal(h.calls.length, 0)
  await h.sendProviderMessage('profile', `  ${'😀'.repeat(4000)}  `)
  assert.deepEqual(h.calls[0].operations, [['insert', { patient_profile_id: 'profile', sender_kind: 'provider', body: '😀'.repeat(4000) }]])
})
for (const operation of ['sendProviderMessage', 'markMessageThreadRead', 'setMessageThreadStarred']) {
  for (const mode of ['returned', 'thrown']) test(`${operation} normalizes ${mode} failures without repeating mutations`, async () => {
    const native = mode === 'returned' ? { code: '42501', message: secret } : new TypeError('Failed to fetch')
    const h = harness({ failureTable: operation === 'sendProviderMessage' ? 'messages' : 'message_thread_state', failure: { error: native, status: 403 }, thrown: mode === 'thrown' ? native : undefined })
    await assert.rejects(h[operation]('profile', operation === 'setMessageThreadStarred' ? true : 'Hello'), e => e.code === (mode === 'returned' ? 'FORBIDDEN' : 'NETWORK_ERROR') && e.cause === native && !JSON.stringify(e).includes(secret))
    assert.equal(h.calls.length, 1)
  })
}
test('read cursor and star updates retain their current query contracts', async () => {
  const h = harness(); await h.markMessageThreadRead('profile', 'displayed-at'); await h.setMessageThreadStarred('profile', true)
  assert.deepEqual(h.calls.map(c => c.operations), [[['update', { last_read_at: 'displayed-at' }], ['eq', 'patient_profile_id', 'profile']], [['update', { starred: true }], ['eq', 'patient_profile_id', 'profile']]])
})
