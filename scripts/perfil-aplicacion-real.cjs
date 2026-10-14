// Driver de diagnóstico: carga el entrypoint real compilado por electron-vite dev.
// Solo admite perfiles creados por preparar-perfil-real.cjs. No sustituye APIs de negocio.
const { app, safeStorage, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { monitorEventLoopDelay } = require('node:perf_hooks')
const root = path.resolve(__dirname, '..')
const escenario = process.env.RCM_PERFIL_ESCENARIO
const preparacion = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'docs/evidencias-arranque-real',
      escenario === 'nuevo' ? 'preparacion-nuevo.json' : 'preparacion.json'
    ),
    'utf8'
  )
)
const corrida = process.env.RCM_PERFIL_CORRIDA
// Corte acotado del parche pg_ctl: evidencia nueva, sin sobrescribir el diagnóstico.
const parchePgctl = process.env.RCM_PERFIL_ETAPA === 'pgctl-despues'
const serieFinal = parchePgctl && process.env.RCM_PERFIL_SERIE === 'final'
const externa = process.env.RCM_PERFIL_CONEXION === 'externa'
assert.ok(['small', 'large', 'nuevo'].includes(escenario))
assert.ok(['frio', 'segundo', 'reposo'].includes(corrida))
const perfil = preparacion.perfiles[escenario]
assert.ok(perfil.preparadoParaPerfil && perfil.esquema === (escenario === 'nuevo' ? 0 : 10))
assert.equal(
  fs.realpathSync(perfil.perfil).toLowerCase(),
  path.join(fs.realpathSync(preparacion.carpeta), escenario).toLowerCase()
)
if (escenario === 'nuevo') {
  assert.ok(perfil.instalacionNueva && !externa && corrida === 'frio')
  assert.deepEqual(fs.readdirSync(perfil.perfil), ['perfil-seguro.json'])
  assert.equal(
    path.resolve(perfil.dataDirectory),
    path.join(fs.realpathSync(perfil.perfil), 'postgres', 'data')
  )
} else
  assert.equal(
    fs.realpathSync(perfil.dataDirectory).toLowerCase(),
    path.join(fs.realpathSync(perfil.perfil), 'postgres', 'data').toLowerCase()
  )
if (externa) {
  const validacion = JSON.parse(
    fs.readFileSync(path.join(perfil.perfil, 'conexion-externa-segura.json'), 'utf8')
  )
  assert.equal(validacion.dataDirectory, perfil.dataDirectory)
  const sha = require('node:crypto')
    .createHash('sha256')
    .update(fs.readFileSync(path.join(perfil.perfil, 'postgres.enc')))
    .digest('hex')
  assert.equal(sha, validacion.sha256, 'Solo se admite la conexión a la copia verificada')
} else {
  assert.ok(
    !fs.existsSync(path.join(perfil.perfil, 'postgres.enc')),
    'El motor local no admite configuración externa'
  )
}
const seguro = JSON.parse(fs.readFileSync(path.join(perfil.perfil, 'perfil-seguro.json'), 'utf8'))
assert.deepEqual(seguro, perfil)
app.setName('RuizCacao Manager')
app.setPath('userData', perfil.perfil)
// Electron lanzado con un .cjs considera scripts/ como appPath. Restituir raíz del proyecto.
app.getAppPath = () => root
const sesionPath = path.join(perfil.perfil, 'chromium-medicion')
fs.mkdirSync(sesionPath, { recursive: true })
// safeStorage de Windows liga el cifrado a os_crypt en sessionData. La copia
// necesita la misma clave protegida con DPAPI, no una nueva clave incompatible.
const estadoLocal = path.join(sesionPath, 'Local State')
if (!fs.existsSync(estadoLocal)) {
  const original = JSON.parse(
    fs.readFileSync(path.join(app.getPath('appData'), 'RuizCacao Manager', 'Local State'), 'utf8')
  )
  assert.ok(original.os_crypt?.encrypted_key)
  fs.writeFileSync(estadoLocal, JSON.stringify({ os_crypt: original.os_crypt }))
}
app.setPath('sessionData', sesionPath)
process.env.RCM_PERFIL_ARRANQUE = '1'
const epoch = () => performance.timeOrigin + performance.now()
const registro = {
  marcas: [{ nombre: 'process-start', epoch: epoch() - process.uptime() * 1000, proceso: 'main' }],
  sql: [],
  recursos: []
}
globalThis[Symbol.for('ruizcacao.perfil.arranque')] = registro
const marcar = (nombre, detalle) =>
  registro.marcas.push({ nombre, detalle, epoch: epoch(), proceso: 'driver' })
