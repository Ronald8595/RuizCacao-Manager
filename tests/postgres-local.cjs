const { load, root } = require('./loader.cjs')
const { join, resolve } = require('node:path')
const { randomUUID, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { Client } = require('pg')
const { PostgresLocal, localizarPostgres } = load(join(root, 'src/main/database/postgres-local.ts'))
async function main() {
  if (!process.argv[2]) throw Error('Indica una carpeta temporal de pruebas.')
  const carpeta = join(resolve(process.argv[2]), 'rcm_motor_' + randomUUID()),
    key = randomBytes(32)
  const cifrar = (s) => {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv),
      contenido = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), contenido])
  }
  const descifrar = (b) => {
    const cipher = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12))
    cipher.setAuthTag(b.subarray(12, 28))
    return Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString('utf8')
  }
  const opciones = {
    carpeta,
    binarios: process.env.RCM_TEST_BIN || (await localizarPostgres(root)),
    cifrar,
    descifrar
  }
  let motor = new PostgresLocal(opciones)
  try {
    const config = await motor.iniciar()
    assert.equal(config.host, '127.0.0.1')
    assert.equal(config.user, 'ruizcacao_app')
    const db = new Client(config)
    await db.connect()
    try {
      const rol = (
        await db.query(
          'SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user'
        )
      ).rows[0]
      assert.equal(rol.rolsuper, false)
      assert.equal(rol.rolcreatedb, false)
      assert.equal(rol.rolcreaterole, false)
      assert.ok(config.port >= 55432 && config.port <= 55442)
      assert.equal((await db.query('SHOW listen_addresses')).rows[0].listen_addresses, '127.0.0.1')
      assert.equal(
        (await db.query('SHOW password_encryption')).rows[0].password_encryption,
        'scram-sha-256'
      )
      await db.query(
        'CREATE TABLE prueba_persistente(valor integer); INSERT INTO prueba_persistente VALUES(42)'
      )
    } finally {
      await db.end()
    }
    assert.ok(
      !(await fs.readFile(join(carpeta, 'conexion.enc'))).includes(Buffer.from(config.password))
    )
    const exportado = await motor.exportarPgAdmin()
    const servidor = JSON.parse(await fs.readFile(join(exportado, 'servidor-pgadmin.json'), 'utf8'))
      .Servers['1']
    assert.equal(servidor.Port, config.port)
    assert.equal(servidor.Username, config.user)
    await motor.detener()
    motor = new PostgresLocal(opciones)
    const segundo = await motor.iniciar()
    assert.deepEqual(segundo, config)
    const db2 = new Client(segundo)
    await db2.connect()
    try {
      assert.equal((await db2.query('SELECT valor FROM prueba_persistente')).rows[0].valor, 42)
    } finally {
      await db2.end()
    }
    console.log(
      'OK: arranque automático, SCRAM, rol sin superusuario, credenciales cifradas, exportación pgAdmin y reinicio con datos conservados.'
    )
  } finally {
    await motor.detener()
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
