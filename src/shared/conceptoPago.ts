import type { Compra, Cuenta, MovimientoCuenta, Venta } from '../renderer/src/types'

export interface ContextoPago {
  categoria: 'compra' | 'venta'
  manual: boolean
  fiable: boolean
  inicial: boolean
  monto: number
  saldoAnterior: number
}

/** Etiqueta de presentación; no altera el tipo contable Abono ni la observación guardada. */
export function conceptoPago(c: ContextoPago): string {
  if (c.manual) return 'Cobro de cuenta manual'
  if (!c.fiable)
    return `${c.categoria === 'compra' ? 'Pago de compra' : 'Cobro de venta'} (historial no verificable)`
  if (c.saldoAnterior <= 0)
    return c.categoria === 'venta' ? 'Cobro de venta (saldo a favor)' : 'Pago de compra'
  const liquida = Math.round(c.monto * 100) >= Math.round(c.saldoAnterior * 100)
  if (c.inicial)
    return liquida
      ? c.categoria === 'compra'
        ? 'Pago total de compra'
        : 'Cobro total de venta'
      : `Abono inicial de ${c.categoria}`
  return `${liquida ? 'Liquidación de' : 'Abono a'} ${c.categoria}`
}

/** Solo elimina de la presentación el texto automático antiguo, nunca notas del usuario. */
export function observacionPago(observacion: string, concepto: string): string {
  return /^(Pago inicial de compra N\.º \d+ del día|Pago inicial registrado en la venta)$/.test(
    observacion
  )
    ? concepto
    : observacion
}

/** Historial de UNA cuenta ya disponible, en orden de inserción descendente del repositorio.
 * No ordenar por fecha efectiva: un abono retroactivo puede registrarse después de otro.
 */
export function conceptosCuenta(
  cuenta: Cuenta,
  operacion: Compra | Venta | undefined,
  movimientosDesc: MovimientoCuenta[]
): Map<string, string> {
  const movimientos = movimientosDesc
    .filter((m) => m.cuentaId === cuenta.id)
    .slice()
    .reverse()
  const inicial = operacion
    ? 'montoPagadoInicial' in operacion
      ? operacion.montoPagadoInicial
      : operacion.montoRecibido
    : 0
  const suma = movimientos.reduce((s, m) => s + Math.round(m.monto * 100), 0)
  const fiable =
    Boolean(operacion) &&
    suma === Math.round(cuenta.montoPagado * 100) &&
    (inicial === 0 ||
      (movimientos[0]?.tipo === 'Abono' &&
        Math.round(movimientos[0].monto * 100) === Math.round(inicial * 100)))
  let aplicado = 0
  return new Map(
    movimientos.map((m, i) => {
      const concepto =
        m.tipo === 'Abono'
          ? conceptoPago({
              categoria: cuenta.categoria,
              manual: cuenta.origen === 'manual',
              fiable,
              inicial: i === 0 && inicial > 0,
              monto: m.monto,
              saldoAnterior: cuenta.montoTotal - aplicado / 100
            })
          : m.tipo
      aplicado += Math.round(m.monto * 100)
      return [m.id, concepto]
    })
  )
}
