import type { Gasto, Venta, Compra, Cuenta, MovimientoCuenta } from '../types'
import { redondearImporte } from './comercio'
export interface FilaFinanciera {
  id: string
  fecha: string
  orden: string
  tipo: 'Cobro de venta' | 'Pago de compra' | 'Gasto operativo'
  detalle: string
  monto: number
}
export interface ResumenFinanciero {
  desde: string
  hasta: string
  filas: FilaFinanciera[]
  totalIngresos: number
  totalComprasPagadas: number
  totalGastosManuales: number
  totalGastos: number
  saldoPeriodo: number
}
export function fechaLocal(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}
export function fechaDesdeTimestamp(timestamp: string): string {
  return fechaLocal(new Date(timestamp))
}
export function enRango(fecha: string, desde: string, hasta: string): boolean {
  return (!desde || fecha >= desde) && (!hasta || fecha <= hasta)
}
export function resumirPeriodo(
  ventas: Venta[],
  gastos: Gasto[],
  desde: string,
  hasta: string,
  movimientos: MovimientoCuenta[],
  cuentas: Cuenta[],
  compras: Compra[]
): ResumenFinanciero {
  const filas: FilaFinanciera[] = movimientos
    .filter(
      (m) =>
        m.tipo === 'Abono' &&
        enRango(m.fecha, desde, hasta) &&
        cuentas.some((c) => c.id === m.cuentaId && c.estado !== 'anulado')
    )
    .map((m) => {
      const cuenta = cuentas.find((c) => c.id === m.cuentaId)!
      const compra = cuenta.categoria === 'compra'
      const operacion = compra
        ? compras.find((c) => c.id === cuenta.compraId)
        : ventas.find((v) => v.id === cuenta.ventaId)
      const referencia = compra
        ? 'Compra N.º ' + cuenta.numeroCompra
        : cuenta.numeroFactura
          ? 'Venta N.º ' + cuenta.numeroFactura
          : 'Cuenta manual de cliente'
      return {
        id: m.id,
        fecha: m.fecha,
        orden: m.fechaHoraRegistro,
        tipo: compra ? 'Pago de compra' : 'Cobro de venta',
        detalle: referencia + (operacion ? ' · ' + operacion.producto : '') + ' · ' + m.observacion,
        monto: compra ? -m.monto : m.monto
      }
    })
  gastos
    .filter((g) => g.tipo === 'manual' && enRango(g.fecha, desde, hasta))
    .forEach((g) =>
      filas.push({
        id: g.id,
        fecha: g.fecha,
        orden: g.fechaHoraRegistro,
        tipo: 'Gasto operativo',
        detalle:
          g.categoria +
          ' · ' +
          (g.empleado_nombre ? g.empleado_nombre + ' · ' : '') +
          (g.observacion || 'Sin observación'),
        monto: -g.monto
      })
    )
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden.localeCompare(b.orden))
  const totalIngresos = redondearImporte(
    filas.filter((f) => f.monto > 0).reduce((s, f) => s + f.monto, 0)
  )
  const totalComprasPagadas = redondearImporte(
    -filas.filter((f) => f.tipo === 'Pago de compra').reduce((s, f) => s + f.monto, 0)
  )
  const totalGastosManuales = redondearImporte(
    -filas.filter((f) => f.tipo === 'Gasto operativo').reduce((s, f) => s + f.monto, 0)
  )
  const totalGastos = redondearImporte(
    -filas.filter((f) => f.monto < 0).reduce((s, f) => s + f.monto, 0)
  )
  return {
    desde,
    hasta,
    filas,
    totalIngresos,
    totalComprasPagadas,
    totalGastosManuales,
    totalGastos,
    saldoPeriodo: redondearImporte(totalIngresos - totalGastos)
  }
}
export function lunesDeSemana(fecha: string): string {
  const date = new Date(`${fecha}T12:00:00`)
  const dia = date.getDay() || 7
  date.setDate(date.getDate() - dia + 1)
  return fechaLocal(date)
}

export function domingoDeSemana(fecha: string): string {
  const date = new Date(`${lunesDeSemana(fecha)}T12:00:00`)
  date.setDate(date.getDate() + 6)
  return fechaLocal(date)
}

export function rangoSemanaActual(): { desde: string; hasta: string } {
  const hoy = fechaLocal()
  return { desde: lunesDeSemana(hoy), hasta: domingoDeSemana(hoy) }
}

export function rangoMesActual(): { desde: string; hasta: string } {
  const ahora = new Date()
  const desde = fechaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), 1))
  const hasta = fechaLocal(new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0))
  return { desde, hasta }
}

export function rangoDiaActual(): { desde: string; hasta: string } {
  const hoy = fechaLocal()
  return { desde: hoy, hasta: hoy }
}

export function formatoMoneda(valor: number): string {
  return valor.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatoFecha(fecha: string): string {
  if (!fecha) return '—'
  const [year, month, day] = fecha.split('-')
  return `${day}/${month}/${year}`
}
