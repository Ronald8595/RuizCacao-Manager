import { ErrorNegocio } from '../../../shared/errorNegocio'
import type { CompraInput, MetodoPago, Producto } from '../types'

export function redondearImporte(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

export function calcularImportes(
  cantidad: number,
  precio: number,
  porcentaje: number
): {
  subtotal: number
  montoImpuesto: number
  total: number
} {
  const subtotal = redondearImporte(cantidad * precio)
  const montoImpuesto = redondearImporte((subtotal * porcentaje) / 100)
  return { subtotal, montoImpuesto, total: redondearImporte(subtotal + montoImpuesto) }
}

export function validarPago(
  total: number,
  pagado: number,
  metodo: MetodoPago,
  efectivo?: number,
  transferencia?: number
): void {
  if (!Number.isFinite(pagado) || pagado < 0 || redondearImporte(pagado) > total) {
    throw new ErrorNegocio('El pago debe estar entre 0 y el total de la operación.')
  }
  if (!['Efectivo', 'Transferencia', 'Pago Mixto'].includes(metodo))
    throw new ErrorNegocio('Método de pago no válido.')
  if (metodo === 'Pago Mixto') {
    if (![efectivo, transferencia].every((m) => m !== undefined && Number.isFinite(m) && m >= 0)) {
      throw new ErrorNegocio('Los importes de efectivo y transferencia deben ser válidos y no negativos.')
    }
    if (redondearImporte((efectivo ?? 0) + (transferencia ?? 0)) !== redondearImporte(pagado)) {
      throw new ErrorNegocio('Efectivo + transferencia debe coincidir con el pago registrado.')
    }
  }
}

export function validarCompra(input: CompraInput): ReturnType<typeof calcularImportes> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) throw new ErrorNegocio('Indica la fecha de compra.')
  if (!(['Cacao en Baba', 'Cacao Seco', 'Maracuyá'] as Producto[]).includes(input.producto))
    throw new ErrorNegocio('Producto no válido.')
  if (
    !Number.isFinite(input.cantidadQq) ||
    input.cantidadQq <= 0 ||
    !Number.isFinite(input.precioCompraQq) ||
    input.precioCompraQq <= 0
  ) {
    throw new ErrorNegocio('La cantidad y el precio deben ser mayores a cero.')
  }
  if (
    !Number.isFinite(input.impuestoPorcentaje) ||
    input.impuestoPorcentaje < 0 ||
    input.impuestoPorcentaje > 3
  ) {
    throw new ErrorNegocio('El impuesto debe estar entre 0% y 3%.')
  }
  const importes = calcularImportes(
    input.cantidadQq,
    input.precioCompraQq,
    input.impuestoPorcentaje
  )
  if (!Number.isFinite(importes.total) || importes.total <= 0)
    throw new ErrorNegocio('El total debe ser mayor a cero.')
  validarPago(
    importes.total,
    input.montoPagado,
    input.metodoPago,
    input.montoEfectivo,
    input.montoTransferencia
  )
  return importes
}

export function calcularConversion(
  babaDisponible: number,
  secoDisponible: number,
  babaUtilizada: number,
  factor: number
): {
  baba: number
  seco: number
  producido: number
} {
  if (!Number.isFinite(babaUtilizada) || babaUtilizada <= 0 || babaUtilizada > babaDisponible)
    throw new ErrorNegocio('La cantidad a convertir debe ser positiva y no superar la baba disponible.')
  if (!Number.isFinite(factor) || factor < 2.8 || factor > 5.3)
    throw new ErrorNegocio('El factor debe estar entre 2.8 y 5.3.')
  const producido = redondearImporte(babaUtilizada / factor)
  if (producido <= 0) throw new ErrorNegocio('La conversión debe producir al menos 0,01 qq de seco.')
  return {
    baba: redondearImporte(babaDisponible - babaUtilizada),
    seco: redondearImporte(secoDisponible + producido),
    producido
  }
}
