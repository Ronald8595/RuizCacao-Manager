const { load, root } = require('./loader.cjs')
const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto')
const { Client } = require('pg')
const { esquema, migracionUno } = load(root + '/src/main/database/schema.ts')
const { sqlNormalizacion } = load(root + '/src/main/database/relacional.ts')
const { migracionTres } = load(root + '/src/main/database/migracion-tres.ts')
const { migracionCuatro } = load(root + '/src/main/database/migracion-cuatro.ts')
const { migracionCinco } = load(root + '/src/main/database/migracion-cinco.ts')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
const { hashSecreto } = load(root + '/src/main/database/seguridad.ts')
const { Respaldos } = load(root + '/src/main/database/respaldos.ts')

async function main() {
  const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  const admin = new Client(config)
  await admin.connect()
  const nombre = 'rcm_v5_v6_' + randomUUID().replaceAll('-', '')
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
    await db.query(migracionCinco)

    const hash = await hashSecreto('Clave-admin-v6-prueba-2026')
    const usuarioId = randomUUID()
    await db.query(
      "INSERT INTO ruizcacao.administrador(id,nombre,password_hash) VALUES(1,'admin-v6',$1)",
      [hash]
    )
    await db.query(
      "INSERT INTO ruizcacao.usuarios(id,nombre,password_hash,rol,activo,principal) VALUES($1,'admin-v6',$2,'administrador',true,true)",
      [usuarioId, hash]
    )
    await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(5)')
    await db.query('COMMIT')

    servicio = new BaseLocal(connection, {
      respaldos: new Respaldos(
        connection,
        process.env.RCM_TEST_BIN,
        process.env.RCM_TEST_ARTIFACTS + '/migracion-v6'
      )
    })
    await servicio.iniciar()

    assert.equal(
      Number((await db.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v),
      10
    )
    let configStock = (
      await db.query(
        'SELECT stock_inicial_registrado,stock_inicial_registrado_en FROM ruizcacao.configuracion WHERE id=1'
      )
    ).rows[0]
    assert.equal(configStock.stock_inicial_registrado, false)
    assert.equal(configStock.stock_inicial_registrado_en, null)

    await servicio.login('admin-v6', 'Clave-admin-v6-prueba-2026')
    await servicio.crearUsuario('operador-v6', 'Clave-operador-v6-2026')
    await servicio.logout()
    await servicio.login('operador-v6', 'Clave-operador-v6-2026')
    await assert.rejects(
      () =>
        servicio.registrarStockInicial({
          cantidades: { 'Cacao en Baba': 1, 'Cacao Seco': 0, Maracuyá: 0 },
          costosUnitarios: { 'Cacao en Baba': null, 'Cacao Seco': null, Maracuyá: null }
        }),
      /administrador/i
    )
    await servicio.logout()
    await servicio.login('admin-v6', 'Clave-admin-v6-prueba-2026')

    const estado = await servicio.registrarStockInicial({
      cantidades: { 'Cacao en Baba': 10, 'Cacao Seco': 5, Maracuyá: 0 },
      costosUnitarios: { 'Cacao en Baba': 100, 'Cacao Seco': 120, Maracuyá: null },
      observacion: 'Inventario previo de prueba'
    })

    assert.equal(estado.stockInicialRegistrado, true)
    assert.ok(estado.stockInicialRegistradoEn)
    assert.equal(estado.datos.stock['Cacao en Baba'], 10)
    assert.equal(estado.datos.stock['Cacao Seco'], 5)
    assert.equal(estado.datos.costoUnitarioPromedio['Cacao en Baba'], 100)
    assert.equal(estado.datos.costoUnitarioPromedio['Cacao Seco'], 120)

    assert.equal((await db.query('SELECT count(*)::int n FROM ruizcacao.compras')).rows[0].n, 0)
    assert.equal((await db.query('SELECT count(*)::int n FROM ruizcacao.gastos')).rows[0].n, 0)
    assert.equal((await db.query('SELECT count(*)::int n FROM ruizcacao.cuentas')).rows[0].n, 0)

    const movimientos = (
      await db.query(
        "SELECT tipo,producto,entrada_qq,usuario_nombre FROM ruizcacao.movimientos_stock WHERE tipo='Stock inicial' ORDER BY producto"
      )
    ).rows
    assert.equal(movimientos.length, 2)
    assert.ok(movimientos.every((m) => m.usuario_nombre === 'admin-v6'))

    configStock = (
      await db.query(
        'SELECT stock_inicial_registrado,stock_inicial_registrado_en,stock_inicial_usuario_id FROM ruizcacao.configuracion WHERE id=1'
      )
    ).rows[0]
    assert.equal(configStock.stock_inicial_registrado, true)
    assert.ok(configStock.stock_inicial_registrado_en)
    assert.equal(configStock.stock_inicial_usuario_id, usuarioId)

    await assert.rejects(
      () =>
        servicio.registrarStockInicial({
          cantidades: { 'Cacao en Baba': 1, 'Cacao Seco': 0, Maracuyá: 0 },
          costosUnitarios: { 'Cacao en Baba': null, 'Cacao Seco': null, Maracuyá: null }
        }),
      /ya fue registrado/i
    )

    console.log(
      'OK: migración v5→v6 habilita stock inicial único, solo administrador y sin generar compras, gastos ni cuentas.'
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
