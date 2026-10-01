import { contextBridge, ipcRenderer } from 'electron'
import type { ApiPersistencia, Respuesta } from '../shared/persistencia'

const invocar = <T>(canal: string, ...args: unknown[]): Promise<Respuesta<T>> =>
  ipcRenderer.invoke(canal, ...args).catch(() => ({
    ok: false,
    error: 'No se pudo comunicar con la aplicación. Vuelve a intentarlo.'
  }))
// Custom APIs for renderer
const datos: ApiPersistencia = {
  anularOperacion: (...args) => invocar('datos:anularOperacion', ...args),
  cambiarPassword: (...args) => invocar('datos:cambiarPassword', ...args),
  crearUsuario: (...args) => invocar('datos:crearUsuario', ...args),
  cambiarEstadoUsuario: (...args) => invocar('datos:cambiarEstadoUsuario', ...args),
  restablecerPasswordUsuario: (...args) => invocar('datos:restablecerPasswordUsuario', ...args),
  estado: () => invocar('datos:estado'),
  crearAdministrador: (...args) => invocar('datos:crearAdministrador', ...args),
  login: (...args) => invocar('datos:login', ...args),
  solicitarRecuperacion: (...args) => invocar('datos:solicitarRecuperacion', ...args),
  recuperar: (...args) => invocar('datos:recuperar', ...args),
  cargar: () => invocar('datos:cargar'),
  ejecutar: (...args) => invocar('datos:ejecutar', ...args),
  jornada: (...args) => invocar('datos:jornada', ...args),
  leerAviso: (...args) => invocar('datos:leerAviso', ...args),
  configurarUmbralStock: (...args) => invocar('datos:configurarUmbralStock', ...args),
  registrarStockInicial: (...args) => invocar('datos:registrarStockInicial', ...args),
  salir: () => invocar('datos:salir')
}
const api = {
  datos,
  copiarTexto: (texto: string): Promise<boolean> =>
    ipcRenderer.invoke('sistema:copiar-texto', texto).then(Boolean, () => false),
  generarReportePDF: async (html: string, nombreArchivo: string, onGenerado?: () => void) => {
    const solicitud = crypto.randomUUID()
    const listener = (_event: Electron.IpcRendererEvent, id: string): void => {
      if (id === solicitud) onGenerado?.()
    }
    ipcRenderer.on('documento:reporte-generado', listener)
    try {
      return await ipcRenderer.invoke('documento:generar-pdf', { html, nombreArchivo, solicitud })
    } catch {
      return { canceled: false, error: 'No se pudo generar el documento. Intenta nuevamente.' }
    } finally {
      ipcRenderer.removeListener('documento:reporte-generado', listener)
    }
  },
  generarComprobantePDF: (html: string, nombreArchivo: string) =>
    ipcRenderer.invoke('comprobante:generar-pdf', { html, nombreArchivo }).then(
      (r) => {
        if (r.error) throw new Error(r.error)
        return r
      },
      () => {
        throw new Error('No se pudo generar el documento. Intenta nuevamente.')
      }
    )
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', { process: { versions: { ...process.versions } } })
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = { process: { versions: { ...process.versions } } }
  // @ts-ignore (define in dts)
  window.api = api
}
