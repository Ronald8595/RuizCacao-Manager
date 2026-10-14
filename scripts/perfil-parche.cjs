// Lectura del perfil existente: no inicia BaseLocal, no autentica ni escribe datos.
const { app, BrowserWindow, ipcMain } = require('electron')
const { performance } = require('node:perf_hooks')
const { createHash } = require('node:crypto')
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto')
const os = require('node:os')
const fs = require('node:fs/promises')
const path = require('node:path')
const { conexionDesarrollador } = require('./conexion-desarrollador.cjs')
const { load, root } = require('../tests/loader.cjs')
const { BaseLocal } = load(path.join(root, 'src/main/database/base.ts'))
const { leerEntidades } = load(path.join(root, 'src/main/database/relacional.ts'))
const { estadoInicial } = load(path.join(root, 'src/shared/persistencia.ts'))
const { crearLecturaDominio } = load(path.join(root, 'src/shared/dominio.ts'))
const { resumirPeriodo } = load(path.join(root, 'src/renderer/src/utils/reportes.ts'))
const { hoy } = load(path.join(root, 'src/main/database/base.ts'))
async function main() {
  const etiqueta = process.argv[2]
  if (!['antes', 'despues'].includes(etiqueta)) throw Error('Indica antes/despues.')
  const pequena = process.argv[3] === '--small'
  if (process.argv[3] && !pequena) throw Error('Solo se admite --small.')
  app.setName('RuizCacao Manager')
  await app.whenReady()
  const informe = {
    etiqueta,
    fecha: new Date().toISOString(),
    muestras: [],
    escenario: pequena ? 'base pequeña aislada nueva' : 'base local existente READ ONLY',
    procesoHastaReadyMs: process.uptime() * 1000
  }
  let config, local, base, db, ventana
  try {
    if (pequena) {
      const { PostgresLocal, localizarPostgres } = load(
        path.join(root, 'src/main/database/postgres-local.ts')
      )
      const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'ruizcacao-perfil-parche-'))
      informe.carpetaAislada = carpeta
      const key = randomBytes(32)
      const cifrar = (s) => {
        const iv = randomBytes(12),
          c = createCipheriv('aes-256-gcm', key, iv)
        const data = Buffer.concat([c.update(s, 'utf8'), c.final()])
        return Buffer.concat([iv, c.getAuthTag(), data])
      }
      const descifrar = (b) => {
        const c = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12))
        c.setAuthTag(b.subarray(12, 28))
        return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString('utf8')
      }
      const t = performance.now()
      const binarios = await localizarPostgres(path.join(root, 'vendor'))
      informe.localizacionMs = performance.now() - t
      local = new PostgresLocal({ carpeta, binarios, cifrar, descifrar })
      const inicio = performance.now()
      config = await local.iniciar()
      informe.motorNuevoMs = performance.now() - inicio
    } else {
      config = (await conexionDesarrollador()).config
    }
    base = new BaseLocal(config)
    if (pequena) {
      const inicio = performance.now()
      await base.iniciar()
      informe.baseNuevaMigracionesMs = performance.now() - inicio
      const acceso = performance.now()
      await base.existeAdministrador()
      informe.estadoAccesoMs = performance.now() - acceso
      await base.crearAdministrador('Perfil aislado', 'Perfil-aislado-2026')
      const login = performance.now()
      await base.login('Perfil aislado', 'Perfil-aislado-2026')
      informe.loginMs = performance.now() - login
    }
    const t = performance.now()
    db = await base.pool.connect()
    informe.conexionMs = performance.now() - t
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await db.query("SET LOCAL TIME ZONE 'America/Guayaquil'")
    informe.esquema = (
      await db.query('SELECT max(version) version FROM ruizcacao.migraciones')
    ).rows[0].version
    const original = db.query.bind(db)
    let consultas = []
    db.query = async (...args) => {
      const inicio = performance.now()
      const r = await original(...args)
      consultas.push({ sql: args[0], ms: performance.now() - inicio, filas: r.rowCount })
      return r
    }
    let estado
    for (let i = 0; i < 5; i++) {
      consultas = []
      const cpu = process.cpuUsage(),
        inicio = performance.now()
      estado = await base.estado(db)
      const estadoMs = performance.now() - inicio
      const finCpu = process.cpuUsage(cpu)
      const s = performance.now(),
        json = JSON.stringify(estado)
      const serializacionMs = performance.now() - s
      const d = performance.now()
      crearLecturaDominio(estado.datos)
      const lecturaDominioMs = performance.now() - d
      const resumen = performance.now()
      resumirPeriodo(
        estado.datos.ventas,
        estado.datos.gastos,
        hoy(),
        hoy(),
        estado.datos.movimientosCuenta,
        estado.datos.cuentas,
        estado.datos.compras
      )
      informe.muestras.push({
        estadoMs,
        serializacionMs,
        lecturaDominioMs,
        calculoInicioMs: performance.now() - resumen,
        bytes: Buffer.byteLength(json),
        rss: process.memoryUsage().rss,
        cpuMs: (finCpu.user + finCpu.system) / 1000,
        consultas
      })
    }
    informe.huella = createHash('sha256').update(JSON.stringify(estado.datos)).digest('hex')
    if (pequena) {
      const llamadas = []
      const transaccion = base.transaccion.bind(base)
      base.transaccion = (fn, ...args) =>
        transaccion(
          async (client) => {
            const query = client.query.bind(client)
            client.query = async (...args) => {
              llamadas.push(args[0])
              return query(...args)
            }
            try {
              return await fn(client)
            } finally {
              client.query = query
            }
          },
          ...args
        )
      const inicio = performance.now()
      const notificaciones = await base.listarNotificaciones()
      informe.lecturaNotificacionesRedundante = {
        ms: performance.now() - inicio,
        consultas: llamadas.length,
        bytes: Buffer.byteLength(JSON.stringify(notificaciones)),
        iguales: JSON.stringify(notificaciones.avisos) === JSON.stringify(estado.avisos)
      }
      base.transaccion = transaccion
    }
    // Aísla conversión DTO de la variación del servidor/red; reutiliza filas leídas.
    const filas = new Map()
    const cache = {
      query: async (sql) => {
        if (!filas.has(sql)) filas.set(sql, await original(sql))
        return filas.get(sql)
      }
    }
    await leerEntidades(cache, estadoInicial())
    informe.conversionDtoMs = []
    for (let i = 0; i < 9; i++) {
      const inicio = performance.now()
      const snapshot = estadoInicial()
      await leerEntidades(cache, snapshot)
      informe.conversionDtoMs.push(performance.now() - inicio)
      if (i === 0)
        informe.huellaEntidades = createHash('sha256')
          .update(JSON.stringify(snapshot))
          .digest('hex')
    }
    ventana = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(root, 'scripts/perfil-preload-snapshot.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    })
    ipcMain.handle('perfil:estado', (event) => {
      if (event.sender.id !== ventana.webContents.id) throw Error('Origen inválido')
      return estado
    })
    await ventana.loadURL('data:text/html,<html><body>Perfil de transporte</body></html>')
    informe.ipcMs = await ventana.webContents.executeJavaScript(`(async () => {
      const tiempos = []
      for (let i=0;i<5;i++) { const t=performance.now(); await perfil.estado(); tiempos.push(performance.now()-t) }
      return tiempos
    })()`)
    informe.memoriaProcesos = await app.getAppMetrics()
    informe.nota =
      (pequena
        ? 'Motor nuevo, migraciones y login medidos en clúster temporal; lecturas posteriores READ ONLY. '
        : 'Estado sin sesión en base existente READ ONLY; no mide login ni arranque del motor. ') +
      'IPC real cacheado en ventana vacía; no mide pantallas completas. Ready incluye carga del arnés TypeScript. CPU acumulada Main, no porcentaje del sistema. RSS incluye caché de filas y muestras del arnés.'
    await original('ROLLBACK')
    const salida = path.join(
      root,
      'docs/evidencias-escalabilidad/parche-' +
        etiqueta +
        (pequena ? '-small' : '') +
        '-2026-10-13.json'
    )
    await fs.writeFile(salida, JSON.stringify(informe, null, 2))
    console.log('Informe: ' + salida)
    console.log(
      JSON.stringify({
        estadoMs: informe.muestras.map((m) => m.estadoMs),
        conversionDtoMs: informe.conversionDtoMs,
        ipcMs: informe.ipcMs
      })
    )
  } finally {
    if (ventana) ventana.destroy()
    if (db) {
      await db.query('ROLLBACK').catch(() => {})
      db.release()
    }
    if (base) await base.desconectar()
    if (local) await local.detener()
  }
}
main()
  .then(() => app.exit(0))
  .catch((e) => {
    console.error(e.message)
    app.exit(1)
  })
