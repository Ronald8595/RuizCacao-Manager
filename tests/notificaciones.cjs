// Migración y acciones solo en el clúster efímero verificado de db:test.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const { Client } = require('pg')
const { load, root } = require('./loader.cjs')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
const { Respaldos, verificarRespaldo } = load(root + '/src/main/database/respaldos.ts')
const { hashSecreto } = load(root + '/src/main/database/seguridad.ts')
const { publicarAviso } = load(root + '/src/main/database/notificaciones.ts')
const { migracionDiez, asignarAvisosHistoricos } = load(
  root + '/src/main/database/migracion-diez.ts'
)
const { ColaNotificaciones } = load(root + '/src/renderer/src/utils/colaNotificaciones.ts')
async function main() {
  const archivo = path.resolve(process.argv[2]),
    carpeta = path.dirname(archivo)
  assert.match(path.basename(carpeta), /^ruizcacao-tests-/)
  const config = JSON.parse(await fs.readFile(archivo, 'utf8'))
  const admin = new Client(config)
  await admin.connect()
  const real = (await admin.query('SHOW data_directory')).rows[0].data_directory
  assert.equal(
    (await fs.realpath(real)).toLowerCase(),
    (await fs.realpath(path.join(carpeta, 'motor', 'data'))).toLowerCase()
  )
  const nombre = 'rcm_notificaciones_' + randomUUID().replaceAll('-', '')
  let sql,
    servicio,
    creada = false
  const files = (await fs.readdir(root + '/database')).filter((f) => /^00[1-9]-/.test(f)).sort()
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
  const anteriores = await hashes()
  try {
    await admin.query('CREATE DATABASE "' + nombre + '"')
    creada = true
    const connection = { ...config, database: nombre }
    sql = new Client(connection)
    await sql.connect()
    await sql.query('BEGIN')
    for (let v = 1; v <= 9; v++) {
      await sql.query(await fs.readFile(root + '/database/' + files[v - 1], 'utf8'))
      await sql.query('INSERT INTO ruizcacao.migraciones(version) VALUES($1)', [v])
    }
    const alice = randomUUID(),
      bob = randomUUID(),
      password = 'Notificaciones-prueba-2026!'
    const hash = await hashSecreto(password)
    // Una instalación v9 sin usuarios no pierde sus avisos durante la actualización.
    await sql.query('SAVEPOINT sin_usuarios')
    const pendiente = randomUUID()
    await sql.query(
      "INSERT INTO ruizcacao.notificaciones(id,titulo,mensaje) VALUES($1,'Sistema','Pendiente de destinatario')",
      [pendiente]
    )
    await sql.query(migracionDiez)
    assert.equal(
      (await sql.query('SELECT usuario_id FROM ruizcacao.notificaciones WHERE id=$1', [pendiente]))
        .rows[0].usuario_id,
      null
    )
    await sql.query(
      "INSERT INTO ruizcacao.usuarios(id,nombre,password_hash,rol,principal) VALUES($1,'Primer usuario',$2,'administrador',true)",
      [alice, hash]
    )
    await sql.query(asignarAvisosHistoricos)
    assert.equal(
      (await sql.query('SELECT usuario_id FROM ruizcacao.notificaciones WHERE id=$1', [pendiente]))
        .rows[0].usuario_id,
      alice
    )
    await sql.query('ROLLBACK TO SAVEPOINT sin_usuarios; RELEASE SAVEPOINT sin_usuarios')
    for (const [id, nombre, principal] of [
      [alice, 'Alicia', true],
      [bob, 'Roberto', false]
    ])
      await sql.query(
        "INSERT INTO ruizcacao.usuarios(id,nombre,password_hash,rol,principal) VALUES($1,$2,$3,'administrador',$4)",
        [id, nombre, hash, principal]
      )
    const antiguos = [randomUUID(), randomUUID()]
    for (let i = 0; i < 2; i++)
      await sql.query(
        "INSERT INTO ruizcacao.notificaciones(id,titulo,mensaje,fecha,leida,evento_clave,destino) VALUES($1,'Árbol Ñ','Mensaje conservado',now()-interval '1 hour',$2,$3,'stock')",
        [antiguos[i], !!i, 'historico:' + i]
      )
    await sql.query('COMMIT')
    const original = (await sql.query('SELECT * FROM ruizcacao.notificaciones ORDER BY id')).rows
    const version = async () =>
      (await sql.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v
    const sinColumna = async () =>
      (
        await sql.query(
          "SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='ruizcacao' AND table_name='notificaciones' AND column_name='usuario_id'"
        )
      ).rows[0].n === 0
    const backup = new Respaldos(connection, process.env.RCM_TEST_BIN, path.join(carpeta, 'v10'))
    servicio = new BaseLocal(connection, {
      respaldos: {
        crear: async () => {
          throw Error('Respaldo v10 fallido')
        }
      }
    })
    await assert.rejects(servicio.iniciar(), /Respaldo v10 fallido/)
    await servicio.desconectar()
    servicio = null
    assert.equal(await version(), 9)
    assert.equal(await sinColumna(), true)
    assert.deepEqual(
      (await sql.query('SELECT * FROM ruizcacao.notificaciones ORDER BY id')).rows,
      original
    )
    await sql.query(`CREATE FUNCTION ruizcacao.fallar_diez() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.version=10 THEN RAISE EXCEPTION 'Fallo v10 simulado'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fallo_v10 BEFORE INSERT ON ruizcacao.migraciones FOR EACH ROW EXECUTE FUNCTION ruizcacao.fallar_diez()`)
    servicio = new BaseLocal(connection, { respaldos: backup })
    await assert.rejects(servicio.iniciar(), /Fallo v10 simulado/)
    await servicio.desconectar()
    servicio = null
    assert.equal(await version(), 9)
    assert.equal(await sinColumna(), true)
    assert.deepEqual(
      (await sql.query('SELECT * FROM ruizcacao.notificaciones ORDER BY id')).rows,
      original
    )
    await sql.query(
      'DROP TRIGGER fallo_v10 ON ruizcacao.migraciones; DROP FUNCTION ruizcacao.fallar_diez()'
    )
    servicio = new BaseLocal(connection, { respaldos: backup })
    await servicio.iniciar()
    assert.equal(await version(), 10)
    assert.equal(
      (await sql.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='ruizcacao'"))
        .rows[0].n,
      25
    )
    const filas = (await sql.query('SELECT * FROM ruizcacao.notificaciones')).rows
    assert.equal(filas.length, 4)
    for (const n of original) {
      assert.deepEqual(
        filas.find((r) => r.id === n.id),
        { ...n, usuario_id: alice }
      )
      const copia = filas.find((r) => r.evento_clave === n.evento_clave && r.usuario_id === bob)
      assert.ok(copia)
      const contenido = { ...copia }
      delete contenido.id
      delete contenido.usuario_id
      const esperado = { ...n }
      delete esperado.id
      assert.deepEqual(contenido, esperado)
    }
    const manifests = await Promise.all(
      (await fs.readdir(backup.carpeta))
        .filter((f) => f.endsWith('.dump.json'))
        .map((f) => verificarRespaldo(path.join(backup.carpeta, f.slice(0, -5))))
    )
    assert.ok(manifests.length >= 1)
    assert.ok(manifests.every((m) => m.esquema_version === 9 && m.tipo === 'pre_migracion'))
    assert.equal(
      await fs.readFile(root + '/database/010-notificaciones.sql', 'utf8'),
      '-- Migración 10: gestión independiente de notificaciones por usuario.\n' + migracionDiez
    )
    assert.deepEqual(await hashes(), anteriores)
    console.log(
      'OK v9→v10: respaldo, rollback posterior al DDL/copiado, históricos, 25 tablas y hashes 001–009'
    )
    const metodos = [
      'listarNotificaciones',
      'marcarNotificacionLeida',
      'marcarTodasNotificacionesLeidas',
      'eliminarNotificacion',
      'eliminarTodasNotificaciones',
      'limpiarNotificacionesAntiguas'
    ]
    for (const m of metodos) await assert.rejects(servicio[m](randomUUID()), /Inicia sesión/)
    await servicio.login('Alicia', password)
    await sql.query(
      "INSERT INTO ruizcacao.notificaciones(id,titulo,mensaje,usuario_id) VALUES($1,'Privada de Roberto','Solo su destinatario',$2)",
      [randomUUID(), bob]
    )
    const snapshot = servicio.datos
    servicio.datos = async () => {
      throw Error('No se permite leer Snapshot en operaciones de avisos')
    }
    for (const id of [null, undefined, [], {}, 1, '', 'no-uuid', "' OR true --"])
      for (const m of ['marcarNotificacionLeida', 'eliminarNotificacion', 'leerAviso'])
        await assert.rejects(servicio[m](id), /notificación no es válida/)
    let pagina = await servicio.listarNotificaciones()
    assert.equal(pagina.avisos.length, 2)
    assert.equal(pagina.noLeidas, 1)
    const privadosBob = async () =>
      (
        await sql.query('SELECT * FROM ruizcacao.notificaciones WHERE usuario_id=$1 ORDER BY id', [
          bob
        ])
      ).rows
    const bobAntes = await privadosBob()
    await servicio.eliminarNotificacion(bobAntes[0].id)
    await servicio.marcarNotificacionLeida(bobAntes[0].id)
    assert.deepEqual(await privadosBob(), bobAntes)
    pagina = await servicio.marcarNotificacionLeida(antiguos[0])
    assert.equal(pagina.noLeidas, 0)
    pagina = await servicio.eliminarNotificacion(antiguos[0])
    assert.equal(pagina.avisos.length, 1)
    await servicio.marcarTodasNotificacionesLeidas()
    await servicio.eliminarTodasNotificaciones()
    assert.deepEqual(await privadosBob(), bobAntes)
    assert.deepEqual(await servicio.listarNotificaciones(), { avisos: [], noLeidas: 0 })
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    for (const [i, horas, leida] of [
      [0, 49, true],
      [1, 47, true],
      [2, 99, false],
      [3, 48, true]
    ])
      await sql.query(
        "INSERT INTO ruizcacao.notificaciones(id,titulo,mensaje,fecha,leida,usuario_id) VALUES($1,'Prueba 48h','Antigüedad',now()-$2*interval '1 hour',$3,$4)",
        [ids[i], horas, leida, alice]
      )
    pagina = await servicio.limpiarNotificacionesAntiguas()
    assert.deepEqual(new Set(pagina.avisos.map((n) => n.id)), new Set([ids[1], ids[2]]))
    assert.equal(pagina.noLeidas, 1)
    assert.deepEqual(await servicio.limpiarNotificacionesAntiguas(), pagina)
    assert.equal(
      (
        await sql.query(
          'SELECT count(*)::int n FROM ruizcacao.notificaciones WHERE id=ANY($1::uuid[])',
          [[ids[0], ids[3]]]
        )
      ).rows[0].n,
      0
    )
    assert.deepEqual(await privadosBob(), bobAntes)
    await publicarAviso(sql, 'Stock general', 'Mensaje', 'general', 'stock')
    await publicarAviso(sql, 'Stock general', 'Mensaje', 'general', 'stock')
    assert.equal(
      (
        await sql.query(
          "SELECT count(*)::int n FROM ruizcacao.notificaciones WHERE evento_clave='general'"
        )
      ).rows[0].n,
      2
    )
    pagina = await servicio.marcarTodasNotificacionesLeidas()
    assert.equal(pagina.noLeidas, 0)
    assert.equal(
      (
        await sql.query(
          "SELECT leida FROM ruizcacao.notificaciones WHERE usuario_id=$1 AND evento_clave='general'",
          [bob]
        )
      ).rows[0].leida,
      false
    )
    await servicio.eliminarTodasNotificaciones()
    servicio.datos = snapshot
    await servicio.cerrar()
    servicio = null
    servicio = new BaseLocal(connection)
    await servicio.iniciar()
    await servicio.login('Alicia', password)
    assert.deepEqual(await servicio.listarNotificaciones(), { avisos: [], noLeidas: 0 })
    await servicio.logout()
    await servicio.login('Roberto', password)
    pagina = await servicio.listarNotificaciones()
    assert.equal(pagina.avisos.length, 4)
    assert.equal(pagina.noLeidas, 3)
    console.log(
      'OK avisos: seis contratos, UUID/sesión, listado/badge, individuales/todos, aislamiento, 48h exactas, idempotencia, persistencia y cero Snapshot'
    )
    const cola = new ColaNotificaciones()
    let resolver,
      visibles = ['borrada']
    const lectura = cola.ejecutar(
      () =>
        new Promise((r) => {
          resolver = r
        }),
      (v) => {
        visibles = v
      }
    )
    await Promise.resolve()
    const borrar = cola.ejecutar(
      async () => [],
      (v) => {
        visibles = v
      }
    )
    resolver(['borrada'])
    await Promise.all([lectura, borrar])
    assert.deepEqual(visibles, [])
    let rechazar
    const falloAnterior = cola.ejecutar(
      () =>
        new Promise((_r, reject) => {
          rechazar = reject
        }),
      () => {
        throw Error('No debe aplicarse')
      }
    )
    await Promise.resolve()
    cola.invalidar()
    rechazar(Error('Fallo de sesión anterior'))
    assert.equal(await falloAnterior, false)
    const anterior = cola.ejecutar(
      () =>
        new Promise((r) => {
          resolver = r
        }),
      (v) => {
        visibles = v
      }
    )
    await Promise.resolve()
    cola.invalidar()
    resolver(['sesión anterior'])
    assert.equal(await anterior, false)
    assert.deepEqual(visibles, [])
    await assert.rejects(
      cola.ejecutar(
        async () => {
          throw Error('fallo')
        },
        () => {}
      )
    )
    assert.equal(
      await cola.ejecutar(
        async () => [],
        () => {}
      ),
      true
    )
    console.log(
      'OK cola: lectura atrasada no resucita borrados, desmontaje de sesión y recuperación tras fallo'
    )
  } finally {
    if (servicio) await servicio.desconectar()
    if (sql) await sql.end()
    if (creada) await admin.query('DROP DATABASE "' + nombre + '"')
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
