const assert = require('node:assert/strict')
const { load, root } = require('./loader.cjs')
const { crearDominio } = load(root + '/src/shared/dominio.ts')
const { estadoInicial } = load(root + '/src/shared/persistencia.ts')
const { conceptosCuenta } = load(root + '/src/shared/conceptoPago.ts')
const s = estadoInicial()
s.cuentas = [
  {
    id: 'c',
    origen: 'venta',
    categoria: 'venta',
    ventaId: 'v',
    clienteId: 'cliente',
    fecha: '2026-10-17',
    montoTotal: 100,
    montoPagado: 0,
    estado: 'pendiente'
  }
]
s.ventas = [{ id: 'v', montoRecibido: 0 }]
const d = crearDominio(s)
for (const monto of [20, 90, 10])
  d.value.registrarAbono({
    cuentaId: 'c',
    fecha: '2026-10-20',
    monto,
    tipo: 'Abono',
    metodoPago: 'Efectivo',
    observacion: 'Nota original'
  })
const datos = d.snapshot()
assert.equal(datos.cuentas[0].montoPagado, 120, 'Política de saldo a favor vigente conservada')
assert.equal(datos.cuentas[0].montoTotal - datos.cuentas[0].montoPagado, -20)
const etiquetas = conceptosCuenta(datos.cuentas[0], datos.ventas[0], datos.movimientosCuenta)
const cronologico = datos.movimientosCuenta.slice().reverse()
assert.deepEqual(
  cronologico.map((m) => etiquetas.get(m.id)),
  ['Abono a venta', 'Liquidación de venta', 'Cobro de venta (saldo a favor)']
)
assert.ok(cronologico.every((m) => m.observacion === 'Nota original'))
console.log(
  'PASS conceptos: sobrepago permitido en venta liquida deuda; cobro con saldo a favor no se llama abono parcial; reglas e importes intactos'
)
