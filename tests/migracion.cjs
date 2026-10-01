const { load, root } = require('./loader.cjs')
const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto')
const { Client } = require('pg')
const { esquema, migracionUno } = load(root + '/src/main/database/schema.ts')
const { BaseLocal, hoy } = load(root + '/src/main/database/base.ts')
const { crearDominio } = load(root + '/src/shared/dominio.ts')
const { estadoInicial } = load(root + '/src/shared/persistencia.ts')
const { Respaldos } = load(root + '/src/main/database/respaldos.ts')
const { entidades } = load(root + '/src/main/database/relacional.ts')
async function main() {
  const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')),
    nombre = 'rcm_migracion_' + randomUUID().replaceAll('-', '')
  const admin = new Client(config)
  await admin.connect()
  await admin.query('CREATE DATABASE "' + nombre + '"')
  const connection = { ...config, database: nombre },
    db = new Client(connection)
  await db.connect()
  let servicio
  try {
    await db.query('BEGIN')
    await db.query(esquema)
    await db.query(migracionUno)
    await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(1)')
    const snapshot = estadoInicial()
    snapshot.jornada = { fecha: hoy(), estado: 'activa', horaInicio: '08:00', horaFin: null }
    let d = crearDominio(snapshot)
    const proveedor = d.value.crearProveedor({
      nombre: 'Proveedor Histórico',
      ciRuc: '1234567890',
      estado: true
    })
    d = crearDominio(d.snapshot())
    d.value.registrarCompra({
      fecha: hoy(),
      proveedorId: proveedor.id,
      producto: 'Cacao en Baba',
      cantidadQq: 100,
      precioCompraQq: 10,
      impuestoPorcentaje: 0,
      montoPagado: 25,
      metodoPago: 'Efectivo'
    })
    const previo = d.snapshot()
    for (const [key, entidad] of Object.entries(entidades))
      for (const registro of previo[key])
        await db.query('INSERT INTO ruizcacao.' + entidad.tabla + '(id,datos) VALUES($1,$2)', [
          String(registro.id),
          JSON.stringify(registro)
        ])
    await db.query('INSERT INTO ruizcacao.configuracion(id,datos) VALUES(1,$1)', [
      JSON.stringify({
        stock: previo.stock,
        costoUnitarioPromedio: previo.costoUnitarioPromedio,
        ultimoFactorUsado: previo.ultimoFactorUsado
      })
    ])
    await db.query('COMMIT')
    await db.query("UPDATE ruizcacao.proveedores SET datos=datos-'nombre'")
    servicio = new BaseLocal(connection, {
      respaldos: new Respaldos(
        connection,
        process.env.RCM_TEST_BIN,
        process.env.RCM_TEST_ARTIFACTS + '/migracion'
      )
    })
    await assert.rejects(servicio.iniciar())
    await servicio.desconectar()
    servicio = null
    assert.equal(
      (await db.query('SELECT max(version) AS version FROM ruizcacao.migraciones')).rows[0].version,
      1
    )
    assert.equal(
      (await db.query('SELECT datos FROM ruizcacao.compras')).rows[0].datos.totalCompra,
      1000
    )
    await db.query(
      "UPDATE ruizcacao.proveedores SET datos=jsonb_set(datos,'{nombre}','\"Proveedor Histórico\"')"
    )
    servicio = new BaseLocal(connection, {
      respaldos: new Respaldos(
        connection,
        process.env.RCM_TEST_BIN,
        process.env.RCM_TEST_ARTIFACTS + '/migracion'
      )
    })
    await servicio.iniciar()
    await servicio.crearAdministrador('admin', 'Prueba-migracion-2026')
    await servicio.login('admin', 'Prueba-migracion-2026')
    const actual = (await servicio.cargar()).datos
    assert.equal(actual.compras[0].id, previo.compras[0].id)
    assert.equal(actual.compras[0].totalCompra, 1000)
    assert.equal(actual.stock['Cacao en Baba'], 100)
    assert.equal(actual.cuentas[0].montoPagado, 25)
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='ruizcacao' AND column_name='datos'"
        )
      ).rows[0].n,
      0
    )
    assert.equal(
      (await db.query('SELECT max(version) AS version FROM ruizcacao.migraciones')).rows[0].version,
      7
    )
    assert.equal(
      Number(
        (await db.query('SELECT sum(monto) AS importe FROM ruizcacao.v_flujo_caja')).rows[0].importe
      ),
      -25
    )
    await servicio.cerrar()
    servicio = new BaseLocal(connection, {
      respaldos: new Respaldos(
        connection,
        process.env.RCM_TEST_BIN,
        process.env.RCM_TEST_ARTIFACTS + '/migracion'
      )
    })
    await servicio.iniciar()
    assert.equal((await db.query('SELECT count(*)::int AS n FROM ruizcacao.compras')).rows[0].n, 1)
    console.log(
      'OK: migración 1→7 con compra, cuenta, gasto, inventario y efectivo conservados; sin documentos de negocio; migración idempotente.'
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
