// Reloj simulado únicamente en este proceso; no altera Windows ni timestamps PostgreSQL.
const assert = require('node:assert/strict')
const { load, root } = require('./loader.cjs')
const { crearDominio } = load(root + '/src/shared/dominio.ts')
const { estadoInicial } = load(root + '/src/shared/persistencia.ts')
const RealDate = Date
let instante = '2026-10-19T17:00:00Z'
global.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [instante]))
  }
  static now() {
    return RealDate.parse(instante)
  }
}
try {
  const s = estadoInicial()
  s.jornada = { estado: 'activa', fecha: '2026-10-19', horaInicio: '08:00', horaFin: null }
  s.proveedores = [{ id: 'p', nombre: 'Proveedor reloj', estado: true, ciRuc: '' }]
  const d = crearDominio(s)
  const comprar = (pago, fechaPagoInicial, total = 100) =>
    d.value.registrarCompra({
      fecha: '2026-10-17',
      fechaPagoInicial,
      proveedorId: 'p',
      producto: 'Cacao Seco',
      cantidadQq: 1,
      precioCompraQq: total,
      impuestoPorcentaje: 0,
      montoPagado: pago,
      metodoPago: 'Efectivo'
    })
  const a = comprar(100, '2026-10-17'),
    b = comprar(100, '2026-10-19'),
    pendiente = comprar(0, undefined),
    cuotas = comprar(100, '2026-10-17', 500)
  const movimientos = (c) => {
    const cuenta = d.snapshot().cuentas.find((x) => x.compraId === c.id)
    return d.snapshot().movimientosCuenta.filter((m) => m.cuentaId === cuenta.id)
  }
  assert.equal(movimientos(a)[0].fecha, '2026-10-17')
  assert.equal(movimientos(b)[0].fecha, '2026-10-19')
  assert.equal(movimientos(pendiente).length, 0)
  const cuenta = d.snapshot().cuentas.find((c) => c.compraId === cuotas.id)
  const abonar = (fecha, monto) =>
    d.value.registrarAbono({
      cuentaId: cuenta.id,
      fecha,
      monto,
      tipo: 'Abono',
      metodoPago: 'Efectivo',
      observacion: 'Cuota reloj'
    })
  abonar('2026-10-19', 200)
  assert.throws(() => abonar('2026-10-20', 200), /posterior a hoy/)
  instante = '2026-10-20T17:00:00Z'
  abonar('2026-10-20', 200)
  assert.deepEqual(
    movimientos(cuotas)
      .map((m) => [m.fecha, m.monto])
      .sort(),
    [
      ['2026-10-17', 100],
      ['2026-10-19', 200],
      ['2026-10-20', 200]
    ]
  )
  assert.equal(d.snapshot().cuentas.find((c) => c.id === cuenta.id).estado, 'cerrado')
  assert.ok(d.snapshot().compras.every((c) => c.fecha === '2026-10-17'))
  console.log(
    'PASS reloj de prueba 19/10: compra17 pagada17/19/pendiente; cuotas17/19/20; futuro bloqueado antes del20'
  )
} finally {
  global.Date = RealDate
}