marcar('diagnostico-preflight-end')
console.log('PERFIL ENTRY ' + escenario + '/' + corrida)
const bloquear = app.requestSingleInstanceLock.bind(app)
app.requestSingleInstanceLock = (...args) => {
  const ok = bloquear(...args)
  marcar('single-instance-lock', { ok, perfilCorrecto: app.getPath('userData') === perfil.perfil })
  console.log('PERFIL LOCK ' + ok)
  return ok
}
const archivo = path.join(
  root,
  parchePgctl ? 'docs/evidencias-pgctl' : 'docs/evidencias-arranque-real',
  escenario + (externa ? '-externo-' : '-') + corrida + (serieFinal ? '-final' : '')
)
if (parchePgctl) {
  assert.ok(!externa && escenario !== 'nuevo')
  fs.mkdirSync(path.dirname(archivo), { recursive: true })
  assert.ok(!fs.existsSync(archivo + '.json'), 'No sobrescribir evidencia')
  assert.ok(
    !fs.existsSync(path.join(perfil.dataDirectory, 'postmaster.pid')),
    'Motor detenido antes de medir'
  )
}
const stopFile = archivo + '.stop'
if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile)
const monitor = spawn(
  'powershell.exe',
  [
    '-NoProfile',
    '-File',
    path.join(root, 'scripts/perfil-recursos-postgres.ps1'),
    '-DataDirectory',
    perfil.dataDirectory,
    '-OutputFile',
    archivo + '-postgres.json',
    '-StopFile',
    stopFile
  ],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
)
let errorMonitor = ''
monitor.stderr.on('data', (b) => {
  errorMonitor += b.toString().slice(0, 1000)
})
const monitorFin = new Promise((resolve) => {
  monitor.on('exit', resolve)
  monitor.on('error', (e) => {
    errorMonitor = e.message
    resolve(-1)
  })
})

// Mantener las firmas callback/promisify originales; registrar solo eventos de
// proceso (sin stdout, stderr, argumentos de conexión ni passwords).
const childProcess = require('node:child_process')
const execOriginal = childProcess.execFile
function execObservado(file, args, ...resto) {
  const observar = path.basename(file).toLowerCase() === 'pg_ctl.exe' && args.includes('start')
  if (observar) marcar('pg_ctl-spawn')
  const ultimo = resto.length - 1
  if (observar && typeof resto[ultimo] === 'function') {
    const callback = resto[ultimo]
    resto[ultimo] = (error, stdout, stderr) => {
      marcar('pg_ctl-callback', { error: !!error, killed: !!error?.killed })
      callback(error, stdout, stderr)
    }
  }
  const child = execOriginal(file, args, ...resto)
  if (observar) {
    child.once('spawn', () => marcar('pg_ctl-spawn-event', { pid: child.pid }))
    for (const canal of ['stdin', 'stdout', 'stderr'])
      child[canal]?.once('close', () => marcar('pg_ctl-' + canal + '-close'))
    child.once('exit', (code, signal) =>
      marcar('pg_ctl-exit', { code: code ?? -1, signal: signal || '' })
    )
    child.once('close', (code, signal) =>
      marcar('pg_ctl-close', { code: code ?? -1, signal: signal || '' })
    )
  }
  return child
}
execObservado[require('node:util').promisify.custom] = (...args) => {
  let child
  const promise = new Promise((resolve, reject) => {
    child = execObservado(...args, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
      } else resolve({ stdout, stderr })
    })
  })
  promise.child = child
  return promise
}
childProcess.execFile = execObservado

const spawnOriginal = childProcess.spawn
childProcess.spawn = function (file, args, options) {
  const observar = path.basename(file).toLowerCase() === 'pg_ctl.exe' && args.includes('start')
  if (observar) marcar('pg_ctl-spawn')
  const child = spawnOriginal(file, args, options)
  if (observar) {
    const pgLog = path.join(perfil.perfil, 'postgres/postgresql.log')
    const bytesPrevios = fs.existsSync(pgLog) ? fs.statSync(pgLog).size : 0
    let listo = false
    const detectar = () => {
      const texto = fs.existsSync(pgLog)
        ? fs.readFileSync(pgLog).subarray(bytesPrevios).toString()
        : ''
      if (!listo && texto.includes('ready to accept connections')) {
        listo = true
        marcar('pg_ctl-server-ready-log')
      }
    }
    const sondeo = setInterval(detectar, 25)
    child.once('spawn', () => marcar('pg_ctl-spawn-event', { pid: child.pid }))
    child.once('exit', (code, signal) =>
      marcar('pg_ctl-exit', { code: code ?? -1, signal: signal || '' })
    )
    child.once('close', (code, signal) => {
      detectar()
      clearInterval(sondeo)
      marcar('pg_ctl-close', { code: code ?? -1, signal: signal || '' })
    })
    child.once('error', (error) => marcar('pg_ctl-error', { code: String(error.code) }))
  }
  return child
}

