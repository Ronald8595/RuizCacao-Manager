const assert = require('node:assert/strict')
const { load, root } = require('./loader.cjs')
const { entidades, leerEntidades } = load(root + '/src/main/database/relacional.ts')
const { estadoInicial } = load(root + '/src/shared/persistencia.ts')
async function main() {
  const consultas = []
  const db = {
    query: async (sql) => {
      consultas.push(sql)
      const e = Object.values(entidades).find((e) =>
        sql.includes('FROM ruizcacao.' + e.tabla + ' ')
      )
      assert.ok(e, 'Solo tablas conocidas')
      assert.equal(
        sql,
        `SELECT ${['id', ...e.campos.map((c) => c.columna)].join(',')} FROM ruizcacao.${e.tabla} ORDER BY orden DESC`
      )
      return {
        rows:
          e.tabla === 'ventas'
            ? [
                {
                  id: 'venta-test',
                  fecha_venta: '2025-09-01',
                  fecha_hora_registro: new Date('2025-09-01T12:00:00.000Z'),
                  total: '123.45',
                  cantidad_qq: '2.00',
                  numero_factura: 7,
                  observaciones: null,
                  estado: 'anulada',
                  anulada_en: new Date('2025-09-02T12:00:00.000Z'),
                  motivo_anulacion: 'Prueba'
                }
              ]
            : []
      }
    }
  }
  const snapshot = estadoInicial()
  await leerEntidades(db, snapshot)
  assert.equal(consultas.length, 9)
  const venta = snapshot.ventas[0]
  assert.equal(venta.totalVenta, 123.45)
  assert.equal(venta.pesoBruto, 2)
  assert.equal(venta.fechaVenta, '2025-09-01')
  assert.equal(venta.fechaHoraRegistro, '2025-09-01T12:00:00.000Z')
  assert.equal(venta.estado, 'anulada')
  assert.equal(venta.anuladaEn, '2025-09-02T12:00:00.000Z')
  assert.equal(venta.motivoAnulacion, 'Prueba')
  assert.ok(!Object.hasOwn(venta, 'observaciones'))
  assert.ok(!Object.hasOwn(venta, 'orden'))
  assert.ok(!Object.hasOwn(venta, 'actualizado_en'))
  console.log(
    'OK proyección: nueve consultas, orden conservado, importes, fechas, anulaciones y nulos.'
  )
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
