// Solo invocada por tests/run.cjs sobre su clúster nuevo, verificado antes de CREATE/DROP.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises'),
  path = require('node:path')
const { randomUUID } = require('node:crypto'),
  { Client } = require('pg')
const { load, root } = require('./loader.cjs')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
async function main() {
  const archivo = path.resolve(process.argv[2]),
    carpeta = path.dirname(archivo)
  assert.match(path.basename(carpeta), /^ruizcacao-tests-/)
  const config = JSON.parse(await fs.readFile(archivo, 'utf8'))
  assert.equal(config.user, 'ruizcacao_bootstrap')
  const admin = new Client(config)
  await admin.connect()
  const nombre = 'rcm_paginacion_test_' + randomUUID().replaceAll('-', '')
  let base,
    creada = false
  try {
    const real = (await admin.query('SHOW data_directory')).rows[0].data_directory
    assert.equal(
      (await fs.realpath(real)).toLowerCase(),
      (await fs.realpath(path.join(carpeta, 'motor', 'data'))).toLowerCase()
    )
    console.log('Prueba aislada: ' + nombre + ' | usuario ' + config.user + ' | clúster ' + real)
    await admin.query('CREATE DATABASE "' + nombre + '"')
    creada = true
    base = new BaseLocal({ ...config, database: nombre })
    await base.iniciar()
    await assert.rejects(base.historialStock({}), /Inicia sesión/)
    await base.crearAdministrador('Prueba stock', 'Prueba-stock-2026!')
    await base.login('Prueba stock', 'Prueba-stock-2026!')
    const sql = base.pool
    await sql.query(`INSERT INTO ruizcacao.movimientos_stock(id,orden,fecha,fecha_hora_registro,tipo,producto,entrada_qq,salida_qq,stock_resultante,detalle,observacion,proveedor_nombre,factor_conversion,diferencia_qq)
      OVERRIDING SYSTEM VALUE SELECT 'mov_'||lpad(i::text,4,'0'),9007199254740993+(i/2),date '2025-01-01'+(i%30),timestamptz '2025-01-01 12:00:00+00','Conversión',CASE WHEN i%2=0 THEN 'Cacao Seco' ELSE 'Maracuyá' END,1,0,i,'Prueba',CASE WHEN i%7=0 THEN 'ÁRBOL %_ Ñ ΣΊΓΜΑ' ELSE 'Normal' END,'PROVEEDOR',3.3,CASE WHEN i%2=0 THEN 0 ELSE NULL END FROM generate_series(1,320) i`)
    const globalAntes = (await base.cargar()).datos
    const referencia = (
      await sql.query(
        'SELECT id,fecha::text,producto,observacion,proveedor_nombre FROM ruizcacao.movimientos_stock ORDER BY orden DESC,id DESC'
      )
    ).rows
    for (const filtro of [
      {},
      { producto: 'Cacao Seco' },
      { desde: '2025-01-05', hasta: '2025-01-10' },
      { busqueda: 'árbol %_' },
      { busqueda: 'σίγμα' },
      { busqueda: 'proveedor' },
      { busqueda: 'no existe' }
    ]) {
      const esperados = referencia
        .filter(
          (r) =>
            (!filtro.producto || r.producto === filtro.producto) &&
            (!filtro.desde || r.fecha >= filtro.desde) &&
            (!filtro.hasta || r.fecha <= filtro.hasta) &&
            [r.fecha, r.producto, r.observacion, r.proveedor_nombre].some((v) =>
              (v ?? '').toLowerCase().includes((filtro.busqueda ?? '').trim().toLowerCase())
            )
        )
        .map((r) => r.id)
      let cursor = null,
        ids = [],
        paginas = 0
      do {
        const page = await base.historialStock({ ...filtro, cursor })
        assert.equal(
          page.total,
          esperados.length,
          'COUNT debe compartir filtros sin cursor de avance'
        )
        assert.ok(page.filas.length <= 15)
        assert.ok(page.filas.every((r) => !('orden' in r) && !('proveedorNombre' in r)))
        ids.push(...page.filas.map((r) => r.id))
        cursor = page.siguiente
        assert.ok(++paginas < 100)
      } while (cursor)
      assert.deepEqual(ids, esperados)
      assert.equal(new Set(ids).size, ids.length)
    }
    const primera = await base.historialStock({})
    const segunda = await base.historialStock({ cursor: primera.siguiente })
    assert.deepEqual(
      await base.historialStock({}),
      primera,
      'Volver a anterior sin modificar registros'
    )
    await assert.rejects(base.historialStock({ producto: 'Cacao Seco', cursor: primera.siguiente }))
    assert.deepEqual(
      (await base.cargar()).datos,
      globalAntes,
      'El historial no modifica ni pagina el Snapshot global'
    )
    await sql.query(
      `INSERT INTO ruizcacao.movimientos_stock(id,orden,fecha,fecha_hora_registro,tipo,producto,entrada_qq,salida_qq,stock_resultante,detalle) OVERRIDING SYSTEM VALUE VALUES('nuevo',9007199254749999,'2025-01-01',now(),'Entrada - Ajuste','Cacao Seco',1,0,1,'Prueba')`
    )
    assert.deepEqual(
      await base.historialStock({ cursor: primera.siguiente }),
      segunda,
      'Nuevas inserciones no desplazan la siguiente página'
    )
    assert.equal((await base.historialStock({})).filas[0].id, 'nuevo')
    await base.logout()
    await assert.rejects(base.historialStock({}), /Inicia sesión/)
    console.log(
      'OK paginación Stock PostgreSQL: navegación completa, filtros/acento/literales, empate, BIGINT, inserción, sesión y Snapshot intacto.'
    )
  } finally {
    if (base) await base.cerrar().catch(() => base.desconectar())
    if (creada) {
      console.log('Eliminar solo base efímera verificada: ' + nombre)
      await admin.query('DROP DATABASE "' + nombre + '"')
    }
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