// Observador de pg conserva tanto la firma Promise como la firma callback del driver.
const { Client } = require('pg')
const queryOriginal = Client.prototype.query
Client.prototype.query = function (...args) {
  const inicio = epoch()
  const texto = typeof args[0] === 'string' ? args[0] : args[0]?.text || ''
  const terminar = (r) =>
    registro.sql.push({
      inicio,
      fin: epoch(),
      tipo: texto.trim().match(/^\w+/)?.[0] || 'SQL',
      tabla: texto.match(/(?:FROM|INTO|UPDATE|JOIN)\s+ruizcacao\.([a-z_]+)/i)?.[1],
      filas: r?.rowCount ?? null
    })
  const ultimo = args.length - 1
  if (typeof args[ultimo] === 'function') {
    const cb = args[ultimo]
    args[ultimo] = function (err, r) {
      terminar(r)
      return cb.call(this, err, r)
    }
    return queryOriginal.apply(this, args)
  }
  const resultado = queryOriginal.apply(this, args)
  return resultado.then(
    (r) => {
      terminar(r)
      return r
    },
    (e) => {
      terminar()
      throw e
    }
  )
}
const demora = monitorEventLoopDelay({ resolution: 20 })
demora.enable()
let timer,
  ventana,
  finalizado = false
const recursos = (etiqueta) => {
  if (!app.isReady()) return
  registro.recursos.push({
    epoch: epoch(),
    etiqueta,
    loopMaxMs: Number.isFinite(demora.max) ? demora.max / 1e6 : 0,
    mainCpu: process.cpuUsage(),
    mainRssBytes: process.memoryUsage().rss,
    procesos: app.getAppMetrics()
  })
  demora.reset()
}
app.whenReady().then(() => {
  recursos('ready')
  timer = setInterval(() => recursos(), 250)
})
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
async function esperarMarca(nombre, desde = 0, pagina) {
  const limite = Date.now() + 120000
  while (Date.now() < limite) {
    const encontrada = registro.marcas
      .slice(desde)
      .find((m) => m.nombre === nombre && (!pagina || m.detalle?.pagina === pagina))
    if (encontrada) return encontrada
    await esperar(100)
  }
  throw Error('Timeout esperando ' + nombre + (pagina ? '/' + pagina : ''))
}
async function terminar(error) {
  if (finalizado) return
  finalizado = true
  clearInterval(timer)
  demora.disable()
  recursos('final')
  fs.writeFileSync(stopFile, 'fin')
  const monitorCode = await monitorFin
  registro.entorno = {
    escenario,
    corrida,
    conexion: externa
      ? 'configurada; motor de copia ya activo'
      : 'PostgresLocal; motor detenido al comenzar',
    modo: 'electron-vite dev; app completa; React desarrollo/StrictMode',
    version: require('../package.json').version,
    electron: process.versions.electron,
    node: process.versions.node,
    cpus: require('node:os').cpus().length,
    ramTotalBytes: require('node:os').totalmem(),
    perfil: perfil.perfil,
    dataDirectory: perfil.dataDirectory,
    errorMonitor,
    monitorCode,
    ventana: ventana && !ventana.isDestroyed() ? ventana.getBounds() : null
  }
  if (error) registro.error = error.message
  if (error && ventana && !ventana.isDestroyed()) {
    registro.errorPagina = await ventana.webContents
      .executeJavaScript(
        '({visible:document.visibilityState,titulo:document.title,botones:[...document.querySelectorAll("aside nav button")].map(b=>b.getAttribute("aria-label")||b.textContent.trim())})'
      )
      .catch(() => null)
    fs.writeFileSync(archivo + '-error.png', (await ventana.webContents.capturePage()).toPNG())
  }
  fs.writeFileSync(archivo + '.json', JSON.stringify(registro, null, 2))
  console.log('PERFIL FINAL ' + escenario + '/' + corrida + (error ? ': ' + error.message : ': OK'))
  if (ventana && !ventana.isDestroyed()) ventana.close()
  else app.quit()
}
// Aceptar exclusivamente el diálogo de cierre normal de este perfil aislado.
const dialogo = dialog.showMessageBox.bind(dialog)
dialog.showMessageBox = (...args) =>
  args.some((a) => a?.title === 'Cerrar RuizCacao Manager')
    ? Promise.resolve({ response: 1, checkboxChecked: false })
    : dialogo(...args)
