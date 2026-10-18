export type TipoRespaldo = 'generar' | 'cargar'
export type FaseRespaldo =
  | 'preparando'
  | 'exportando'
  | 'verificando'
  | 'guardando'
  | 'datos'
  | 'seguridad'
  | 'cargando'
  | 'resultado'
  | 'finalizando'
export interface ProgresoRespaldo {
  operacionId: string
  fase: FaseRespaldo
  cancelable: boolean
}
export interface SeleccionRespaldo {
  operacionId: string
  nombre: string
}
export interface ResumenRespaldo extends SeleccionRespaldo {
  preparacionId: string
  fecha: string
  version: string
  bytes: number
}
export type ResultadoRespaldo =
  { estado: 'cancelado' } | { estado: 'completado'; nombre?: string; reiniciar: boolean }
export type RespuestaRespaldo<T> =
  { ok: true; valor: T } | { ok: false; error: string; codigo: string }
export interface ApiRespaldos {
  seleccionarDestinoRespaldo(): Promise<RespuestaRespaldo<SeleccionRespaldo | null>>
  generarRespaldo(id: string): Promise<RespuestaRespaldo<ResultadoRespaldo>>
  seleccionarRespaldo(): Promise<RespuestaRespaldo<SeleccionRespaldo | null>>
  validarRespaldoSeleccionado(
    id: string
  ): Promise<RespuestaRespaldo<ResumenRespaldo | { estado: 'cancelado' }>>
  cargarRespaldo(
    id: string,
    preparacionId: string,
    confirmacion: true,
    password: string
  ): Promise<RespuestaRespaldo<ResultadoRespaldo>>
  cancelarOperacionRespaldo(id: string): Promise<RespuestaRespaldo<boolean>>
  reiniciarDespuesDeRestauracion(id: string): Promise<RespuestaRespaldo<void>>
  alProgreso(id: string, listener: (progreso: ProgresoRespaldo) => void): () => void
}
export const fasesRespaldo: Record<FaseRespaldo, string> = {
  preparando: 'Preparando respaldo',
  exportando: 'Exportando información',
  verificando: 'Verificando información',
  guardando: 'Guardando respaldo',
  datos: 'Preparando datos',
  seguridad: 'Guardando copia de seguridad actual',
  cargando: 'Cargando respaldo',
  resultado: 'Verificando resultado',
  finalizando: 'Finalizando'
}
