// Solo clúster de tests/run.cjs; comprueba identidad antes de crear la base aislada.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises'),
  path = require('node:path')
const { randomUUID } = require('node:crypto'),
  { Client } = require('pg')
const { load, root } = require('./loader.cjs')
const { BaseLocal, hoy } = load(root + '/src/main/database/base.ts')
const { validarStockFecha } = load(root + '/src/main/database/stock-por-fecha.ts')
async function main() {
  const archivo = path.resolve(process.argv[2]),
    carpeta = path.dirname(archivo)
  assert.match(path.basename(carpeta), /^ruizcacao-tests-/)
  const config = JSON.parse(await fs.readFile(archivo, 'utf8'))
  assert.equal(config.user, 'ruizcacao_bootstrap')
  const admin = new Client(config)
  await admin.connect()
  const nombre = 'rcm_stock_fecha_' + randomUUID().replaceAll('-', '')
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
    await assert.rejects(base.stockPorFecha({ fecha: '2025-01-01' }), /Inicia sesión/)
    await base.crearAdministrador('Stock fecha', 'Stock-fecha-2026!')
    await base.login('Stock fecha', 'Stock-fecha-2026!')
    const db = base.pool
    const vacio = await base.stockPorFecha({ fecha: '2025-01-01' })
    assert.equal(vacio.resumen.length, 3)
    assert.equal(vacio.total, 0)
    assert.ok(vacio.resumen.every((r) => r.inicial === 0 && r.final === 0))
    // Detecta ordenar BIGINT como texto al seleccionar el techo (99 > 9007... en texto).
    await db.query(`INSERT INTO ruizcacao.movimientos_stock(id,orden,fecha,fecha_hora_registro,tipo,producto,entrada_qq,salida_qq,stock_resultante,detalle)
      OVERRIDING SYSTEM VALUE VALUES('orden-corto',99,'2024-12-30','2024-12-30 12:00:00-05','Entrada - Ajuste','Maracuyá',0,0,0,'Orden corto')`)
    let orden = 9007199254740993n
    const insertar = async (id, fecha, tipo, producto, entrada, salida, conversion = null) => {
      await db.query(
        `INSERT INTO ruizcacao.movimientos_stock(id,orden,fecha,fecha_hora_registro,tipo,producto,entrada_qq,salida_qq,stock_resultante,detalle,conversion_id)
        OVERRIDING SYSTEM VALUE VALUES($1,$2,$3,($3::date::text||'T12:00:00.123456-05:00')::timestamptz,$4,$5,$6,$7,999,'Caso de prueba',$8)`,
        [id, String(orden++), fecha, tipo, producto, entrada, salida, conversion]
      )
    }
    await insertar('inicial-b', '2025-01-01', 'Stock inicial', 'Cacao en Baba', 100, 0)
    await insertar('inicial-s', '2025-01-01', 'Stock inicial', 'Cacao Seco', 40, 0)
    await insertar('inicial-m', '2025-01-01', 'Stock inicial', 'Maracuyá', 30, 0)
    await insertar('compra-b', '2025-01-02', 'Entrada - Compra', 'Cacao en Baba', 20, 0)
    await insertar('venta-b', '2025-01-03', 'Salida - Venta', 'Cacao en Baba', 0, 10)
    await insertar('compra-s', '2025-01-04', 'Entrada - Compra Seco', 'Cacao Seco', 8, 0)
    await insertar('venta-s', '2025-01-04', 'Salida - Venta', 'Cacao Seco', 0, 3)
    await insertar('conversion', '2025-01-05', 'Conversión', 'Cacao Seco', 5, 15)
    await insertar('ajuste-mas', '2025-01-06', 'Entrada - Ajuste', 'Maracuyá', 3, 0)
    await insertar('ajuste-menos', '2025-01-07', 'Salida - Ajuste', 'Maracuyá', 0, 2)
    await insertar('merma', '2025-01-08', 'Salida - Merma', 'Maracuyá', 0, 1)
    await insertar('anula-venta', '2025-01-09', 'Entrada - Ajuste', 'Cacao en Baba', 10, 0)
    await insertar('anula-compra', '2025-01-10', 'Salida - Ajuste', 'Cacao en Baba', 0, 20)
    await insertar('retroactiva', '2025-01-02', 'Entrada - Ajuste', 'Maracuyá', 1, 0)
    await insertar('futura', '9999-12-30', 'Entrada - Ajuste', 'Maracuyá', 2, 0)
    // Patrón legado de dos filas ya separadas: nunca volver a expandirlas como Conversión.
    await insertar('legacy-salida', '2025-01-11', 'Salida - Procesamiento', 'Cacao en Baba', 0, 2)
    await insertar(
      'legacy-entrada',
      '2025-01-11',
      'Entrada - Ajuste',
      'Cacao Seco',
      0.5,
      0,
      'legacy-salida'
    )
    const r = (pagina, p) => pagina.resumen.find((r) => r.producto === p)
    const leer = (fecha) => base.stockPorFecha({ fecha })
    const antes = await leer('2024-12-31')
    assert.ok(antes.resumen.every((r) => r.final === 0))
    assert.equal(r(await leer('2025-01-01'), 'Cacao en Baba').entradas, 100)
    assert.equal(r(await leer('2025-01-02'), 'Cacao en Baba').salidas, 0)
    assert.equal(r(await leer('2025-01-03'), 'Cacao en Baba').entradas, 0)
    const mezcla = r(await leer('2025-01-04'), 'Cacao Seco')
    assert.deepEqual([mezcla.entradas, mezcla.salidas, mezcla.final], [8, 3, 45])
    const conv = await leer('2025-01-05')
    assert.deepEqual(
      [
        r(conv, 'Cacao en Baba').salidas,
        r(conv, 'Cacao Seco').entradas,
        r(conv, 'Cacao Seco').salidas
      ],
      [15, 5, 0]
    )
    assert.equal(conv.total, 1)
    assert.equal(conv.filas.length, 1)
    assert.equal(conv.filas[0].horaRegistrada, '12:00:00')
    assert.equal(r(await leer('2025-01-08'), 'Maracuyá').salidas, 1)
    assert.equal(
      r(await leer('2025-01-03'), 'Cacao en Baba').final,
      110,
      'Compensación no borra venta previa'
    )
    assert.equal(r(await leer('2025-01-09'), 'Cacao en Baba').entradas, 10)
    assert.equal(r(await leer('2025-01-10'), 'Cacao en Baba').salidas, 20)
    assert.equal(r(await leer('2025-01-11'), 'Cacao en Baba').final, 83)
    assert.equal(r(await leer('2025-01-11'), 'Cacao Seco').final, 50.5)
    assert.equal(r(await leer(hoy()), 'Maracuyá').final, 31)
    assert.equal(r(await leer('9999-12-31'), 'Maracuyá').final, 33)
    for (let dia = 1; dia <= 13; dia++) {
      const actual = await leer(`2025-01-${String(dia).padStart(2, '0')}`)
      const posterior = await leer(`2025-01-${String(dia + 1).padStart(2, '0')}`)
      for (const fila of actual.resumen) {
        assert.equal(fila.final, fila.inicial + fila.entradas - fila.salidas)
        assert.equal(fila.final, r(posterior, fila.producto).inicial)
      }
    }
    // Historial conciliado independiente de la fórmula probada, con movimiento futuro.
    for (const [producto, cantidad] of [
      ['Cacao en Baba', 83],
      ['Cacao Seco', 50.5],
      ['Maracuyá', 33]
    ])
      await db.query('UPDATE ruizcacao.existencias SET cantidad_qq=$2 WHERE producto=$1', [
        producto,
        cantidad
      ])
    const finales = await leer('9999-12-31')
    const existencias = (await db.query('SELECT producto,cantidad_qq FROM ruizcacao.existencias'))
      .rows
    for (const e of existencias) assert.equal(r(finales, e.producto).final, Number(e.cantidad_qq))
    // Retirar solo fixture futura para probar hoy sin futuros. Nunca datos comerciales.
    await db.query("DELETE FROM ruizcacao.movimientos_stock WHERE id='futura'")
    await db.query("UPDATE ruizcacao.existencias SET cantidad_qq=31 WHERE producto='Maracuyá'")
    const actuales = await leer(hoy())
    for (const e of (await db.query('SELECT producto,cantidad_qq FROM ruizcacao.existencias')).rows)
      assert.equal(r(actuales, e.producto).final, Number(e.cantidad_qq))
    // Orden >2^53, empates completos salvo id, y microsegundos distintos en el mismo milisegundo.
    await db.query(`INSERT INTO ruizcacao.movimientos_stock(id,orden,fecha,fecha_hora_registro,tipo,producto,entrada_qq,salida_qq,stock_resultante,detalle)
      OVERRIDING SYSTEM VALUE SELECT 'pagina_'||lpad(i::text,4,'0'),9007199254750000+(i/2),'2025-01-12',
      timestamptz '2025-01-12 17:00:00.123000+00'+(i%3)*interval '1 microsecond',
      'Entrada - Ajuste','Maracuyá',0.01,0,0,'Empate' FROM generate_series(1,260) i`)
    const esperados = (
      await db.query(
        "SELECT id FROM ruizcacao.movimientos_stock WHERE fecha='2025-01-12' ORDER BY fecha_hora_registro DESC,orden DESC,id DESC"
      )
    ).rows.map((r) => r.id)
    const huella = async () =>
      (
        await db.query(
          "SELECT md5(string_agg(row_to_json(m)::text,'' ORDER BY id)) h FROM ruizcacao.movimientos_stock m"
        )
      ).rows[0].h
    const inicial = await huella()
    // Prohibir que el endpoint recurra al Snapshot.
    base.datos = async () => {
      throw Error('Snapshot prohibido')
    }
    base.estado = async () => {
      throw Error('Estado global prohibido')
    }
    for (const limite of [10, 25, 50, 100]) {
      let cursor = null,
        ids = [],
        paginas = 0
      do {
        const page = await base.stockPorFecha({ fecha: '2025-01-12', limite, cursor })
        assert.equal(page.total, 260)
        assert.ok(page.filas.length <= limite)
        assert.equal(page.resumen.length, 3)
        ids.push(...page.filas.map((r) => r.id))
        cursor = page.siguiente
        if (cursor) {
          const c = JSON.parse(Buffer.from(cursor, 'base64url'))
          assert.equal(typeof c.despues.orden, 'string')
          assert.ok(BigInt(c.despues.orden) > 9007199254740991n)
          assert.match(c.despues.instante, /\.\d{6}Z$/)
        }
        assert.ok(++paginas < 30)
      } while (cursor)
      assert.deepEqual(ids, esperados)
      assert.equal(new Set(ids).size, 260)
    }
    const primera = await base.stockPorFecha({ fecha: '2025-01-12' })
    const segunda = await base.stockPorFecha({ fecha: '2025-01-12', cursor: primera.siguiente })
    assert.deepEqual(await base.stockPorFecha({ fecha: '2025-01-12' }), primera)
    assert.equal(await huella(), inicial, 'Consultas no modifican movimientos')
    for (const input of [
      null,
      [],
      {},
      { fecha: '2025-02-30' },
      { fecha: '0000-01-01' },
      { fecha: '2025-01-12', limite: 15 },
      { fecha: '2025-01-12', limite: '25' },
      { fecha: '2025-01-12', extra: 1 },
      { fecha: '2025-01-12', cursor: '??' },
      { fecha: '2025-01-13', cursor: primera.siguiente },
      { fecha: '2025-01-12', limite: 10, cursor: primera.siguiente }
    ])
      assert.throws(() => validarStockFecha(input))
    for (const fallo of ['orden', 'instante']) {
      const c = JSON.parse(Buffer.from(primera.siguiente, 'base64url'))
      c.despues[fallo] = fallo === 'orden' ? '9223372036854775808' : '2025-02-30T17:00:00.000000Z'
      assert.throws(() =>
        validarStockFecha({
          fecha: '2025-01-12',
          cursor: Buffer.from(JSON.stringify(c)).toString('base64url')
        })
      )
    }
    // Inserción retroactiva después del techo: no desplaza páginas, COUNT ni resumen de navegación.
    orden = 9007199254999999n
    await insertar('nuevo-retro', '2025-01-01', 'Entrada - Ajuste', 'Maracuyá', 7, 0)
    assert.deepEqual(
      await base.stockPorFecha({ fecha: '2025-01-12', cursor: primera.siguiente }),
      segunda
    )
    assert.equal(r(await leer('2025-01-12'), 'Maracuyá').final, 40.6)
    const cliente = await db.connect()
    try {
      await cliente.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const { consultarStockFecha } = load(root + '/src/main/database/stock-por-fecha.ts')
      await consultarStockFecha(cliente, { fecha: '2025-01-12' })
      assert.equal(
        (await cliente.query('SHOW transaction_read_only')).rows[0].transaction_read_only,
        'on'
      )
      assert.equal(
        (await cliente.query('SHOW transaction_isolation')).rows[0].transaction_isolation,
        'repeatable read'
      )
      await cliente.query('ROLLBACK')
    } finally {
      cliente.release()
    }
    console.log(
      'OK Stock por fecha: resumen, invariantes, casos, legado, futuro/retroactivo, compensación, cursores 10/25/50/100, BIGINT, microsegundos, READ ONLY, cero Snapshot.'
    )
  } finally {
    if (base) await base.desconectar()
    if (creada) await admin.query('DROP DATABASE "' + nombre + '"')
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e.stack)
  process.exitCode = 1
})
