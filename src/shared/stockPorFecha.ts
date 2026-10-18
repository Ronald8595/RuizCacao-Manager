import type { Producto } from '../renderer/src/types'

export const LIMITES_STOCK_FECHA = [10, 25, 50, 100] as const
export type LimiteStockFecha = (typeof LIMITES_STOCK_FECHA)[number]
export interface FiltroStockFecha {
  fecha: string
  limite?: LimiteStockFecha
  cursor?: string | null
}
export interface ResumenStockFecha {
  producto: Producto
  inicial: number
  entradas: number
  salidas: number
  final: number
}
export interface MovimientoStockFecha {
  id: string
  horaRegistrada: string
  producto: Producto
  tipo: string
  entrada: number
  salida: number
  detalle: string
}
export interface PaginaStockFecha {
  resumen: ResumenStockFecha[]
  filas: MovimientoStockFecha[]
  total: number
  siguiente: string | null
}
