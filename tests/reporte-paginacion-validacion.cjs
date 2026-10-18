// Contrato acotado de paginación: captura SQL, sin motor ni datos comerciales.
const assert = require('node:assert/strict')
const { load, root } = require('./loader.cjs')
const { consultarListado } = load(root + '/src/main/database/listados.ts')
const { validarFiltroStock } = load(root + '/src/main/database/historial-stock.ts')
const { LIMITES_PAGINA, LIMITES_PAGINA_REPORTE } = load(root + '/src/shared/listados.ts')

async function main() {
  assert.deepEqual(LIMITES_PAGINA, [10, 15, 25, 50])
  assert.deepEqual(LIMITES_PAGINA_REPORTE, [10, 15, 25, 50, 100])
  assert.throws(() => validarFiltroStock({ limite: 100 }))
  const consultas = []
  let ultimaPagina = false
  const db = {
    query: async (sql, params = []) => {
      consultas.push({ sql, params })
      assert.doesNotMatch(sql, /\bOFFSET\b/i)
      if (sql.startsWith('SELECT (SELECT coalesce(max')) return { rows: [{ a: '300', b: '300' }] }
      if (sql.includes('SELECT count(*)::text total,')) return { rows: [{ total: '103' }] }
      assert.match(
        sql,
        /ORDER BY fecha ASC,instante ASC,fuente ASC,registro DESC,id DESC LIMIT \$\d+$/
      )
      const limiteSQL = params.at(-1)
      assert.ok([11, 16, 26, 51, 101].includes(limiteSQL))
      return {
        rows: Array.from({ length: ultimaPagina ? 3 : limiteSQL }, (_, i) => ({
          id: `mov-${ultimaPagina ? 100 + i : i}`,
          fecha: '2026-10-17',
          instante: '2026-10-17T12:00:00.000Z',
          fuente: 0,
          registro: String(ultimaPagina ? 200 - i : 300 - i),
          tipo: 'Cobro de venta',
          producto: 'Cacao Seco',
          detalle: 'Movimiento de prueba',
          monto: '1.00'
        }))
      }
    }
  }
  for (const limite of LIMITES_PAGINA_REPORTE) {
    const pagina = await consultarListado(db, 'reportePeriodo', { limite })
    assert.equal(pagina.filas.length, limite)
    assert.equal(pagina.total, 103)
    assert.equal(consultas.at(-1).params.at(-1), limite + 1)
    const cursor = JSON.parse(Buffer.from(pagina.siguiente, 'base64url'))
    assert.equal(cursor.clave.at(-1), pagina.filas.at(-1).id)
  }
  const primera = await consultarListado(db, 'reportePeriodo', { limite: 100 })
  const consultasAntes = consultas.length
  for (const limite of [50, 101, 1000, 100.1, '100'])
    await assert.rejects(
      consultarListado(db, 'reportePeriodo', { limite, cursor: primera.siguiente })
    )
  for (const modulo of ['historialCombinado', 'listadoGastos', 'resumenGastos'])
    await assert.rejects(consultarListado(db, modulo, { limite: 100 }))
  assert.equal(consultas.length, consultasAntes, 'Rechazo antes de consultar SQL')
  ultimaPagina = true
  const segunda = await consultarListado(db, 'reportePeriodo', {
    limite: 100,
    cursor: primera.siguiente
  })
  assert.match(consultas.at(-1).sql, /WHERE \(fecha,instante,fuente,-registro\)>/)
  assert.ok(consultas.at(-1).params.includes(primera.filas.at(-1).id))
  assert.equal(segunda.filas.length, 3)
  assert.equal(segunda.siguiente, null)
  assert.equal(new Set([...primera.filas, ...segunda.filas].map((r) => r.id)).size, 103)
  console.log(
    'OK reportes: límites 10/15/25/50/100, LIMIT n+1, cursor keyset, última página y validación aislada.'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
