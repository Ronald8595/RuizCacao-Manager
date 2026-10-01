const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { performance } = require('node:perf_hooks')
const { load, root } = require('../tests/loader.cjs')
const { consultarHistorialStock, validarFiltroStock, consultaLoteStock } = load(
  root + '/src/main/database/historial-stock.ts'
)
async function medirPaginacionStock(db, medir) {
  const resultados = []
  const primera = await consultarHistorialStock(db, {})
  const medio = (
    await db.query(
      'SELECT orden,id FROM ruizcacao.movimientos_stock ORDER BY orden DESC,id DESC OFFSET (SELECT count(*)/2 FROM ruizcacao.movimientos_stock) LIMIT 1'
    )
  ).rows[0]
  const profundo = JSON.parse(Buffer.from(primera.siguiente, 'base64url').toString('utf8'))
  profundo.despues = { orden: String(medio.orden), id: medio.id }
  const casos = [
    ['primera', {}],
    ['profunda', { cursor: Buffer.from(JSON.stringify(profundo)).toString('base64url') }],
    ['producto-fecha', { producto: 'Cacao Seco', desde: '2025-06-01', hasta: '2025-06-30' }],
    ['texto', { busqueda: 'SINTÉTICO' }]
  ]
  for (const [nombre, filtro] of casos) {
    const q = consultaLoteStock(validarFiltroStock(filtro))
    const plan = await medir(
      db,
      'Stock piloto ' + nombre,
      q.sql,
      q.params,
      'consulta real del servicio paginado'
    )
    const tiempos = []
    let pagina,
      consultas = 0,
      filasSQL = 0
    for (let n = 0; n < 5; n++) {
      consultas = 0
      filasSQL = 0
      const clienteMedido = {
        query: async (...args) => {
          consultas++
          const r = await db.query(...args)
          filasSQL += r.rows.length
          return r
        }
      }
      const t = performance.now()
      pagina = await consultarHistorialStock(clienteMedido, filtro)
      tiempos.push(performance.now() - t)
      assert.ok(pagina.filas.length <= 15)
      assert.ok(pagina.filas.every((r) => !('orden' in r) && !('proveedorNombre' in r)))
    }
    resultados.push({
      nombre,
      filtro,
      huellaRespuesta: createHash('sha256').update(JSON.stringify(pagina)).digest('hex'),
      planConsulta: plan,
      muestrasServicioMs: tiempos,
      medianaServicioMs: [...tiempos].sort((a, b) => a - b)[2],
      consultasUltimaMuestra: consultas,
      filasSQLUltimaMuestra: filasSQL,
      filasRenderer: pagina.filas.length,
      bytesRespuestaJSON: Buffer.byteLength(JSON.stringify({ ok: true, valor: pagina })),
      nota: 'Tamaño exacto JSON de Respuesta<PaginaHistorialStock>; no instrumenta el transporte binario IPC. Una consulta SQL por página, incluidos filtros textuales.'
    })
  }
  const idsOffset = (
    await db.query(
      'SELECT id FROM ruizcacao.movimientos_stock WHERE (orden,id)<($1::bigint,$2) ORDER BY orden DESC,id DESC LIMIT 15',
      [profundo.despues.orden, profundo.despues.id]
    )
  ).rows.map((r) => r.id)
  assert.deepEqual(
    (await consultarHistorialStock(db, casos[1][1])).filas.map((r) => r.id),
    idsOffset
  )
  const esquema = (await db.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v
  const indiceNuevo = Boolean(
    (await db.query("SELECT to_regclass('ruizcacao.movimientos_stock_orden_id') t")).rows[0].t
  )
  return { esquema, indiceNuevo, resultados }
}
module.exports = { medirPaginacionStock }
