import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/modules.mjs'
const errors = loadTs('src/lib/errors.ts')
const secret = 'SQL clinical_notes Bearer secret-token patient@example.invalid'
function harness({ pages = [{ data: [] }], inboxPages = [{ data: [] }], failureTable, failure, thrown } = {}) {
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
  }, rpc(name) {
    const call = { rpc: name, operations: [] }; calls.push(call)
    return { range(...args) { call.operations.push(['range', ...args]); return Promise.resolve(inboxPages.shift()) } }
  } }
  return { ...loadTs('src/lib/messages.ts', { './supabase': { supabase }, './errors': errors }), calls }
}
const row = id => ({ id: String(id), patient_profile_id: 'profile', sender_kind: 'patient', body: `Message ${id}`, created_at: '2026-10-27T12:00:00Z' })
test('inbox uses summaries only, keeps empty recipients and counts beyond the history page limit', async () => {
  const h = harness({ inboxPages: [{ data: [
    { patient_profile_id: 'profile', patient_name: 'Pat One', last_body: 'Latest', last_message_at: '2026-11-08T12:00:00Z', unread_count: '1001', starred: true },
    { patient_profile_id: 'empty', patient_name: 'Other', last_body: null, last_message_at: null, unread_count: 0, starred: false },
  ] }] })
  const rows = await h.loadMessageConversations()
  assert.equal(rows[0].unread, 1001)
  assert.equal(rows[0].preview, 'Latest')
  assert.equal(rows[0].initials, 'PO')
  assert.equal(rows[0].starred, true)
  assert.equal(rows[1].lastMessageAt, null)
  assert.equal(rows[1].preview, 'No messages yet')
  assert.ok(rows.every(row => !('messages' in row)))
  assert.deepEqual(h.calls, [{ rpc: 'get_provider_message_inbox', operations: [['range', 0, 499]] }])
})
test('inbox paginates summaries without requesting any history', async () => {
  const row = { patient_profile_id: 'profile', patient_name: 'Patient', unread_count: 0, starred: false, last_message_at: null }
  const h = harness({ inboxPages: [{ data: Array(500).fill(row) }, { data: [row] }] })
  assert.equal((await h.loadMessageConversations()).length, 501)
  assert.deepEqual(h.calls.map(c => c.operations), [[['range', 0, 499]], [['range', 500, 999]]])
  assert.ok(h.calls.every(c => c.rpc === 'get_provider_message_inbox'))
})
test('inbox failures retain status and hide diagnostics', async () => {
  const native = { code: '42501', message: secret }
  const h = harness({ inboxPages: [{ error: native, status: 403 }] })
  await assert.rejects(h.loadMessageConversations(), e => e.code === 'FORBIDDEN' && e.cause === native && !JSON.stringify(e).includes(secret))
})
test('selected history loads 1001 messages in ordered pages scoped to one relationship', async () => {
  const h = harness({ pages: [{ data: Array.from({ length: 500 }, (_, i) => row(i)) }, { data: Array.from({ length: 500 }, (_, i) => row(i + 500)) }, { data: [row(1000)] }] })
  const messages = await h.loadMessageHistory('profile')
  assert.equal(messages.length, 1001)
  assert.equal(messages.at(-1).text, 'Message 1000')
  assert.deepEqual(h.calls.map(c => c.operations.find(([name]) => name === 'range')), [['range', 0, 499], ['range', 500, 999], ['range', 1000, 1499]])
  for (const call of h.calls) {
    assert.equal(call.table, 'messages')
    assert.deepEqual(call.operations.find(([name]) => name === 'eq'), ['eq', 'patient_profile_id', 'profile'])
    assert.deepEqual(call.operations.filter(([name]) => name === 'order'), [['order', 'created_at', { ascending: true }], ['order', 'id', { ascending: true }]])
  }
})

test('missing image column falls back to text history on the deployed schema', async () => {
  const h = harness({ pages: [{ error: { code: '42703' }, status: 400 }, { data: [row('old')] }] })
  const messages = await h.loadMessageHistory('profile')
  assert.equal(messages[0].text, 'Message old')
  assert.equal(messages[0].imagePath, null)
  assert.deepEqual(h.calls.map(c => c.operations.find(([name]) => name === 'select')?.[1]),
    ['id, sender_kind, body, created_at, image_path', 'id, sender_kind, body, created_at'])
})

test('image support probe recognizes the pending database migration', async () => {
  const supabase = { from: () => ({ select: () => ({ limit: async () => ({ error: { code: '42703' }, status: 400 }) }) }) }
  const { checkMessageImageSupport } = loadTs('src/lib/messages.ts', { './supabase': { supabase }, './errors': errors })
  assert.equal(await checkMessageImageSupport(), false)
})
for (const mode of ['returned', 'thrown']) test(`later history page ${mode} failure rejects the whole read without retry`, async () => {
  const native = { code: 'XX000', status: 503, message: secret }
  const second = mode === 'returned' ? { error: native, status: 503 } : { then: (_, reject) => reject(native) }
  const h = harness({ pages: [{ data: Array.from({ length: 500 }, (_, i) => row(i)) }, second] })
  await assert.rejects(h.loadMessageHistory('profile'), e => e.code === 'SERVICE_UNAVAILABLE' && e.httpStatus === 503 && e.cause === native && !JSON.stringify(e).includes(secret))
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

test('image message uploads privately before inserting its relationship-scoped path', async () => {
  const calls = []
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'sender' } } }) },
    storage: { from: bucket => ({ upload: async (path, file, options) => { calls.push({ bucket, path, file, options }); return { error: null } } }) },
    from: table => ({
      select: () => ({ limit: async () => ({ error: null, status: 200 }) }),
      insert: async row => { calls.push({ table, row }); return { error: null } },
    }),
  }
  const { sendProviderImage } = loadTs('src/lib/messages.ts', { './supabase': { supabase }, './errors': errors })
  const file = { type: 'image/png', size: 123, name: 'photo.png' }
  await sendProviderImage('profile', file, ' hello ')
  assert.equal(calls[0].bucket, 'message-images')
  assert.match(calls[0].path, /^profile\/sender\/[-a-f0-9]+\.png$/)
  assert.deepEqual(calls[0].options, { contentType: 'image/png', upsert: false })
  assert.deepEqual(calls[1].row, { patient_profile_id: 'profile', sender_kind: 'provider', body: 'hello', image_path: calls[0].path })
  await assert.rejects(sendProviderImage('profile', { type: 'image/svg+xml', size: 123 }, ''), /JPEG, PNG, or WebP/)
  assert.equal(calls.length, 2)
})
