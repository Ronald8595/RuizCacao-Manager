const { load, root } = require('./loader.cjs'),
  assert = require('node:assert/strict')
const { claveNovedades, debeMostrarNovedades, confirmarNovedades } = load(
  root + '/src/renderer/src/utils/novedades.ts'
)
const datos = new Map(),
  storage = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v) }
assert.equal(debeMostrarNovedades('', storage), false)
assert.equal(debeMostrarNovedades('usuario-uno', storage, '1.1.2'), true)
confirmarNovedades('usuario-uno', storage, '1.1.2')
assert.equal(datos.get('ruizcacao:novedades:usuario-uno:1.1.2'), 'visto')
assert.equal(debeMostrarNovedades('usuario-uno', storage, '1.1.2'), false)
assert.equal(debeMostrarNovedades('usuario-dos', storage, '1.1.2'), true)
assert.equal(debeMostrarNovedades('usuario-uno', storage, '1.1.3'), true)
assert.notEqual(claveNovedades('usuario-uno', '1.1.2'), claveNovedades('usuario-dos', '1.1.2'))
assert.equal(debeMostrarNovedades('usuario-persistido', { getItem: () => 'visto' }, '1.1.2'), false)
const roto = {
  getItem: () => {
    throw Error('No disponible')
  },
  setItem: () => {
    throw Error('Sin espacio')
  }
}
assert.equal(debeMostrarNovedades('usuario-error', roto), true)
assert.doesNotThrow(() => confirmarNovedades('usuario-error', roto))
assert.equal(debeMostrarNovedades('usuario-error', roto), false)
console.log(
  'OK novedades: aislamiento por usuario y versión, persistencia, próxima versión y fallo de localStorage.'
)
