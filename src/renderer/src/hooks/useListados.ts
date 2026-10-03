import type { Listados, ResumenGastos } from '../../../shared/listados'
import type { ApiPersistencia, Respuesta } from '../../../shared/persistencia'
import { usePaginaSQL, type ControlPagina } from './usePaginaSQL'
const combinado = (f: Record<string, unknown>): ReturnType<ApiPersistencia['historialCombinado']> =>
  window.api.datos.historialCombinado(f)
const gastos = (f: Record<string, unknown>): ReturnType<ApiPersistencia['listadoGastos']> =>
  window.api.datos.listadoGastos(f)
const reporte = (f: Record<string, unknown>): ReturnType<ApiPersistencia['reportePeriodo']> =>
  window.api.datos.reportePeriodo(f)
type PaginaResumen = { filas: never[]; total: number; siguiente: null; resumen: ResumenGastos }
const resumen = async (f: Record<string, unknown>): Promise<Respuesta<PaginaResumen>> => {
  const r = await window.api.datos.resumenGastos(f)
  return r.ok
    ? { ok: true as const, valor: { filas: [], total: 0, siguiente: null, resumen: r.valor } }
    : r
}
export const useHistorialCombinado = (
  f: object,
  revision: unknown,
  activo: boolean
): ControlPagina<Listados['historialCombinado']> => usePaginaSQL(combinado, f, revision, activo)
export const useListadoGastos = (
  f: object,
  revision: unknown,
  activo: boolean
): ControlPagina<Listados['listadoGastos']> => usePaginaSQL(gastos, f, revision, activo)
export const useReportePeriodo = (
  f: object,
  revision: unknown
): ControlPagina<Listados['reportePeriodo']> => usePaginaSQL(reporte, f, revision)
export const useResumenGastos = (
  f: object,
  revision: unknown,
  activo: boolean
): ControlPagina<PaginaResumen> => usePaginaSQL(resumen, f, revision, activo)
