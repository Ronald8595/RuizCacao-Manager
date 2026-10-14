const assert = require('node:assert/strict')
const { load, root } = require('./loader.cjs')
const { generarDataset } = require('../scripts/benchmark-dataset.cjs')
const { crearDominio } = load(root + '/src/shared/dominio.ts')
const { formatoFecha } = load(root + '/src/renderer/src/utils/reportes.ts')
const { hoy } = load(root + '/src/main/database/base.ts')
const { datos } = generarDataset(0.01)
const dominio = crearDominio(datos)
const origen = new Map(datos.cuentas.map((c) => [c.id, c.fecha]))
for (const c of datos.cuentas) {
  const operacion =
    c.categoria === 'compra'
      ? datos.compras.find((o) => o.id === c.compraId)
      : datos.ventas.find((o) => o.id === c.ventaId)
  assert.equal(c.fecha, c.categoria === 'compra' ? operacion.fecha : operacion.fechaVenta)
}
for (const categoria of ['compra', 'venta']) {
  for (const estado of ['pendiente', 'parcial']) {
    const c = dominio
      .snapshot()
      .cuentas.find((c) => c.categoria === categoria && c.estado === estado)
    dominio.value.registrarAbono({
      cuentaId: c.id,
      fecha: hoy(),
      monto: 1,
      metodoPago: 'Efectivo',
      tipo: 'Abono',
      observacion: 'Prueba de fecha'
    })
    let actual = dominio.snapshot().cuentas.find((a) => a.id === c.id)
    assert.equal(actual.fecha, origen.get(c.id))
    assert.notEqual(actual.fechaUltimoMovimiento, c.fechaUltimoMovimiento)
    dominio.value.registrarAbono({
      cuentaId: c.id,
      fecha: hoy(),
      monto: actual.montoTotal - actual.montoPagado,
      metodoPago: 'Efectivo',
      tipo: 'Abono',
      observacion: 'Saldo'
    })
    actual = dominio.snapshot().cuentas.find((a) => a.id === c.id)
    assert.equal(actual.estado, 'cerrado')
    assert.equal(actual.fecha, origen.get(c.id))
  }
}
dominio.value.crearCuentaManual({
  clienteId: datos.clientes[0].id,
  tipo: 'Deuda manual',
  fecha: '2026-01-02',
  monto: 25,
  observacion: 'Origen manual'
})
const manual = dominio.snapshot().cuentas.find((c) => c.origen === 'manual')
assert.equal(manual.fecha, '2026-01-02')
assert.equal(formatoFecha(manual.fecha), '02/01/2026')
dominio.value.registrarAbono({
  cuentaId: manual.id,
  fecha: hoy(),
  monto: 5,
  metodoPago: 'Efectivo',
  tipo: 'Abono',
  observacion: 'Abono posterior'
})
assert.equal(dominio.snapshot().cuentas.find((c) => c.id === manual.id).fecha, manual.fecha)
console.log(
  'OK fechas de compra/venta pendientes, parciales y saldadas; manual y abonos posteriores conservan origen.'
)
