// Prueba v7->v8 solo en clúster efímero verificado por el runner.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const { Client } = require('pg')
const { load, root } = require('./loader.cjs')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
const { Respaldos, verificarRespaldo } = load(root + '/src/main/database/respaldos.ts')
const { entidades } = load(root + '/src/main/database/relacional.ts')
const { hashSecreto } = load(root + '/src/main/database/seguridad.ts')
const { generarDataset } = require('../scripts/benchmark-dataset.cjs')
async function main() {
  const archivo = path.resolve(process.argv[2]),
    carpeta = path.dirname(archivo)
  assert.match(path.basename(carpeta), /^ruizcacao-tests-/)
  const config = JSON.parse(await fs.readFile(archivo, 'utf8'))
  assert.equal(config.user, 'ruizcacao_bootstrap')
  const admin = new Client(config)
  await admin.connect()
  const nombre = 'rcm_v8_' + randomUUID().replaceAll('-', '')
  let creada = false,
    sql,
    servicio
  const files = (await fs.readdir(root + '/database')).filter((f) => /^00[1-7]-/.test(f)).sort()
  const hashes = async () =>
    Object.fromEntries(
      await Promise.all(
        files.map(async (f) => [
          f,
          createHash('sha256')
            .update(await fs.readFile(root + '/database/' + f))
            .digest('hex')
        ])
      )
    )
  const historicos = await hashes()
  assert.deepEqual(
    historicos,
    require('../docs/evidencias-escalabilidad/benchmark-stock-small-2026-09-30.json')
      .hashesHistoricos
  )
  try {
    const real = (await admin.query('SHOW data_directory')).rows[0].data_directory
    assert.equal(
      (await fs.realpath(real)).toLowerCase(),
      (await fs.realpath(path.join(carpeta, 'motor', 'data'))).toLowerCase()
    )
    await admin.query('CREATE DATABASE "' + nombre + '"')
    creada = true
    const connection = { ...config, database: nombre }
    sql = new Client(connection)
    await sql.connect()
    await sql.query('BEGIN')
    for (let v = 1; v <= 7; v++) {
      await sql.query(await fs.readFile(root + '/database/' + files[v - 1], 'utf8'))
      await sql.query('INSERT INTO ruizcacao.migraciones(version) VALUES($1)', [v])
    }
    await sql.query('SET CONSTRAINTS ALL DEFERRED')
    const { datos } = generarDataset(0.01)
    for (const [key, e] of Object.entries(entidades)) {
      const cols = ['id', ...e.campos.map((c) => c.columna)]
      const rows = datos[key].map((r) =>
        Object.fromEntries([
          ['id', r.id],
          ...e.campos.map((c) => [
            c.columna,
            r[c.propiedad] === undefined || (c.opcional && r[c.propiedad] === '')
              ? null
              : r[c.propiedad]
          ])
        ])
      )
      await sql.query(
        `INSERT INTO ruizcacao.${e.tabla} (${cols.join(',')}) SELECT ${cols.join(',')} FROM jsonb_populate_recordset(NULL::ruizcacao.${e.tabla},$1::jsonb)`,
        [JSON.stringify(rows)]
      )
    }
    for (const [producto, cantidad] of Object.entries(datos.stock))
      await sql.query('UPDATE ruizcacao.existencias SET cantidad_qq=$2 WHERE producto=$1', [
        producto,
        cantidad
      ])
    const clave = 'Prueba-v8-conservacion-2026!'
    await sql.query(
      "INSERT INTO ruizcacao.usuarios(id,nombre,password_hash,rol,activo,principal) VALUES($1,'Prueba v8',$2,'administrador',true,true)",
      [randomUUID(), await hashSecreto(clave)]
    )
    await sql.query('INSERT INTO ruizcacao.instalacion(id,installation_id) VALUES(1,$1)', [
      randomUUID()
    ])
    await sql.query('COMMIT')
    const tablas = (
      await sql.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='ruizcacao' ORDER BY tablename"
      )
    ).rows.map((r) => r.tablename)
    assert.equal(tablas.length, 25)
    const snapshot = async () => {
      const filas = {}
      for (const t of tablas.filter((t) => !['migraciones', 'sesiones', 'respaldos'].includes(t)))
        filas[t] = (
          await sql.query(
            `SELECT to_jsonb(t) fila FROM ruizcacao.${t} t ORDER BY to_jsonb(t)::text`
          )
        ).rows
      return filas
    }
    const antes = await snapshot()
    const version = async () =>
      (await sql.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v
    const indice = async () =>
      (await sql.query("SELECT to_regclass('ruizcacao.movimientos_stock_orden_id') t")).rows[0].t
    assert.equal(await version(), 7)
    assert.equal(await indice(), null)
    servicio = new BaseLocal(connection, {
      respaldos: {
        crear: async () => {
          throw Error('Fallo simulado respaldo v8')
        }
      }
    })
    await assert.rejects(servicio.iniciar(), /Fallo simulado respaldo v8/)
    await servicio.desconectar()
    servicio = null
    assert.equal(await version(), 7)
    assert.equal(await indice(), null)
    assert.deepEqual(await snapshot(), antes)
    console.log('OK v8 respaldo fallido impide actualización y conserva todos los datos')
    const respaldos = new Respaldos(connection, process.env.RCM_TEST_BIN, path.join(carpeta, 'v8'))
    // Fallar DESPUÉS de CREATE INDEX permite comprobar rollback de índice y versión.
    await sql.query(`CREATE FUNCTION ruizcacao.fallar_version_ocho() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.version=8 THEN RAISE EXCEPTION 'Fallo simulado version ocho'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fallo_v8 BEFORE INSERT ON ruizcacao.migraciones FOR EACH ROW EXECUTE FUNCTION ruizcacao.fallar_version_ocho()`)
    servicio = new BaseLocal(connection, { respaldos })
    await assert.rejects(servicio.iniciar(), /Fallo simulado version ocho/)
    await servicio.desconectar()
    servicio = null
    assert.equal(await version(), 7)
    assert.equal(await indice(), null)
    assert.deepEqual(await snapshot(), antes)
    await sql.query(
      'DROP TRIGGER fallo_v8 ON ruizcacao.migraciones; DROP FUNCTION ruizcacao.fallar_version_ocho()'
    )
    console.log('OK v8 fallo posterior a CREATE INDEX revierte índice y versión')
    const indicesAntes = (
      await sql.query(
        "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='ruizcacao' ORDER BY indexname"
      )
    ).rows
    servicio = new BaseLocal(connection, { respaldos })
    await servicio.iniciar()
    assert.equal(await version(), 9)
    assert.equal(await indice(), 'ruizcacao.movimientos_stock_orden_id')
    assert.deepEqual(await snapshot(), antes)
    assert.deepEqual(
      (
        await sql.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='ruizcacao' ORDER BY tablename"
        )
      ).rows.map((r) => r.tablename),
      tablas
    )
    const indicesDespues = (
      await sql.query(
        "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='ruizcacao' ORDER BY indexname"
      )
    ).rows
    assert.deepEqual(
      indicesDespues.filter(
        (r) =>
          !['movimientos_stock_orden_id', 'compras_orden_id', 'ventas_orden_id'].includes(
            r.indexname
          )
      ),
      indicesAntes
    )
    assert.match(
      indicesDespues.find((r) => r.indexname === 'movimientos_stock_orden_id').indexdef,
      /\(orden DESC, id DESC\)$/
    )
    const { migracionOcho } = load(root + '/src/main/database/migracion-ocho.ts')
    assert.equal(
      await fs.readFile(root + '/database/008-rendimiento-paginacion.sql', 'utf8'),
      '-- Migración 8: índice de orden y desempate para historial Stock paginado.\n' + migracionOcho
    )
    assert.deepEqual(await hashes(), historicos)
    const manifests = await Promise.all(
      (await fs.readdir(respaldos.carpeta))
        .filter((f) => f.endsWith('.dump.json'))
        .map((f) => verificarRespaldo(path.join(respaldos.carpeta, f.slice(0, -5))))
    )
    assert.ok(manifests.length >= 1)
    assert.ok(manifests.every((m) => m.tipo === 'pre_migracion' && m.esquema_version === 7))
    console.log(
      'OK v7->v8->v9: 25 tablas, datos y hashes intactos, un único índice, SQL exportado y respaldo v7 verificado'
    )
    await servicio.login('Prueba v8', clave)
    const pagina = await servicio.historialStock({})
    assert.equal(pagina.filas.length, 15)
    await servicio.cerrar()
    servicio = null
    servicio = new BaseLocal(connection)
    await servicio.iniciar() // v8 no pide otro respaldo ni duplica índice/migración.
    await servicio.login('Prueba v8', clave)
    assert.deepEqual(await servicio.historialStock({}), pagina)
    assert.deepEqual(
      (await sql.query('SELECT version FROM ruizcacao.migraciones ORDER BY version')).rows.map(
        (r) => r.version
      ),
      [1, 2, 3, 4, 5, 6, 7, 8, 9]
    )
    console.log('OK v8 reinicio idempotente conserva credenciales e historial paginado')
  } finally {
    if (servicio) await servicio.desconectar()
    if (sql) await sql.end()
    if (creada) await admin.query('DROP DATABASE "' + nombre + '"')
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
