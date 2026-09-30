// Solo datos sintéticos deterministas. No abre conexiones ni lee perfiles de usuario.
const { load, root } = require('../tests/loader.cjs')
const { entidades } = load(root + '/src/main/database/relacional.ts')
const { estadoInicial } = load(root + '/src/shared/persistencia.ts')
const productos = ['Cacao en Baba', 'Cacao Seco', 'Maracuyá']
const fecha = (i, year = 2024) =>
  new Date(Date.UTC(year, 0, 1 + (i % 365))).toISOString().slice(0, 10)
function registro(key, id, valores) {
  const dto = { id }
  for (const c of entidades[key].campos) {
    if (c.opcional) continue
    dto[c.propiedad] =
      c.tipo.startsWith('numeric') || c.tipo === 'integer'
        ? 0
        : c.tipo === 'boolean'
          ? true
          : c.tipo === 'date'
            ? '2024-01-01'
            : c.tipo === 'timestamptz'
              ? '2024-01-01T12:00:00.000Z'
              : ''
  }
  return Object.assign(dto, valores)
}
function generarDataset(escala = 1) {
  if (![0.01, 0.1, 1].includes(escala)) throw Error('Escala permitida: 0.01, 0.1 o 1.')
  const datos = estadoInicial()
  for (let i = 0; i < 5000 * escala; i++)
    datos.clientes.push(
      registro('clientes', 'cli_' + i, {
        nombreRazonSocial: 'Cliente sintético ' + i,
        identificacion: 'TEST-C-' + i,
        telefono: '0000000000'
      })
    )
  for (let i = 0; i < 2000 * escala; i++)
    datos.proveedores.push(
      registro('proveedores', 'prov_' + i, {
        nombre: 'Proveedor sintético ' + i,
        ciRuc: 'TEST-P-' + i
      })
    )
  for (const categoria of ['compra', 'venta']) {
    const compra = categoria === 'compra',
      n = (compra ? 20000 : 30000) * escala
    for (let i = 0; i < n; i++) {
      const id = categoria + '_' + i,
        cuentaId = 'cuenta_' + id,
        dia = fecha(i, compra ? 2024 : 2025)
      const producto = productos[i % 3],
        cantidad = compra ? 10 : 5,
        total = cantidad * 10
      const pagado = i % 3 === 0 ? 0 : i % 3 === 1 ? total / 2 : total
      const estado = pagado === 0 ? 'pendiente' : pagado === total ? 'cerrado' : 'parcial'
      const titular = compra
        ? datos.proveedores[i % datos.proveedores.length]
        : datos.clientes[i % datos.clientes.length]
      const referencia = compra
        ? {
            compraId: id,
            numeroCompra: i + 1,
            proveedorId: titular.id,
            proveedorNombre: titular.nombre,
            clienteId: null
          }
        : { ventaId: id, numeroFactura: i + 1, clienteId: titular.id }
      const comun = {
        producto,
        estado: 'vigente',
        fechaHoraRegistro: dia + 'T12:00:00.000Z',
        subtotal: total,
        metodoPago: 'Efectivo',
        montoEfectivo: pagado,
        montoTransferencia: 0
      }
      if (compra)
        datos.compras.push(
          registro('compras', id, {
            ...comun,
            fecha: dia,
            numeroCompra: i + 1,
            proveedorId: titular.id,
            proveedorNombre: titular.nombre,
            cantidadQq: cantidad,
            precioCompraQq: 10,
            totalCompra: total,
            montoPagadoInicial: pagado
          })
        )
      else
        datos.ventas.push(
          registro('ventas', id, {
            ...comun,
            fechaVenta: dia,
            numeroFactura: i + 1,
            numeroComprobante: i + 1,
            clienteId: titular.id,
            pesoBruto: cantidad,
            precioUnitario: 10,
            totalVenta: total,
            montoRecibido: pagado,
            saldoPendiente: total - pagado,
            estadoCobro: estado
          })
        )
      datos.cuentas.push(
        registro('cuentas', cuentaId, {
          ...referencia,
          origen: categoria,
          categoria,
          estado,
          fecha: dia,
          fechaHoraRegistro: comun.fechaHoraRegistro,
          fechaUltimoMovimiento: comun.fechaHoraRegistro,
          montoTotal: total,
          montoPagado: pagado
        })
      )
      // Dos abonos por cuenta pagada: volumen y saldos coherentes, sin duplicar el dinero.
      if (pagado)
        for (let abono = 0; abono < 2; abono++)
          datos.movimientosCuenta.push(
            registro('movimientosCuenta', 'abono_' + id + '_' + abono, {
              cuentaId,
              categoria,
              proveedorId: referencia.proveedorId,
              clienteId: referencia.clienteId,
              fecha: dia,
              fechaHoraRegistro: dia + 'T12:00:00.000Z',
              tipo: 'Abono',
              monto: pagado / 2,
              metodoPago: 'Efectivo',
              montoEfectivo: pagado / 2,
              montoTransferencia: 0,
              observacion: 'Dato sintético'
            })
          )
      datos.stock[producto] += compra ? cantidad : -cantidad
      datos.costoUnitarioPromedio[producto] = 10
      datos.movimientosStock.push(
        registro('movimientosStock', 'stock_' + id, {
          ...referencia,
          fecha: dia,
          fechaHoraRegistro: comun.fechaHoraRegistro,
          producto,
          tipo: compra ? 'Compra' : 'Venta',
          entradaQq: compra ? cantidad : 0,
          salidaQq: compra ? 0 : cantidad,
          stockResultante: datos.stock[producto],
          detalle: 'Dato sintético'
        })
      )
    }
  }
  // Histórico sintético anulado sin pago; autor desconocido como en registros heredados.
  // Compensaciones conservan el inventario y nunca inventan devoluciones de dinero.
  for (const categoria of ['compra', 'venta']) {
    const compra = categoria === 'compra',
      operaciones = compra ? datos.compras : datos.ventas
    for (let i = 0; i < operaciones.length; i += 30) {
      const op = operaciones[i],
        cantidad = compra ? op.cantidadQq : op.pesoBruto
      op.estado = 'anulada'
      op.anuladaEn = '2026-01-01T12:00:00.000Z'
      op.anuladaPorNombre = 'Histórico sintético'
      op.motivoAnulacion = 'Anulación sintética sin pago'
      const cuenta = datos.cuentas[(compra ? 0 : datos.compras.length) + i]
      cuenta.estado = 'anulado'
      cuenta.motivoAnulacion = op.motivoAnulacion
      cuenta.fechaUltimoMovimiento = op.anuladaEn
      datos.stock[op.producto] += compra ? -cantidad : cantidad
      datos.movimientosStock.push(
        registro('movimientosStock', 'anulacion_' + op.id, {
          fecha: '2026-01-01',
          fechaHoraRegistro: op.anuladaEn,
          tipo: 'Ajuste',
          producto: op.producto,
          entradaQq: compra ? 0 : cantidad,
          salidaQq: compra ? cantidad : 0,
          stockResultante: datos.stock[op.producto],
          detalle: op.motivoAnulacion,
          ...(compra ? { compraId: op.id } : { ventaId: op.id })
        })
      )
    }
  }
  for (let i = 0; i < 15000 * escala; i++)
    datos.gastos.push(
      registro('gastos', 'gasto_' + i, {
        fecha: fecha(i, 2025),
        fechaHoraRegistro: fecha(i, 2025) + 'T12:00:00.000Z',
        categoria: 'Otros',
        tipo: 'manual',
        monto: 5 + (i % 20),
        concepto: '',
        observacion: 'Gasto sintético ' + i
      })
    )
  const avisos = Array.from({ length: 10000 * escala }, (_, i) => ({
    id: '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
    titulo: 'Aviso sintético',
    mensaje: 'Dato de benchmark ' + i,
    fecha: fecha(i, 2025) + 'T12:00:00.000Z',
    leida: i % 20 !== 0,
    destino: 'inicio'
  }))
  return { datos, avisos }
}
module.exports = { generarDataset }
