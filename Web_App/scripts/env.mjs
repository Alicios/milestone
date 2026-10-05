// Tiny .env.local loader for admin scripts (no dependency on `dotenv`).
// Only used by Node scripts in this folder — never bundled into the browser build,
// so it's safe to read SUPABASE_SERVICE_ROLE_KEY here as long as that variable
// is NOT prefixed with VITE_ (Vite only exposes VITE_* vars to client code).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const envPath = path.join(root, '.env.local')

try {
  const contents = readFileSync(envPath, 'utf8')
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
} catch {
  // .env.local not found — fall back to whatever is already in process.env.
}
