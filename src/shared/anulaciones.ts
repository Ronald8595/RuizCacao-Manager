import { ErrorNegocio } from './errorNegocio'
import type { Snapshot, UsuarioSesion } from './persistencia'
import type { MovimientoStock } from '../renderer/src/types'

/** Compensaciones sobre una copia; Main confirma todo junto o no guarda nada. */
export function aplicarAnulacion(
  original: Snapshot,
  tipo: 'compra' | 'venta',
  id: string,
  motivo: string,
  usuario: UsuarioSesion,
  fecha: string,
  instante: string,
  nuevoId: () => string
): Snapshot {
  if (original.jornada.estado !== 'activa' || original.jornada.fecha !== fecha)
    throw new ErrorNegocio('Inicia una jornada para realizar esta anulación.')
  if (!motivo.trim()) throw new ErrorNegocio('Ingresa el motivo de la anulación.')
  const s = structuredClone(original)
  const compra = tipo === 'compra' ? s.compras.find((c) => c.id === id) : undefined
  const venta = tipo === 'venta' ? s.ventas.find((v) => v.id === id) : undefined
  const operacion = compra ?? venta
  if (!operacion) throw new ErrorNegocio(`No se encontró la ${tipo}.`)
  const cuenta = s.cuentas.find((c) => (tipo === 'compra' ? c.compraId === id : c.ventaId === id))
  if (operacion.estado === 'anulada' || cuenta?.estado === 'anulado')
    throw new ErrorNegocio(`Esta ${tipo} ya fue anulada.`)
  if (!cuenta)
    throw new ErrorNegocio('No se encontró la cuenta de esta operación. Contacta con soporte.')
  const cantidad = compra?.cantidadQq ?? venta!.pesoBruto
  const redondear = (n: number): number => Math.round(n * 100) / 100
  const disponible = s.stock[operacion.producto]
  if (compra && redondear(disponible - cantidad) < 0)
    throw new ErrorNegocio(
      'No hay suficiente inventario para anular esta compra. Revisa el stock antes de continuar.'
    )
  const nuevoStock = redondear(disponible + (compra ? -cantidad : cantidad))
  const autor = { usuarioId: usuario.id, usuarioNombre: usuario.nombre }
  Object.assign(operacion, {
    estado: 'anulada',
    anuladaEn: instante,
    anuladaPorUsuarioId: usuario.id,
    anuladaPorNombre: usuario.nombre,
    motivoAnulacion: motivo.trim()
  })
  cuenta.estado = 'anulado'
  cuenta.motivoAnulacion = motivo.trim()
  cuenta.fechaUltimoMovimiento = instante
  const movimiento: MovimientoStock = {
    id: nuevoId(),
    fecha,
    fechaHoraRegistro: instante,
    tipo: compra ? 'Salida - Ajuste' : 'Entrada - Ajuste',
    producto: operacion.producto,
    entradaQq: compra ? 0 : cantidad,
    salidaQq: compra ? cantidad : 0,
    stockResultante: nuevoStock,
    detalle: `Anulación de ${tipo} N.º ${compra?.numeroCompra ?? venta!.numeroFactura} (${compra?.fecha ?? venta!.fechaVenta})`,
    observacion: motivo.trim(),
    ...(compra ? { compraId: id } : { ventaId: id }),
    ...autor
  }
  s.movimientosStock.unshift(movimiento)
  s.stock[operacion.producto] = nuevoStock
  // Se conserva el costo promedio: no existe costeo por lote que permita reconstruirlo.
  // Una anulación corrige una operación registrada por error. Los pagos/cobros
  // originales se conservan como historial de la cuenta, pero al quedar anulada
  // dejan de participar en saldos y reportes. No se genera una devolución financiera.
  return s
}
