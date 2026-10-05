import './env.mjs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  console.error('Missing config. Add these to .env.local (SUPABASE_SERVICE_ROLE_KEY must NOT have a VITE_ prefix):')
  console.error('  VITE_SUPABASE_URL=...              (already there for the app)')
  console.error('  SUPABASE_SERVICE_ROLE_KEY=...       (Project Settings -> API -> service_role secret)')
  process.exit(1)
}

// service_role bypasses Row Level Security — this client must only ever run
// server-side / locally, never ship it to the browser.
export const adminClient = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
