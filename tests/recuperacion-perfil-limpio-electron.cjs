const { app, BrowserWindow, dialog, safeStorage } = require('electron')
const fs = require('node:fs/promises')
const fss = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createHash, randomUUID } = require('node:crypto')
const ts = require('typescript')
const { load, root } = require('./loader.cjs')
const [raiz, fase] = process.argv.slice(2)
assert.match(path.basename(raiz), /^rcm-perfil-limpio-/)
assert.ok(['A', 'B', 'login', 'reabrir'].includes(fase))
const perfil = path.join(raiz, fase === 'A' ? 'A' : 'B')
fss.mkdirSync(perfil, { recursive: true })
app.setPath('userData', perfil)
app.getVersion = () => require('../package.json').version
// Motor empaquetable del proyecto; no depende de PostgreSQL instalado globalmente.
process.resourcesPath = path.join(root, 'vendor')
app.on('window-all-closed', () => {})
const conexion = load(root + '/src/main/database/conexion.ts')
const { registrarRespaldosIPC } = load(root + '/src/main/respaldos-ipc.ts')
const { registrarPersistenciaIPC } = load(root + '/src/main/database/ipc.ts')
const { procesosPostgresActivos } = load(root + '/src/main/database/proceso-postgres.ts')
const { PaqueteRespaldoZip } = load(root + '/src/main/database/respaldo-paquete.ts')
const password = 'Perfil-limpio-original-2026!'

async function huellasComerciales(pool) {
  const resultado = {}
  for (const tabla of [
    'compras',
    'ventas',
    'cuentas',
    'movimientos_cuenta',
    'gastos',
    'existencias',
    'v_saldos',
    'v_flujo_caja'
  ]) {
    resultado[tabla] = (
      await pool.query(
        `SELECT count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) firma FROM ruizcacao.${tabla} t`
      )
    ).rows[0]
  }
  return resultado
}

