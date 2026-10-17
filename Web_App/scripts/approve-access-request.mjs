// Run locally from an interactive terminal. Passwords are never CLI arguments.
// Supabase Auth handles password hashing and salting; this script does not.
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { pathToFileURL } from 'node:url'

const usage = 'Usage: node scripts/approve-access-request.mjs <email> --medical-practice-id <uuid> [--professional-title "Physical Therapist"]'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class ApprovalError extends Error {}

export function parseApprovalArguments(args) {
  const [email, ...options] = args
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new ApprovalError(usage)
  let medicalPracticeId
  let professionalTitle
  for (let index = 0; index < options.length; index += 2) {
    const flag = options[index]
    const value = options[index + 1]
    if (!['--medical-practice-id', '--professional-title', '--role'].includes(flag)
      || !value?.trim() || value.startsWith('--')) throw new ApprovalError(usage)
    if (flag === '--medical-practice-id') {
      if (medicalPracticeId !== undefined || !uuidPattern.test(value)) throw new ApprovalError(usage)
      medicalPracticeId = value.toLowerCase()
    } else {
      // Retain the legacy title alias, but reject duplicate/conflicting options.
      if (professionalTitle !== undefined) throw new ApprovalError(usage)
      professionalTitle = value.trim()
    }
  }
  if (!medicalPracticeId) throw new ApprovalError(usage)
  return { email, medicalPracticeId, professionalTitle }
}

export function promptHiddenPassword(label, { input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY || !output.isTTY || input.destroyed || input.readableEnded
    || typeof input.setRawMode !== 'function') {
    return Promise.reject(new ApprovalError('An interactive terminal is required. Password arguments and piped input are not supported.'))
  }
  return new Promise((resolve, reject) => {
    // Readline manages raw mode/editing, but all of its echo goes to a sink.
    // Disable history and display neither the password nor its length.
    const hiddenOutput = new Writable({ write(_chunk, _encoding, callback) { callback() } })
    let reader
    let settled = false
    const cancel = () => finish(new ApprovalError('Password entry cancelled or unavailable. No approval was attempted.'))
    function finish(error, answer) {
      if (settled) return
      settled = true
      input.removeListener('end', cancel)
      input.removeListener('error', cancel)
      input.removeListener('close', cancel)
      process.removeListener('SIGINT', cancel)
      process.removeListener('SIGTERM', cancel)
      reader?.removeListener('close', cancel)
      reader?.close()
      hiddenOutput.end()
      output.write('\n')
      if (error) reject(error)
      else resolve(answer)
    }
    try {
      reader = createInterface({ input, output: hiddenOutput, terminal: true, historySize: 0 })
      reader.once('SIGINT', cancel)
      reader.once('SIGTSTP', cancel)
      reader.once('error', cancel)
      reader.once('close', cancel)
      input.once('end', cancel)
      input.once('error', cancel)
      input.once('close', cancel)
      process.once('SIGINT', cancel)
      process.once('SIGTERM', cancel)
      output.write(label)
      reader.question('').then((answer) => finish(null, answer), cancel)
    } catch {
      cancel()
    }
  })
}

async function checkedCall(operation, failureMessage) {
  try {
    const result = await operation()
    if (result.error) throw new Error()
    return result.data
  } catch {
    // Never propagate raw API/transport errors: they may include request data.
    throw new ApprovalError(failureMessage)
  }
}

export async function approveAccessRequest(args, {
  getClient = async () => (await import('./admin-client.mjs')).adminClient,
  readPassword = promptHiddenPassword,
  log = console.log,
} = {}) {
  const { email, medicalPracticeId, professionalTitle } = parseApprovalArguments(args)
  let password = ''
  let confirmation = ''
  try {
    password = await readPassword('Password (input hidden): ')
    if (typeof password !== 'string' || !password.trim()) throw new ApprovalError('A nonblank password is required. No approval was attempted.')
    confirmation = await readPassword('Confirm password (input hidden): ')
    if (password !== confirmation) throw new ApprovalError('Passwords do not match. No approval was attempted.')
    confirmation = ''

    // Load credentials only after arguments and interactive input are accepted.
    const client = await getClient()
    const request = await checkedCall(() => client.from('access_requests')
      .select('id, name, email, department, status').eq('email', email)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    'Failed to look up the access request.')
    if (!request) throw new ApprovalError('No access request was found for that email.')

    const practice = await checkedCall(() => client.from('medical_practices')
      .select('id').eq('id', medicalPracticeId).maybeSingle(),
    'Failed to verify the medical practice.')
    if (!practice || practice.id !== medicalPracticeId) {
      throw new ApprovalError('The medical practice ID does not identify an existing practice. No account was created.')
    }
    if (request.status === 'approved') log('Warning: this request is already approved. Account creation may be rejected if the user already exists.')

    const created = await checkedCall(() => client.auth.admin.createUser({
      email: request.email,
      password,
      email_confirm: true,
      user_metadata: {
        name: request.name,
        professional_title: professionalTitle || request.department,
        role: professionalTitle || request.department,
        medical_practice_id: medicalPracticeId,
      },
    }), 'Account creation could not be confirmed. Review the Auth user state before retrying.')
    password = ''
    if (!created?.user?.id) throw new ApprovalError('Account creation could not be confirmed. Review the Auth user state before retrying.')

    await checkedCall(() => client.from('access_requests').update({ status: 'approved' })
      .eq('id', request.id).select('id').single(),
    'The account was created, but the request could not be marked approved. Reconcile the request status before retrying; do not recreate the account.')
    log('Provider account created and access request approved. Share the password through your secure handoff channel; it has not been printed.')
  } finally {
    // Drop references; JavaScript strings cannot be securely zeroed in memory.
    password = ''
    confirmation = ''
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  approveAccessRequest(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof ApprovalError ? error.message : 'Approval failed. Review the account and request state before retrying.')
    process.exitCode = 1
  })
}
