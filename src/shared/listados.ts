import type { Cuenta, Gasto } from '../renderer/src/types'
import type { ResumenFinanciero, FilaFinanciera } from '../renderer/src/utils/reportes'
export const LIMITES_PAGINA = [10, 15, 25, 50] as const
export type LimitePagina = (typeof LIMITES_PAGINA)[number]
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
export type TotalesFinancieros = Omit<ResumenFinanciero, 'filas'>
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
