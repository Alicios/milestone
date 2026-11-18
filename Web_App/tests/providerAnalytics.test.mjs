import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'
const require = createRequire(import.meta.url)

// Real modules compiled in memory, with no configured client or network access.
function loadTs(path, mocks = {}) {
  const filename = fileURLToPath(new URL(path, import.meta.url))
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const module = { exports: {} }
  const dependency = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name === './errors' || name === '../lib/errors') return errors
    if (name.startsWith('.')) throw new Error(`Unmocked application import: ${name}`)
    if (name.startsWith('@mui/icons-material/')) return { default: 'Icon' }
    return require(name)
  }
  new Function('require', 'module', 'exports', outputText)(dependency, module, module.exports)
  return module.exports
}
const errors = loadTs('../src/lib/errors.ts')
const prescriptions = loadTs('../src/lib/prescriptions.ts')

function transport(rpcResult) {
  const calls = []
  return { calls, supabase: {
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return rpcResult },
  } }
}
const dataModule = (t) => loadTs('../src/lib/supabaseData.ts', { './supabase': t, './prescriptions': prescriptions, './videoPreview': loadTs('../src/lib/videoPreview.ts') })

const rpcRow = (overrides = {}) => ({
  patient_profile_id: 'profile-1', patient_name: 'Frank Murgolo', discharged: false,
  scheduled_count: 10, completed_count: 7, missed_count: 1, critical_count: 1, issue_count: 1, in_progress_count: 0,
  avg_pain_score: '4.5', ...overrides,
})

test('loadProviderRoutineAnalytics calls the RPC with null defaults and maps snake_case rows to camelCase', async () => {
  const t = transport({ data: [rpcRow()] })
  const result = await dataModule(t).loadProviderRoutineAnalytics()
  assert.deepEqual(t.calls, [{ rpc: 'get_provider_routine_analytics', args: { p_start: null, p_end: null } }])
  assert.deepEqual(result, [{
    patientProfileId: 'profile-1', patientName: 'Frank Murgolo', discharged: false,
    scheduledCount: 10, completedCount: 7, missedCount: 1, criticalCount: 1, issueCount: 1, inProgressCount: 0,
    avgPainScore: 4.5,
  }])
})

test('loadProviderRoutineAnalytics forwards an explicit date range and treats a null average pain score as null', async () => {
  const t = transport({ data: [rpcRow({ avg_pain_score: null })] })
  const result = await dataModule(t).loadProviderRoutineAnalytics('2026-01-01', '2026-01-31')
  assert.deepEqual(t.calls, [{ rpc: 'get_provider_routine_analytics', args: { p_start: '2026-01-01', p_end: '2026-01-31' } }])
  assert.equal(result[0].avgPainScore, null)
})

test('loadProviderRoutineAnalytics treats a missing data array as an empty result instead of throwing', async () => {
  const t = transport({ data: null })
  assert.deepEqual(await dataModule(t).loadProviderRoutineAnalytics(), [])
})

test('loadProviderRoutineAnalytics propagates a backend error without retrying', async () => {
  const error = { code: '42501', message: 'Providers only' }
  const t = transport({ error, status: 403 })
  await assert.rejects(dataModule(t).loadProviderRoutineAnalytics(), (caught) => caught.cause === error)
  assert.equal(t.calls.length, 1)
})
