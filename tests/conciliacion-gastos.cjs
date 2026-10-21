// Fixture mínimo por APIs reales, únicamente en clúster temporal de tests/run.cjs.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { Client } = require('pg')
const { load, root } = require('./loader.cjs')
const { BaseLocal, hoy } = load(root + '/src/main/database/base.ts')
const { vistaFlujoHistorica } = load(root + '/src/main/database/restore-compatibilidad.ts')
const { leerDirectorioPostgres } = load(root + '/src/main/database/postgres-ruta.ts')
const clave = 'Conciliacion-prueba-2026!'
async function main() {
  const archivo = path.resolve(process.argv[2]),
    carpeta = path.dirname(archivo)
  assert.match(path.basename(carpeta), /^ruizcacao-tests-/)
  const config = JSON.parse(await fs.readFile(archivo, 'utf8'))
  const admin = new Client(config)
  await admin.connect()
  let base,
    creada = false
  const nombre = process.argv[3] || 'rcm_conciliacion_' + randomUUID().replaceAll('-', '')
  assert.match(nombre, /^rcm_conciliacion_[a-f0-9]{32}$/)
  try {
    assert.equal(
      (await fs.realpath(await leerDirectorioPostgres(admin))).toLowerCase(),
      (await fs.realpath(path.join(carpeta, 'motor/data'))).toLowerCase()
    )
    if (process.argv[3]) {
      base = new BaseLocal({ ...config, database: nombre })
      await base.iniciar()
      await base.login('Conciliacion', clave)
      const filas = (
        await base.pool.query(
          "SELECT fecha::text,fecha_hora_registro,monto,observacion FROM ruizcacao.gastos WHERE tipo='manual' ORDER BY monto"
        )
      ).rows
      console.log('PERSISTENCIA:' + JSON.stringify(filas))
      return
    }
    await admin.query('CREATE DATABASE "' + nombre + '"')
    creada = true
    base = new BaseLocal({ ...config, database: nombre })
    await base.iniciar()
    await base.crearAdministrador('Conciliacion', clave)
    await base.login('Conciliacion', clave)
    const exec = async (cmd, ...args) => (await base.ejecutar(randomUUID(), cmd, args)).resultado
    const fecha = hoy()
    const ayer = (await admin.query('SELECT ($1::date-1)::text fecha', [fecha])).rows[0].fecha
    const gasto = {
      fecha: ayer,
      categoria: 'Transporte',
      monto: 10,
      concepto: '',
      observacion: 'GASTO_PASADO'
    }
    await assert.rejects(exec('crearGastoManual', gasto), /jornada/)
    await base.jornada('abrir')
    for (const invalida of ['', '2026-02-30', '9999-01-01'])
      await assert.rejects(exec('crearGastoManual', { ...gasto, fecha: invalida }), /fecha/i)
    const instante = Date.now()
    await exec('crearGastoManual', gasto)
    await exec('crearGastoManual', { ...gasto, fecha, monto: 20, observacion: 'GASTO_HOY' })
    const gastos = (
      await base.pool.query(
        "SELECT fecha::text,fecha_hora_registro,monto,observacion FROM ruizcacao.gastos WHERE tipo='manual' ORDER BY monto"
      )
    ).rows
    assert.deepEqual(
      gastos.map((g) => g.fecha),
      [ayer, fecha]
    )
    assert.ok(gastos.every((g) => new Date(g.fecha_hora_registro).getTime() >= instante))
    console.log('PASS gastos: fecha pasada/actual, timestamp real, validación Main y jornada')
    const p = await exec('crearProveedor', {
      nombre: 'Proveedor conciliación',
      ciRuc: '',
      estado: true
    })
    const compra = (dia, total, pagado) =>
      exec('registrarCompra', {
        fecha: dia,
        proveedorId: p.id,
        producto: 'Cacao Seco',
        cantidadQq: 1,
        precioCompraQq: total,
        impuestoPorcentaje: 0,
        montoPagado: pagado,
        metodoPago: 'Efectivo'
      })
    const pendientes = await compra(ayer, 100, 0)
    const parcial = await compra(ayer, 100, 20)
    const pagada = await compra(ayer, 100, 100)
    const actual = await compra(fecha, 50, 50)
    assert.equal(actual.numeroCompra, pendientes.numeroCompra, 'Número diario no es ID único')
    assert.notEqual(actual.id, pendientes.id)
    for (const [c, monto] of [
      [pendientes, 30],
      [parcial, 40]
    ]) {
      const cuenta = (await base.cargar()).datos.cuentas.find((a) => a.compraId === c.id)
      await exec('registrarAbono', {
        cuentaId: cuenta.id,
        fecha,
        monto,
        tipo: 'Abono',
        metodoPago: 'Efectivo',
        observacion: 'Abono anterior'
      })
    }
    const cuentas = (await base.cargar()).datos.cuentas
    assert.equal(cuentas.find((c) => c.compraId === pagada.id).estado, 'cerrado')
    assert.equal(cuentas.find((c) => c.compraId === pendientes.id).montoPagado, 30)
    assert.equal(cuentas.find((c) => c.compraId === parcial.id).montoPagado, 60)
    async function revisar(desde, hasta, tipo, pagos, manuales) {
      const filtro = { desde, hasta, limite: 10 }
      const r = await base.reportePeriodo(filtro)
      assert.equal(r.resumen.totalComprasPagadas, pagos)
      assert.equal(r.resumen.totalGastosManuales, manuales)
      assert.equal(r.resumen.saldoPeriodo, -pagos - manuales)
      assert.equal(new Set(r.filas.map((f) => f.id)).size, r.filas.length)
      const v = (
        await base.pool.query(
          'SELECT coalesce(sum(monto),0)::text total FROM ruizcacao.v_flujo_caja WHERE fecha BETWEEN $1::date AND $2::date',
          [desde, hasta]
        )
      ).rows[0]
      assert.equal(Number(v.total), r.resumen.saldoPeriodo)
      const pdf = await base.documentoReporte(filtro, tipo)
      const n =
        (pdf.html.split('aria-label="Detalle financiero"')[1].match(/<tr>/g) || []).length - 1
      assert.equal(n, r.total)
      for (const f of r.filas)
        assert.ok(pdf.html.includes(f.detalle), 'Detalle PDF de cada movimiento')
      return r
    }
    const dia = await revisar(fecha, fecha, 'diario', 120, 20)
    await revisar(ayer, ayer, 'diario', 120, 10)
    assert.equal(dia.filas.filter((f) => f.tipo === 'Pago de compra').length, 3)
    const rangos = (
      await admin.query(
        `SELECT date_trunc('week',$1::date)::date::text semana,
      date_trunc('month',$1::date)::date::text mes`,
        [fecha]
      )
    ).rows[0]
    for (const [tipo, desde] of [
      ['semanal', rangos.semana],
      ['mensual', rangos.mes]
    ])
      await revisar(desde, fecha, tipo, ayer >= desde ? 240 : 120, ayer >= desde ? 30 : 20)
    console.log(
      'PASS compra pendiente/parcial/pagada, abonos anteriores, IDs, SQL/vista/PDF por períodos'
    )
    await base.anularOperacion(randomUUID(), 'compra', parcial.id, 'Regresión de exclusión', clave)
    await revisar(fecha, fecha, 'diario', 80, 20)
    await revisar(ayer, ayer, 'diario', 100, 10)
    console.log('PASS anulación excluye inicial y abono sin tocar gastos')
    // Una devolución manual expone la diferencia histórica conocida de la vista.
    const cli = await exec('crearCliente', {
      nombreRazonSocial: 'Cliente',
      identificacion: '',
      telefono: ''
    })
    await exec('crearCuentaManual', {
      clienteId: cli.id,
      tipo: 'Deuda manual',
      fecha: ayer,
      monto: 10,
      observacion: 'Fixture devolución'
    })
    const cuenta = (await base.cargar()).datos.cuentas.find((c) => c.origen === 'manual')
    await exec('registrarAbono', {
      cuentaId: cuenta.id,
      fecha,
      monto: 2,
      tipo: 'Ajuste por devolución',
      metodoPago: 'Efectivo',
      observacion: 'Fixture histórico'
    })
    const r = await revisar(fecha, fecha, 'diario', 80, 20)
    const db = await base.pool.connect()
    try {
      await db.query('BEGIN')
      await db.query(vistaFlujoHistorica)
      const v = (
        await db.query(
          'SELECT sum(monto)::text total FROM ruizcacao.v_flujo_caja WHERE fecha=$1::date',
          [fecha]
        )
      ).rows[0]
      assert.equal(Number(v.total), r.resumen.saldoPeriodo - 40 - 2)
      await db.query('ROLLBACK')
    } finally {
      db.release()
    }
    console.log(
      'PASS devolución y variante histórica documentadas, sin cambiar semántica del reporte'
    )
    await base.cerrar()
    base = undefined
    const reinicio = spawnSync(process.execPath, [__filename, archivo, nombre], {
      encoding: 'utf8',
      windowsHide: true
    })
    assert.equal(reinicio.status, 0, reinicio.stderr)
    const recuperados = JSON.parse(reinicio.stdout.split('PERSISTENCIA:')[1].split('\n')[0])
    assert.deepEqual(recuperados, JSON.parse(JSON.stringify(gastos)))
    console.log('PASS proceso nuevo: login y fechas/importes/instantes persistidos intactos')
  } finally {
    await base?.cerrar()
    if (creada) await admin.query('DROP DATABASE "' + nombre + '"')
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e.stack)
  process.exitCode = 1
})
