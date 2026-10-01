const { app } = require('electron')
const { Pool } = require('pg')
const fs = require('node:fs/promises')
const path = require('node:path')
const { conexionDesarrollador } = require('./conexion-desarrollador.cjs')
const { load, root } = require('../tests/loader.cjs')
const { Respaldos, verificarRespaldo } = load(root + '/src/main/database/respaldos.ts')
const { localizarPostgres } = load(root + '/src/main/database/postgres-local.ts')
async function main() {
  const args = process.argv.slice(2)
  if (args.some((a) => !['--inspect', '--insertar-desarrollador'].includes(a)))
    throw Error('Argumento no permitido.')
  const { config, carpeta, fuente } = await conexionDesarrollador()
  const pool = new Pool({
    ...config,
    max: 2,
    connectionTimeoutMillis: 5000,
    statement_timeout: 120000
  })
  try {
    const { rows } = await pool.query(
      "SELECT current_database() base,(SELECT max(version) FROM ruizcacao.migraciones) version,(SELECT count(*)::int FROM information_schema.tables WHERE table_schema='ruizcacao' AND table_type='BASE TABLE') tablas"
    )
    const antes = rows[0]
    console.log(
      JSON.stringify(
        { ...antes, esquema: 'ruizcacao', host: config.host, puerto: config.port, fuente },
        null,
        2
      )
    )
    if (![8, 9].includes(antes.version) || antes.tablas !== 25)
      throw Error('Se requiere esquema 8/9 con 25 tablas antes del seed.')
    const informe = {
      fecha: new Date().toISOString(),
      base: antes,
      esquema: 'ruizcacao',
      fuente,
      estado: 'inspeccionada'
    }
    const salida = path.join(
      root,
      'docs/evidencias-escalabilidad/' +
        (args.includes('--insertar-desarrollador') ? 'seed' : 'inspeccion') +
        '-desarrollador-' +
        new Date().toISOString().replace(/[:.]/g, '-') +
        '.json'
    )
    if (!args.includes('--insertar-desarrollador')) {
      await fs.writeFile(salida, JSON.stringify(informe, null, 2))
      return
    }
    // Seed implementado después de inspección; nunca inicializa ni migra la base.
    const { insertarRendimiento } = require('./seed-rendimiento-core.cjs')
    const db = await pool.connect()
    try {
      if (!(await db.query('SELECT pg_try_advisory_lock(7302027) ok')).rows[0].ok)
        throw Error('Cierra RuizCacao Manager antes del seed; la base está en uso.')
      const respaldos = new Respaldos(
        config,
        await localizarPostgres(path.join(root, 'vendor')),
        path.join(carpeta, 'backups')
      )
      const m = await respaldos.crear(pool, 'manual')
      const archivo = path.join(respaldos.carpeta, m.archivo)
      await verificarRespaldo(archivo)
      await respaldos.herramienta('pg_restore', ['--list', archivo])
      informe.respaldo = {
        archivo,
        sha256: m.sha256,
        tamano: m.tamano,
        version: m.esquema_version,
        verificado: true
      }
      informe.estado = 'respaldo_verificado'
      await fs.writeFile(salida, JSON.stringify(informe, null, 2))
      informe.seed = await insertarRendimiento(db)
      informe.estado = 'insertado_validado'
      await fs.writeFile(salida, JSON.stringify(informe, null, 2))
      console.log(JSON.stringify(informe, null, 2))
    } finally {
      await db.query('SELECT pg_advisory_unlock(7302027)').catch(() => {})
      db.release()
    }
  } finally {
    await pool.end()
  }
}
main()
  .then(() => app.exit(0))
  .catch((e) => {
    console.error(e.message)
    app.exit(1)
  })
