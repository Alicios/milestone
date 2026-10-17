import assert from 'node:assert/strict'
import { PassThrough, Writable } from 'node:stream'
import test from 'node:test'
import { ApprovalError, approveAccessRequest, parseApprovalArguments, promptHiddenPassword } from '../scripts/approve-access-request.mjs'

// Synthetic inputs only. Importing the script must not load its admin client.
const practiceId = '00000000-0000-0000-0000-000000000043'
const args = ['provider@example.invalid', '--medical-practice-id', practiceId]
const password = '  synthetic-test-input  '
const request = { id: 'request-id', name: 'Test Provider', email: args[0], department: 'Physical Therapy', status: 'pending' }

function harness(overrides = {}) {
  const calls = []
  const logs = []
  const answers = [...(overrides.answers ?? [password, password])]
  let clientLoads = 0
  let prompts = 0
  const results = {
    request: { data: request },
    practice: { data: { id: practiceId } },
    create: { data: { user: { id: 'user-id' } } },
    update: { data: { id: request.id } },
    ...overrides.results,
  }
  async function response(key) {
    if (results[key] instanceof Error) throw results[key]
    return results[key]
  }
  const client = {
    from(table) {
      const call = { table, operations: [] }
      calls.push(call)
      const builder = {}
      for (const method of ['select', 'eq', 'order', 'limit', 'update']) {
        builder[method] = (...values) => { call.operations.push([method, ...values]); return builder }
      }
      builder.maybeSingle = () => response(table === 'medical_practices' ? 'practice' : 'request')
      builder.single = () => response('update')
      return builder
    },
    auth: { admin: { async createUser(payload) {
      calls.push({ createUser: payload })
      return response('create')
    } } },
  }
  return {
    calls, logs,
    get clientLoads() { return clientLoads },
    get prompts() { return prompts },
    run(input = args) {
      return approveAccessRequest(input, {
        getClient: async () => { clientLoads++; return client },
        readPassword: async () => {
          prompts++
          const answer = answers.shift()
          if (answer instanceof Error) throw answer
          return answer
        },
        log: (message) => logs.push(message),
      })
    },
  }
}

test('arguments accept a required practice and optional title or legacy alias', () => {
  assert.deepEqual(parseApprovalArguments(args), { email: args[0], medicalPracticeId: practiceId, professionalTitle: undefined })
  for (const flag of ['--professional-title', '--role']) {
    assert.equal(parseApprovalArguments([...args, flag, ' Occupational Therapist ']).professionalTitle, 'Occupational Therapist')
  }
})

test('password arguments, unknown flags, malformed IDs and duplicate/missing options fail before prompting or client loading', async () => {
  const badArguments = [
    [], [args[0]], ['invalid-email', ...args.slice(1)],
    [args[0], password, ...args.slice(1)], [...args, password],
    [...args, '--password', password], [...args, '--unknown', 'value'],
    [args[0], '--medical-practice-id'], [args[0], '--medical-practice-id', 'bad-id'],
    [...args, '--medical-practice-id', practiceId], [...args, '--professional-title'],
    [...args, '--professional-title', ''], [...args, '--professional-title', '--role'],
    [...args, '--professional-title', 'A', '--role', 'B'],
  ]
  for (const input of badArguments) {
    const h = harness()
    await assert.rejects(h.run(input), (error) => error instanceof ApprovalError && !error.message.includes(password))
    assert.equal(h.prompts, 0)
    assert.equal(h.clientLoads, 0)
    assert.deepEqual(h.calls, [])
  }
})

test('blank, missing, mismatched and cancelled password input never loads a client', async () => {
  for (const answers of [
    [''], ['   '], [undefined], [password, 'different-input'],
    [new ApprovalError('Cancelled')], [password, new ApprovalError('Cancelled')],
  ]) {
    const h = harness({ answers })
    await assert.rejects(h.run(), ApprovalError)
    assert.equal(h.clientLoads, 0)
    assert.deepEqual(h.calls, [])
    assert.deepEqual(h.logs, [])
  }
})

test('approval verifies the practice, preserves the exact password, then marks only the selected request approved', async () => {
  const h = harness()
  await h.run([...args, '--professional-title', 'Occupational Therapist'])
  assert.equal(h.clientLoads, 1)
  assert.equal(h.prompts, 2)
  assert.deepEqual(h.calls[0], { table: 'access_requests', operations: [
    ['select', 'id, name, email, department, status'], ['eq', 'email', args[0]],
    ['order', 'created_at', { ascending: false }], ['limit', 1],
  ] })
  assert.deepEqual(h.calls[1], { table: 'medical_practices', operations: [['select', 'id'], ['eq', 'id', practiceId]] })
  assert.deepEqual(h.calls[2], { createUser: {
    email: request.email, password, email_confirm: true,
    user_metadata: { name: request.name, professional_title: 'Occupational Therapist', role: 'Occupational Therapist', medical_practice_id: practiceId },
  } })
  assert.deepEqual(h.calls[3], { table: 'access_requests', operations: [
    ['update', { status: 'approved' }], ['eq', 'id', request.id], ['select', 'id'],
  ] })
  assert.equal(h.calls.length, 4)
  assert.ok(h.logs.every((line) => !line.includes(password)))
})

