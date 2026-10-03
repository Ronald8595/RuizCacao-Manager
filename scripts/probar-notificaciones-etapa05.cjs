// Interfaz real en Chromium oculto, fixture solo en memoria; sin PostgreSQL.
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { root } = require('../tests/loader.cjs')
app.setPath(
  'userData',
  require('node:fs').mkdtempSync(
    path.join(require('node:os').tmpdir(), 'ruizcacao-notificaciones-ui-')
  )
)
app.on('window-all-closed', () => {})
async function main() {
  const { createServer } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const { default: tailwind } = await import('@tailwindcss/vite')
  const server = await createServer({
    configFile: false,
    root,
    plugins: [
      react(),
      tailwind(),
      {
        name: 'notificaciones-prueba',
        configureServer(s) {
          s.middlewares.use('/__notificaciones', (_req, res) => {
            res.setHeader('Content-Type', 'text/html')
            res.end(
              '<html><head><meta charset="utf-8"><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/scripts/perfil-notificaciones-etapa05.tsx"></script></body></html>'
            )
          })
        }
      }
    ],
    server: { host: '127.0.0.1', port: 0 }
  })
  let ventana, inicio, escenario
  const evidencia = path.join(root, 'docs/evidencias-escalabilidad'),
    resultados = []
  const origen = (e) => {
    if (e.sender.id !== ventana.webContents.id || e.senderFrame !== ventana.webContents.mainFrame)
      throw Error('Origen inválido')
  }
  ipcMain.handle('perfil:estado', async (e) => {
    origen(e)
    await inicio
  })
  ipcMain.handle('scroll:captura', async (e, nombre) => {
    origen(e)
    await fs.writeFile(
      path.join(evidencia, `notificaciones-${escenario.nombre}-${nombre}.png`),
      (await ventana.webContents.capturePage()).toPNG()
    )
  })
  ipcMain.handle('scroll:entrada', async (e, tipo) => {
    origen(e)
    ventana.webContents.focus()
    const tecla = tipo === 'ArrowDown' ? 'Down' : tipo === 'ArrowUp' ? 'Up' : tipo
    ventana.webContents.sendInputEvent({ type: 'keyDown', keyCode: tecla })
    ventana.webContents.sendInputEvent({ type: 'keyUp', keyCode: tecla })
  })
  try {
    await server.listen()
    for (escenario of [
      { nombre: 'escritorio', ancho: 1440, alto: 900, zoom: 1 },
      { nombre: 'reducida', ancho: 800, alto: 600, zoom: 1 },
      { nombre: 'zoom125', ancho: 1280, alto: 800, zoom: 1.25 }
    ]) {
      let iniciar
      inicio = new Promise((r) => {
        iniciar = r
      })
      ventana = new BrowserWindow({
        show: false,
        width: escenario.ancho,
        height: escenario.alto,
        useContentSize: true,
        webPreferences: {
          preload: root + '/scripts/preload-scroll-etapa04.cjs',
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          offscreen: true
        }
      })
      const resultado = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Tiempo de prueba agotado')), 60000)
        ipcMain.once('perfil:resultado', (e, r) => {
          origen(e)
          clearTimeout(timer)
          r.error ? reject(Error(r.error)) : resolve(r)
        })
      })
      await ventana.loadURL(server.resolvedUrls.local[0] + '__notificaciones')
      ventana.webContents.setZoomFactor(escenario.zoom)
      iniciar()
      resultados.push({
        escenario,
        zoomReal: ventana.webContents.getZoomFactor(),
        ...(await resultado)
      })
      console.log(escenario.nombre + ': notificaciones y accesibilidad correctas')
      ventana.destroy()
      ventana = null
    }
    await fs.writeFile(
      path.join(evidencia, 'notificaciones-etapa05-2026-10-03.json'),
      JSON.stringify(resultados, null, 2) + '\n'
    )
  } finally {
    ventana?.destroy()
    await server.close()
  }
}
app
  .whenReady()
  .then(main)
  .then(() => app.quit())
  .catch((e) => {
    console.error(e)
    app.exit(1)
  })
