import { errorFechaGasto, hoyGasto } from './fechaGasto'

export const hoyOperacion = hoyGasto

export function errorFechaOperacion(fecha: string): string | undefined {
  return errorFechaGasto(fecha)?.replace('del gasto ', '')
}

export function errorFechaMovimiento(fecha: string, origen: string): string | undefined {
  const error = errorFechaOperacion(fecha)
  if (error) return error
  if (fecha < origen) return 'La fecha del movimiento no puede ser anterior a la operación.'
  return undefined
}
