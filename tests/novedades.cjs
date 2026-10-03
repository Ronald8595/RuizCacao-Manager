const { load, root } = require('./loader.cjs'),
  assert = require('node:assert/strict')
const { claveNovedades, debeMostrarNovedades, confirmarNovedades } = load(
  root + '/src/renderer/src/utils/novedades.ts'
)
const datos = new Map(),
  storage = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v) }
const { VERSION_APP } = load(root + '/src/shared/version.ts')
assert.equal(VERSION_APP, require('../package.json').version)
assert.equal(
  claveNovedades('usuario-version'),
  'ruizcacao:novedades:usuario-version:' + VERSION_APP
)
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

// Simular el paquete futuro solo en memoria: comprobar los parámetros por
// defecto reales, sin escribir package.json ni cambiar la clave de localStorage.
const rutaPaquete = require.resolve('../package.json')
const paqueteOriginal = require.cache[rutaPaquete].exports
const rutaLoader = require.resolve('./loader.cjs')
const loaderOriginal = require.cache[rutaLoader]
function cargarVersion(version) {
  require.cache[rutaPaquete].exports = { ...paqueteOriginal, version }
  delete require.cache[rutaLoader]
  return require('./loader.cjs').load(root + '/src/renderer/src/utils/novedades.ts')
}
try {
  const nueva = cargarVersion('1.2.0')
  assert.equal(nueva.claveNovedades('usuario-uno'), 'ruizcacao:novedades:usuario-uno:1.2.0')
  assert.equal(nueva.debeMostrarNovedades('usuario-uno', storage), true) // Ya vio 1.1.2.
  nueva.confirmarNovedades('usuario-uno', storage) // Acción de Entendido.
  assert.equal(datos.get('ruizcacao:novedades:usuario-uno:1.2.0'), 'visto')
  assert.equal(nueva.debeMostrarNovedades('usuario-uno', storage), false)
  assert.equal(nueva.debeMostrarNovedades('usuario-dos', storage), true)
  // Logout/login remonta la ventana; la comprobación del mismo usuario sigue false.
  assert.equal(nueva.debeMostrarNovedades('usuario-uno', storage), false)
  // Incluso sin el Set de la sesión anterior, el almacenamiento conserva Entendido.
  const reinicio = cargarVersion('1.2.0')
  assert.equal(reinicio.debeMostrarNovedades('usuario-uno', storage), false)
  assert.equal(reinicio.debeMostrarNovedades('usuario-dos', storage), true)
  const futura = cargarVersion('1.2.1')
  assert.equal(futura.debeMostrarNovedades('usuario-uno', storage), true)
  assert.equal(datos.get('ruizcacao:novedades:usuario-uno:1.1.2'), 'visto')
} finally {
  require.cache[rutaPaquete].exports = paqueteOriginal
  require.cache[rutaLoader] = loaderOriginal
}
console.log(
  'OK novedades: package.json dinámico, 1.1.2→1.2.0, Entendido, otro usuario, logout/login, reinicio, versión siguiente y fallo de localStorage.'
)
