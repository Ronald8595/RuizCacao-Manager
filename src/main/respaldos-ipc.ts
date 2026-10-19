import { registrarFalloRespaldo } from './database/respaldo-diagnostico'
import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { stat } from 'node:fs/promises'
import {
  obtenerBase,
  crearGeneradorInterno,
  crearRestauradorInterno,
  crearWorkspaceRestoreInterno,
  bloquearHastaReinicioRestore
} from './database/conexion'
import { operacionesRespaldos } from './database/operacion-respaldo'
import { ErrorRespaldo, ServicioRespaldos, errorRespaldo } from './respaldos-servicio'
import type { RespuestaRespaldo } from '../shared/respaldos'

const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v)
export const canalesRespaldos = [
  'seleccionarDestinoRespaldo',
  'generarRespaldo',
  'seleccionarRespaldo',
  'validarRespaldoSeleccionado',
  'cargarRespaldo',
  'cancelarOperacionRespaldo',
  'reiniciarDespuesDeRestauracion'
] as const
export async function despacharRespaldo(
  servicio: ServicioRespaldos,
  canal: string,
  args: unknown[]
): Promise<RespuestaRespaldo<unknown>> {
  try {
    if (!canalesRespaldos.includes(canal as (typeof canalesRespaldos)[number]))
      throw new ErrorRespaldo('solicitud')
    const seleccion = canal === 'seleccionarDestinoRespaldo' || canal === 'seleccionarRespaldo'
    if (seleccion ? args.length !== 0 : !uuid(args[0])) throw new ErrorRespaldo('solicitud')
    if (!seleccion && canal !== 'cargarRespaldo' && args.length !== 1)
      throw new ErrorRespaldo('solicitud')
    if (
      canal === 'cargarRespaldo' &&
      (args.length !== 4 ||
        !uuid(args[1]) ||
        args[2] !== true ||
        typeof args[3] !== 'string' ||
        args[3].length > 128)
    )
      throw new ErrorRespaldo('solicitud')
    let valor: unknown
    switch (canal) {
      case 'seleccionarDestinoRespaldo':
        valor = await servicio.seleccionar('generar')
        break
      case 'seleccionarRespaldo':
        valor = await servicio.seleccionar('cargar')
        break
      case 'generarRespaldo':
        valor = await servicio.generar(args[0] as string)
        break
      case 'validarRespaldoSeleccionado':
        valor = await servicio.validar(args[0] as string)
        break
      case 'cargarRespaldo':
        valor = await servicio.cargar(args[0] as string, args[1] as string, args[3] as string)
        break
      case 'cancelarOperacionRespaldo':
        valor = await servicio.cancelar(args[0] as string)
        break
      case 'reiniciarDespuesDeRestauracion':
        valor = await servicio.reiniciar(args[0] as string)
    }
    return { ok: true, valor }
  } catch (e) {
    if (!(e instanceof ErrorRespaldo)) registrarFalloRespaldo(e, canal)
    return { ok: false, ...errorRespaldo(e) }
  }
}
export function registrarRespaldosIPC(
  ventana: BrowserWindow,
  reiniciar: () => Promise<void>
): ServicioRespaldos {
  const servicio = new ServicioRespaldos({
    autorizar: async (tipo) => {
      try {
        return tipo === 'cargar'
          ? await obtenerBase().autorizarCargaRespaldo()
          : obtenerBase().autorizarRespaldos()
      } catch {
        throw new ErrorRespaldo('permiso')
      }
    },
    credencial: async (password) => {
      let valido: boolean
      try {
        valido = await obtenerBase().confirmarCargaRespaldo(password)
      } catch {
        throw new ErrorRespaldo('autenticacion')
      }
      if (!valido) throw new ErrorRespaldo('password')
    },
    seleccionar: async (tipo) => {
      if (tipo === 'generar') {
        const fecha = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
        const r = await dialog.showSaveDialog(ventana, {
          title: 'Generar respaldo',
          defaultPath: 'RuizCacao_' + fecha + '.back',
          filters: [{ name: 'Respaldo RuizCacao', extensions: ['back'] }],
          properties: ['createDirectory', 'showOverwriteConfirmation']
        })
        return r.canceled ? null : (r.filePath ?? null)
      }
      const r = await dialog.showOpenDialog(ventana, {
        title: 'Cargar respaldo',
        filters: [{ name: 'Respaldo RuizCacao', extensions: ['back'] }],
        properties: ['openFile']
      })
      return r.canceled ? null : (r.filePaths[0] ?? null)
    },
    tamano: async (ruta) => (await stat(ruta)).size,
    preparar: async (ruta, ctx) => {
      const workspace = await crearWorkspaceRestoreInterno()
      const lease = operacionesRespaldos.adquirir('restore')
      try {
        return await workspace.preparar(ruta, {
          ...ctx,
          signal: AbortSignal.any([ctx.signal!, lease.contexto.signal!])
        })
      } finally {
        lease.liberar()
      }
    },
    generar: async (ruta, ctx) => {
      const caso = await crearGeneradorInterno(ruta, () => ctx.fase?.('publicando'))
      return (await caso.ejecutar(ctx)).archivo
    },
    cargar: async (p, ctx, autorizacion) => {
      const activa = obtenerBase()
      if ((await activa.autorizarCargaRespaldo()) !== autorizacion)
        throw new ErrorRespaldo('permiso')
      const caso = await crearRestauradorInterno({ preparar: async () => p })
      await caso.ejecutar(
        '',
        async () => (await activa.autorizarCargaRespaldo()) === autorizacion,
        ctx
      )
    },
    bloquearHastaReinicio: bloquearHastaReinicioRestore,
    reiniciar,
    progreso: (p) => {
      if (!ventana.webContents.isDestroyed()) ventana.webContents.send('respaldos:progreso', p)
    }
  })
  for (const canal of canalesRespaldos) {
    ipcMain.removeHandler('respaldos:' + canal)
    ipcMain.handle('respaldos:' + canal, (event, ...args) => {
      if (
        event.sender !== ventana.webContents ||
        event.senderFrame !== ventana.webContents.mainFrame
      )
        return {
          ok: false,
          codigo: 'permiso',
          error: 'No tienes permisos para realizar esta acción.'
        }
      return despacharRespaldo(servicio, canal, args)
    })
  }
  ventana.webContents.on('render-process-gone', () => {
    void servicio.cerrar()
  })
  // No tareas ni listeners de progreso residentes en Renderer. Este servicio queda inerte.
  return servicio
}