async function conducir(w) {
  ventana = w
  w.webContents.on('console-message', (detalles) => {
    if (detalles?.level === 'error')
      marcar('renderer-error', { mensaje: String(detalles.message).slice(0, 400) })
  })
  await esperarMarca('acceso-visible')
  recursos('acceso-visible')
  if (escenario === 'nuevo') {
    assert.ok(
      await w.webContents.executeJavaScript(
        '!!document.querySelector("input[autocomplete=new-password]")'
      ),
      'Debe mostrarse Crear administrador'
    )
    await esperar(250)
    fs.writeFileSync(
      archivo + '-crear-administrador.png',
      (await w.webContents.capturePage()).toPNG()
    )
    marcar('instalacion-acceso-fin')
    await terminar()
    return
  }
  const login = JSON.parse(
    safeStorage.decryptString(fs.readFileSync(path.join(perfil.perfil, 'login.enc')))
  )
  const claveNovedades = `ruizcacao:novedades:${login.id}:${require('../package.json').version}`
  await w.webContents
    .executeJavaScript(`localStorage.setItem(${JSON.stringify(claveNovedades)}, 'visto');
    for (const [selector, value] of ${JSON.stringify([
      ['input[autocomplete="username"]', login.nombre],
      ['input[type="password"]', login.password]
    ])}) {
      const e=document.querySelector(selector); if(!e) throw Error('Falta campo de Acceso');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);
      e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));
    }`)
  await esperar(80)
  await w.webContents.executeJavaScript(
    `document.querySelector('form button[type="submit"]').click()`
  )
  await esperarMarca('interactive', 0, 'inicio')
  recursos('post-login')
  await esperar(1500)
  fs.writeFileSync(archivo + '-inicio.png', (await w.webContents.capturePage()).toPNG())
  for (const [pagina, etiqueta] of parchePgctl
    ? []
    : [
        ['cuentas', 'Cuentas'],
        ['inicio', 'Inicio'],
        ['ventas', 'Compra/Venta'],
        ['inicio', 'Inicio']
      ]) {
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
    const desde = registro.marcas.length
    await w.webContents.executeJavaScript(`(() => {
      const b=[...document.querySelectorAll('aside nav button')].find(b => (b.getAttribute('aria-label') || b.textContent.trim()) === ${JSON.stringify(etiqueta)});
      if(!b) throw Error('Falta destino de navegación'); b.click();
    })()`)
    await esperarMarca('interactive', desde, pagina)
    recursos('post-' + pagina)
    await esperar(1500)
  }
  w.setEnabled(false)
  marcar('idle-input-disabled')
  marcar('idle-start')
  recursos('idle-start')
  const reposoMs = !parchePgctl && ['segundo', 'reposo'].includes(corrida) ? 300000 : 5000
  console.log('PERFIL REPOSO ' + escenario + '/' + corrida + ': ' + reposoMs / 1000 + ' segundos')
  await esperar(reposoMs)
  marcar('idle-end')
  recursos('idle-end')
  w.setEnabled(true)
  // Medición invasiva del tamaño fuera de arranque/navegación/reposo.
  marcar('payload-probe-start')
  registro.payload = await w.webContents.executeJavaScript(`(async()=>{
    const r=await window.api.datos.cargar(); if(!r.ok) throw Error('No se pudo medir estado');
    const t=performance.now(), json=JSON.stringify(r.valor);
    return {bytes:new TextEncoder().encode(json).length, jsonMs:performance.now()-t,
      conteos:Object.fromEntries(Object.entries(r.valor.datos).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length])),
      recursosWeb:performance.getEntriesByType('resource').map(r=>({nombre:new URL(r.name).pathname,ms:r.duration,bytes:r.decodedBodySize,tipo:r.initiatorType}))};
  })()`)
  marcar('payload-probe-end')
  await terminar()
}
app.on('browser-window-created', (_, w) => {
  if (!ventana) {
    ventana = w
    conducir(w).catch(terminar)
  }
})
process.on('uncaughtException', (e) => {
  void terminar(e)
})
process.on('unhandledRejection', (e) => {
  void terminar(e instanceof Error ? e : Error('Rechazo inesperado'))
})
app.on('will-quit', () => {
  if (parchePgctl && finalizado)
    fs.writeFileSync(
      archivo + '-cierre.json',
      JSON.stringify(
        {
          epoch: epoch(),
          cierreNormal: true,
          motorDetenido: !fs.existsSync(path.join(perfil.dataDirectory, 'postmaster.pid'))
        },
        null,
        2
      )
    )
  if (!finalizado) {
    fs.writeFileSync(stopFile, 'fin')
    fs.writeFileSync(archivo + '-incompleto.json', JSON.stringify(registro, null, 2))
    console.log('PERFIL SALIDA PREMATURA')
  }
})
require(path.join(root, 'out/main/index.js'))
