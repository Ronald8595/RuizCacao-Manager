const { load, root } = require('./loader.cjs'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto')
const { aplicarAnulacion } = load(root + '/src/shared/anulaciones.ts'),
  { crearDominio, saldoDeCuenta } = load(root + '/src/shared/dominio.ts'),
  { estadoInicial } = load(root + '/src/shared/persistencia.ts'),
  { resumirPeriodo } = load(root + '/src/renderer/src/utils/reportes.ts')
const fecha = '2026-09-26',
  ayer = '2026-09-25',
  ahora = fecha + 'T17:00:00.000Z',
  usuario = { id: randomUUID(), nombre: 'Operador', rol: 'operador', principal: false }
let n = 0
for (const tipo of ['compra', 'venta'])
  for (const monto of [0, 5, 20]) {
    const s = estadoInicial()
    s.jornada = { estado: 'activa', fecha, horaInicio: '08:00', horaFin: null }
    const d = crearDominio(s)
    const proveedor = d.value.crearProveedor({
        nombre: 'Proveedor prueba',
        ciRuc: '',
        estado: true
      }),
      cliente = d.value.crearCliente({
        nombreRazonSocial: 'Cliente prueba',
        identificacion: '',
        telefono: ''
      })
    const compra = d.value.registrarCompra({
      fecha: ayer,
      proveedorId: proveedor.id,
      producto: 'Cacao Seco',
      cantidadQq: 2,
      precioCompraQq: 10,
      impuestoPorcentaje: 0,
      montoPagado: tipo === 'compra' ? monto : 0,
      metodoPago: 'Efectivo'
    })
    const venta =
      tipo === 'venta'
        ? d.value.registrarVenta({
            fechaVenta: ayer,
            clienteId: cliente.id,
            producto: 'Cacao Seco',
            pesoBruto: 2,
            precioUnitario: 10,
            impuestoPorcentaje: 0,
            montoRecibido: monto,
            metodoPago: 'Efectivo'
          })
        : null
    const id = tipo === 'compra' ? compra.id : venta.id,
      antes = d.snapshot(),
      copia = structuredClone(antes)
    const despues = aplicarAnulacion(antes, tipo, id, 'Prueba', usuario, fecha, ahora, randomUUID)
    assert.deepEqual(antes, copia, 'No muta el estado original')
    const cuenta = despues.cuentas.find((c) =>
      tipo === 'compra' ? c.compraId === id : c.ventaId === id
    )
    assert.equal(cuenta.estado, 'anulado')
    assert.equal(saldoDeCuenta(cuenta), 0)
    assert.equal(despues.stock['Cacao Seco'], tipo === 'compra' ? 0 : 2)
    const ajustes = despues.movimientosCuenta.filter(
      (m) => m.cuentaId === cuenta.id && m.tipo === 'Ajuste por devolución'
    )
    assert.equal(ajustes.length, 0)
    assert.equal(
      despues.movimientosCuenta.filter((m) => m.cuentaId === cuenta.id).length,
      antes.movimientosCuenta.filter((m) => m.cuentaId === cuenta.id).length,
      'La anulación no crea movimientos financieros'
    )
    const resumir = (s, f) =>
      resumirPeriodo(s.ventas, s.gastos, f, f, s.movimientosCuenta, s.cuentas, s.compras)
    assert.equal(resumir(despues, ayer).saldoPeriodo, 0)
    assert.equal(resumir(despues, fecha).saldoPeriodo, 0)
    assert.throws(
      () => aplicarAnulacion(despues, tipo, id, 'Prueba', usuario, fecha, ahora, randomUUID),
      /ya fue anulada/
    )
    assert.throws(
      () => aplicarAnulacion(antes, tipo, id, '  ', usuario, fecha, ahora, randomUUID),
      /Ingresa el motivo/
    )
    const sinJornada = structuredClone(antes)
    sinJornada.jornada.estado = 'finalizada'
    assert.throws(
      () => aplicarAnulacion(sinJornada, tipo, id, 'Prueba', usuario, fecha, ahora, randomUUID),
      /Inicia una jornada/
    )
    const jornadaAnterior = structuredClone(antes)
    jornadaAnterior.jornada.fecha = ayer
    assert.throws(
      () =>
        aplicarAnulacion(jornadaAnterior, tipo, id, 'Prueba', usuario, fecha, ahora, randomUUID),
      /Inicia una jornada/
    )
    if (tipo === 'compra') {
      const insuficiente = structuredClone(antes)
      insuficiente.stock['Cacao Seco'] = 1
      assert.throws(
        () => aplicarAnulacion(insuficiente, tipo, id, 'Prueba', usuario, fecha, ahora, randomUUID),
        /No hay suficiente inventario/
      )
    }
    n++
  }
console.log(
  'OK ' +
    n +
    ' escenarios de dominio: pendiente/parcial/completo, compra/venta, fechas históricas, anulaciones sin devolución financiera, stock, cuentas y prohibición de repetir.'
)
