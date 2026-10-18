import type { ApiRespaldos, ProgresoRespaldo, RespuestaRespaldo } from '../shared/respaldos'
interface Transporte {
  invoke(canal: string, ...args: unknown[]): Promise<unknown>
  on(canal: string, listener: (_e: unknown, p: ProgresoRespaldo) => void): unknown
  removeListener(canal: string, listener: (_e: unknown, p: ProgresoRespaldo) => void): unknown
}
export function apiRespaldos(ipc: Transporte): ApiRespaldos {
  const invocar = <T>(canal: string, ...args: unknown[]): Promise<RespuestaRespaldo<T>> =>
    ipc.invoke('respaldos:' + canal, ...args).then(
      (r) => r as RespuestaRespaldo<T>,
      () => ({
        ok: false,
        codigo: 'comunicacion',
        error: 'No se pudo comunicar con la aplicación. Vuelve a intentarlo.'
      })
    )
  return {
    seleccionarDestinoRespaldo: () => invocar('seleccionarDestinoRespaldo'),
    generarRespaldo: (id) => invocar('generarRespaldo', id),
    seleccionarRespaldo: () => invocar('seleccionarRespaldo'),
    validarRespaldoSeleccionado: (id) => invocar('validarRespaldoSeleccionado', id),
    cargarRespaldo: (id, preparado, confirmado, password) =>
      invocar('cargarRespaldo', id, preparado, confirmado, password),
    cancelarOperacionRespaldo: (id) => invocar('cancelarOperacionRespaldo', id),
    reiniciarDespuesDeRestauracion: (id) => invocar('reiniciarDespuesDeRestauracion', id),
    alProgreso: (id, callback) => {
      const listener = (_e: unknown, p: ProgresoRespaldo): void => {
        if (p?.operacionId === id) callback(p)
      }
      ipc.on('respaldos:progreso', listener)
      return () => {
        ipc.removeListener('respaldos:progreso', listener)
      }
    }
  }
}
