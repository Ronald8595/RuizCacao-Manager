// Aplicación explícita de 009 en la base del desarrollador; no inicia sesiones/jornadas.
const { app } = require('electron'),
  { Pool } = require('pg')
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict')
const { conexionDesarrollador } = require('./conexion-desarrollador.cjs')
const { load, root } = require('../tests/loader.cjs')
const { Respaldos, verificarRespaldo } = load(root + '/src/main/database/respaldos.ts')
const { localizarPostgres } = load(root + '/src/main/database/postgres-local.ts')
const { migracionNueve } = load(root + '/src/main/database/migracion-nueve.ts')
async function main() {
  assert.deepEqual(process.argv.slice(2), ['--aplicar-009'])
  const { config, carpeta } = await conexionDesarrollador()
  const pool = new Pool({ ...config, max: 2, statement_timeout: 120000 })
  const db = await pool.connect()
  try {
    assert.ok(
      (await db.query('SELECT pg_try_advisory_lock(7302027) ok')).rows[0].ok,
      'Cierra la aplicación antes de migrar.'
    )
    const estado = async () =>
      (
        await db.query(
          "SELECT current_database() base,(SELECT max(version) FROM ruizcacao.migraciones) version,(SELECT count(*)::int FROM information_schema.tables WHERE table_schema='ruizcacao' AND table_type='BASE TABLE') tablas"
        )
      ).rows[0]
    const antes = await estado()
    assert.equal(antes.tablas, 25)
    assert.ok([8, 9].includes(antes.version))
    if (antes.version === 9) {
      console.log('La migración 009 ya está aplicada; no se ejecutó DDL.')
      return
    }
    const tablas = (
      await db.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='ruizcacao' AND tablename NOT IN ('migraciones','respaldos') ORDER BY tablename"
      )
    ).rows.map((r) => r.tablename)
    const huellas = async () => {
      const r = {}
      for (const tabla of tablas)
        r[tabla] = (
          await db.query(
            `SELECT count(*)::int filas,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) hash FROM ruizcacao.${tabla} t`
          )
        ).rows[0]
      return r
    }
    const original = await huellas()
    const respaldos = new Respaldos(
      config,
      await localizarPostgres(path.join(root, 'vendor')),
      path.join(carpeta, 'backups')
    )
    const m = await respaldos.crear(pool, 'pre_migracion'),
      archivo = path.join(respaldos.carpeta, m.archivo)
    await verificarRespaldo(archivo)
    await respaldos.herramienta('pg_restore', ['--list', archivo])
    await db.query('BEGIN')
    try {
      await db.query('SELECT pg_advisory_xact_lock(7302026)')
      assert.equal((await estado()).version, 8)
      await db.query(migracionNueve)
      await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(9)')
      assert.deepEqual(await huellas(), original)
      assert.equal((await estado()).tablas, 25)
      await db.query('COMMIT')
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
    const informe = {
      fecha: new Date().toISOString(),
      antes,
      despues: await estado(),
      respaldo: {
        archivo,
        sha256: m.sha256,
        tamano: m.tamano,
        version: m.esquema_version,
        verificado: true
      },
      datosConservados: true,
      huellas: original,
      indices: (
        await db.query(
          "SELECT indexname,indexdef,pg_relation_size(('ruizcacao.'||indexname)::regclass)::text bytes FROM pg_indexes WHERE schemaname='ruizcacao' AND indexname IN ('compras_orden_id','ventas_orden_id','movimientos_stock_orden_id') ORDER BY indexname"
        )
      ).rows
    }
    const salida = path.join(
      root,
      'docs/evidencias-escalabilidad/migracion-desarrollador-v9-2026-10-01.json'
    )
    await fs.writeFile(salida, JSON.stringify(informe, null, 2))
    console.log(
      JSON.stringify(
        {
          antes,
          despues: informe.despues,
          respaldo: informe.respaldo,
          datosConservados: true,
          salida
        },
        null,
        2
      )
    )
  } finally {
    await db.query('SELECT pg_advisory_unlock(7302027)').catch(() => {})
    db.release()
    await pool.end()
  }
}
main()
  .then(() => app.exit(0))
  .catch((e) => {
    console.error(e.message)
    app.exit(1)
  })