async function main() {
  let win, servicio, server
  try {
    await conexion.iniciarPersistencia()
    const db = conexion.obtenerBase()
    const jsPreload = ts.transpileModule(
      await fs.readFile(root + '/src/preload/respaldos.ts', 'utf8'),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
      }
    ).outputText
    const preload = path.join(perfil, 'prueba-preload.cjs')
    await fs.writeFile(
      preload,
      `const {contextBridge,ipcRenderer}=require('electron');const m={exports:{}};(function(exports){${jsPreload}\n})(m.exports);contextBridge.exposeInMainWorld('api',{respaldos:m.exports.apiRespaldos(ipcRenderer),datos:{estado:()=>ipcRenderer.invoke('datos:estado'),login:(...a)=>ipcRenderer.invoke('datos:login',...a),crearAdministrador:(...a)=>ipcRenderer.invoke('datos:crearAdministrador',...a)}});`
    )
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload,
        sandbox: true,
        contextIsolation: true,
        offscreen: true,
        backgroundThrottling: false
      }
    })
    registrarPersistenciaIPC(win)
    const js = (code) => win.webContents.executeJavaScript(code)
    const call = (method, ...args) => js(`api.respaldos.${method}(...${JSON.stringify(args)})`)
    let reiniciado = false
    servicio = registrarRespaldosIPC(win, async () => {
      await conexion.cerrarPersistencia()
      reiniciado = true
    })
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(raiz, 'A.back') })
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path.join(raiz, 'transferencia', 'A.back')]
    })
    await win.loadURL('data:text/html,<html><body>Prueba aislada</body></html>')
    const cred = JSON.parse(
      safeStorage.decryptString(await fs.readFile(path.join(perfil, 'postgres', 'conexion.enc')))
    )
    const huellaCredencial = createHash('sha256').update(JSON.stringify(cred)).digest('hex')
    if (fase === 'A') {
      await fs.writeFile(path.join(raiz, 'huella-credencial-A.txt'), huellaCredencial)
      await db.crearAdministrador('Principal original', password)
      await db.login('Principal original', password)
      await db.jornada('abrir')
      const ejecutar = async (comando, datos) =>
        (await db.ejecutar(randomUUID(), comando, [datos])).resultado
      await ejecutar('crearCliente', {
        nombreRazonSocial: 'Cliente conservado A',
        identificacion: '',
        telefono: ''
      })
      const proveedor = await ejecutar('crearProveedor', {
        nombre: 'Proveedor A',
        ciRuc: '',
        estado: true
      })
      await ejecutar('registrarCompra', {
        fecha: '2026-10-18',
        proveedorId: proveedor.id,
        producto: 'Cacao Seco',
        cantidadQq: 10,
        precioCompraQq: 12.5,
        impuestoPorcentaje: 0,
        montoPagado: 25,
        metodoPago: 'Efectivo'
      })
      await require('../scripts/dataset-qa.cjs').crearDataset(db, '2026-10-18')
      await fs.writeFile(
        path.join(raiz, 'comercial-A.json'),
        JSON.stringify(await huellasComerciales(db.pool))
      )
      const s = await call('seleccionarDestinoRespaldo')
      assert.equal(s.ok, true)
      const r = await call('generarRespaldo', s.valor.operacionId)
      assert.equal(r.ok, true, JSON.stringify(r))
      const manifest = await new PaqueteRespaldoZip().verificar(path.join(raiz, 'A.back'))
      assert.equal(manifest.app_version, '1.3.1')
      console.log('OK A: .back 1.3.1 generado por IPC y contenedor verificado')
      return
    }
    assert.notEqual(
      huellaCredencial,
      await fs.readFile(path.join(raiz, 'huella-credencial-A.txt'), 'utf8')
    )
    const { createServer } = await import('vite')
    const { default: react } = await import('@vitejs/plugin-react')
    const { default: tailwind } = await import('@tailwindcss/vite')
    server = await createServer({
      configFile: false,
      root,
      plugins: [
        react(),
        tailwind(),
        {
          name: 'acceso-perfil-limpio',
          configureServer(s) {
            s.middlewares.use('/__perfil', (_, res) => {
              res.setHeader('Content-Type', 'text/html')
              res.end(
                '<html><head><meta charset="utf-8"><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/scripts/perfil-respaldos-login.tsx"></script></body></html>'
              )
            })
          }
        }
      ],
      server: { host: '127.0.0.1', port: 0, hmr: false }
    })
    await server.listen()
    await win.loadURL(server.resolvedUrls.local[0] + '__perfil')
    // Esperas acotadas solo del arnés; no quedan timers en el producto.
    const esperar = async (texto) => {
      const limite = Date.now() + 120000
      let contenido = ''
      while (Date.now() < limite) {
        contenido = await js('document.body.textContent')
        if (contenido.includes('No se pudo cargar el respaldo'))
          throw Error('La carga falló; consultar logs/respaldos.jsonl del perfil B de prueba.')
        if (contenido.replace(/\s+/g, ' ').includes(texto)) {
          console.log('OK UI: ' + texto)
          return
        }
        await new Promise((r) => setTimeout(r, 100))
      }
      throw Error('Espera agotada: ' + texto + '; DOM: ' + contenido)
    }
    const click = (texto) =>
      js(
        `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(texto)}).click()`
      )
    if (fase === 'B') {
      assert.equal(await db.existeAdministrador(), false)
      for (const tabla of ['compras', 'ventas', 'cuentas'])
        assert.equal(
          (await db.pool.query(`SELECT count(*)::int n FROM ruizcacao.${tabla}`)).rows[0].n,
          0
        )
      await esperar('Crear usuario nuevo')
      assert.deepEqual(
        await js("Array.from(document.querySelectorAll('button')).map(b=>b.textContent.trim())"),
        ['Crear usuario nuevo', 'Cargar respaldo']
      )
      await click('Crear usuario nuevo')
      await esperar('Nueva contraseña')
      await click('Volver a las opciones iniciales')
      await esperar('Crear usuario nuevo')
      assert.equal((await call('seleccionarDestinoRespaldo')).codigo, 'permiso')
      await click('Cargar respaldo')
      await esperar('Antes de realizar el cambio')
      assert.equal(
        await db.existeAdministrador(),
        false,
        'No crear administrador antes del restore'
      )
      assert.equal(await js("document.querySelectorAll('input[type=password]').length"), 0)
      // El segundo botón con este texto es el de confirmación del modal.
      await js(
        "Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.trim()==='Cargar respaldo').at(-1).click()"
      )
      await esperar('Respaldo cargado correctamente')
      await click('Continuar')
      // Esperar el cierre de Main a través del callback de reinicio, sin otro motor concurrente.
      const limiteReinicio = Date.now() + 60000
      while (!reiniciado && Date.now() < limiteReinicio) await new Promise((r) => setTimeout(r, 50))
      assert.ok(reiniciado, 'Reinicio finalizado en Main')
      console.log(
        'OK B: dos acciones, restore sin usuario previo ni contraseña técnica A, reinicio solicitado'
      )
    } else {
      await esperar('Iniciar sesión')
      const estado = await conexion.estadoAcceso()
      assert.equal(estado.administradorExiste, true)
      assert.equal(estado.autenticado, false)
      assert.doesNotMatch(
        await js('document.body.innerText'),
        /Crear usuario nuevo|Cargar respaldo/
      )
      assert.equal((await call('seleccionarRespaldo')).codigo, 'permiso')
      await js(`(() => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        for (const [selector, valor] of [['input[autocomplete=username]', 'Principal original'], ['input[type=password]', ${JSON.stringify(password)}]]) {
          const input = document.querySelector(selector); set.call(input, valor); input.dispatchEvent(new Event('input', {bubbles:true}));
        }
      })()`)
      await click('Ingresar')
      await esperar('Sesión iniciada')
      assert.equal(db.autenticado(), true)
      assert.deepEqual(
        await huellasComerciales(db.pool),
        JSON.parse(await fs.readFile(path.join(raiz, 'comercial-A.json'), 'utf8'))
      )
      assert.equal(
        (
          await db.pool.query(
            "SELECT count(*)::int n FROM ruizcacao.clientes WHERE nombre_razon_social='Cliente conservado A'"
          )
        ).rows[0].n,
        1
      )
      assert.equal(await db.confirmarCargaRespaldo(''), false)
      console.log(
        'OK proceso nuevo: Login, contraseña original, datos de A y permisos posteriores conservados'
      )
    }
  } finally {
    await servicio?.cerrar()
    win?.destroy()
    await server?.close()
    await conexion.cerrarPersistencia()
    assert.equal(procesosPostgresActivos.size, 0)
  }
}
app
  .whenReady()
  .then(main)
  .then(() => app.exit(0))
  .catch((e) => {
    console.error(e)
    app.exit(1)
  })
