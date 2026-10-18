// SELECT solamente en origen. CREATE/DROP índice solo en copia temporal verificada.
const { app, safeStorage } = require('electron')
const fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path')
const assert = require('node:assert/strict')
const { performance } = require('node:perf_hooks')
const { createHash } = require('node:crypto')
const { Client } = require('pg')
const { conexionDesarrollador } = require('./conexion-desarrollador.cjs')
const { load, root } = require('../tests/loader.cjs')
const { PostgresLocal, localizarPostgres } = load(root + '/src/main/database/postgres-local.ts')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
const { consultaDetalleStockFecha, SQL_RESUMEN_STOCK_FECHA, consultarStockFecha } = load(
  root + '/src/main/database/stock-por-fecha.ts'
)
const indice = 'movimientos_stock_fecha_hora_orden_id'
const ddl = `CREATE INDEX ${indice} ON ruizcacao.movimientos_stock(fecha,fecha_hora_registro DESC,orden DESC,id DESC)`
const mediana = (a) => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)]
async function medir(db, sql, params) {
  const plan = (await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + sql, params)).rows[0][
    'QUERY PLAN'
  ][0]
  const muestras = []
  let rows
  for (let i = 0; i < 7; i++) {
    const t = performance.now()
    rows = (await db.query(sql, params)).rows
    muestras.push(performance.now() - t)
  }
  return {
    sql,
    params,
    plan,
    muestrasMs: muestras,
    medianaMs: mediana(muestras),
    filas: rows.length,
    huella: createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  }
}
async function main() {
  const { config } = await conexionDesarrollador()
  const origen = new Client({
    ...config,
    options: '-c default_transaction_read_only=on',
    statement_timeout: 30000
  })
  await origen.connect()
  let rows, existencias
  try {
    await origen.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    rows = (
      await origen.query(`SELECT id,orden::text,fecha::text,
      to_char(fecha_hora_registro AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') fecha_hora_registro,
      tipo,producto,entrada_qq::text,salida_qq::text,stock_resultante::text,detalle
      FROM ruizcacao.movimientos_stock ORDER BY orden,id`)
    ).rows
    existencias = (
      await origen.query(
        'SELECT producto,cantidad_qq::text FROM ruizcacao.existencias ORDER BY producto'
      )
    ).rows
    await origen.query('ROLLBACK')
  } finally {
    await origen.end()
  }
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'ruizcacao-stock-fecha-'))
  console.log('Copia aislada: ' + carpeta + '; movimientos: ' + rows.length)
  const local = new PostgresLocal({
    carpeta: path.join(carpeta, 'motor'),
    binarios: await localizarPostgres(path.join(root, 'vendor')),
    cifrar: (s) => safeStorage.encryptString(s),
    descifrar: (b) => safeStorage.decryptString(b)
  })
  let base
  try {
    const conexion = await local.iniciar()
    const cred = JSON.parse(
      safeStorage.decryptString(await fs.readFile(path.join(carpeta, 'motor', 'conexion.enc')))
    )
    const admin = new Client({
      ...conexion,
      database: 'postgres',
      user: 'ruizcacao_bootstrap',
      password: cred.passwordAdministrador
    })
    await admin.connect()
    try {
      const real = (await admin.query('SHOW data_directory')).rows[0].data_directory
      assert.equal(
        (await fs.realpath(real)).toLowerCase(),
        (await fs.realpath(path.join(carpeta, 'motor', 'data'))).toLowerCase()
      )
    } finally {
      await admin.end()
    }
    base = new BaseLocal(conexion)
    await base.iniciar()
    const db = await base.pool.connect()
    try {
      await db.query("SET TIME ZONE 'America/Guayaquil'")
      const cols =
        'id,orden,fecha,fecha_hora_registro,tipo,producto,entrada_qq,salida_qq,stock_resultante,detalle'
      for (let i = 0; i < rows.length; i += 500)
        await db.query(
          `INSERT INTO ruizcacao.movimientos_stock(${cols}) OVERRIDING SYSTEM VALUE
        SELECT ${cols} FROM jsonb_populate_recordset(NULL::ruizcacao.movimientos_stock,$1::jsonb)`,
          [JSON.stringify(rows.slice(i, i + 500))]
        )
      for (const e of existencias)
        await db.query('UPDATE ruizcacao.existencias SET cantidad_qq=$2 WHERE producto=$1', [
          e.producto,
          e.cantidad_qq
        ])
      await db.query('ANALYZE ruizcacao.movimientos_stock')
      const techo = (
        await db.query(
          'SELECT orden,id FROM ruizcacao.movimientos_stock ORDER BY orden DESC,id DESC LIMIT 1'
        )
      ).rows[0]
      const fechas = (
        await db.query(
          'SELECT fecha::text,count(*)::int n FROM ruizcacao.movimientos_stock GROUP BY fecha ORDER BY fecha'
        )
      ).rows
      assert.ok(fechas.length)
      const denso = [...fechas].sort((a, b) => b.n - a.n)[0]
      const posicion = (
        await db.query(
          `SELECT orden::text,id,to_char(fecha_hora_registro AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') instante
        FROM (SELECT *,row_number() OVER(ORDER BY fecha_hora_registro DESC,orden DESC,id DESC) rn FROM ruizcacao.movimientos_stock WHERE fecha=$1) m WHERE rn=$2`,
          [denso.fecha, Math.max(1, Math.floor(denso.n * 0.8))]
        )
      ).rows[0]
      const casos = [
        ['vacio', '0001-01-01'],
        ['denso', denso.fecha],
        ['antiguo', fechas[0].fecha],
        ['reciente', fechas.at(-1).fecha],
        ['profundo', denso.fecha, posicion]
      ]
      const rondas = []
      let bytesIndice
      for (const conIndice of [false, true, true, false]) {
        await db.query(`DROP INDEX IF EXISTS ruizcacao.${indice}`)
        if (conIndice) {
          await db.query(ddl)
          bytesIndice = Number(
            (await db.query(`SELECT pg_relation_size('ruizcacao.${indice}') n`)).rows[0].n
          )
        }
        const resultados = []
        for (const [nombre, fecha, despues] of casos) {
          const q = consultaDetalleStockFecha(fecha, 25, techo, despues)
          resultados.push({ nombre, detalle: await medir(db, q.sql, q.params) })
        }
        const resumen = await medir(db, SQL_RESUMEN_STOCK_FECHA, [
          fechas.at(-1).fecha,
          techo.orden,
          techo.id
        ])
        if (rondas.length)
          assert.deepEqual(
            resultados.map((r) => r.detalle.huella),
            rondas[0].resultados.map((r) => r.detalle.huella)
          )
        const servicioMs = []
        let respuesta
        for (let i = 0; i < 7; i++) {
          const inicio = performance.now()
          await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
          try {
            respuesta = await consultarStockFecha(db, { fecha: fechas.at(-1).fecha })
          } finally {
            await db.query('ROLLBACK')
          }
          servicioMs.push(performance.now() - inicio)
        }
        rondas.push({
          conIndice,
          resultados,
          resumen,
          servicio: {
            muestrasMs: servicioMs,
            medianaMs: mediana(servicioMs),
            filas: respuesta.filas.length,
            bytes: Buffer.byteLength(JSON.stringify(respuesta))
          }
        })
        console.log(
          'Ronda ' +
            rondas.length +
            ' índice=' +
            conIndice +
            ' ' +
            resultados
              .map((r) => r.nombre + ': ' + r.detalle.medianaMs.toFixed(3) + 'ms')
              .join(', ')
        )
      }
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const actual = await consultarStockFecha(db, { fecha: '9999-12-31' })
      for (const e of existencias)
        assert.equal(
          actual.resumen.find((r) => r.producto === e.producto).final,
          Number(e.cantidad_qq)
        )
      await db.query('ROLLBACK')
      const informe = {
        fecha: new Date().toISOString(),
        carpeta,
        movimientos: rows.length,
        fechas: fechas.length,
        diaDenso: denso,
        copia:
          'Solo columnas de movimientos requeridas; sin vínculos/usuarios. No es restore completo.',
        conciliacionCopia: 'OK',
        candidato: ddl,
        bytesIndice,
        rondas
      }
      const dir = path.join(root, 'docs/evidencias-stock-fecha')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'benchmark-indice.json'),
        JSON.stringify(informe, null, 2) + '\n'
      )
    } finally {
      db.release()
    }
  } catch (e) {
    console.error('Benchmark: ' + e.message)
    throw e
  } finally {
    if (base) await base.desconectar()
    await local.detener()
  }
}
main()
  .then(() => app.exit(0))
  .catch((e) => {
    console.error(e.message)
    app.exit(1)
  })
