// Arnés visual de solo lectura, con CSS y componentes reales. No inicia la app,
// no autentica, no migra ni escribe en PostgreSQL. Vite sirve en modo desarrollo.
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { root, load } = require('../tests/loader.cjs')
const { conexionDesarrollador } = require('./conexion-desarrollador.cjs')
app.setName('RuizCacao Manager')
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
        name: 'pagina-prueba-scroll',
        configureServer(s) {
          s.middlewares.use('/__scroll', (_req, res) => {
            res.setHeader('Content-Type', 'text/html')
            res.end(
              '<html><head><meta charset="utf-8"><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/scripts/perfil-scroll-etapa04.tsx"></script></body></html>'
            )
          })
        }
      }
    ],
    server: { host: '127.0.0.1', port: 0 }
  })
  const { config } = await conexionDesarrollador()
  const { BaseLocal } = load(root + '/src/main/database/base.ts')
  const base = new BaseLocal(config)
  const db = await base.pool.connect()
  let ventana
  const evidencia = root + '/docs/evidencias-escalabilidad'
  const resultados = []
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await db.query('SET LOCAL idle_in_transaction_session_timeout = 0')
    await db.query("SET LOCAL TIME ZONE 'America/Guayaquil'")
    const estado = await base.estado(db)
    await server.listen()
    const origen = (e) => {
      if (e.sender.id !== ventana.webContents.id || e.senderFrame !== ventana.webContents.mainFrame)
        throw Error('Origen inválido')
    }
    let inicio
    ipcMain.handle('perfil:estado', async (e) => {
      origen(e)
      await inicio
      return estado
    })
    ipcMain.handle('perfil:historial', async (e, modulo, f) => {
      origen(e)
      let valor
      if (modulo === 'historialStock')
        valor = await load(root + '/src/main/database/historial-stock.ts').consultarHistorialStock(
          db,
          f
        )
      else if (modulo === 'historialCompras' || modulo === 'historialVentas')
        valor = await load(root + '/src/main/database/historial-operaciones.ts')[
          modulo === 'historialCompras' ? 'consultarHistorialCompras' : 'consultarHistorialVentas'
        ](db, f)
      else
        valor = await load(root + '/src/main/database/listados.ts').consultarListado(db, modulo, f)
      return { ok: true, valor }
    })
    let escenario
    ipcMain.handle('scroll:captura', async (e, nombre) => {
      origen(e)
      await ventana.webContents.executeJavaScript(
        'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'
      )
      const png = await ventana.webContents.capturePage()
      await fs.writeFile(
        path.join(evidencia, `scroll-${escenario.nombre}-${nombre}.png`),
        png.toPNG()
      )
    })
    ipcMain.handle('scroll:entrada', async (e, tipo) => {
      origen(e)
      if (tipo === 'rueda') {
        const punto = await ventana.webContents.executeJavaScript(
          '(()=>{const r=document.querySelector(".contenedor-tabla").getBoundingClientRect();return {x:Math.round(r.left+60),y:Math.round(r.top+60)}})()'
        )
        ventana.webContents.sendInputEvent({
          type: 'mouseWheel',
          x: Math.round(punto.x * ventana.webContents.getZoomFactor()),
          y: Math.round(punto.y * ventana.webContents.getZoomFactor()),
          deltaY: -260,
          deltaX: 0
        })
      } else {
        ventana.webContents.sendInputEvent({ type: 'keyDown', keyCode: tipo })
        ventana.webContents.sendInputEvent({ type: 'keyUp', keyCode: tipo })
      }
    })
    for (escenario of [
      { nombre: 'escritorio', ancho: 1440, alto: 960, zoom: 1 },
      { nombre: 'reducida', ancho: 1024, alto: 768, zoom: 1 },
      { nombre: 'compacta', ancho: 800, alto: 600, zoom: 1 },
      { nombre: 'zoom125', ancho: 1280, alto: 800, zoom: 1.25 }
    ]) {
      let iniciar
      inicio = new Promise((resolve) => {
        iniciar = resolve
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
      ventana.webContents.on('console-message', (event) => {
        if (event.message.includes('Scroll') || event.message.includes('Error'))
          console.log(event.message)
      })
      const resultado = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Tiempo de prueba agotado')), 300000)
        ipcMain.once('perfil:resultado', (e, r) => {
          origen(e)
          clearTimeout(timer)
          r.error ? reject(Error(r.error)) : resolve(r)
        })
      })
      await ventana.loadURL(server.resolvedUrls.local[0] + '__scroll')
      ventana.webContents.setZoomFactor(escenario.zoom)
      iniciar()
      const r = await resultado
      resultados.push({ escenario, zoomReal: ventana.webContents.getZoomFactor(), ...r })
      console.log(escenario.nombre + ': ' + r.validaciones.length + ' comprobaciones correctas')
      ventana.destroy()
    }
    await fs.writeFile(
      evidencia + '/scroll-etapa04-2026-10-02.json',
      JSON.stringify(resultados, null, 2)
    )
  } finally {
    ventana?.destroy()
    await server.close()
    await db.query('ROLLBACK').catch(() => {})
    db.release()
    await base.pool.end()
  }
}
app
  .whenReady()
  .then(main)
  .then(() => app.quit())
  .catch((e) => {
    console.error(e.stack)
    app.exit(1)
  })
