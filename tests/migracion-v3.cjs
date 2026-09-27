const { load, root } = require('./loader.cjs'),
  { Client } = require('pg'),
  fs = require('node:fs/promises'),
  { randomUUID } = require('node:crypto'),
  assert = require('node:assert/strict'),
  { join } = require('node:path')
const { esquema, migracionUno } = load(root + '/src/main/database/schema.ts'),
  { sqlNormalizacion } = load(root + '/src/main/database/relacional.ts'),
  { migracionTres } = load(root + '/src/main/database/migracion-tres.ts'),
  { BaseLocal } = load(root + '/src/main/database/base.ts'),
  { Respaldos, verificarRespaldo } = load(root + '/src/main/database/respaldos.ts')
async function main() {
  const cfg = JSON.parse(await fs.readFile(process.argv[2], 'utf8')),
    admin = new Client(cfg)
  await admin.connect()
  const nombre = 'rcm_m3_' + randomUUID().replaceAll('-', '')
  await admin.query('CREATE DATABASE "' + nombre + '"')
  const config = { ...cfg, database: nombre },
    db = new Client(config)
  await db.connect()
  let servicio
  try {
    // Construir una instalación previa v3 exactamente con los SQL históricos.
    await db.query('BEGIN')
    await db.query(esquema)
    await db.query(migracionUno)
    await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(1)')
    await db.query(sqlNormalizacion())
    await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(2)')
    await db.query(migracionTres)
    const instalacion = randomUUID()
    await db.query('INSERT INTO ruizcacao.instalacion(id,installation_id) VALUES(1,$1)', [
      instalacion
    ])
    await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(3)')
    await db.query('COMMIT')
    const carpeta = join(process.env.RCM_TEST_ARTIFACTS, 'migracion-v3'),
      backup = new Respaldos(config, process.env.RCM_TEST_BIN, carpeta)
    servicio = new BaseLocal(config, { respaldos: backup })
    await servicio.iniciar()
    assert.equal((await db.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v, 7)
    assert.equal(
      (await db.query('SELECT installation_id FROM ruizcacao.instalacion')).rows[0].installation_id,
      instalacion
    )
    assert.ok(
      (await db.query('SELECT umbral_stock FROM ruizcacao.productos')).rows.every(
        (r) => r.umbral_stock === null
      )
    )
    const archivos = (await fs.readdir(carpeta)).filter((f) => f.endsWith('.dump'))
    assert.equal(archivos.length, 1)
    assert.equal((await verificarRespaldo(join(carpeta, archivos[0]))).esquema_version, 3)
    console.log(
      'OK migración 3→4 conserva identidad, no inventa umbrales y verifica copia previa v3'
    )
  } finally {
    if (servicio) await servicio.cerrar().catch(() => servicio.desconectar())
    await db.end()
    await admin.query('DROP DATABASE "' + nombre + '"')
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
