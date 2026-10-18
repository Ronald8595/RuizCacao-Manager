// Chromium real, fixtures en memoria; no importa persistencia ni abre PostgreSQL.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict')
const { root } = require('../tests/loader.cjs')
app.setPath('userData', require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'ruizcacao-ui03-')))
app.on('window-all-closed', () => {})
async function main() {
  const { createServer } = await import('vite'),
    { default: react } = await import('@vitejs/plugin-react'),
    { default: tailwind } = await import('@tailwindcss/vite')
  const evidence = path.join(root, 'docs/evidencias-respaldos-etapa03/visual')
  await fs.mkdir(evidence, { recursive: true })
  const server = await createServer({
    configFile: false,
    root,
    plugins: [
      react(),
      tailwind(),
      {
        name: 'respaldos-test',
        configureServer(s) {
          s.middlewares.use('/__respaldos', (_, res) => {
            res.setHeader('Content-Type', 'text/html')
            res.end(
              '<html><head><meta charset="utf-8"><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/scripts/perfil-respaldos-ui.tsx"></script></body></html>'
            )
          })
        }
      }
    ],
    server: { host: '127.0.0.1', port: 0 }
  })
  let win
  const resultados = []
  try {
    await server.listen()
    for (const escenario of [
      { nombre: 'escritorio', width: 1440, height: 900, zoom: 1 },
      { nombre: 'reducida', width: 800, height: 600, zoom: 1 },
      { nombre: 'zoom125', width: 1000, height: 750, zoom: 1.25 }
    ]) {
      win = new BrowserWindow({
        show: false,
        width: escenario.width,
        height: escenario.height,
        useContentSize: true,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          offscreen: true
        }
      })
      const js = (s) => win.webContents.executeJavaScript(s)
      const tick = () => js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
      const action = async (s) => {
        try {
          await js('pruebaRespaldos.' + s)
        } catch (e) {
          throw new Error('Acción ' + s + ': ' + e.message)
        }
        await tick()
      }
      const state = () => js('pruebaRespaldos.estado()')
      const captura = async (n) => {
        await tick()
        await fs.writeFile(
          path.join(evidence, escenario.nombre + '-' + n + '.png'),
          (await win.webContents.capturePage()).toPNG()
        )
      }
      const key = async (k, shift = false) => {
        win.webContents.sendInputEvent({
          type: 'keyDown',
          keyCode: k,
          modifiers: shift ? ['shift'] : []
        })
        if (k === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
        win.webContents.sendInputEvent({
          type: 'keyUp',
          keyCode: k,
          modifiers: shift ? ['shift'] : []
        })
        await tick()
      }
      await win.loadURL(server.resolvedUrls.local[0] + '__respaldos')
      win.webContents.setZoomFactor(escenario.zoom)
      await js(
        'new Promise((resolve,reject)=>{let n=0;const f=()=>{if(window.pruebaRespaldos)return resolve();if(++n>1000)return reject(Error("Carga UI"));requestAnimationFrame(f)};f()})'
      )
      assert.equal((await state()).llamadas, 0)
      await action('montar()')
      assert.equal((await state()).llamadas, 0)
      await captura('pagina')
      assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'), true)
      await action('dialogo(true)')
      await action('click("Generar respaldo")')
      assert.equal((await state()).dialogos, 0)
      await action('dialogo(false)')
      await action('click("Generar respaldo")')
      await action('click("Generar respaldo")')
      assert.equal((await state()).llamadas, 3)
      assert.equal((await state()).listeners, 1)
      await action('progreso("exportando")')
      await captura('generando')
      const frames = await js(
        'new Promise(r=>{let n=0;const t=performance.now();function f(){n++;if(performance.now()-t>300)r(n);else requestAnimationFrame(f)}f()})'
      )
      assert.ok(frames > 2)
      await key('Escape')
      assert.equal((await state()).dialogos, 1)
      await action('click("Cancelar")')
      await captura('cancelado')
      assert.equal((await state()).listeners, 0)
      await action('click("Aceptar")')
      await action('click("Generar respaldo")')
      await action('progreso("finalizando",false)')
      assert.equal(await js('document.querySelector("dialog button").disabled'), true)
      await captura('publicacion')
      await action('resolver("backup")')
      await captura('exito-backup')
      assert.equal((await state()).listeners, 0)
      await action('click("Aceptar")')
      await action('click("Cargar respaldo")')
      await action('progreso("verificando")')
      await captura('validando')
      await action('resolver("resumen")')
      await captura('confirmar')
      assert.equal((await state()).foco, 'Cancelar')
      assert.equal((await state()).listeners, 0)
      await key('Tab', true)
      assert.equal(
        await js('document.querySelector("dialog").contains(document.activeElement)'),
        true
      )
      await key('Tab')
      assert.equal(
        await js('document.querySelector("dialog").contains(document.activeElement)'),
        true
      )
      await action('click("Cargar respaldo")')
      await captura('password')
      await action('passwordMala(true)')
      await action('clave()')
      await key('Enter')
      await captura('password-incorrecta')
      assert.equal(await js('!!document.querySelector("[role=alert]")'), true)
      await action('passwordMala(false)')
      await action('clave()')
      await action('click("Autorizar carga")')
      await action('progreso("datos")')
      await captura('carga-cancelable')
      await action('progreso("finalizando",false)')
      await captura('carga-critica')
      assert.equal(await js('document.querySelector("dialog button").disabled'), true)
      await key('Escape')
      assert.equal((await state()).dialogos, 1)
      await action('resolver("restore")')
      await captura('exito-restore')
      await action('click("Continuar")')
      assert.equal((await state()).reinicios, 1)
      await action('desmontar()')
      assert.equal((await state()).listeners, 0)
      await action('montar()')
      await action('click("Cargar respaldo")')
      await action('resolver("error")')
      await captura('error')
      await action('click("Aceptar")')
      await action('click("Cargar respaldo")')
      await action('resolver("resumen")')
      await key('Enter')
      assert.equal((await state()).dialogos, 1)
      assert.equal(await js('!!document.querySelector("input[type=password]")'), false)
      await action('click("Aceptar")')
      await action('click("Generar respaldo")')
      await action('desmontar()')
      await tick()
      assert.equal((await state()).listeners, 0)
      await action('montar(false)')
      assert.equal(await js('document.querySelectorAll("button").length'), 0)
      const final = await state()
      assert.equal(final.datos, 0)
      assert.equal(final.maxListeners, 1)
      resultados.push({
        escenario,
        zoomReal: win.webContents.getZoomFactor(),
        framesDuranteOperacion: frames,
        ...final
      })
      console.log('OK UI ' + escenario.nombre)
      win.destroy()
      win = undefined
    }
    await fs.writeFile(path.join(evidence, 'resultados.json'), JSON.stringify(resultados, null, 2))
  } finally {
    win?.destroy()
    await server.close()
  }
}
app
  .whenReady()
  .then(main)
  .then(
    () => app.exit(0),
    (e) => {
      console.error(e.stack)
      app.exit(1)
    }
  )
