// Preparar la misma rama de conexión configurada que usa el entorno de desarrollo,
// exclusivamente contra un clúster de medición ya verificado; nunca contra el origen.
const { app, safeStorage } = require('electron')
app.setName('RuizCacao Manager')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { Client } = require('pg')
const { load, root } = require('../tests/loader.cjs')
const { conexionDesarrollador } = require('./conexion-desarrollador.cjs')
const { PostgresLocal } = load(root + '/src/main/database/postgres-local.ts')
async function main() {
  const escenario = process.argv.find((a) => ['small', 'large'].includes(a))
  assert.ok(escenario)
  const preparacion = JSON.parse(
    await fs.readFile(path.join(root, 'docs/evidencias-arranque-real/preparacion.json'), 'utf8')
  )
  const perfil = preparacion.perfiles[escenario]
  assert.equal(
    (await fs.realpath(perfil.perfil)).toLowerCase(),
    path.join(await fs.realpath(preparacion.carpeta), escenario).toLowerCase()
  )
  const { config: original } = await conexionDesarrollador()
  const local = new PostgresLocal({
    carpeta: path.join(perfil.perfil, 'postgres'),
    binarios: perfil.binarios,
    cifrar: (s) => safeStorage.encryptString(s),
    descifrar: (b) => safeStorage.decryptString(b)
  })
  const config = await local.iniciar()
  assert.notEqual(config.port, original.port)
  const cred = JSON.parse(
    safeStorage.decryptString(await fs.readFile(path.join(perfil.perfil, 'postgres/conexion.enc')))
  )
  const db = new Client({
    ...config,
    database: 'postgres',
    user: 'ruizcacao_bootstrap',
    password: cred.passwordAdministrador
  })
  await db.connect()
  try {
    const actual = (await db.query('SHOW data_directory')).rows[0].data_directory
    assert.equal(
      (await fs.realpath(actual)).toLowerCase(),
      (await fs.realpath(perfil.dataDirectory)).toLowerCase()
    )
  } finally {
    await db.end()
  }
  if (process.argv.includes('--detener')) {
    await local.detener()
    await fs.unlink(path.join(perfil.perfil, 'postgres.enc')).catch((e) => {
      if (e.code !== 'ENOENT') throw e
    })
    console.log('Motor aislado detenido: ' + escenario)
  } else {
    const cifrado = safeStorage.encryptString(JSON.stringify(config))
    await fs.writeFile(path.join(perfil.perfil, 'postgres.enc'), cifrado)
    await fs.writeFile(
      path.join(perfil.perfil, 'conexion-externa-segura.json'),
      JSON.stringify({
        dataDirectory: perfil.dataDirectory,
        sha256: createHash('sha256').update(cifrado).digest('hex')
      })
    )
    console.log('Conexión configurada exclusivamente a la copia: ' + escenario)
  }
}
main()
  .then(() => app.exit(0))
  .catch((e) => {
    console.error(e.message)
    app.exit(1)
  })
