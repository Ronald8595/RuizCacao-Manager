import type { MovimientoStock, Producto } from '../renderer/src/types'

export interface FiltroHistorialStock {
  desde?: string
  hasta?: string
  producto?: Producto | 'Todos'
  busqueda?: string
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
}
export const TAMANO_PAGINA_STOCK = 15
