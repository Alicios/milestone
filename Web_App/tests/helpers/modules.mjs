import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
const require = createRequire(import.meta.url)
export const root = fileURLToPath(new URL('../../', import.meta.url))
export function loadTs(path, mocks = {}, cache = new Map()) {
  let filename = resolve(root, path)
  if (!existsSync(filename)) filename += existsSync(`${filename}.ts`) ? '.ts' : '.tsx'
  if (cache.has(filename)) return cache.get(filename).exports
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const module = { exports: {} }; cache.set(filename, module)
  const dependency = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('.')) return loadTs(resolve(dirname(filename), name), mocks, cache)
    return require(name)
  }
  new Function('require', 'module', 'exports', outputText)(dependency, module, module.exports)
  return module.exports
}
export const tick = () => new Promise((resolve) => setImmediate(resolve))
export const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
export class MemoryStorage {
  values = new Map()
  get length() { return this.values.size }
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, value) }
  removeItem(key) { this.values.delete(key) }
  key(index) { return [...this.values.keys()][index] ?? null }
}
// Deterministic hook runner: honors dependencies, cleanup, memo identity, and
// synchronous guards. The browser suite separately exercises real React effects.
export function hooks() {
  const slots = []; let cursor = 0; let dirty = false; let component; let output; let effects = []; let mounted = true
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const memo = (fn, deps) => { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value }
  const react = {
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, (value) => { const next = typeof value === 'function' ? value(slots[index].value) : value; if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true } }] },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index] },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect(fn, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) { const previous = slots[index]; slots[index] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn() }) } },
  }
  const flush = () => {
    if (!mounted) return output
    for (let i = 0; i < 40; i++) {
      dirty = false; cursor = 0; output = component()
      const pending = effects; effects = []; pending.forEach((effect) => effect())
      if (!dirty) return output
    }
    throw new Error('Hook render did not settle')
  }
  return { react, render(fn) { component = fn; return flush() }, flush, unmount() { mounted = false; slots.forEach((slot) => slot?.cleanup?.()) } }
}
