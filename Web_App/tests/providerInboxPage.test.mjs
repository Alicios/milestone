import test from 'node:test'
import assert from 'node:assert/strict'
import { hooks, loadTs, deferred, tick } from './helpers/modules.mjs'

const summaries = ['a', 'b'].map(id => ({ id, name: id, initials: id, preview: 'Latest', lastMessageAt: '2026-11-08T12:00:00Z', unread: 2, starred: false }))
const message = id => ({ id, text: id, from: 'patient', createdAt: '2026-11-08T12:00:00Z' })
function harness(t, desktop = false) {
  const previous = { window: globalThis.window, document: globalThis.document }
  globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
  globalThis.window = { setInterval() {}, clearInterval() {}, addEventListener() {}, removeEventListener() {} }
  const h = hooks(); const loads = []; const reads = []
  const jsx = (type, props) => ({ type, props })
  const ui = Object.fromEntries(['Alert','Box','Button','FormControl','IconButton','InputAdornment','InputLabel','MenuItem','OutlinedInput','Select','Stack','Typography'].map(name => [name, name]))
  const channel = { on() { return this }, subscribe() { return this } }
  const mocks = {
    react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@mui/material': { ...ui, useMediaQuery: () => desktop, useTheme: () => ({ breakpoints: { up: () => '' }, palette: { mode: 'light', divider: '#ccc' } }) },
    '../auth/AuthContext': { useAuth: () => ({ user }) },
    '../lib/supabase': { supabase: { channel: () => channel, removeChannel() {} } },
    '../lib/messages': {
      loadMessageConversations: async () => summaries,
      loadMessageHistory: id => { const pending = deferred(); loads.push({ id, ...pending }); return pending.promise },
      markMessageThreadRead: async (...args) => { reads.push(args) },
      sendProviderMessage: async () => {}, sendProviderImage: async () => {}, downloadMessageImage: async () => {}, setMessageThreadStarred: async () => {},
      checkMessageImageSupport: async () => true,
    },
  }
  const user = { id: 'provider' }
  for (const icon of ['ArrowBack','Search','Send','StarBorder','Star','AttachFile','Download']) mocks[`@mui/icons-material/${icon}`] = { default: icon }
  const { MessagesPage } = loadTs('src/pages/MessagesPage.tsx', mocks)
  h.render(MessagesPage)
  t.after(() => { h.unmount(); Object.assign(globalThis, previous) })
  const settle = async () => { for (let i = 0; i < 4; i++) { await tick(); h.flush() } }
  const find = (predicate, node = h.flush()) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.map(n => find(predicate, n)).find(Boolean)
    if (predicate(node)) return node
    return find(predicate, node.props?.children ?? null)
  }
  return { loads, reads, settle, find, open(id) { find(n => n.props?.conversation?.id === id).props.onClick(); h.flush() } }
}

test('mobile list displays summary counts without fetching or reading histories', async t => {
  const h = harness(t)
  await h.settle()
  assert.equal(h.find(n => n.props?.conversation?.id === 'a').props.conversation.unread, 2)
  assert.deepEqual(h.loads, [])
  assert.deepEqual(h.reads, [])
})
test('opening and switching conversations ignores stale history and reads only loaded messages', async t => {
  const h = harness(t)
  await h.settle()
  h.open('a'); h.open('b')
  assert.deepEqual(h.loads.map(x => x.id), ['a', 'b'])
  assert.deepEqual(h.reads, [])
  h.loads[0].resolve([message('old-a')]); await h.settle()
  assert.deepEqual(h.reads, [])
  h.loads[1].resolve([message('b')]); await h.settle()
  assert.deepEqual(h.reads, [['b', '2026-11-08T12:00:00Z']])
})
test('failed history does not mark the conversation read', async t => {
  const h = harness(t, true)
  await h.settle()
  assert.deepEqual(h.loads.map(x => x.id), ['a'])
  h.loads[0].reject(new Error('Unavailable')); await h.settle()
  assert.deepEqual(h.reads, [])
  assert.ok(h.find(n => n.type === 'Alert' && n.props.severity === 'error'))
  assert.equal(h.find(n => n.props?.children === 'No messages yet. Send the first one below.'), undefined)
})
