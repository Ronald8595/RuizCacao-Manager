const assert = require('node:assert/strict')
const { load, root } = require('./loader.cjs'),
  { BaseLocal } = load(root + '/src/main/database/base.ts'),
  { estadoInicial } = load(root + '/src/shared/persistencia.ts')
async function main() {
  const base = new BaseLocal({
    host: '127.0.0.1',
    port: 1,
    database: 'sin_conexion',
    user: 'prueba',
    password: 'prueba'
  })
  const consultas = [],
    db = {
      query: async (sql, params) => {
        consultas.push({ sql, params })
        return { rows: [], rowCount: 1 }
      }
    }
  try {
    const antes = estadoInicial()
    antes.clientes = [
      { id: 'a', nombreRazonSocial: 'A' },
      { id: 'b', nombreRazonSocial: 'B' }
    ]
    const despues = structuredClone(antes)
    despues.clientes.reverse()
    await base.guardar(db, antes, despues)
    assert.ok(consultas.every((q) => !q.sql.includes('DELETE')))
    despues.clientes.pop()
    await assert.rejects(base.guardar(db, antes, despues), /no se puede eliminar/)
    const num = estadoInicial()
    num.empleados = [{ id: 1, nombre: 'Empleado' }]
    const str = structuredClone(num)
    str.empleados[0].id = '1'
    await assert.rejects(base.guardar(db, num, str), /no se puede eliminar/)
    const gasto = estadoInicial()
    gasto.gastos = [{ id: 'g', tipo: 'manual', monto: 20 }]
    const sinGasto = structuredClone(gasto)
    sinGasto.gastos = []
    await base.guardar(db, gasto, sinGasto)
    assert.ok(
      consultas.some((q) => q.sql.includes('DELETE FROM ruizcacao.gastos') && q.params[0] === 'g')
    )
    console.log(
      'OK guardar: reordenar conserva registros, borrado comercial rechazado, IDs estrictos y eliminación de gasto con auditoría intactos.'
    )
  } finally {
    await base.desconectar()
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