test('default title and already-approved warning preserve existing approval behavior', async () => {
  const h = harness({ results: { request: { data: { ...request, status: 'approved' } } } })
  await h.run()
  assert.equal(h.calls[2].createUser.user_metadata.professional_title, request.department)
  assert.match(h.logs[0], /already approved/)
})

test('missing request or nonexistent practice prevents all writes', async () => {
  for (const results of [{ request: { data: null } }, { practice: { data: null } }, { practice: { data: { id: 'different-id' } } }]) {
    const h = harness({ results })
    await assert.rejects(h.run(), ApprovalError)
    assert.ok(h.calls.every((call) => !call.createUser && !call.operations.some(([method]) => method === 'update')))
  }
})

test('lookup errors and rejected user creation never approve the request or expose raw errors', async () => {
  for (const stage of ['request', 'practice', 'create']) {
    for (const failure of [{ error: { message: password, details: password } }, new Error(password)]) {
      const h = harness({ results: { [stage]: failure } })
      await assert.rejects(h.run(), (error) => error instanceof ApprovalError && !error.message.includes(password))
      assert.ok(h.calls.every((call) => !call.operations?.some(([method]) => method === 'update')))
      assert.ok(h.logs.every((line) => !line.includes(password)))
    }
  }
})

test('an incomplete creation response does not approve the request', async () => {
  const h = harness({ results: { create: { data: { user: null } } } })
  await assert.rejects(h.run(), /could not be confirmed/)
  assert.equal(h.calls.length, 3)
})

test('status-update failure reports that the account exists without retrying creation or logging response data', async () => {
  const h = harness({ results: { update: { error: { message: password } } } })
  await assert.rejects(h.run(), (error) => /account was created/.test(error.message) && !error.message.includes(password))
  assert.equal(h.calls.filter((call) => call.createUser).length, 1)
  assert.equal(h.calls.length, 4)
  assert.deepEqual(h.logs, [])
})

function terminal() {
  const input = new PassThrough()
  const outputChunks = []
  const modes = []
  input.isTTY = true
  input.isRaw = false
  input.setRawMode = (mode) => { modes.push(mode); input.isRaw = mode; return input }
  const output = new Writable({ write(chunk, _encoding, callback) { outputChunks.push(chunk.toString()); callback() } })
  output.isTTY = true
  return { input, output, modes, text: () => outputChunks.join('') }
}

test('hidden prompt rejects noninteractive input or output without consuming a password', async () => {
  for (const stream of ['input', 'output']) {
    const tty = terminal()
    tty[stream].isTTY = false
    await assert.rejects(promptHiddenPassword('Password: ', tty), /interactive terminal/)
    assert.equal(tty.text(), '')
    assert.deepEqual(tty.modes, [])
    tty.input.destroy()
  }
})

test('real readline prompt hides typed input, supports backspace, and restores terminal mode', async () => {
  const tty = terminal()
  const answer = promptHiddenPassword('Password: ', tty)
  tty.input.write(`${password}x\u007f\r`)
  assert.equal(await answer, password)
  assert.equal(tty.text(), 'Password: \n')
  assert.deepEqual(tty.modes, [true, false])
  tty.input.destroy()
})

for (const [label, cancel] of [
  ['Ctrl+C', (input) => input.write('\u0003')],
  ['Ctrl+D', (input) => input.write('\u0004')],
  ['Ctrl+Z', (input) => input.write('\u001a')],
  ['input ending', (input) => input.end()],
  ['input error', (input) => input.emit('error', new Error(password))],
  ['input closing', (input) => input.destroy()],
]) {
  test(`hidden prompt aborts on ${label} without echoing and restores terminal mode`, async () => {
    const tty = terminal()
    const answer = promptHiddenPassword('Password: ', tty)
    const rejected = assert.rejects(answer, (error) => error instanceof ApprovalError && !error.message.includes(password))
    cancel(tty.input)
    await rejected
    assert.equal(tty.text(), 'Password: \n')
    assert.equal(tty.input.isRaw, false)
    tty.input.destroy()
  })
}

test('a closed input cannot start another prompt', async () => {
  const tty = terminal()
  tty.input.destroy()
  await assert.rejects(promptHiddenPassword('Password: ', tty), /interactive terminal/)
  assert.equal(tty.text(), '')
})
