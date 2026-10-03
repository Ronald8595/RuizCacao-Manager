// Migración v2 real, respaldo crítico fallido, rollback DDL y restauración aislada.
const { load, root } = require('./loader.cjs'),
  { Client } = require('pg'),
  fs = require('node:fs/promises'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto'),
  { join } = require('node:path')
const { esquema, migracionUno } = load(root + '/src/main/database/schema.ts'),
  { sqlNormalizacion } = load(root + '/src/main/database/relacional.ts')
const { BaseLocal } = load(root + '/src/main/database/base.ts'),
  { Respaldos, verificarRespaldo } = load(root + '/src/main/database/respaldos.ts')
async function main() {
  const config = JSON.parse(await fs.readFile(process.argv[2], 'utf8')),
    admin = new Client(config)
  await admin.connect()
  const nombre = 'rcm_v2_' + randomUUID().replaceAll('-', ''),
    destino = nombre + '_restore'
  await admin.query('CREATE DATABASE "' + nombre + '"')
  await admin.query('CREATE DATABASE "' + destino + '"')
  const c = { ...config, database: nombre },
    db = new Client(c)
  await db.connect()
  let servicio
  const backup = new Respaldos(
    c,
    process.env.RCM_TEST_BIN,
    join(process.env.RCM_TEST_ARTIFACTS, 'v2')
  )
  try {
    await db.query('BEGIN')
    await db.query(esquema)
    await db.query(migracionUno)
    await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(1)')
    await db.query(sqlNormalizacion())
    await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(2)')
    await db.query('COMMIT')
    await db.query(
      "INSERT INTO ruizcacao.proveedores(id,nombre,ci_ruc,estado,fecha_registro) VALUES('proveedor-v2','Proveedor conservado','1234567890',true,CURRENT_DATE)"
    )
    servicio = new BaseLocal(c, {
      respaldos: {
        crear: async () => {
          throw Error('Fallo simulado de respaldo crítico')
        }
      }
    })
    await assert.rejects(servicio.iniciar())
    await servicio.desconectar()
    servicio = null
    assert.equal((await db.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v, 2)
    assert.equal((await db.query("SELECT to_regclass('ruizcacao.instalacion') t")).rows[0].t, null)
    assert.equal(
      (await db.query('SELECT nombre FROM ruizcacao.proveedores')).rows[0].nombre,
      'Proveedor conservado'
    )
    console.log('OK v2 respaldo crítico fallido impide migración sin alterar datos')
    // Conflicto DDL controlado en esta base efímera: toda la migración debe revertirse.
    await db.query('CREATE TABLE ruizcacao.control_recuperacion(prueba integer)')
    servicio = new BaseLocal(c, { respaldos: backup })
    await assert.rejects(servicio.iniciar())
    await servicio.desconectar()
    servicio = null
    assert.equal((await db.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v, 2)
    assert.equal((await db.query("SELECT to_regclass('ruizcacao.instalacion') t")).rows[0].t, null)
    await db.query('DROP TABLE ruizcacao.control_recuperacion')
    console.log('OK v2 fallo DDL revierte completamente la migración 3')
    servicio = new BaseLocal(c, { respaldos: backup })
    await servicio.iniciar()
    assert.equal((await db.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v, 10)
    assert.equal(
      (await db.query('SELECT nombre FROM ruizcacao.proveedores')).rows[0].nombre,
      'Proveedor conservado'
    )
    const manifests = await Promise.all(
      (await fs.readdir(backup.carpeta))
        .filter((f) => f.endsWith('.dump.json'))
        .map((f) => verificarRespaldo(join(backup.carpeta, f.slice(0, -5))))
    )
    assert.ok(manifests.every((m) => m.tipo === 'pre_migracion' && m.esquema_version === 2))
    console.log('OK v2 migración 2→4 conserva registros y respaldo custom de versión 2')
    // Restaurar la copia actual usando los mismos binarios y argumentos que la herramienta técnica.
    const m = await backup.crear(servicio.pool, 'manual'),
      ruta = join(backup.carpeta, m.archivo)
    await backup.validarRestauracion(ruta)
    const destinoInicial = new Client({ ...config, database: destino })
    await destinoInicial.connect()
    await destinoInicial.query('CREATE SCHEMA ruizcacao')
    await destinoInicial.end()
    await backup.herramienta('pg_restore', [
      ...backup.argumentosConexion(destino),
      '--clean',
      '--if-exists',
      '--single-transaction',
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      '--schema=ruizcacao',
      ruta
    ])
    const restaurada = new Client({ ...config, database: destino })
    await restaurada.connect()
    try {
      assert.deepEqual(
        (await restaurada.query('SELECT * FROM ruizcacao.proveedores')).rows,
        (await db.query('SELECT * FROM ruizcacao.proveedores')).rows
      )
      assert.equal(
        (await restaurada.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v,
        10
      )
    } finally {
      await restaurada.end()
    }
    assert.ok(!backup.argumentosConexion().join(' ').includes(config.password))
    console.log(
      'OK restauración real en base aislada conserva registros y versión; contraseña ausente de argv'
    )
  } finally {
    if (servicio) await servicio.cerrar().catch(() => servicio.desconectar())
    await db.end()
    await admin.query('DROP DATABASE "' + nombre + '"')
    await admin.query('DROP DATABASE "' + destino + '"')
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
