// Solo pg_dump/SELECT en origen; toda preparación mutable ocurre en clústeres nuevos.
const { app, safeStorage } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { randomBytes, createHash } = require('node:crypto')
const { Client } = require('pg')
const { load, root } = require('../tests/loader.cjs')
const { conexionDesarrollador } = require('./conexion-desarrollador.cjs')
const { PostgresLocal, localizarPostgres } = load(root + '/src/main/database/postgres-local.ts')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
const { Respaldos } = load(root + '/src/main/database/respaldos.ts')
const { hashSecreto } = load(root + '/src/main/database/seguridad.ts')
const salida = path.join(root, 'docs/evidencias-arranque-real')
async function huellas(config) {
  const db = new Client({ ...config, options: '-c default_transaction_read_only=on' })
  await db.connect()
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const tablas = (
      await db.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='ruizcacao' ORDER BY tablename"
      )
    ).rows
    const valores = {}
    for (const { tablename } of tablas) {
      assert.match(tablename, /^[a-z_]+$/)
      valores[tablename] = (
        await db.query(
          `SELECT count(*)::int filas, md5(coalesce(string_agg(firma,'' ORDER BY firma),'')) huella FROM (SELECT md5(row_to_json(t)::text) firma FROM ruizcacao.${tablename} t) s`
        )
      ).rows[0]
    }
    await db.query('ROLLBACK')
    return valores
  } finally {
    await db.end()
  }
}
async function main() {
  const { config } = await conexionDesarrollador()
  if (process.argv.includes('--nuevo')) {
    const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'ruizcacao-perfil-instalacion-'))
    const perfil = path.join(carpeta, 'nuevo')
    await fs.mkdir(perfil)
    const manifest = {
      version: 1,
      escenario: 'nuevo',
      perfil,
      dataDirectory: path.join(perfil, 'postgres', 'data'),
      binarios: await localizarPostgres(process.resourcesPath),
      preparadoParaPerfil: true,
      esquema: 0,
      instalacionNueva: true
    }
    await fs.writeFile(path.join(perfil, 'perfil-seguro.json'), JSON.stringify(manifest))
    await fs.writeFile(
      path.join(salida, 'preparacion-nuevo.json'),
      JSON.stringify({ carpeta, perfiles: { nuevo: manifest } }, null, 2)
    )
    console.log('Perfil nuevo vacío preparado; no se ejecutó initdb ni se abrió una conexión SQL.')
    return
  }
  if (process.argv.includes('--verificar')) {
    const anterior = JSON.parse(await fs.readFile(path.join(salida, 'preparacion.json'), 'utf8'))
    const originalFinal = await huellas(config)
    const diferencias = Object.keys(originalFinal).filter(
      (tabla) =>
        JSON.stringify(originalFinal[tabla]) !== JSON.stringify(anterior.originalAntes[tabla])
    )
    const db = new Client({ ...config, options: '-c default_transaction_read_only=on' })
    await db.connect()
    let actividad
    try {
      actividad = {
        auditoria: (
          await db.query(
            'SELECT accion,fecha FROM ruizcacao.auditoria WHERE fecha >= $1 ORDER BY fecha',
            [anterior.fecha]
          )
        ).rows,
        sesiones: (
          await db.query(
            'SELECT iniciada_en,cerrada_en,cierre FROM ruizcacao.sesiones WHERE iniciada_en >= $1 ORDER BY iniciada_en',
            [anterior.fecha]
          )
        ).rows,
        servidor: (
          await db.query(
            "SELECT inet_server_addr() host, inet_server_port() puerto, current_setting('server_version') version"
          )
        ).rows[0]
      }
    } finally {
      await db.end()
    }
    await fs.writeFile(
      path.join(salida, 'original-final.json'),
      JSON.stringify(
        {
          fecha: new Date().toISOString(),
          iguales: diferencias.length === 0,
          diferencias,
          actividad,
          originalFinal
        },
        null,
        2
      )
    )
    console.log(
      'Cotejo del origen guardado. Tablas iguales: ' +
        (25 - diferencias.length) +
        '/25. Diferencias: ' +
        diferencias.join(', ')
    )
    return
  }
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'ruizcacao-perfil-real-'))
  const binarios = await localizarPostgres(process.resourcesPath)
  const informe = {
    carpeta,
    fecha: new Date().toISOString(),
    originalAntes: await huellas(config),
    perfiles: {}
  }
  await fs.mkdir(salida, { recursive: true })
  const dump = path.join(carpeta, 'origen.dump')
  const respaldo = new Respaldos(config, binarios, carpeta)
  const oldOptions = process.env.PGOPTIONS
  process.env.PGOPTIONS = '-c default_transaction_read_only=on'
  try {
    await respaldo.herramienta('pg_dump', [...respaldo.argumentosConexion(), '-Fc', '--file', dump])
  } finally {
    if (oldOptions === undefined) delete process.env.PGOPTIONS
    else process.env.PGOPTIONS = oldOptions
  }
  informe.dumpSha256 = createHash('sha256')
    .update(await fs.readFile(dump))
    .digest('hex')
  for (const escenario of ['small', 'large']) {
    const perfil = path.join(carpeta, escenario)
    await fs.mkdir(perfil)
    const motor = path.join(perfil, 'postgres')
    const local = new PostgresLocal({
      carpeta: motor,
      binarios,
      cifrar: (s) => safeStorage.encryptString(s),
      descifrar: (b) => safeStorage.decryptString(b)
    })
    let base, db
    try {
      const copia = await local.iniciar()
      const cred = JSON.parse(
        safeStorage.decryptString(await fs.readFile(path.join(motor, 'conexion.enc')))
      )
      const admin = new Client({
        ...copia,
        database: 'postgres',
        user: 'ruizcacao_bootstrap',
        password: cred.passwordAdministrador
      })
      await admin.connect()
      const actual = (await admin.query('SHOW data_directory')).rows[0].data_directory
      await admin.end()
      assert.equal(
        (await fs.realpath(actual)).toLowerCase(),
        (await fs.realpath(path.join(motor, 'data'))).toLowerCase()
      )
      assert.notEqual(copia.port, config.port)
      const password = randomBytes(24).toString('hex') + 'Aa1!'
      if (escenario === 'large') {
        const destino = new Respaldos(copia, binarios, perfil)
        await destino.herramienta('pg_restore', [
          ...destino.argumentosConexion(),
          '--exit-on-error',
          '--no-owner',
          '--no-privileges',
          dump
        ])
      } else {
        base = new BaseLocal(copia)
        await base.iniciar()
        await base.crearAdministrador('Perfil aislado', password)
        await base.pool.query(
          "UPDATE ruizcacao.sesiones SET cerrada_en=now(),cierre='preparacion_perfil' WHERE id=$1",
          [base.sesion]
        )
        await base.desconectar()
        base = null
      }
      db = new Client(copia)
      await db.connect()
      const usuario = (
        await db.query('SELECT id,nombre FROM ruizcacao.usuarios WHERE principal LIMIT 1')
      ).rows[0]
      assert.ok(usuario)
      // Solo la copia: la credencial de diagnóstico no modifica a ningún usuario original.
      await db.query(
        'UPDATE ruizcacao.usuarios SET password_hash=$2,fallos=0,bloqueado_hasta=NULL WHERE id=$1',
        [usuario.id, await hashSecreto(password)]
      )
      await fs.writeFile(
        path.join(perfil, 'login.enc'),
        safeStorage.encryptString(JSON.stringify({ ...usuario, password }))
      )
      const manifest = {
        version: 1,
        escenario,
        perfil: await fs.realpath(perfil),
        dataDirectory: actual,
        binarios,
        preparadoParaPerfil: true,
        esquema: (await db.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v
      }
      assert.equal(manifest.esquema, 10)
      await fs.writeFile(path.join(perfil, 'perfil-seguro.json'), JSON.stringify(manifest))
      informe.perfiles[escenario] = manifest
      console.log('Perfil aislado preparado: ' + escenario)
    } finally {
      if (db) await db.end()
      if (base) await base.desconectar()
      await local.detener()
    }
  }
  informe.originalDespues = await huellas(config)
  assert.deepEqual(
    informe.originalDespues,
    informe.originalAntes,
    'El origen debe conservar todas sus tablas'
  )
  await fs.writeFile(path.join(salida, 'preparacion.json'), JSON.stringify(informe, null, 2))
  console.log(
    'Preparación terminada. Huellas originales iguales. ' + path.join(salida, 'preparacion.json')
  )
}
main()
  .then(() => app.exit(0))
  .catch((e) => {
    console.error(e.message)
    app.exit(1)
  })
