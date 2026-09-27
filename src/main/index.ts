import { guardarDocumento } from './documentos'
import { traducirError } from './database/errores'
import { ErrorNegocio } from '../shared/errorNegocio'
import { app, shell, BrowserWindow, ipcMain, dialog, clipboard, Menu } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { iniciarPersistencia, cerrarPersistencia, obtenerBase } from './database/conexion'
import { registrarPersistenciaIPC } from './database/ipc'
import icon from '../../resources/icon.png?asset'

app.setName('RuizCacao Manager')

let cerrandoVentana = false
let cierreAutorizado = false
let principal: BrowserWindow | null = null
const instanciaUnica = app.requestSingleInstanceLock()
if (!instanciaUnica) app.quit()

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged
    }
  })

  principal = mainWindow
  registrarPersistenciaIPC(mainWindow)
  mainWindow.on('close', async (event) => {
    if (cierreAutorizado) return
    event.preventDefault()
    if (cerrandoVentana) return
    cerrandoVentana = true
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Continuar trabajando', 'Cerrar aplicación'],
      defaultId: 0,
      cancelId: 0,
      title: 'Cerrar RuizCacao Manager',
      message: '¿Cerrar la aplicación y la jornada activa?',
      detail:
        'Las operaciones confirmadas se conservarán. La jornada de hoy podrá reabrirse con la contraseña del administrador. Los formularios sin guardar se descartarán.'
    })
    if (result.response !== 1) {
      cerrandoVentana = false
      return
    }
    try {
      await cerrarPersistencia()
      cierreAutorizado = true
      mainWindow.destroy()
      app.quit()
    } catch {
      cerrandoVentana = false
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        message: 'No se pudo guardar el cierre de jornada.',
        detail:
          'La aplicación seguirá abierta. Comprueba el almacenamiento local e intenta cerrar nuevamente.'
      })
    }
  })
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  mainWindow.webContents.on('context-menu', (_event, params) => {
    const plantilla: Electron.MenuItemConstructorOptions[] = []

    if (params.isEditable) {
      plantilla.push(
        {
          label: 'Deshacer',
          role: 'undo',
          enabled: params.editFlags.canUndo
        },
        {
          label: 'Rehacer',
          role: 'redo',
          enabled: params.editFlags.canRedo
        },
        { type: 'separator' },
        {
          label: 'Cortar',
          role: 'cut',
          enabled: params.editFlags.canCut
        },
        {
          label: 'Copiar',
          role: 'copy',
          enabled: params.editFlags.canCopy
        },
        {
          label: 'Pegar',
          role: 'paste',
          enabled: params.editFlags.canPaste
        },
        { type: 'separator' },
        {
          label: 'Seleccionar todo',
          role: 'selectAll'
        }
      )
    } else if (params.selectionText) {
      plantilla.push(
        {
          label: 'Copiar',
          role: 'copy',
          enabled: params.editFlags.canCopy
        },
        { type: 'separator' },
        {
          label: 'Seleccionar todo',
          role: 'selectAll'
        }
      )
    }

    if (plantilla.length > 0) {
      Menu.buildFromTemplate(plantilla).popup({ window: mainWindow })
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//.test(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  if (!instanciaUnica) return
  await iniciarPersistencia()
  // Identidad oficial de la aplicación para Windows y notificaciones
  electronApp.setAppUserModelId('com.gruporuiz.ruizcacao-manager')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const generarPDF = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { html: string; nombreArchivo: string; solicitud?: string }
  ): Promise<{ canceled: boolean; filePath?: string; error?: string }> => {
    let generado = false
    try {
      if (
        !principal ||
        _event.sender.id !== principal.webContents.id ||
        _event.senderFrame !== principal.webContents.mainFrame ||
        !obtenerBase().autenticado()
      )
        throw new ErrorNegocio('Inicia sesión para generar documentos.')
      if (
        typeof payload?.html !== 'string' ||
        payload.html.length > 10000000 ||
        typeof payload.nombreArchivo !== 'string'
      )
        throw new ErrorNegocio('El documento no es válido.')
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          javascript: false
        }
      })

      try {
        await printWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`
        )

        const pdf = await printWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0
          }
        })

        generado = true
        if (typeof payload.solicitud === 'string' && payload.solicitud.length <= 64)
          _event.sender.send('documento:reporte-generado', payload.solicitud)
        const safeName = (payload.nombreArchivo || 'comprobante').replace(/[\\/:*?"<>|]/g, '_')
        const defaultPath = join(app.getPath('downloads'), `${safeName}.pdf`)
        return await guardarDocumento(
          pdf,
          () =>
            dialog.showSaveDialog({
              title: 'Guardar documento PDF',
              defaultPath,
              filters: [{ name: 'Documento PDF', extensions: ['pdf'] }]
            }),
          writeFile
        )
      } finally {
        if (!printWindow.isDestroyed()) printWindow.close()
      }
    } catch (error) {
      traducirError(error, {
        modulo: 'documentos',
        operacion: generado ? 'guardar_pdf' : 'generar_pdf'
      })
      return {
        canceled: false,
        error: generado
          ? 'No se pudo guardar el reporte. Intenta nuevamente.'
          : 'No se pudo generar el documento. Intenta nuevamente.'
      }
    }
  }
  ipcMain.handle('comprobante:generar-pdf', generarPDF)
  ipcMain.handle('documento:generar-pdf', generarPDF)
  ipcMain.handle('sistema:copiar-texto', async (event, texto: unknown): Promise<boolean> => {
    if (
      !principal ||
      event.sender.id !== principal.webContents.id ||
      event.senderFrame !== principal.webContents.mainFrame ||
      typeof texto !== 'string' ||
      texto.length === 0 ||
      texto.length > 4096
    )
      return false

    clipboard.writeText(texto)
    return (await clipboard.readText()) === texto
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

app.on('before-quit', (event) => {
  if (!cierreAutorizado && principal && !principal.isDestroyed()) {
    event.preventDefault()
    principal.close()
  }
})
app.on('second-instance', () => {
  if (principal) {
    if (principal.isMinimized()) principal.restore()
    principal.focus()
  }
})
