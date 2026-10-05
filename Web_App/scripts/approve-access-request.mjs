// Usage:
//   node scripts/approve-access-request.mjs <email> [password] [--role "Physical Therapist"]
//
// Creates a confirmed Supabase Auth user for a pending access request, using the
// requester's name/email already on file, then marks the request approved.
// If no password is given, a random one is generated and printed once — share it
// with the provider yourself and have them change it after first login.
import { randomBytes } from 'node:crypto'
import { adminClient } from './admin-client.mjs'

const [, , email, maybePassword, ...rest] = process.argv

if (!email) {
  console.error('Usage: node scripts/approve-access-request.mjs <email> [password] [--role "Physical Therapist"]')
  process.exit(1)
}

const roleFlagIndex = rest.indexOf('--role')
const role = roleFlagIndex !== -1 ? rest[roleFlagIndex + 1] : undefined
const password = maybePassword && !maybePassword.startsWith('--') ? maybePassword : randomBytes(9).toString('base64url')

const { data: request, error: findError } = await adminClient
  .from('access_requests')
  .select('id, name, email, department, status')
  .eq('email', email)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()

if (findError) {
  console.error('Failed to look up access request:', findError.message)
  process.exit(1)
}
if (!request) {
  console.error(`No access request found for ${email}.`)
  process.exit(1)
}
if (request.status === 'approved') {
  console.warn(`Warning: this request is already marked approved. Continuing anyway.`)
}

const { data: created, error: createError } = await adminClient.auth.admin.createUser({
  email: request.email,
  password,
  email_confirm: true, // skip the confirmation email; this is an admin-created account
  user_metadata: { name: request.name, role: role || request.department },
})

if (createError) {
  console.error('Failed to create user:', createError.message)
  process.exit(1)
}

const { error: updateError } = await adminClient
  .from('access_requests')
  .update({ status: 'approved' })
  .eq('id', request.id)

if (updateError) {
  console.warn('User was created, but failed to mark the request approved:', updateError.message)
}

console.log(`Created user ${created.user.email} (id: ${created.user.id})`)
console.log(`Temporary password: ${password}`)
console.log('Share this with the provider and have them sign in and change it. A matching row in `profiles` was created automatically by the on_auth_user_created trigger.')
