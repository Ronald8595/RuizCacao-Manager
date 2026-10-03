import type { MovimientoStock, Producto } from '../renderer/src/types'

export interface FiltroHistorialStock {
  desde?: string
  hasta?: string
  producto?: Producto | 'Todos'
  busqueda?: string
  limite?: import('./listados').LimitePagina
  cursor?: string | null
}
export type FilaHistorialStock = Pick<
  MovimientoStock,
  | 'id'
  | 'fecha'
  | 'producto'
  | 'tipo'
  | 'entradaQq'
  | 'salidaQq'
  | 'factorConversion'
  | 'cantidadObtenidaQq'
  | 'diferenciaQq'
  | 'observacion'
  | 'usuarioNombre'
>
export interface PaginaHistorialStock {
  filas: FilaHistorialStock[]
  siguiente: string | null
  total: number
}
export const TAMANO_PAGINA_STOCK = 15
