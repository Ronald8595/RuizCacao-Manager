// Solo recibe el cliente del benchmark nuevo, nunca conexiones externas.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { medirPaginacionStock } = require('./benchmark-paginacion-stock.cjs')
const nombre = 'movimientos_stock_orden_id'
const sqlIndice = `CREATE INDEX ${nombre} ON ruizcacao.movimientos_stock (orden DESC,id DESC)`
const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const sqlInsercion = `INSERT INTO ruizcacao.movimientos_stock
  (id,fecha,fecha_hora_registro,tipo,producto,entrada_qq,salida_qq,stock_resultante,detalle)
  SELECT 'benchmark_indice_'||i,current_date,now(),'Entrada - Ajuste','Cacao Seco',1,0,1,'Sintético, rollback'
  FROM generate_series(1,100) i`
async function medirEscritura(db) {
  const muestrasMs = []
  let plan
  for (let n = 0; n < 6; n++) {
    await db.query('BEGIN')
    try {
      if (n === 0) {
        plan = (await db.query('EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) ' + sqlInsercion))
          .rows[0]['QUERY PLAN'][0]
      } else {
        const t = performance.now()
        await db.query(sqlInsercion)
        // Incluye chequeo de referencias diferidas antes de revertir el lote.
        await db.query('SET CONSTRAINTS ALL IMMEDIATE')
        muestrasMs.push(performance.now() - t)
      }
    } finally {
      await db.query('ROLLBACK')
    }
  }
  return {
    filasPorLote: 100,
    sql: sqlInsercion,
    muestrasMs,
    medianaMs: mediana(muestrasMs),
    plan,
    nota: 'INSERT SQL sintético por lote, transacción revertida. No mide comando comercial, fsync/COMMIT ni WAL durable; la secuencia avanza aunque se reviertan filas.'
  }
}
async function evaluarIndiceStock(db, medir, carpeta, directorioVerificado) {
  assert.match(path.basename(carpeta), /^ruizcacao-benchmark-test-/)
  // Comprobación previa con bootstrap; el rol de medición no puede hacer SHOW data_directory.
  const real = directorioVerificado
  assert.equal(typeof real, 'string')
  assert.equal(
    (await fs.realpath(real)).toLowerCase(),
    (await fs.realpath(path.join(carpeta, 'motor', 'data'))).toLowerCase()
  )
  const existente = (
    await db.query('SELECT indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname=$2', [
      'ruizcacao',
      nombre
    ])
  ).rows[0]
  const total = (await db.query('SELECT count(*)::int n FROM ruizcacao.movimientos_stock')).rows[0]
    .n
  const rondas = []
  let bytesIndice
  try {
    // ABBA: repetir sin/con y con/sin sobre el mismo dataset y los mismos cursores.
    for (const conIndice of [false, true, true, false]) {
      await db.query(`DROP INDEX IF EXISTS ruizcacao.${nombre}`)
      if (conIndice) {
        await db.query(sqlIndice)
        bytesIndice = Number(
          (await db.query(`SELECT pg_relation_size('ruizcacao.${nombre}') bytes`)).rows[0].bytes
        )
      }
      const paginas = await medirPaginacionStock(db, medir)
      if (rondas.length) {
        assert.deepEqual(
          paginas.resultados.map((r) => [
            r.planConsulta.sql,
            r.planConsulta.params,
            r.huellaRespuesta
          ]),
          rondas[0].paginas.resultados.map((r) => [
            r.planConsulta.sql,
            r.planConsulta.params,
            r.huellaRespuesta
          ]),
          'Mismas consultas, parámetros y respuestas con/sin índice'
        )
      }
      const escritura = await medirEscritura(db)
      assert.equal(
        (await db.query('SELECT count(*)::int n FROM ruizcacao.movimientos_stock')).rows[0].n,
        total
      )
      rondas.push({ conIndice, paginas, escritura })
      console.log(
        'Evaluación aislada índice Stock: ronda ' + rondas.length + ', índice ' + conIndice
      )
    }
    return {
      candidato: sqlIndice,
      indicesIniciales: existente ? [existente] : [],
      bytesIndice,
      rondas,
      nota: 'ABBA, caché caliente; CREATE/DROP solo en clúster efímero verificado. Las rondas incluyen cinco muestras de servicio y planes completos. El candidato se restaura al estado inicial al finalizar.'
    }
  } finally {
    await db.query(`DROP INDEX IF EXISTS ruizcacao.${nombre}`)
    if (existente) await db.query(existente.indexdef)
  }
}
module.exports = { evaluarIndiceStock }
