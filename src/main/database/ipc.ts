import { ErrorNegocio } from '../../shared/errorNegocio'
import { traducirError } from './errores'
import { ipcMain, type BrowserWindow } from 'electron'
import { estadoAcceso, obtenerBase } from './conexion'
import type { ApiPersistencia, Respuesta } from '../../shared/persistencia'
export function registrarPersistenciaIPC(ventana: BrowserWindow): void {
  const handlers = {
    listarNotificaciones: () => obtenerBase().listarNotificaciones(),
    marcarNotificacionLeida: (id: string) => obtenerBase().marcarNotificacionLeida(id),
    marcarTodasNotificacionesLeidas: () => obtenerBase().marcarTodasNotificacionesLeidas(),
    eliminarNotificacion: (id: string) => obtenerBase().eliminarNotificacion(id),
    eliminarTodasNotificaciones: () => obtenerBase().eliminarTodasNotificaciones(),
    limpiarNotificacionesAntiguas: () => obtenerBase().limpiarNotificacionesAntiguas(),
    historialCombinado: (...args: Parameters<ApiPersistencia['historialCombinado']>) =>
      obtenerBase().historialCombinado(...args),
    listadoGastos: (...args: Parameters<ApiPersistencia['listadoGastos']>) =>
      obtenerBase().listadoGastos(...args),
    resumenGastos: (...args: Parameters<ApiPersistencia['resumenGastos']>) =>
      obtenerBase().resumenGastos(...args),
    reportePeriodo: (...args: Parameters<ApiPersistencia['reportePeriodo']>) =>
      obtenerBase().reportePeriodo(...args),
    documentoReporte: (...args: Parameters<ApiPersistencia['documentoReporte']>) =>
      obtenerBase().documentoReporte(...args),
    historialCompras: (...args: Parameters<ApiPersistencia['historialCompras']>) =>
      obtenerBase().historialCompras(...args),
    historialVentas: (...args: Parameters<ApiPersistencia['historialVentas']>) =>
      obtenerBase().historialVentas(...args),
    historialStock: (...args: Parameters<ApiPersistencia['historialStock']>) =>
      obtenerBase().historialStock(...args),
    estado: estadoAcceso,
    anularOperacion: (...args: Parameters<ApiPersistencia['anularOperacion']>) =>
      obtenerBase().anularOperacion(...args),
    cambiarPassword: (actual: string, nueva: string) =>
      obtenerBase().cambiarPassword(actual, nueva),
    crearUsuario: (nombre: string, password: string) =>
      obtenerBase().crearUsuario(nombre, password),
    cambiarEstadoUsuario: (id: string, activo: boolean) =>
      obtenerBase().cambiarEstadoUsuario(id, activo),
    restablecerPasswordUsuario: (id: string, nueva: string) =>
      obtenerBase().restablecerPasswordUsuario(id, nueva),
    crearAdministrador: (nombre: string, password: string) =>
      obtenerBase().crearAdministrador(nombre, password),
    login: (nombre: string, password: string) => obtenerBase().login(nombre, password),
    solicitarRecuperacion: (nombre: string) => obtenerBase().solicitarRecuperacion(nombre),
    recuperar: (nombre: string, codigo: string, password: string) =>
      obtenerBase().recuperar(nombre, codigo, password),
    cargar: () => obtenerBase().cargar(),
    ejecutar: (...args: Parameters<ApiPersistencia['ejecutar']>) => obtenerBase().ejecutar(...args),
    jornada: (...args: Parameters<ApiPersistencia['jornada']>) => obtenerBase().jornada(...args),
    leerAviso: (id: string) => obtenerBase().leerAviso(id),
    configurarUmbralStock: (...args: Parameters<ApiPersistencia['configurarUmbralStock']>) =>
      obtenerBase().configurarUmbralStock(...args),
    registrarStockInicial: (...args: Parameters<ApiPersistencia['registrarStockInicial']>) =>
      obtenerBase().registrarStockInicial(...args),
    salir: () => obtenerBase().logout()
  }
  // Las solicitudes se ejecutan en orden, incluso si se intenta pulsar dos veces.
  let cola: Promise<unknown> = Promise.resolve()
  for (const [nombre, handler] of Object.entries(handlers)) {
    ipcMain.removeHandler('datos:' + nombre)
    ipcMain.handle('datos:' + nombre, (event, ...args): Promise<Respuesta<unknown>> => {
      if (
        event.sender.id !== ventana.webContents.id ||
        event.senderFrame !== ventana.webContents.mainFrame
      )
        return Promise.resolve({ ok: false, error: 'Origen no autorizado.' })
      const tarea = cola.then(async () => {
        try {
          const valor = await (handler as (...a: unknown[]) => Promise<unknown>)(...args)
          return { ok: true as const, valor }
        } catch (error) {
          const mensaje = traducirError(error, { modulo: 'datos', operacion: nombre })
          return {
            ok: false as const,
            error:
              nombre === 'anularOperacion' && !(error instanceof ErrorNegocio)
                ? 'No se pudo completar la anulación. Vuelve a intentarlo.'
                : mensaje
          }
        }
      })
      cola = tarea.catch(() => {})
      return tarea
    })
  }
}
