// Lecturas únicamente: no login, migraciones, seed ni comandos de dominio.
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os')
const { performance } = require('node:perf_hooks'),
  { createHash } = require('node:crypto')
const { build } = require('esbuild'),
  { load, root } = require('../tests/loader.cjs')
const { conexionDesarrollador } = require('./conexion-desarrollador.cjs')
async function main() {
  console.log('Inicio de medición Etapa 04')
  const etiqueta = process.argv[2]
  if (!['antes', 'despues', 'estadisticas'].includes(etiqueta))
    throw Error('Indica antes/despues/estadisticas')
  const { config } = await conexionDesarrollador()
  const { BaseLocal } = load(root + '/src/main/database/base.ts')
  const base = new BaseLocal(config),
    db = await base.pool.connect()
  console.log('Conexión local lista, solo lectura')
  let ventana
  const salida = { etiqueta, fecha: new Date().toISOString(), consultas: [] }
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await db.query('SET LOCAL idle_in_transaction_session_timeout = 0')
    await db.query('SET LOCAL statement_timeout = 60000')
    await db.query("SET LOCAL TIME ZONE 'America/Guayaquil'")
    salida.base = (
      await db.query(
        'SELECT current_database() nombre,(SELECT max(version) FROM ruizcacao.migraciones) esquema'
      )
    ).rows[0]
    const estado = await base.estado(db),
      d = estado.datos
    console.log('Snapshot leído')
    salida.huella = createHash('sha256').update(JSON.stringify(d)).digest('hex')
    salida.conteos = Object.fromEntries(
      Object.entries(d)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => [k, v.length])
    )
    const { resumirPeriodo } = load(root + '/src/renderer/src/utils/reportes.ts')
    if (etiqueta === 'estadisticas') {
      const conteos = {},
        originales = {}
      for (const metodo of ['filter', 'map', 'some', 'find']) {
        originales[metodo] = Array.prototype[metodo]
        conteos[metodo] = { llamadas: 0, evaluaciones: 0 }
        Array.prototype[metodo] = function (...args) {
          conteos[metodo].llamadas++
          const callback = args[0]
          if (typeof callback === 'function')
            args[0] = function (...valores) {
              conteos[metodo].evaluaciones++
              return Reflect.apply(callback, this, valores)
            }
          return Reflect.apply(originales[metodo], this, args)
        }
      }
      let filas
      try {
        filas = resumirPeriodo(
          d.ventas,
          d.gastos,
          '2026-01-01',
          '2026-09-30',
          d.movimientosCuenta,
          d.cuentas,
          d.compras
        ).filas.length
      } finally {
        for (const metodo of Object.keys(originales)) Array.prototype[metodo] = originales[metodo]
      }
      const r = {
        etiqueta,
        huella: salida.huella,
        filas,
        conteos,
        nota: 'Conteo del algoritmo anterior conservado; la instrumentación altera tiempos y no se usa como benchmark temporal.'
      }
      await fs.writeFile(
        root + '/docs/evidencias-escalabilidad/etapa04-funciones-2026-10-02.json',
        JSON.stringify(r, null, 2)
      )
      console.log(JSON.stringify(r, null, 2))
      return
    }
    const inicio = performance.now()
    const anterior = resumirPeriodo(
      d.ventas,
      d.gastos,
      '2026-01-01',
      '2026-09-30',
      d.movimientosCuenta,
      d.cuentas,
      d.compras
    )
    salida.reporteAnterior = {
      ms: performance.now() - inicio,
      filas: anterior.filas.length,
      bytes: Buffer.byteLength(JSON.stringify(anterior)),
      resumen: { ...anterior, filas: undefined }
    }
    const t = performance.now()
    const nombres = new Map(d.clientes.map((c) => [c.id, c.nombreRazonSocial]))
    const historial = d.cuentas.filter(
      (c) =>
        c.origen !== 'manual' &&
        (
          (c.categoria === 'compra'
            ? (c.proveedorNombre ?? 'Proveedor')
            : (nombres.get(c.clienteId) ?? 'Cliente')) +
          ' ' +
          c.fecha +
          ' ' +
          (c.numeroCompra ?? c.numeroFactura)
        )
          .toLowerCase()
          .includes('')
    )
    salida.historialAnterior = {
      ms: performance.now() - t,
      filas: historial.length,
      bytes: Buffer.byteLength(JSON.stringify(historial))
    }
    const g = performance.now(),
      gastos = d.gastos.filter((g) => g.fecha >= '2026-01-01' && g.fecha <= '2026-09-30')
    let anuladas = 0
    for (const gasto of gastos)
      if (
        gasto.tipo === 'automatico' &&
        d.cuentas.some((c) => c.compraId === gasto.compra_id && c.estado === 'anulado')
      )
        anuladas++
    salida.gastosAnterior = {
      ms: performance.now() - g,
      filas: gastos.length,
      anuladas,
      bytes: Buffer.byteLength(JSON.stringify(gastos))
    }
    console.log('Cálculos originales medidos')
    for (const entidad of ['clientes', 'proveedores']) {
      const t = performance.now(),
        filas = d[entidad].filter((c) =>
          Object.values(c).some((v) => String(v).toLowerCase().includes('perf'))
        )
      salida[entidad] = {
        ms: performance.now() - t,
        filas: filas.length,
        bytes: Buffer.byteLength(JSON.stringify(d[entidad]))
      }
    }
    const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'ruizcacao-etapa04-'))
    const plugins =
      etiqueta === 'antes'
        ? [
            {
              name: 'baseline-head',
              setup(b) {
                b.onLoad({ filter: /[\\/]src[\\/].*\.tsx?$/ }, (args) => {
                  const relative = path.relative(root, args.path).replaceAll('\\', '/')
                  try {
                    return {
                      contents: require('node:child_process').execFileSync(
                        'git',
                        ['show', '9efb6c6:' + relative],
                        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
                      ),
                      loader: relative.endsWith('.tsx') ? 'tsx' : 'ts'
                    }
                  } catch {
                    return undefined
                  }
                })
              }
            }
          ]
        : []
    await build({
      entryPoints: [root + '/scripts/perfil-renderer-etapa04.tsx'],
      plugins,
      bundle: true,
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"' },
      outfile: path.join(carpeta, 'renderer.js')
    })
    console.log('Instrumentación React preparada (sin build de aplicación)')
    await fs.writeFile(
      path.join(carpeta, 'index.html'),
      '<html><head><meta charset="utf-8"><style>body{font:13px Arial}td,th{padding:12px}table{width:100%}</style></head><body><div id="root"></div><script src="renderer.js"></script></body></html>'
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
    ventana.webContents.on('console-message', (_event, _level, message) =>
      console.log('Arnés: ' + message)
    )
    const origen = (e) => {
      if (e.sender.id !== ventana.webContents.id || e.senderFrame !== ventana.webContents.mainFrame)
        throw Error('Origen inválido')
    }
    ipcMain.handle('perfil:estado', (e) => {
      origen(e)
      return estado
    })
    ipcMain.handle('perfil:historial', async (e, modulo, f) => {
      origen(e)
      const t = performance.now()
      let valor
      if (modulo === 'compras' || modulo === 'ventas') {
        const service = load(root + '/src/main/database/historial-operaciones.ts')
        valor = await service[
          modulo === 'compras' ? 'consultarHistorialCompras' : 'consultarHistorialVentas'
        ](db, f)
      } else
        valor = await load(root + '/src/main/database/listados.ts').consultarListado(db, modulo, f)
      salida.consultas.push({
        modulo,
        ms: performance.now() - t,
        filas: valor.filas?.length ?? 0,
        bytes: Buffer.byteLength(JSON.stringify(valor))
      })
      return { ok: true, valor }
    })
    const resultado = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Tiempo del arnés agotado')), 180000)
      ipcMain.once('perfil:resultado', (e, r) => {
        origen(e)
        clearTimeout(timer)
        r.error ? reject(Error(r.error)) : resolve(r)
      })
    })
    await ventana.loadFile(path.join(carpeta, 'index.html'))
    console.log('Ventana de prueba cargada')
    salida.renderer = await resultado
    if (etiqueta === 'despues') {
      const { verificarEquivalencia } = require('./verificar-etapa04.cjs')
      salida.equivalencia = await verificarEquivalencia(db, d)
    }
    await fs.writeFile(
      root + '/docs/evidencias-escalabilidad/etapa04-' + etiqueta + '-2026-10-02.json',
      JSON.stringify(salida, null, 2)
    )
    console.log(
      JSON.stringify(
        {
          etiqueta,
          huella: salida.huella,
          renderer: salida.renderer,
          consultas: salida.consultas.slice(0, 8),
          equivalencia: salida.equivalencia?.finanzas.map((f) => ({
            desde: f.desde,
            hasta: f.hasta,
            filas: f.filas,
            htmlPDFIdentico: f.htmlPDFIdentico
          }))
        },
        null,
        2
      )
    )
  } finally {
    ventana?.destroy()
    await db.query('ROLLBACK').catch(() => {})
    db.release()
    await base.pool.end()
  }
}
app.setName('RuizCacao Manager')
app
  .whenReady()
  .then(main)
  .then(() => app.quit())
  .catch((e) => {
    console.error(e.message)
    app.exit(1)
  })
