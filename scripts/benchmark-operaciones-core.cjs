const { performance } = require('node:perf_hooks'),
  { createHash } = require('node:crypto'),
  assert = require('node:assert/strict')
const { load, root } = require('../tests/loader.cjs')
const { consultaHistorialOperaciones, consultarHistorialCompras, consultarHistorialVentas } = load(
  root + '/src/main/database/historial-operaciones.ts'
)
const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
async function medirOperaciones(db) {
  const results = []
  for (const modulo of ['compras', 'ventas']) {
    const servicio = modulo === 'compras' ? consultarHistorialCompras : consultarHistorialVentas
    const primera = await servicio(db, {})
    const medio = (
      await db.query(
        `SELECT orden,id FROM ruizcacao.${modulo} ORDER BY orden DESC,id DESC OFFSET (SELECT count(*)*4/5 FROM ruizcacao.${modulo}) LIMIT 1`
      )
    ).rows[0]
    let cursor = null
    if (primera.siguiente && medio) {
      const c = JSON.parse(
        Buffer.from(primera.siguiente.slice(modulo.length + 1), 'base64url').toString()
      )
      c.despues = { orden: String(medio.orden), id: medio.id }
      cursor = modulo + '.' + Buffer.from(JSON.stringify(c)).toString('base64url')
    }
    const casos = [
      ['primera', {}],
      ['profunda', { cursor }],
      ['fecha', { desde: '2026-06-01', hasta: '2026-06-30' }],
      ['titular', { busqueda: modulo === 'compras' ? 'Peña Ñandú 17' : 'Muñoz Álvarez 17' }]
    ]
    const qCompleta = consultaHistorialOperaciones(modulo, {}).sql.replace(
      / ORDER BY.*$/,
      ' ORDER BY o.orden DESC'
    )
    const start = performance.now(),
      completa = await db.query(qCompleta)
    const anterior = {
      filas: completa.rows.length,
      ms: performance.now() - start,
      bytesJson: Buffer.byteLength(JSON.stringify(completa.rows)),
      nota: 'Una muestra lectura completa SQL; no incluye filtro React, IPC ni render.'
    }
    for (const [caso, filtro] of casos) {
      const q = consultaHistorialOperaciones(modulo, filtro)
      const plan = (await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + q.sql, q.params))
        .rows[0]['QUERY PLAN'][0]
      const tiempos = []
      let pagina
      for (let n = 0; n < 5; n++) {
        const t = performance.now()
        pagina = await servicio(db, filtro)
        tiempos.push(performance.now() - t)
      }
      const nodos = []
      const recorrer = (p) => {
        if (p['Relation Name'])
          nodos.push({
            tabla: p['Relation Name'],
            nodo: p['Node Type'],
            indice: p['Index Name'],
            emitidas: p['Actual Rows'],
            descartadas: p['Rows Removed by Filter'] ?? 0,
            vueltas: p['Actual Loops']
          })
        for (const c of p.Plans ?? []) recorrer(c)
      }
      recorrer(plan.Plan)
      const esperado = (
        await db.query(q.sql.replace(/ LIMIT \$\d+$/, ' LIMIT 15'), q.params.slice(0, -1))
      ).rows.map((r) => r.id)
      assert.deepEqual(
        pagina.filas.map((r) => r.id),
        esperado
      )
      results.push({
        modulo,
        caso,
        filtro,
        sql: q.sql,
        params: q.params,
        plan,
        nodos,
        muestrasServicioMs: tiempos,
        medianaServicioMs: mediana(tiempos),
        filasRenderer: pagina.filas.length,
        bytesRespuestaJson: Buffer.byteLength(JSON.stringify({ ok: true, valor: pagina })),
        huella: createHash('sha256').update(JSON.stringify(pagina)).digest('hex'),
        anterior
      })
    }
  }
  return results
}
module.exports = { medirOperaciones }
