import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  console.warn('Supabase is not configured. Copy .env.example to .env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

// Placeholder values keep the app from crashing on load when env vars are missing;
// auth calls fail with a clear error instead (see AuthContext).
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing-anon-key')
