const assert = require('node:assert/strict')
const { load, root } = require('./loader.cjs')
const { validarFiltroStock, consultaLoteStock } = load(
  root + '/src/main/database/historial-stock.ts'
)
for (const input of [
  null,
  [],
  { limite: 1000 },
  { desde: '2025-02-30' },
  { desde: '2025-03-01', hasta: '2025-02-01' },
  { producto: "';DROP TABLE x;--" },
  { busqueda: 'a'.repeat(501) },
  { cursor: 'no-es-json' },
  { busqueda: 1 },
  { desde: '0000-01-01' }
])
  assert.throws(() => validarFiltroStock(input))
const filtro = validarFiltroStock({
  desde: '2024-02-29',
  producto: 'Cacao Seco',
  busqueda: ' ÁRBOL %_ '
})
assert.equal(filtro.busqueda, 'árbol %_')
const q = consultaLoteStock(filtro)
assert.ok(q.sql.includes('LIMIT $'))
assert.ok(!q.sql.includes('2024-02-29'))
assert.ok(!q.sql.includes('SELECT *'))
assert.ok(q.sql.includes('ORDER BY orden DESC,id DESC'))
assert.equal(q.params.at(-1), 16)
assert.ok(q.sql.includes('strpos(lower(coalesce(proveedor_nombre'))
assert.ok(q.params.includes('árbol %_'))
assert.equal(consultaLoteStock(validarFiltroStock({})).params.at(-1), 16)
const cursor = Buffer.from(
  JSON.stringify({
    version: 1,
    filtro: filtro.firma,
    techo: { orden: '9007199254740993', id: 'z' },
    despues: { orden: '9007199254740993', id: 'a' }
  })
).toString('base64url')
assert.equal(
  validarFiltroStock({ desde: '2024-02-29', producto: 'Cacao Seco', busqueda: 'árbol %_', cursor })
    .cursor.despues.orden,
  '9007199254740993'
)
assert.throws(() => validarFiltroStock({ cursor }))
console.log(
  'OK paginación Stock: filtros, fechas, texto literal, cursor BIGINT, parámetros y límites.'
)
