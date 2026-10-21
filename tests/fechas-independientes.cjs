const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { Client } = require('pg')
const { root, load } = require('./loader.cjs')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
const { leerDirectorioPostgres } = load(root + '/src/main/database/postgres-ruta.ts')
const { trazabilidadFinanciera } = load(root + '/src/shared/trazabilidadFinanciera.ts')
const { hoyOperacion, errorFechaMovimiento } = load(root + '/src/shared/fechasOperaciones.ts')
const out = path.join(root, 'docs/evidencias-fechas-independientes-1.3.2')
const clave = 'Fechas-fixture-2026!'
// Oráculo anterior del mismo repositorio; solo lectura, sin checkout ni escritura de fuentes.
function consultaAnterior() {
  const r = spawnSync('git', ['show', 'HEAD:src/main/database/listados.ts'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  })
  assert.equal(r.status, 0, r.stderr)
  const ts = require('typescript')
  const codigo = ts.transpileModule(r.stdout, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const m = { exports: {} }
  new Function('require', 'module', 'exports', codigo)(
    (nombre) =>
      nombre.startsWith('.')
        ? load(path.resolve(root, 'src/main/database', nombre) + '.ts')
        : require(nombre),
    m,
    m.exports
  )
  return m.exports.consultarListado
}
async function main() {
  const archivo = path.resolve(process.argv[2]),
    carpeta = path.dirname(archivo)
  assert.match(path.basename(carpeta), /^ruizcacao-tests-/)
  const config = JSON.parse(await fs.readFile(archivo, 'utf8'))
  const admin = new Client(config)
  await admin.connect()
  let base,
    creada = false
  const nombre = process.argv[3] || 'rcm_fechas_' + randomUUID().replaceAll('-', '')
  assert.match(nombre, /^rcm_fechas_[a-f0-9]{32}$/)
  await fs.mkdir(out, { recursive: true })
  const guardar = (n, v) => fs.writeFile(path.join(out, n), JSON.stringify(v, null, 2) + '\n')
  try {
    assert.equal(
      (await fs.realpath(await leerDirectorioPostgres(admin))).toLowerCase(),
      (await fs.realpath(path.join(carpeta, 'motor/data'))).toLowerCase()
    )
    if (process.argv[3]) {
      base = new BaseLocal({ ...config, database: nombre })
      await base.iniciar()
      await base.login('Fechas', clave)
      const d = (await base.cargar()).datos
      assert.deepEqual(
        {
          compras: d.compras,
          ventas: d.ventas,
          cuentas: d.cuentas,
          movimientos: d.movimientosCuenta,
          gastos: d.gastos
        },
        JSON.parse(await fs.readFile(path.join(out, 'estado-antes.json'), 'utf8'))
      )
      console.log('PASS proceso nuevo: fechas, importes, estados y saldos intactos')
      return
    }
    await admin.query('CREATE DATABASE "' + nombre + '"')
    creada = true
    base = new BaseLocal({ ...config, database: nombre })
    await base.iniciar()
    await assert.rejects(base.ejecutar(randomUUID(), 'registrarCompra', [{}]), /sesión/)
    await base.crearAdministrador('Fechas', clave)
    await base.login('Fechas', clave)
    const exec = async (cmd, ...args) => (await base.ejecutar(randomUUID(), cmd, args)).resultado
    const p = await exec('crearProveedor', { nombre: 'Proveedor fechas', ciRuc: '', estado: true })
    const cli = await exec('crearCliente', {
      nombreRazonSocial: 'Cliente fechas',
      identificacion: '',
      telefono: ''
    })
    const input = (fecha, fechaPagoInicial, total, pago) => ({
      fecha,
      fechaPagoInicial,
      proveedorId: p.id,
      producto: 'Cacao Seco',
      cantidadQq: 10,
      precioCompraQq: total / 10,
      impuestoPorcentaje: 0,
      montoPagado: pago,
      metodoPago: 'Efectivo'
    })
    await assert.rejects(
      exec('registrarCompra', input('2026-10-17', '2026-10-19', 100, 100)),
      /jornada/
    )
    await base.jornada('abrir')
    const a = await exec('registrarCompra', input('2026-10-17', '2026-10-17', 100, 100))
    const b = await exec('registrarCompra', input('2026-10-17', '2026-10-19', 162.12, 150))
    const pendiente = await exec('registrarCompra', input('2026-10-17', undefined, 300, 0))
    const cuotas = await exec('registrarCompra', input('2026-10-17', '2026-10-17', 500, 100))
    const cuenta = async (c) =>
      (await base.cargar()).datos.cuentas.find((x) => x.compraId === c.id || x.ventaId === c.id)
    const abono = async (cuentaId, fecha, monto, tipo = 'Abono') =>
      exec('registrarAbono', {
        cuentaId,
        fecha,
        monto,
        tipo,
        metodoPago: 'Efectivo',
        observacion: 'Cuota de prueba'
      })
    await abono((await cuenta(cuotas)).id, '2026-10-19', 200)
    await abono((await cuenta(cuotas)).id, '2026-10-20', 200)
    assert.equal((await cuenta(cuotas)).estado, 'cerrado')
    assert.equal((await cuenta(cuotas)).montoPagado, 500)
    assert.equal((await cuenta(b)).montoTotal - (await cuenta(b)).montoPagado, 12.120000000000005)
    assert.equal((await cuenta(pendiente)).estado, 'pendiente')
    await assert.rejects(abono((await cuenta(cuotas)).id, '2026-10-20', 1), /pago/)
    for (const [op, pago] of [
      ['2026-02-30', '2026-10-19'],
      ['9999-01-01', '9999-01-01'],
      ['2026-10-19', '2026-10-17'],
      ['2026-10-17', '2026-02-30']
    ])
      await assert.rejects(exec('registrarCompra', input(op, pago, 100, 50)), /fecha/i)
    const otroDia = await exec('registrarCompra', input('2026-10-19', '2026-10-19', 50, 50))
    assert.equal(a.numeroCompra, otroDia.numeroCompra)
    assert.notEqual(a.id, otroDia.id)
    const venta = await exec('registrarVenta', {
      fechaVenta: '2026-10-17',
      fechaCobroInicial: '2026-10-19',
      clienteId: cli.id,
      producto: 'Cacao Seco',
      pesoBruto: 1,
      precioUnitario: 400,
      impuestoPorcentaje: 0,
      montoRecibido: 100,
      metodoPago: 'Efectivo'
    })
    await abono((await cuenta(venta)).id, '2026-10-20', 300)
    const venta2 = await exec('registrarVenta', {
      fechaVenta: '2026-10-19',
      fechaCobroInicial: '2026-10-19',
      clienteId: cli.id,
      producto: 'Cacao Seco',
      pesoBruto: 1,
      precioUnitario: 20,
      impuestoPorcentaje: 0,
      montoRecibido: 20,
      metodoPago: 'Efectivo'
    })
    assert.equal(venta.numeroFactura, venta2.numeroFactura)
    assert.notEqual(venta.id, venta2.id)
    await exec('crearCuentaManual', {
      clienteId: cli.id,
      fecha: '2026-10-17',
      tipo: 'Deuda manual',
      monto: 50,
      observacion: 'Cuenta anterior'
    })
    const manual = (await base.cargar()).datos.cuentas.find((c) => c.origen === 'manual')
    await abono(manual.id, '2026-10-19', 10)
    await abono(manual.id, '2026-10-20', 2, 'Ajuste por devolución')
    await exec('crearGastoManual', {
      fecha: '2026-10-17',
      categoria: 'Transporte',
      monto: 7,
      observacion: 'Gasto retroactivo',
      concepto: ''
    })
    await exec('crearGastoManual', {
      fecha: hoyOperacion(),
      categoria: 'Otros',
      monto: 3,
      observacion: 'Gasto actual',
      concepto: ''
    })
    const antes = (await base.cargar()).datos
    const original = consultaAnterior()
    const resultados = []
    for (const [desde, hasta, tipo] of [
      ['2026-10-17', '2026-10-17', 'diario'],
      ['2026-10-19', '2026-10-19', 'diario'],
      ['2026-10-20', '2026-10-20', 'diario'],
      ['2026-10-12', '2026-10-18', 'semanal'],
      ['2026-10-19', '2026-10-25', 'semanal'],
      ['2026-10-01', '2026-10-31', 'mensual']
    ]) {
      const f = { desde, hasta, limite: 100 }
      const viejo = await original(base.pool, 'reportePeriodo', f)
      const nuevo = await base.reportePeriodo(f)
      assert.deepEqual(nuevo.resumen, viejo.resumen)
      const financiera = (f) =>
        Object.fromEntries(
          Object.entries(f).filter(([k]) => !['trazabilidad', 'tipo', 'concepto'].includes(k))
        )
      assert.deepEqual(nuevo.filas.map(financiera), viejo.filas.map(financiera))
      const todos = []
      let cursor
      do {
        const pag = await base.reportePeriodo({
          desde,
          hasta,
          limite: 10,
          ...(cursor ? { cursor } : {})
        })
        assert.deepEqual(pag.resumen, nuevo.resumen)
        todos.push(...pag.filas)
        cursor = pag.siguiente
      } while (cursor)
      assert.deepEqual(todos, nuevo.filas)
      assert.equal(new Set(todos.map((f) => f.id)).size, todos.length)
      for (const fila of nuevo.filas) {
        if (fila.tipo === 'Pago de compra' || fila.tipo === 'Cobro de venta')
          assert.match(fila.trazabilidad, /Fecha de (compra|venta): (17|19)\/10\/2026/)
        if (fila.tipo === 'Cobro de cuenta manual')
          assert.match(fila.trazabilidad, /Fecha de cuenta: 17\/10\/2026/)
        if (fila.detalle.includes('Gasto retroactivo'))
          assert.match(fila.trazabilidad, /Registrado:.*Guayaquil/)
        if (fila.detalle.includes('Gasto actual')) assert.equal(fila.trazabilidad, '')
      }
      const doc = await base.documentoReporte(f, tipo)
      for (const fila of todos) assert.ok(doc.html.includes(fila.trazabilidad))
      assert.equal(
        (doc.html.split('aria-label="Detalle financiero"')[1]?.match(/<tr>/g) || []).length - 1,
        todos.length
      )
      const prefijo = tipo + '-' + desde
      await fs.writeFile(path.join(out, prefijo + '.html'), doc.html)
      resultados.push({ desde, hasta, tipo, ...nuevo })
    }
    const porDia = Object.fromEntries(
      resultados.filter((r) => r.tipo === 'diario').map((r) => [r.desde, r.resumen])
    )
    assert.equal(porDia['2026-10-17'].totalComprasPagadas, 200)
    assert.equal(porDia['2026-10-19'].totalComprasPagadas, 400)
    assert.equal(porDia['2026-10-20'].totalComprasPagadas, 200)
    assert.equal(porDia['2026-10-19'].totalIngresos, 130)
    assert.equal(porDia['2026-10-20'].totalIngresos, 300)
    const sql = (
      await base.pool.query(
        `SELECT c.id compra_id,c.fecha::text fecha_compra,c.total,a.estado,a.monto_total-a.monto_aplicado saldo,m.id movimiento_id,m.fecha::text fecha_efectiva,m.monto FROM ruizcacao.compras c JOIN ruizcacao.cuentas a ON a.compra_id=c.id LEFT JOIN ruizcacao.movimientos_cuenta m ON m.cuenta_id=a.id ORDER BY c.orden,m.orden`
      )
    ).rows
    const audit = (
      await base.pool.query(
        'SELECT comando,creado_en FROM ruizcacao.operaciones ORDER BY creado_en'
      )
    ).rows
    await guardar('resultados.json', {
      estado: 'PASS',
      resultados,
      compras: sql,
      auditoria: audit,
      nota: 'Inserción PostgreSQL real en el día de ejecución; no se falsifica 19/10 como hora real.'
    })
    await guardar('estado-antes.json', {
      compras: antes.compras,
      ventas: antes.ventas,
      cuentas: antes.cuentas,
      movimientos: antes.movimientosCuenta,
      gastos: antes.gastos
    })
    await base.cerrar()
    base = undefined
    const reinicio = spawnSync(process.execPath, [__filename, archivo, nombre], {
      encoding: 'utf8',
      windowsHide: true
    })
    assert.equal(reinicio.status, 0, reinicio.stderr)
    await guardar('reinicio.json', { codigo: reinicio.status, salida: reinicio.stdout })
    base = new BaseLocal({ ...config, database: nombre })
    await base.iniciar()
    await base.login('Fechas', clave)
    const despues = (await base.cargar()).datos
    assert.deepEqual(
      {
        compras: despues.compras,
        ventas: despues.ventas,
        cuentas: despues.cuentas,
        movimientos: despues.movimientosCuenta,
        gastos: despues.gastos
      },
      JSON.parse(await fs.readFile(path.join(out, 'estado-antes.json'), 'utf8'))
    )
    await base.jornada('reabrir', clave)
    await base.anularOperacion(randomUUID(), 'compra', b.id, 'Regresión', clave)
    assert.equal(
      (await base.reportePeriodo({ desde: '2026-10-19', hasta: '2026-10-19' })).resumen
        .totalComprasPagadas,
      250
    )
    assert.equal(
      (await base.cargar()).datos.movimientosCuenta.length,
      antes.movimientosCuenta.length
    )
    // Referencia ausente: solo fixture, sin fallback a número repetido ni fecha de cuenta.
    await base.pool.query('UPDATE ruizcacao.cuentas SET compra_id=NULL WHERE compra_id=$1', [
      otroDia.id
    ])
    const sinOrigen = await base.reportePeriodo({ desde: '2026-10-19', hasta: '2026-10-19' })
    assert.ok(sinOrigen.filas.some((f) => f.trazabilidad === 'Fecha de compra: no disponible'))
    assert.equal(hoyOperacion(new Date('2026-10-20T04:59:59Z')), '2026-10-19')
    assert.equal(hoyOperacion(new Date('2026-10-20T05:00:00Z')), '2026-10-20')
    assert.equal(trazabilidadFinanciera('gasto', '2026-10-19', null, '2026-10-20T04:59:59Z'), '')
    assert.match(
      trazabilidadFinanciera('gasto', '2026-10-19', null, '2026-10-20T05:00:00Z'),
      /20\/10\/2026 00:00:00/
    )
    assert.equal(trazabilidadFinanciera('gasto', '2026-10-19', null, 'inválido'), '')
    assert.ok(errorFechaMovimiento('2026-02-30', '2026-02-01'))
    await guardar('cierre.json', {
      estado: 'PASS',
      persistencia: 'PASS',
      anulaciones: 'PASS',
      referenciaAusente: 'PASS',
      limitesGuayaquil: 'PASS',
      diferenciasImportes: 0
    })
    console.log(
      'PASS fechas independientes: escenarios, cuotas, ventas/manuales, SQL anterior=nuevo, keyset/PDF, reinicio, anulaciones y Guayaquil'
    )
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
