import type {
  FiltroHistorialOperaciones,
  PaginaCompras,
  PaginaVentas
} from '../../../shared/historialOperaciones'
import { usePaginaSQL, type ControlPagina } from './usePaginaSQL'
const compras = (
  f: Record<string, unknown>
): Promise<import('../../../shared/persistencia').Respuesta<PaginaCompras>> =>
  window.api.datos.historialCompras(f)
const ventas = (
  f: Record<string, unknown>
): Promise<import('../../../shared/persistencia').Respuesta<PaginaVentas>> =>
  window.api.datos.historialVentas(f)
export function useHistorialOperaciones<M extends 'compras' | 'ventas'>(
  modulo: M,
  filtro: Omit<FiltroHistorialOperaciones, 'cursor'>,
  revision: unknown
): ControlPagina<M extends 'compras' ? PaginaCompras : PaginaVentas> {
  const a = usePaginaSQL(compras, filtro, revision, modulo === 'compras')
  const b = usePaginaSQL(ventas, filtro, revision, modulo === 'ventas')
  return (modulo === 'compras' ? a : b) as ControlPagina<
    M extends 'compras' ? PaginaCompras : PaginaVentas
  >
}
