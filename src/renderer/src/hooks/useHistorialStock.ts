import type { FiltroHistorialStock, PaginaHistorialStock } from '../../../shared/historialStock'
import { usePaginaSQL, type ControlPagina } from './usePaginaSQL'
const consultar = (
  f: Record<string, unknown>
): Promise<import('../../../shared/persistencia').Respuesta<PaginaHistorialStock>> =>
  window.api.datos.historialStock(f)
export function useHistorialStock(
  filtro: Omit<FiltroHistorialStock, 'cursor'>,
  revision: unknown
): ControlPagina<PaginaHistorialStock> {
  return usePaginaSQL(consultar, filtro, revision)
}
