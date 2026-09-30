const assert = require('node:assert/strict')
const { generarDataset } = require('../scripts/benchmark-dataset.cjs')
for (const escala of [0.01, 1]) {
  const { datos, avisos } = generarDataset(escala)
  assert.deepEqual(generarDataset(escala), { datos, avisos }, 'Dataset reproducible')
  assert.equal(datos.compras.length, 20000 * escala)
  assert.equal(datos.ventas.length, 30000 * escala)
  assert.equal(datos.cuentas.length, 50000 * escala)
  const cuentas = new Map(datos.cuentas.map((c) => [c.id, c]))
  const proveedores = new Set(datos.proveedores.map((p) => p.id))
  const clientes = new Set(datos.clientes.map((c) => c.id))
  const compras = new Set(datos.compras.map((c) => c.id))
  const ventas = new Set(datos.ventas.map((v) => v.id))
  const pagado = new Map()
  for (const m of datos.movimientosCuenta) {
    assert.ok(cuentas.has(m.cuentaId))
    assert.ok(m.monto > 0)
    pagado.set(m.cuentaId, (pagado.get(m.cuentaId) || 0) + m.monto)
  }
  for (const c of datos.cuentas) {
    assert.equal(c.montoPagado, pagado.get(c.id) || 0)
    if (c.categoria === 'compra') {
      assert.ok(proveedores.has(c.proveedorId))
      assert.ok(compras.has(c.compraId))
      assert.equal(c.clienteId, null)
    } else {
      assert.ok(clientes.has(c.clienteId))
      assert.ok(ventas.has(c.ventaId))
    }
    if (c.estado === 'anulado') assert.equal(c.montoPagado, 0)
  }
  const stock = Object.fromEntries(Object.keys(datos.stock).map((p) => [p, 0]))
  for (const m of datos.movimientosStock) {
    stock[m.producto] += m.entradaQq - m.salidaQq
    assert.equal(stock[m.producto], m.stockResultante)
    assert.ok(m.stockResultante >= 0)
  }
  assert.deepEqual(stock, datos.stock)
  for (const rows of [...Object.values(datos).filter(Array.isArray), avisos]) {
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length)
  }
  console.log(
    'OK benchmark dataset: escala ' +
      escala +
      ', referencias, saldos, anulaciones sin pago, stock, IDs y determinismo.'
  )
}
assert.throws(() => generarDataset(10))
