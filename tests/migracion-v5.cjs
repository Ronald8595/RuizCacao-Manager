const { load, root } = require('./loader.cjs')
const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto')
const { Client } = require('pg')
const { esquema, migracionUno } = load(root + '/src/main/database/schema.ts')
const { sqlNormalizacion } = load(root + '/src/main/database/relacional.ts')
const { migracionTres } = load(root + '/src/main/database/migracion-tres.ts')
const { migracionCuatro } = load(root + '/src/main/database/migracion-cuatro.ts')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
const { hashSecreto } = load(root + '/src/main/database/seguridad.ts')
const { Respaldos } = load(root + '/src/main/database/respaldos.ts')

async function main() {
  const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  const admin = new Client(config)
  await admin.connect()
  const nombre = 'rcm_v4_v5_' + randomUUID().replaceAll('-', '')
  await admin.query('CREATE DATABASE "' + nombre + '"')
  const connection = { ...config, database: nombre }
  const db = new Client(connection)
  await db.connect()
  let servicio
  try {
    await db.query('BEGIN')
    await db.query(esquema)
    await db.query(migracionUno)
    await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(1)')
    await db.query(sqlNormalizacion())
    await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(2)')
    await db.query(migracionTres)
    await db.query('INSERT INTO ruizcacao.instalacion(id,installation_id) VALUES(1,$1)', [
      randomUUID()
    ])
    await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(3)')
    await db.query(migracionCuatro)
    await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(4)')
    const hash = await hashSecreto('Clave-v4-se-conserva-2026')
    await db.query(
      "INSERT INTO ruizcacao.administrador(id,nombre,password_hash) VALUES(1,'admin-v4',$1)",
      [hash]
    )
    await db.query(
      "INSERT INTO ruizcacao.clientes(id,nombre_razon_social,identificacion,telefono,estado,fecha_registro) VALUES('cliente-v4','Cliente previo','1234567890','0999999999',true,now())"
    )
    await db.query('COMMIT')

    servicio = new BaseLocal(connection, {
      respaldos: new Respaldos(
        connection,
        process.env.RCM_TEST_BIN,
        process.env.RCM_TEST_ARTIFACTS + '/migracion-v5'
      )
    })
    await servicio.iniciar()

    assert.equal(
      Number((await db.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v),
      8
    )
    assert.equal((await db.query('SELECT count(*)::int n FROM ruizcacao.usuarios')).rows[0].n, 1)
    const usuario = (await db.query('SELECT nombre,rol,activo,principal FROM ruizcacao.usuarios'))
      .rows[0]
    assert.deepEqual(usuario, {
      nombre: 'admin-v4',
      rol: 'administrador',
      activo: true,
      principal: true
    })
    assert.equal((await db.query('SELECT count(*)::int n FROM ruizcacao.clientes')).rows[0].n, 1)

    await servicio.login('admin-v4', 'Clave-v4-se-conserva-2026')
    const estado = await servicio.cargar()
    assert.equal(estado.usuarioActual.nombre, 'admin-v4')
    assert.equal(estado.usuarioActual.rol, 'administrador')
    assert.equal(estado.usuarios.length, 1)

    await servicio.crearUsuario('operador-v5', 'Operador-v5-prueba-2026')
    assert.equal((await servicio.cargar()).usuarios.length, 2)

    console.log(
      'OK: actualización v4→v6 conserva usuario, contraseña y datos; habilita multiusuario y prepara stock inicial sin reinicializar.'
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
