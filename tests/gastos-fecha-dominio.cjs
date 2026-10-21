const assert = require('node:assert/strict')
const { load, root } = require('./loader.cjs')
const { crearDominio } = load(root + '/src/shared/dominio.ts')
const { estadoInicial } = load(root + '/src/shared/persistencia.ts')
const { hoyGasto, errorFechaGasto } = load(root + '/src/shared/fechaGasto.ts')
assert.equal(hoyGasto(new Date('2026-10-20T04:59:59.999Z')), '2026-10-19')
assert.equal(hoyGasto(new Date('2026-10-20T05:00:00.000Z')), '2026-10-20')
assert.equal(errorFechaGasto('2024-02-29'), undefined)
assert.ok(errorFechaGasto('2025-02-29'))
const s = estadoInicial()
s.jornada = { estado: 'activa', fecha: '2026-09-26', horaInicio: '08:00', horaFin: null }
const d = crearDominio(s)
const antes = Date.now()
d.value.crearGastoManual({
  fecha: '2026-09-25',
  categoria: 'Transporte',
  monto: 10,
  observacion: 'Retroactivo',
  concepto: ''
})
const gasto = d.snapshot().gastos[0]
assert.equal(gasto.fecha, '2026-09-25', 'Conserva fecha elegida, no la jornada')
assert.ok(Date.parse(gasto.fechaHoraRegistro) >= antes)
assert.ok(Date.parse(gasto.fechaHoraRegistro) <= Date.now())
for (const fecha of ['', '2026-02-30', '19/10/2026', '9999-01-01']) {
  assert.throws(
    () =>
      d.value.crearGastoManual({
        fecha,
        categoria: 'Otros',
        monto: 1,
        observacion: '',
        concepto: ''
      }),
    /fecha/i
  )
}
assert.equal(d.snapshot().gastos.length, 1)
d.value.actualizarGastoManual(gasto.id, { ...gasto, fecha: '2026-09-20', monto: 12 })
assert.equal(d.snapshot().gastos[0].fecha, gasto.fecha, 'Editar no cambia fecha histórica')
assert.equal(d.snapshot().gastos[0].fechaHoraRegistro, gasto.fechaHoraRegistro)
s.jornada.estado = 'finalizada'
assert.throws(() => crearDominio(s).value.crearGastoManual({ ...gasto }), /jornada/)
console.log('PASS fecha elegida, instante real, fechas inválidas, historial y jornada')
