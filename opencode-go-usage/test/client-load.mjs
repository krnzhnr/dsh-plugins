/**
 * Client-half load test: runs the browser module factory and apply() against a
 * minimal fake Cordis context, without a DOM or a renderer. It proves that the
 * module parses, the factory returns the expected plugin shape, apply() inserts
 * its stylesheet hook, registers the locale dictionary, and adds the composer
 * dock pill.
 *
 *   node test/client-load.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')

const registrations = []
const localeRegistrations = []
const effects = []
let loaded = null

const fakeWindow = {
  __ModuleLoader__: {
    load(definition) {
      loaded = definition
    },
  },
}

const fakeCtx = {
  effect(callback, label) {
    const dispose = callback()
    effects.push({ label, dispose })
    return () => {}
  },
  locale: {
    register(namespace, dicts) {
      localeRegistrations.push({ namespace, dicts })
      return () => {}
    },
    bind: () => (key) => key,
  },
  slots: {
    inject(ownerKey, callback) {
      assert.equal(ownerKey, 'conversation.composer.dock')
      callback()
      return () => {}
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
}

const sandbox = {
  window: fakeWindow,
  console,
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
}
vm.createContext(sandbox)
new vm.Script(source, { filename: 'client.js' }).runInContext(sandbox)

assert.ok(loaded !== null, 'module calls window.__ModuleLoader__.load')
assert.equal(loaded.id, '@local/opencode-go-usage')

const fakeReactDOM = { createPortal: (node) => node }
const plugin = loaded.factory((name) => {
  assert.ok(name === 'react' || name === 'react-dom', `unexpected require: ${name}`)
  return name === 'react-dom' ? fakeReactDOM : {}
})
assert.ok(Array.isArray(plugin.inject), 'plugin exposes an inject array')
assert.deepEqual([...plugin.inject].sort(), ['locale', 'slots'])
assert.equal(typeof plugin.apply, 'function')

plugin.apply(fakeCtx)

assert.equal(localeRegistrations.length, 1)
assert.equal(localeRegistrations[0].namespace, 'opencode-go-usage')
assert.ok(localeRegistrations[0].dicts.en['panel.title'] === 'OpenCode Go')
assert.ok(localeRegistrations[0].dicts.en['pill.aria'].includes('{window}'))
assert.equal(registrations.length, 1)
const registration = registrations[0]
assert.equal(registration.options.name, 'conversation.composer.dock')
assert.equal(registration.options.id, 'opencode-go-usage')
assert.equal(registration.options.order, 2)
assert.equal(registration.options.locale, 'opencode-go-usage')
assert.equal(typeof registration.component, 'function')
assert.equal(effects.length, 2)
assert.ok(
  effects.every((effect) => typeof effect.dispose === 'function'),
  'stylesheet and locale effects are disposed',
)

console.log('client module load test passed')
console.log(`  dictionary keys: ${Object.keys(localeRegistrations[0].dicts.en).length}`)
console.log(`  dock registration: ${registration.options.id} (order ${registration.options.order})`)
console.log(`  effects: ${effects.map((effect) => effect.label).join(', ')}`)
