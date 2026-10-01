const { app, BrowserWindow, ipcMain } = require('electron'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os')
const { performance } = require('node:perf_hooks'),
  { createHash } = require('node:crypto'),
  { build } = require('esbuild')
const { conexionDesarrollador } = require('./conexion-desarrollador.cjs'),
  { load, root } = require('../tests/loader.cjs')
const { BaseLocal } = load(root + '/src/main/database/base.ts'),
  { crearDominio } = load(root + '/src/shared/dominio.ts')
const { consultarHistorialCompras, consultarHistorialVentas } = load(
  root + '/src/main/database/historial-operaciones.ts'
)
async function main() {
  const etiqueta = process.argv[2]
  if (!['antes', 'despues'].includes(etiqueta)) throw Error('Indica antes/despues.')
  const { config } = await conexionDesarrollador(),
    base = new BaseLocal(config),
    db = await base.pool.connect()
  let ventana
  const salida = { fecha: new Date().toISOString(), etiqueta, main: [] }
  const relacional = load(root + '/src/main/database/relacional.ts')
  const leer = relacional.leerEntidades
  const datos = base.datos.bind(base)
  let leerEntidadesMs = 0,
    datosMs = 0
  relacional.leerEntidades = async (...args) => {
    const t = performance.now()
    await leer(...args)
    leerEntidadesMs = performance.now() - t
  }
  base.datos = async (...args) => {
    const t = performance.now()
    const r = await datos(...args)
    datosMs = performance.now() - t
    return r
  }
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await db.query("SET LOCAL TIME ZONE 'America/Guayaquil'")
    salida.base = (
      await db.query(
        'SELECT current_database() base,(SELECT max(version) FROM ruizcacao.migraciones) version'
      )
    ).rows[0]
    const query = db.query.bind(db)
    let consultas = []
    db.query = async (...args) => {
      const t = performance.now()
      const r = await query(...args)
      consultas.push({ sql: args[0], ms: performance.now() - t, filas: r.rowCount })
      return r
    }
    let estado
    for (let n = 0; n < 3; n++) {
      consultas = []
      const t = performance.now()
      estado = await base.estado(db)
      const estadoMs = performance.now() - t
      const inicio = performance.now(),
        json = JSON.stringify(estado)
      const serializacionJsonMs = performance.now() - inicio
      const c = performance.now()
      const dominio = crearDominio(estado.datos)
      const dominioMs = performance.now() - c
      const g = performance.now()
      await base.guardar(
        { query: async () => ({ rows: [], rowCount: 0 }) },
        estado.datos,
        dominio.snapshot()
      )
      const guardarSinCambiosCpuMs = performance.now() - g
      salida.main.push({
        estadoMs,
        datosMs,
        leerEntidadesMs,
        consultas,
        serializacionJsonMs,
        bytesEstado: Buffer.byteLength(json),
        bytesSnapshot: Buffer.byteLength(JSON.stringify(estado.datos)),
        dominioMs,
        guardarSinCambiosCpuMs
      })
      console.log(
        'Muestra Main ' +
          (n + 1) +
          ': ' +
          estadoMs.toFixed(1) +
          ' ms; guardar CPU ' +
          guardarSinCambiosCpuMs.toFixed(1) +
          ' ms'
      )
    }
    salida.huellaSnapshot = createHash('sha256').update(JSON.stringify(estado.datos)).digest('hex')
    salida.postgresql = []
    for (const q of consultas.filter((q) => /^SELECT id,/.test(q.sql))) {
      const plan = (await query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + q.sql)).rows[0][
        'QUERY PLAN'
      ][0]
      salida.postgresql.push({
        tabla: q.sql.match(/FROM ruizcacao\.(\w+)/)[1],
        servidorMs: plan['Execution Time'],
        plan
      })
    }
    salida.conteos = Object.fromEntries(
      Object.entries(estado.datos)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => [k, v.length])
    )
    const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'ruizcacao-perfil-snapshot-'))
    await build({
      entryPoints: [root + '/scripts/perfil-renderer-snapshot.tsx'],
      bundle: true,
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"' },
      outfile: path.join(carpeta, 'renderer.js')
    })
    await fs.writeFile(
      path.join(carpeta, 'index.html'),
      '<html><head><meta charset="utf-8"><style>body{font:13px Arial;margin:0}table{width:100%;border-collapse:collapse}td,th{padding:12px 16px}#root{height:900px;overflow:auto}</style></head><body><div id="root"></div><script src="renderer.js"></script></body></html>'
    )
    ventana = new BrowserWindow({
      show: false,
      width: 1440,
      height: 960,
      webPreferences: {
        preload: root + '/scripts/perfil-preload-snapshot.cjs',
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    const origen = (event) => {
      if (
        event.sender.id !== ventana.webContents.id ||
        event.senderFrame !== ventana.webContents.mainFrame
      )
        throw Error('Origen inválido')
    }
    ipcMain.handle('perfil:estado', (event) => {
      origen(event)
      return estado
    })
    ipcMain.handle('perfil:historial', async (event, modulo, f) => {
      origen(event)
      return {
        ok: true,
        valor: await (modulo === 'compras' ? consultarHistorialCompras : consultarHistorialVentas)(
          db,
          f
        )
      }
    })
    const resultado = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Timeout Renderer')), 180000)
      ipcMain.once('perfil:resultado', (event, r) => {
        origen(event)
        clearTimeout(timeout)
        r.error ? reject(Error(r.error)) : resolve(r)
      })
      ventana.webContents.on('render-process-gone', (_, d) =>
        reject(Error('Renderer terminó: ' + d.reason))
      )
    })
    await ventana.loadFile(path.join(carpeta, 'index.html'))
    salida.renderer = await resultado
    await db.query('COMMIT')
    salida.nota =
      'Base actual en solo lectura; guardar CPU usa db stub, sin escrituras. IPC real de EstadoAplicacion cacheado en canal exclusivo del arnés, sin cola/autenticación de producción. Componentes reales React/DOM en ventana oculta, CSS mínimo; mide render/commit/layout y siguiente frame, no revisión visual de la app.'
    const archivo = path.join(
      root,
      'docs/evidencias-escalabilidad/snapshot-' + etiqueta + '-2026-10-01.json'
    )
    await fs.writeFile(archivo, JSON.stringify(salida, null, 2))
    console.log('Perfil guardado: ' + archivo)
    console.log(JSON.stringify(salida.renderer, null, 2))
  } finally {
    if (ventana) ventana.destroy()
    db.release()
    await base.desconectar()
  }
}
main()
  .then(() => app.exit(0))
  .catch((e) => {
    console.error(e)
    app.exit(1)
  })
