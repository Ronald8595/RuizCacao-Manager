import type { Compra, Venta } from '../renderer/src/types'
export interface FiltroHistorialOperaciones {
  desde?: string
  hasta?: string
  busqueda?: string
  limite?: import('./listados').LimitePagina
  cursor?: string | null
}
export interface PaginaHistorial<T> {
  filas: T[]
  siguiente: string | null
  total: number
}
export type PaginaCompras = PaginaHistorial<Compra>
export type PaginaVentas = PaginaHistorial<Venta>
export const TAMANO_PAGINA_OPERACIONES = 15
