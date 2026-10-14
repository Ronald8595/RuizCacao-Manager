const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '..'),
  dir = path.join(root, 'docs/evidencias-arranque-real')
const read = (p) => JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8').replace(/^\uFEFF/, ''))
const resumen = read('resumen.json')
assert.equal(resumen.length, 9, 'Ocho observaciones de arranque y una repetición de reposo')
for (const r of resumen) {
  const raw = read(r.nombre + '.json')
  assert.equal(raw.entorno.monitorCode, 0)
  assert.equal(raw.entorno.errorMonitor, '')
  assert.ok(raw.recursos.length > 5)
  assert.ok(raw.recursos.some((s) => s.procesos.some((p) => p.type === 'Tab')))
  for (const k of [
    'hastaAccesoMs',
    'loginInicioMs',
    'totalMs',
    'estadoMs',
    'dtoMs',
    'ipcMainPreloadMs',
    'rendererMs'
  ])
    assert.ok(r.tiempos[k] >= 0, k)
  assert.ok(
    Math.abs(
      r.tiempos.totalMs -
        r.tiempos.hastaAccesoMs -
        r.tiempos.pausaAutomaticaMs -
        r.tiempos.loginInicioMs
    ) < 0.1
  )
  assert.ok(r.tiempos.sqlClienteEstadoMs + r.tiempos.dtoMs <= r.tiempos.estadoMs + 1)
  if (r.nombre === 'large-segundo') {
    assert.equal(r.incompleto, 'Timeout esperando interactive/ventas')
    continue
  }
  assert.equal(r.incompleto, null)
  assert.ok(r.nombre.startsWith('large') ? r.payload > 65000000 : r.payload < 2000)
  if (r.nombre.includes('externo')) {
    assert.equal(r.tiempos.esperaMotorMs, null)
    assert.equal(r.pgCtl.length, 0)
    assert.deepEqual(
      r.navegacion.map((n) => [n.desde, n.pagina]),
      [
        ['inicio', 'cuentas'],
        ['cuentas', 'inicio'],
        ['inicio', 'ventas'],
        ['ventas', 'inicio']
      ]
    )
    assert.ok(r.navegacion.every((n) => n.interactivoMs > 0))
    if (r.nombre.endsWith('segundo')) assert.ok(r.reposoMs >= 300000)
  }
}
const origen = read('original-final.json'),
  prep = read('preparacion.json')
const diferencias = Object.keys(origen.originalFinal).filter(
  (k) => JSON.stringify(origen.originalFinal[k]) !== JSON.stringify(prep.originalAntes[k])
)
assert.deepEqual(diferencias, origen.diferencias)
assert.deepEqual(
  diferencias,
  ['auditoria', 'sesiones', 'usuarios'],
  'Documentar cualquier diferencia adicional, no ocultarla'
)
assert.equal(Object.keys(origen.originalFinal).length, 25)
const reposoValido = resumen.find((r) => r.nombre === 'large-externo-reposo')
assert.ok(reposoValido.reposoMs >= 300000 && reposoValido.entradaBloqueadaReposo)
assert.equal(reposoValido.interaccionesReposo, 0)
assert.equal(reposoValido.consultas.reposo, 0)
const protegidos = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .filter((p) => /migracion|(?:^|\/)(?:00[1-9]|010)[^/]*\.sql$/.test(p) && !p.startsWith('tests/'))
const hashes = {}
const nuevo = read('nuevo-frio.json')
assert.equal(nuevo.error, undefined)
assert.equal(nuevo.entorno.monitorCode, 0)
const tNuevo = (nombre) => nuevo.marcas.find((m) => m.nombre === nombre)?.epoch
assert.ok(tNuevo('initdb-end') > tNuevo('initdb-start'))
assert.ok(tNuevo('acceso-visible') > tNuevo('base-iniciar-end'))
assert.ok(!tNuevo('login-main-start'), 'C termina en Crear usuario, sin inventar un login')
for (const p of protegidos) {
  const actual = fs.readFileSync(path.join(root, p)),
    previo = execFileSync('git', ['show', 'HEAD:' + p], { cwd: root, maxBuffer: 20 * 1024 * 1024 })
  const canon = (b) => b.toString('utf8').replace(/\r\n/g, '\n')
  assert.equal(canon(actual), canon(previo), 'Migración modificada: ' + p)
  hashes[p] = createHash('sha256').update(canon(actual)).digest('hex')
}
const salida = {
  fecha: new Date().toISOString(),
  arranques: resumen.length,
  instalacionNueva: {
    hastaAccesoMs: tNuevo('acceso-visible') - tNuevo('process-start'),
    initdbMs: tNuevo('initdb-end') - tNuevo('initdb-start'),
    login: 'No aplica: no se creó usuario en C'
  },
  corridasCompletas: 8,
  corridaParcial: 'large-segundo: arranque válido; navegación/reposo incompletos',
  repososCincoMinutos: resumen
    .filter((r) => r.reposoMs >= 300000 && !r.interaccionesReposo)
    .map((r) => r.nombre),
  reposoDescartado: 'large-externo-segundo: seis navegaciones durante la ventana de reposo',
  original25TablasIgual: origen.iguales,
  tablasOriginalesIguales: 25 - diferencias.length,
  diferenciasOriginales: diferencias,
  migracionesSinCambios: hashes
}
fs.writeFileSync(path.join(dir, 'verificacion.json'), JSON.stringify(salida, null, 2))
console.log(
  'Tiempos, muestras y migraciones verificados. Advertencia: el origen conserva 22/25 tablas; las tres diferencias están documentadas.'
)
