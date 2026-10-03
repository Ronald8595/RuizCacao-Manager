const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto'),
  { Client } = require('pg')
const { load, root } = require('./loader.cjs'),
  { BaseLocal } = load(root + '/src/main/database/base.ts'),
  { entidades } = load(root + '/src/main/database/relacional.ts')
const { insertarRendimiento } = require('../scripts/seed-rendimiento-core.cjs')
const { consultaHistorialOperaciones } = load(root + '/src/main/database/historial-operaciones.ts')
async function main() {
  const archivo = path.resolve(process.argv[2]),
    carpeta = path.dirname(archivo)
  assert.match(path.basename(carpeta), /^ruizcacao-tests-/)
  const config = JSON.parse(await fs.readFile(archivo, 'utf8')),
    admin = new Client(config)
  await admin.connect()
  const nombre = 'rcm_pag_ops_' + randomUUID().replaceAll('-', '')
  let base,
    creada = false
  try {
    const real = (await admin.query('SHOW data_directory')).rows[0].data_directory
    assert.equal(
      (await fs.realpath(real)).toLowerCase(),
      (await fs.realpath(path.join(carpeta, 'motor', 'data'))).toLowerCase()
    )
    await admin.query('CREATE DATABASE "' + nombre + '"')
    creada = true
    base = new BaseLocal({ ...config, database: nombre })
    await base.iniciar()
    await assert.rejects(base.historialCompras({}), /Inicia sesión/)
    await assert.rejects(base.historialVentas({}), /Inicia sesión/)
    await base.crearAdministrador('Prueba Historial', 'Prueba-historial-2026!')
    await base.login('Prueba Historial', 'Prueba-historial-2026!')
    const db = await base.pool.connect()
    try {
      await insertarRendimiento(db, {
        clientes: 30,
        proveedores: 20,
        compras: 200,
        ventas: 300,
        gastos: 50
      })
    } finally {
      db.release()
    }
    for (const modulo of ['compras', 'ventas']) {
      const e = entidades[modulo],
        cols = ['id', 'orden', ...e.campos.map((c) => c.columna)],
        fecha = modulo === 'compras' ? 'fecha' : 'fecha_venta'
      for (const [n, id] of [
        [0, 'empate_a'],
        [1, 'empate_z']
      ]) {
        const overrides = {
          id,
          orden: '9007199254740993',
          numero_compra: 1000000 + n,
          numero_factura: 1000000 + n,
          numero_comprobante: 1000000 + n,
          proveedor_nombre: 'ÁRBOL %_ Ñ ΣΊΓΜΑ'
        }
        await base.pool.query(
          `INSERT INTO ruizcacao.${modulo} (${cols.join(',')}) OVERRIDING SYSTEM VALUE SELECT ${cols.join(',')} FROM jsonb_populate_record(NULL::ruizcacao.${modulo},(SELECT to_jsonb(o) FROM ruizcacao.${modulo} o LIMIT 1)||$1::jsonb)`,
          [JSON.stringify(overrides)]
        )
      }
      const consultar = (f) =>
        modulo === 'compras' ? base.historialCompras(f) : base.historialVentas(f)
      const snapshot = (await base.cargar()).datos
      const primeras = await consultar({})
      assert.deepEqual(
        primeras.filas.slice(0, 2).map((r) => r.id),
        ['empate_z', 'empate_a']
      )
      const refs = (
        await base.pool.query(
          `SELECT o.id,o.${fecha}::text fecha,${modulo === 'compras' ? 'o.proveedor_nombre' : 'c.nombre_razon_social'} titular FROM ruizcacao.${modulo} o ${modulo === 'ventas' ? 'LEFT JOIN ruizcacao.clientes c ON c.id=o.cliente_id' : ''} ORDER BY o.orden DESC,o.id DESC`
        )
      ).rows
      for (const filtro of [
        {},
        { desde: '2026-01-05', hasta: '2026-01-10' },
        { busqueda: modulo === 'compras' ? 'peña' : 'muñoz' },
        { busqueda: '%_' },
        { busqueda: 'σίγμα' },
        { busqueda: 'inexistente' },
        ...(modulo === 'ventas' ? [{ busqueda: '2026-01-02' }] : [])
      ]) {
        const texto = (filtro.busqueda ?? '').toLocaleLowerCase('es'),
          esperado = refs
            .filter(
              (r) =>
                (!filtro.desde || r.fecha >= filtro.desde) &&
                (!filtro.hasta || r.fecha <= filtro.hasta) &&
                (!texto ||
                  (r.titular ?? '').toLocaleLowerCase('es').includes(texto) ||
                  (modulo === 'ventas' && r.fecha.includes(texto)))
            )
            .map((r) => r.id)
        let cursor = null
        const ids = []
        do {
          const page = await consultar({ ...filtro, cursor })
          assert.equal(
            page.total,
            esperado.length,
            'COUNT debe compartir filtros sin cursor de avance'
          )
          assert.ok(page.filas.length <= 15)
          for (const r of page.filas) {
            assert.ok(!('orden' in r))
            assert.deepEqual(
              r,
              snapshot[modulo].find((x) => x.id === r.id)
            )
            ids.push(r.id)
          }
          cursor = page.siguiente
        } while (cursor)
        assert.deepEqual(ids, esperado)
        assert.equal(new Set(ids).size, ids.length)
      }
      assert.deepEqual(await consultar({}), primeras)
      await assert.rejects(consultar({ busqueda: 'cambio', cursor: primeras.siguiente }))
      await assert.rejects(
        consultar({
          cursor:
            (modulo === 'compras' ? 'ventas' : 'compras') + primeras.siguiente.slice(modulo.length)
        })
      )
      assert.deepEqual((await base.cargar()).datos, snapshot)
      for (const f of [
        null,
        [],
        { limite: 1000 },
        { desde: '2026-02-30' },
        { hasta: '2026-01-01', desde: '2026-02-01' },
        { cursor: 'abc' },
        { busqueda: 1 }
      ])
        assert.throws(() => consultaHistorialOperaciones(modulo, f))
      console.log(
        'OK ' +
          modulo +
          ' SQL keyset: filtros Unicode/literales/fecha, navegación íntegra, empate BIGINT, DTO compatible con Snapshot, cursor ligado a módulo/filtro y sesión.'
      )
    }
    await base.logout()
    await assert.rejects(base.historialCompras({}), /Inicia sesión/)
    await assert.rejects(base.historialVentas({}), /Inicia sesión/)
  } finally {
    if (base) await base.desconectar()
    if (creada) await admin.query('DROP DATABASE "' + nombre + '"')
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
