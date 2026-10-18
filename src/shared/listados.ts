import type { Cuenta, Gasto } from '../renderer/src/types'
import type { ResumenFinanciero, FilaFinanciera } from '../renderer/src/utils/reportes'
export const LIMITES_PAGINA = [10, 15, 25, 50] as const
export const LIMITES_PAGINA_REPORTE = [...LIMITES_PAGINA, 100] as const
export type LimitePagina = (typeof LIMITES_PAGINA_REPORTE)[number]
export interface FiltroListado {
  desde?: string
  hasta?: string
  limite?: LimitePagina
  cursor?: string | null
  busqueda?: string
  tipo?: string
  estado?: string
  categoria?: string
}
export interface PaginaListado<T> {
  filas: T[]
  total: number
  siguiente: string | null
}
export type FilaCombinada = Cuenta & { titular: string }
export type FilaGasto = Gasto & { anulada: boolean }
export const PRODUCTOS_REPORTE = ['Cacao en Baba', 'Cacao Seco', 'Maracuyá'] as const
export const SIN_PRODUCTO_REPORTE = 'Sin producto de origen'
export interface ImportesProducto {
  ingresos: number
  pagosCompras: number
}
export type DesgloseProductos = Record<
  (typeof PRODUCTOS_REPORTE)[number] | typeof SIN_PRODUCTO_REPORTE,
  ImportesProducto
>
export type TotalesFinancieros = Omit<ResumenFinanciero, 'filas'> & {
  desgloseProductos: DesgloseProductos
}
export interface PaginaReporte extends PaginaListado<FilaFinanciera> {
  resumen: TotalesFinancieros
}
export interface ResumenGastos {
  desde: string
  hasta: string
  totalesPorCategoria: Record<string, number>
  totalOperativos: number
  totalCompras: number
  totalEgresos: number
}
export interface Listados {
  historialCombinado: PaginaListado<FilaCombinada>
  listadoGastos: PaginaListado<FilaGasto>
  resumenGastos: ResumenGastos
  reportePeriodo: PaginaReporte
}
