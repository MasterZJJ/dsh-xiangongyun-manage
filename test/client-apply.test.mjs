/**
 * Loads the real client half in Node with stubbed browser globals and a fake
 * ctx, then asserts the three slot registrations and the locale registration.
 * This executes the module's real code path (parse → factory → apply) without a
 * renderer, so it cannot replace a visual check.
 */
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'

const CLIENT = new URL('../client.js', import.meta.url)

let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load(entry) { loaded = entry },
  },
  addEventListener() {},
  removeEventListener() {},
}
globalThis.document = {
  hidden: false,
  body: { style: {} },
  addEventListener() {},
  removeEventListener() {},
}
if (!globalThis.navigator) globalThis.navigator = {}
if (!globalThis.navigator.clipboard) {
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true })
}
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, data: {} }) })

class StubComponent {
  constructor(props) { this.props = props }
  setState(partial) { this.state = { ...(this.state ?? {}), ...partial } }
}
const React = {
  Component: StubComponent,
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: Symbol('Fragment'),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
}
const fakeRequire = (name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require(${name})`)
}

await import(pathToFileURL(CLIENT.pathname).href)
if (!loaded) throw new Error('client.js did not call __ModuleLoader__.load')
console.log('module id:', loaded.id)
const mod = loaded.factory(fakeRequire)
console.log('exports:', Object.keys(mod).join(', '), '| inject:', JSON.stringify(mod.inject))

const regs = []
const injections = []
let localeRegisters = 0
let localeBound = 0
const ctx = {
  slots: {
    inject(key, callback) {
      injections.push(key)
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    register(options, component) {
      regs.push({ name: options.name, id: options.id, order: options.order, label: options.label, component })
      return () => {}
    },
  },
  locale: {
    register() { localeRegisters += 1 },
    bind() { localeBound += 1; return (key) => key },
  },
}

mod.apply(ctx)

console.log('injected slots:', injections.join(', '))
for (const reg of regs) {
  const label = typeof reg.label === 'function' ? reg.label() : reg.label
  console.log(`registered ${reg.name} id=${reg.id} order=${reg.order} label=${label} component=${typeof reg.component}`)
}
console.log(`locale registers=${localeRegisters} binds=${localeBound}`)

const expected = ['settings.section', 'sidebar.footer.action', 'shell.overlay']
const okSlots = expected.every((name) => regs.some((r) => r.name === name && typeof r.component === 'function'))
const okIds = regs.every((r) => typeof r.id === 'string' && r.id.length > 0)
const okLabel = regs.filter((r) => r.name !== 'shell.overlay').every((r) => {
  const label = typeof r.label === 'function' ? r.label() : r.label
  return typeof label === 'string' && label.length > 0
})

console.log(okSlots && okIds && okLabel && localeBound === 1
  ? 'CLIENT APPLY OK (3 slots + locale)'
  : `CLIENT APPLY FAILED slots=${okSlots} ids=${okIds} labels=${okLabel} bind=${localeBound}`)
process.exit(okSlots && okIds && okLabel && localeBound === 1 ? 0 : 1)
