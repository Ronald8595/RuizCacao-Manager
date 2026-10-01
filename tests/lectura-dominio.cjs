const assert = require('node:assert/strict')
const { load, root } = require('./loader.cjs')
const { crearDominio, crearLecturaDominio } = load(root + '/src/shared/dominio.ts')
const { generarDataset } = require('../scripts/benchmark-dataset.cjs')
const { indexarPrimero } = load(root + '/src/renderer/src/utils/indices.ts')
const { rangoFilas } = load(root + '/src/renderer/src/utils/filasVisibles.ts')
const { hoy } = load(root + '/src/main/database/base.ts')
for (const escala of [0.01, 1]) {
  const { datos } = generarDataset(escala)
  // Casos de saldo a favor, manual y anulado, no solo el dataset sin pagos excedidos.
  datos.cuentas.unshift(
    ...['venta', 'compra', 'manual'].flatMap((categoria, i) => [
      {
        id: 'borde-' + i,
        origen: 'manual',
        categoria,
        clienteId: datos.clientes[0].id,
        proveedorId: datos.proveedores[0].id,
        montoTotal: 10.03,
        montoPagado: 25.04,
        estado: 'cerrado'
      },
      {
        id: 'anulado-' + i,
        origen: 'manual',
        categoria,
        clienteId: datos.clientes[0].id,
        proveedorId: datos.proveedores[0].id,
        montoTotal: 50,
        montoPagado: 0,
        estado: 'anulado'
      }
    ])
  )
  for (const jornada of [
    { estado: 'no_iniciada', fecha: '2000-01-01', horaInicio: null, horaFin: null },
    { estado: 'activa', fecha: '2000-01-01', horaInicio: '10:00', horaFin: null },
    { estado: 'interrumpida', fecha: '2000-01-01', horaInicio: '10:00', horaFin: null },
    { estado: 'finalizada', fecha: hoy(), horaInicio: '10:00', horaFin: '11:00' }
  ]) {
    datos.jornada = jornada
    const original = JSON.stringify(datos),
      antes = crearDominio(datos).value,
      vista = crearLecturaDominio(datos)
    for (const [k, v] of Object.entries(vista))
      if (typeof v !== 'function') assert.deepEqual(v, antes[k], k)
    for (const p of datos.proveedores)
      assert.equal(vista.saldoPendienteProveedor(p.id), antes.saldoPendienteProveedor(p.id))
    for (const c of datos.clientes)
      assert.equal(vista.saldoAFavorDeCliente(c.id), antes.saldoAFavorDeCliente(c.id))
    assert.equal(vista.saldoAFavorDeCliente('ausente'), 0)
    assert.equal(vista.saldoPendienteProveedor('ausente'), 0)
    assert.equal(JSON.stringify(datos), original)
    assert.equal(vista.cuentas, datos.cuentas)
    assert.ok(!('registrarVenta' in vista))
  }
  console.log(
    'OK lectura dominio escala ' +
      escala +
      ': todos los campos/saldos/jornadas iguales, datos completos sin mutación ni comandos.'
  )
}
const repetidos = [
  { id: 'a', n: 1 },
  { id: 'a', n: 2 },
  { id: 1, n: 3 },
  { id: '1', n: 4 }
]
const indice = indexarPrimero(repetidos, (r) => r.id)
for (const id of ['a', 1, '1', 'ausente'])
  assert.equal(
    indice.get(id),
    repetidos.find((r) => r.id === id)
  )
// Todas las posiciones del viewport deben pertenecer al rango y mantener el tamaño total.
for (const total of [0, 1, 25, 25021])
  for (let scroll = 0; scroll < total * 56 + 100; scroll += 791) {
    const r = rangoFilas(total, scroll, 624)
    assert.ok(r.inicio >= 0 && r.fin <= total && r.inicio <= r.fin)
    assert.equal(r.antes + (r.fin - r.inicio) * 56 + r.despues, total * 56)
    if (scroll < total * 56)
      assert.ok(
        r.inicio <= Math.floor(Math.max(0, scroll - 44) / 56) &&
          r.fin > Math.floor(Math.max(0, scroll - 44) / 56)
      )
  }
console.log(
  'OK índice conserva find/primera coincidencia/tipo de ID; rangos visibles cubren inicio/medio/final sin huecos.'
)
