import { adminClient } from './admin-client.mjs'

const { data, error } = await adminClient
  .from('access_requests')
  .select('id, name, email, department, notes, status, created_at')
  .order('created_at', { ascending: false })

if (error) {
  console.error('Failed to load access requests:', error.message)
  process.exit(1)
}

if (!data.length) {
  console.log('No access requests yet.')
  process.exit(0)
}

for (const row of data) {
  console.log(`[${row.status ?? 'pending'}] ${row.name} <${row.email}> — ${row.department}${row.notes ? ` — "${row.notes}"` : ''}`)
  console.log(`  id: ${row.id}   requested: ${row.created_at}`)
}
