// Integración Electron Main + preload específico + IPC real + motor TEMPORAL.
const { app, BrowserWindow, dialog } = require('electron')
const fs = require('node:fs/promises'),
  fss = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict')
const { spawn } = require('node:child_process'),
  ts = require('typescript')
const { load, root } = require('./loader.cjs')
const reabrir = process.argv.includes('--reabrir')
const carpeta = reabrir
  ? process.argv[process.argv.indexOf('--reabrir') + 1]
  : fss.mkdtempSync(path.join(os.tmpdir(), 'ruizcacao-uiipc-'))
assert.match(path.basename(carpeta), /^ruizcacao-uiipc-/)
app.setPath('userData', carpeta)
// El arnés mantiene al padre vivo para observar la reapertura; separar solo caché Chromium.
if (reabrir) {
  const cache = path.join(carpeta, 'cache-reinicio')
  fss.mkdirSync(cache, { recursive: true })
  app.setPath('sessionData', cache)
}
app.on('window-all-closed', () => {})
const evidencia = path.join(root, 'docs/evidencias-respaldos-etapa03')
const conexion = load(root + '/src/main/database/conexion.ts')
const { registrarRespaldosIPC } = load(root + '/src/main/respaldos-ipc.ts')
const { registrarPersistenciaIPC } = load(root + '/src/main/database/ipc.ts')
const { procesosPostgresActivos } = load(root + '/src/main/database/proceso-postgres.ts')
const { PaqueteRespaldoZip } = load(root + '/src/main/database/respaldo-paquete.ts')
const { hoy } = load(root + '/src/main/database/base.ts')
const clave = 'Solo-prueba-IPC-2026'
async function preload() {
  const js = ts.transpileModule(await fs.readFile(root + '/src/preload/respaldos.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const archivo = path.join(carpeta, 'preload-prueba.cjs')
  await fs.writeFile(
    archivo,
    `const {contextBridge,ipcRenderer}=require('electron');const bridgeModule={exports:{}};(function(exports){${js}\n})(bridgeModule.exports);const respaldos=bridgeModule.exports.apiRespaldos(ipcRenderer);let eventos=[],quitar,pendiente,cancelarFase;contextBridge.exposeInMainWorld('api',{respaldos,datos:{estado:()=>ipcRenderer.invoke('datos:estado'),login:(...a)=>ipcRenderer.invoke('datos:login',...a)}});contextBridge.exposeInMainWorld('sonda',{observar:(id,fase)=>{eventos=[];quitar?.();quitar=respaldos.alProgreso(id,p=>{eventos.push(p);if(p.fase===fase){cancelarFase=respaldos.cancelarOperacionRespaldo(id)}})},eventos:()=>eventos,fin:()=>{quitar?.();quitar=undefined},cancelacion:()=>cancelarFase,arbitrario:(c,...a)=>ipcRenderer.invoke(c,...a),iniciar:(metodo,...a)=>{pendiente=respaldos[metodo](...a)},esperar:()=>pendiente});`
  )
  return archivo
}
async function loginVisual(win) {
  const { createServer } = await import('vite'),
    { default: react } = await import('@vitejs/plugin-react'),
    { default: tailwind } = await import('@tailwindcss/vite')
  const server = await createServer({
    configFile: false,
    root,
    plugins: [
      react(),
      tailwind(),
      {
        name: 'login-restore',
        configureServer(s) {
          s.middlewares.use('/__login', (_, res) => {
            res.setHeader('Content-Type', 'text/html')
            res.end(
              '<html><head><meta charset="utf-8"><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/scripts/perfil-respaldos-login.tsx"></script></body></html>'
            )
          })
        }
      }
    ],
    server: { host: '127.0.0.1', port: 0 }
  })
  try {
    await server.listen()
    await win.loadURL(server.resolvedUrls.local[0] + '__login')
    await win.webContents.executeJavaScript(
      'new Promise((resolve,reject)=>{const inicio=performance.now();function f(){if(document.querySelector("input[type=password]") && !document.body.innerText.includes("Conectando"))return resolve();if(performance.now()-inicio>30000)return reject(Error("Login no visible"));setTimeout(f,50)}f()})'
    )
    const texto = await win.webContents.executeJavaScript('document.body.innerText')
    assert.match(texto, /Iniciar sesión|Ingresar/)
    assert.doesNotMatch(texto, /Sesión iniciada|Crear usuario/)
    await fs.writeFile(
      path.join(evidencia, 'login-reinicio.png'),
      (await win.webContents.capturePage()).toPNG()
    )
  } finally {
    await server.close()
  }
}
async function main() {
  await fs.mkdir(evidencia, { recursive: true })
  let win, servicio
  const resultados = { carpeta, pruebas: [], perfiles: [] }
  const check = (s) => {
    resultados.pruebas.push(s)
    console.log('OK producto ' + s)
  }
  try {
    if (!reabrir) await assert.rejects(conexion.crearWorkspaceRestoreInterno(), /externo/)
    await conexion.iniciarPersistencia()
    const db = conexion.obtenerBase()
    win = new BrowserWindow({
      show: false,
      width: 1000,
      height: 750,
      webPreferences: {
        preload: await preload(),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        offscreen: true,
        backgroundThrottling: false
      }
    })
    registrarPersistenciaIPC(win)
    win.webContents.on('preload-error', (_, _ruta, e) => console.error('PRELOAD TEST', e.message))
    win.webContents.on('console-message', (_, detalle) => {
      if (detalle.level === 'error') console.error('RENDERER TEST', detalle.message)
    })
    await win.loadURL('data:text/html,<html><body>Prueba aislada IPC</body></html>')
    const js = (s) => win.webContents.executeJavaScript(s)
    const call = (metodo, ...args) =>
      js('window.api.respaldos.' + metodo + '(...' + JSON.stringify(args) + ')')
    if (reabrir) {
      const estado = await conexion.estadoAcceso()
      assert.equal(estado.autenticado, false)
      assert.equal(estado.administradorExiste, true)
      await loginVisual(win)
      assert.equal((await db.login('admin', clave)).usuarioActual.rol, 'administrador')
      check('nuevo proceso: journal resuelto, UI Login real y contraseña original')
      await fs.writeFile(
        path.join(evidencia, 'reinicio-producto.json'),
        JSON.stringify({ estado, login: true, procesoNuevo: process.pid }, null, 2)
      )
      return
    }
    await db.crearAdministrador('admin', clave)
    await db.login('admin', clave)
    await db.crearUsuario('operador', clave)
    let destino = null,
      entrada = null
    dialog.showSaveDialog = async () => ({ canceled: !destino, filePath: destino })
    dialog.showOpenDialog = async () => ({
      canceled: !entrada,
      filePaths: entrada ? [entrada] : []
    })
    servicio = registrarRespaldosIPC(win, async () => {
      await conexion.cerrarPersistencia()
      await new Promise((resolve, reject) => {
        const p = spawn(process.execPath, [__filename, '--reabrir', carpeta], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        p.stdout.on('data', (d) => process.stdout.write(d))
        p.stderr.on('data', (d) => process.stderr.write(d))
        p.on('error', reject)
        p.on('close', (c) => (c === 0 ? resolve() : reject(Error('Reinicio aislado falló: ' + c))))
      })
    })
    await db.logout()
    await db.login('operador', clave)
    assert.equal((await call('seleccionarDestinoRespaldo')).codigo, 'permiso')
    await db.logout()
    await db.login('admin', clave)
    check('operador rechazado por Main y administrador autorizado')
    assert.equal((await call('seleccionarDestinoRespaldo')).valor, null)
    assert.equal((await call('seleccionarRespaldo')).valor, null)
    assert.equal(procesosPostgresActivos.size, 0)
    check('cancelar ambos diálogos no inicia herramientas')
    assert.equal(
      (await js('sonda.arbitrario("respaldos:generarRespaldo","C:/ruta;pg_restore")')).codigo,
      'solicitud'
    )
    await assert.rejects(js('sonda.arbitrario("respaldos:exec","pg_restore")'))
    const espia = new BrowserWindow({
      show: false,
      webPreferences: { preload: await preload(), sandbox: true, contextIsolation: true }
    })
    try {
      await espia.loadURL('data:text/html,emisor')
      assert.equal(
        (await espia.webContents.executeJavaScript('api.respaldos.seleccionarDestinoRespaldo()'))
          .codigo,
        'permiso'
      )
    } finally {
      espia.destroy()
    }
    check('IPC real: canal desconocido, payload/ruta arbitraria y otro emisor rechazados')
    await db.jornada('abrir')
    await require('../scripts/dataset-qa.cjs').crearDataset(db, hoy())
    async function generar(nombre, cancelarFase) {
      destino = path.join(carpeta, nombre + '.back')
      const s = (await call('seleccionarDestinoRespaldo')).valor
      await js(
        'sonda.observar(' +
          JSON.stringify(s.operacionId) +
          ',' +
          JSON.stringify(cancelarFase || 'nunca') +
          ')'
      )
      const t = performance.now(),
        cpu = process.cpuUsage()
      await js(
        'window.__pulso={activo:true,frames:0,maxGap:0,ultimo:performance.now()};function frame(t){const p=window.__pulso;if(!p.activo)return;p.frames++;p.maxGap=Math.max(p.maxGap,t-p.ultimo);p.ultimo=t;requestAnimationFrame(frame)}requestAnimationFrame(frame)'
      )
      const r = await call('generarRespaldo', s.operacionId)
      const pulso = await js('window.__pulso.activo=false;window.__pulso')
      if (!cancelarFase)
        assert.ok(pulso.frames > 2, 'Renderer debe seguir pintando durante backup real')
      const eventos = await js('sonda.eventos()')
      await js('sonda.fin()')
      assert.ok(r.ok, JSON.stringify(r))
      assert.equal(procesosPostgresActivos.size, 0)
      resultados.perfiles.push({
        nombre,
        ms: performance.now() - t,
        cpu: process.cpuUsage(cpu),
        renderer: {
          frames: pulso.frames,
          max_gap_ms: pulso.maxGap,
          proceso: app.getAppMetrics().find((p) => p.pid === win.webContents.getOSProcessId())
        },
        eventos,
        ipc_max_bytes: Math.max(...eventos.map((e) => Buffer.byteLength(JSON.stringify(e))))
      })
      if (cancelarFase) {
        assert.equal(r.valor.estado, 'cancelado')
        await assert.rejects(fs.stat(destino))
        return
      }
      assert.equal(r.valor.estado, 'completado')
      assert.equal(r.valor.nombre, nombre + '.back')
      await new PaqueteRespaldoZip().verificar(destino)
      return destino
    }
    const pequeno = await generar('RuizCacao_2026-10-16_12-00')
    check('backup pequeño publicado/verificado y nombre elegido')
    const c = await db.pool.connect()
    try {
      await require('../scripts/seed-rendimiento-core.cjs').insertarRendimiento(c)
    } finally {
      c.release()
    }
    const grande = await generar('RuizCacao_2026-10-16_12-01')
    check('backup grande mediante IPC real')
    await generar('cancelado-export', 'exportando')
    await generar('cancelado-hash', 'verificando')
    check('cancelación real export/hash, sin final parcial ni hijos')
    if (process.argv.includes('--medir-backup')) {
      resultados.exito = true
      return
    }
    const paquete = new PaqueteRespaldoZip(),
      manifest = await paquete.verificar(pequeno),
      dump = path.join(carpeta, 'fixture.dump')
    await paquete.extraerDump(pequeno, dump)
    async function malformado(nombre, cambios) {
      const { ZipFile } = require('yazl')
      const { pipeline } = require('node:stream/promises')
      const z = new ZipFile()
      const ruta = path.join(carpeta, nombre + '.back')
      const fin = pipeline(z.outputStream, fss.createWriteStream(ruta))
      z.addBuffer(Buffer.from(JSON.stringify({ ...manifest, ...cambios })), 'manifest.json', {
        compress: false
      })
      z.addFile(dump, 'database.dump', { compress: false })
      z.end()
      await fin
      return ruta
    }
    for (const [nombre, cambios, codigo] of [
      ['producto', { product_id: 'otro' }, 'invalido'],
      ['formato', { format_version: 2 }, 'futuro'],
      ['schema', { schema_version: 11 }, 'futuro']
    ]) {
      entrada = await malformado(nombre, cambios)
      const s = (await call('seleccionarRespaldo')).valor
      const r = await call('validarRespaldoSeleccionado', s.operacionId)
      assert.equal(r.codigo, codigo, JSON.stringify(r))
      assert.ok(db.autenticado())
    }
    entrada = path.join(carpeta, 'roto.back')
    await fs.writeFile(entrada, 'archivo incompleto')
    let s = (await call('seleccionarRespaldo')).valor
    assert.equal((await call('validarRespaldoSeleccionado', s.operacionId)).ok, false)
    const statfsOriginal = fs.statfs
    try {
      fs.statfs = async () => ({ bavail: 0n, bsize: 4096n })
      entrada = grande
      s = (await call('seleccionarRespaldo')).valor
      assert.equal((await call('validarRespaldoSeleccionado', s.operacionId)).codigo, 'espacio')
    } finally {
      fs.statfs = statfsOriginal
    }
    check('producto/formato/schema futuro, archivo dañado y disco insuficiente conservan activa')
    entrada = path.join(carpeta, 'seleccionado.back')
    await fs.copyFile(grande, entrada)
    s = (await call('seleccionarRespaldo')).valor
    const preparado = await call('validarRespaldoSeleccionado', s.operacionId)
    assert.ok(preparado.ok, JSON.stringify(preparado))
    await fs.writeFile(
      entrada,
      'La selección cambia después de validar: el preparado debe ser independiente'
    )
    const r = preparado.valor
    assert.equal(
      (await call('cargarRespaldo', s.operacionId, r.preparacionId, true, 'incorrecta')).codigo,
      'password'
    )
    assert.ok(db.autenticado())
    await js('sonda.observar(' + JSON.stringify(s.operacionId) + ',"finalizando")')
    const cargado = await call('cargarRespaldo', s.operacionId, r.preparacionId, true, clave)
    assert.ok(cargado.ok, JSON.stringify(cargado))
    assert.equal(cargado.valor.reiniciar, true)
    assert.equal((await js('sonda.cancelacion()')).valor, false)
    await js('sonda.fin()')
    assert.throws(() => conexion.obtenerBase(), /cargando un respaldo/)
    assert.equal(procesosPostgresActivos.size, 0)
    check(
      'preparación privada inmutable, password incorrecta, restore grande, cancelación crítica rechazada y acceso bloqueado hasta reinicio'
    )
    const reinicio = await call('reiniciarDespuesDeRestauracion', s.operacionId)
    assert.ok(reinicio.ok, JSON.stringify(reinicio))
    check('Continuar dispara cierre técnico y reapertura en proceso nuevo hasta Login')
    resultados.exito = true
  } finally {
    await servicio?.cerrar()
    await conexion.cerrarPersistencia()
    win?.destroy()
    resultados.hijos = procesosPostgresActivos.size
    if (!reabrir)
      await fs.writeFile(
        path.join(
          evidencia,
          process.argv.includes('--medir-backup') ? 'rendimiento-ipc.json' : 'producto.json'
        ),
        JSON.stringify(resultados, null, 2)
      )
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
