// Fixtures únicamente en el clúster efímero de db:test; nunca conexión de la aplicación.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { Client } = require('pg')
const { root, load } = require('./loader.cjs')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
const { conceptosCuenta } = load(root + '/src/shared/conceptoPago.ts')
const out = path.join(root, 'docs/evidencias-pagos-efectuados-1.3.2')
const clave = 'Pagos-fixture-2026!'
function original() {
  const r = spawnSync('git', ['show', 'HEAD:src/main/database/listados.ts'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  })
  assert.equal(r.status, 0)
  const codigo = require('typescript').transpileModule(r.stdout, {
    compilerOptions: { module: 1, target: 9, esModuleInterop: true }
  }).outputText
  const m = { exports: {} }
  new Function('require', 'module', 'exports', codigo)(
    (n) =>
      n.startsWith('.') ? load(path.resolve(root, 'src/main/database', n) + '.ts') : require(n),
    m,
    m.exports
  )
  return m.exports.consultarListado
}
async function main() {
  const archivo = path.resolve(process.argv[2]),
    carpeta = path.dirname(archivo)
  assert.match(path.basename(carpeta), /^ruizcacao-tests-/)
  const config = JSON.parse(await fs.readFile(archivo, 'utf8')),
    admin = new Client(config)
  await admin.connect()
  const nombre = process.argv[3] || 'rcm_pagos_' + randomUUID().replaceAll('-', '')
  assert.match(nombre, /^rcm_pagos_[a-f0-9]{32}$/)
  let base,
    creada = false
  await fs.mkdir(out, { recursive: true })
  const guardar = (n, v) => fs.writeFile(path.join(out, n), JSON.stringify(v, null, 2) + '\n')
  try {
    const real = (await admin.query('SHOW data_directory')).rows[0].data_directory
    assert.equal(
      (await fs.realpath(real)).toLowerCase(),
      (await fs.realpath(path.join(carpeta, 'motor/data'))).toLowerCase()
    )
    if (process.argv[3]) {
      base = new BaseLocal({ ...config, database: nombre })
      await base.iniciar()
      await base.login('Pagos', clave)
      const esperado = JSON.parse(await fs.readFile(path.join(out, 'reinicio-antes.json'), 'utf8'))
      const actuales = (await base.cargar()).datos
      for (const campo of ['compras', 'ventas', 'cuentas', 'movimientosCuenta', 'gastos', 'stock'])
        assert.deepEqual(actuales[campo], esperado.datos[campo])
      assert.equal(
        actuales.jornada.estado,
        'finalizada',
        'Cierre normal conserva política de jornada'
      )
      assert.deepEqual(await base.reportePeriodo(esperado.filtro), esperado.reporte)
      console.log('PASS nuevo proceso: datos, fechas, importes, etiquetas y saldos idénticos')
      return
    }
    await admin.query('CREATE DATABASE "' + nombre + '"')
    creada = true
    base = new BaseLocal({ ...config, database: nombre })
    await base.iniciar()
    await assert.rejects(base.reportePeriodo({ categoria: 'pagos' }), /sesión/)
    await base.crearAdministrador('Pagos', clave)
    await base.login('Pagos', clave)
    await base.jornada('abrir')
    const exec = async (cmd, ...args) => (await base.ejecutar(randomUUID(), cmd, args)).resultado
    const p = await exec('crearProveedor', { nombre: 'Proveedor pagos', ciRuc: '', estado: true })
    const cli = await exec('crearCliente', {
      nombreRazonSocial: 'Cliente pagos',
      identificacion: '',
      telefono: ''
    })
    const compra = (fecha, total, pagado, fechaPagoInicial = fecha) =>
      exec('registrarCompra', {
        fecha,
        fechaPagoInicial,
        proveedorId: p.id,
        producto: 'Cacao en Baba',
        cantidadQq: 1,
        precioCompraQq: total,
        impuestoPorcentaje: 0,
        montoPagado: pagado,
        metodoPago: 'Efectivo'
      })
    const venta = (total, pago) =>
      exec('registrarVenta', {
        fechaVenta: '2026-10-19',
        fechaCobroInicial: '2026-10-19',
        clienteId: cli.id,
        producto: 'Cacao en Baba',
        pesoBruto: 0.1,
        precioUnitario: total * 10,
        impuestoPorcentaje: 0,
        montoRecibido: pago,
        metodoPago: 'Efectivo'
      })
    const cuenta = async (op) =>
      (await base.cargar()).datos.cuentas.find((c) => c.compraId === op.id || c.ventaId === op.id)
    const pagar = async (op, fecha, monto, tipo = 'Abono') =>
      exec('registrarAbono', {
        cuentaId: (await cuenta(op)).id,
        fecha,
        monto,
        tipo,
        metodoPago: 'Efectivo',
        observacion: 'Nota del usuario intacta'
      })
    const caso = await compra('2026-10-19', 162.12, 0)
    assert.equal(caso.numeroCompra, 1)
    const abono = await pagar(caso, '2026-10-20', 150)
    const total = await compra('2026-10-20', 501.22, 501.22)
    assert.equal(total.numeroCompra, 1)
    assert.notEqual(total.id, caso.id)
    await exec('crearGastoManual', {
      fecha: '2026-10-20',
      categoria: 'Otros',
      monto: 20,
      observacion: 'Gasto operativo de prueba',
      concepto: ''
    })
    const filtro = { desde: '2026-10-20', hasta: '2026-10-20', categoria: 'pagos', limite: 100 }
    const pagosCaso = await base.reportePeriodo(filtro)
    assert.equal(pagosCaso.total, 3)
    assert.equal(pagosCaso.resumen.totalComprasPagadas, 651.22)
    assert.equal(pagosCaso.resumen.totalGastosManuales, 20)
    const fila = pagosCaso.filas.find((f) => f.id === abono.movimiento.id)
    assert.equal(fila.monto, -150)
    assert.equal(fila.fecha, '2026-10-20')
    assert.equal(fila.concepto, 'Abono a compra')
    assert.equal(fila.trazabilidad, 'Fecha de compra: 19/10/2026')
    assert.equal(
      Math.round(((await cuenta(caso)).montoTotal - (await cuenta(caso)).montoPagado) * 100),
      1212
    )
    const lista19 = await base.listadoGastos({ desde: '2026-10-19', hasta: '2026-10-19' })
    const lista20 = await base.listadoGastos({ desde: '2026-10-20', hasta: '2026-10-20' })
    assert.ok(lista19.filas.some((g) => g.compra_id === caso.id))
    assert.ok(!lista20.filas.some((g) => g.compra_id === caso.id))
    await guardar('caso-150.json', {
      estado: 'PASS',
      compra: caso,
      cuenta: await cuenta(caso),
      pagos: pagosCaso,
      lista19,
      lista20
    })
    const docCaso = await base.documentoReporte(
      { desde: filtro.desde, hasta: filtro.hasta },
      'diario'
    )
    await fs.writeFile(path.join(out, 'caso-150.html'), docCaso.html)
    const parcial = await compra('2026-10-17', 500, 100)
    await pagar(parcial, '2026-10-19', 200)
    await pagar(parcial, '2026-10-20', 200)
    const cobroTotal = await venta(40, 40),
      cobroParcial = await venta(300, 100)
    await pagar(cobroParcial, '2026-10-19', 50)
    await pagar(cobroParcial, '2026-10-20', 150)
    // Un abono de fecha anterior se inserta después: la etiqueta sigue el saldo anterior real.
    const retro = await compra('2026-10-17', 100, 0)
    await pagar(retro, '2026-10-20', 30)
    const liquidacionRetro = await pagar(retro, '2026-10-19', 70)
    await exec('crearCuentaManual', {
      clienteId: cli.id,
      tipo: 'Deuda manual',
      fecha: '2026-10-17',
      monto: 50,
      observacion: 'Deuda migrada'
    })
    const manual = (await base.cargar()).datos.cuentas.find((c) => c.origen === 'manual')
    await exec('registrarAbono', {
      cuentaId: manual.id,
      fecha: '2026-10-20',
      monto: 10,
      tipo: 'Abono',
      metodoPago: 'Efectivo',
      observacion: 'Cuenta sin operación'
    })
    await pagar(cobroParcial, '2026-10-20', 2, 'Ajuste por devolución')
    // Registro histórico con observación automática antigua: solo se corrige la presentación.
    await base.pool.query(
      "UPDATE ruizcacao.movimientos_cuenta SET observacion='Pago inicial registrado en la venta' WHERE cuenta_id=$1",
      [(await cuenta(cobroTotal)).id]
    )
    const antes = (
      await base.pool.query('SELECT * FROM ruizcacao.movimientos_cuenta ORDER BY orden')
    ).rows
    const originalConsulta = original(),
      resultados = []
    for (const [desde, hasta, tipo] of [
      ['2026-10-20', '2026-10-20', 'diario'],
      ['2026-10-19', '2026-10-25', 'semanal'],
      ['2026-10-01', '2026-10-31', 'mensual']
    ]) {
      const f = { desde, hasta, limite: 100 },
        nuevo = await base.reportePeriodo(f),
        viejo = await originalConsulta(base.pool, 'reportePeriodo', f)
      assert.deepEqual(nuevo.resumen, viejo.resumen)
      const financiero = (f) => ({
        id: f.id,
        fecha: f.fecha,
        orden: f.orden,
        monto: f.monto,
        producto: f.producto
      })
      assert.deepEqual(nuevo.filas.map(financiero), viejo.filas.map(financiero))
      const pagos = await base.reportePeriodo({ ...f, categoria: 'pagos' })
      assert.deepEqual(
        pagos.filas,
        nuevo.filas.filter((f) => f.monto < 0)
      )
      assert.equal(pagos.resumen.totalComprasPagadas, nuevo.resumen.totalComprasPagadas)
      assert.equal(pagos.resumen.totalGastosManuales, nuevo.resumen.totalGastosManuales)
      let cursor,
        filas = []
      do {
        const pag = await base.reportePeriodo({
          ...f,
          categoria: 'pagos',
          limite: 10,
          ...(cursor ? { cursor } : {})
        })
        filas.push(...pag.filas)
        cursor = pag.siguiente
      } while (cursor)
      assert.deepEqual(filas, pagos.filas)
      const doc = await base.documentoReporte(f, tipo)
      for (const f of nuevo.filas) assert.ok(doc.html.includes(f.concepto ?? f.tipo))
      await fs.writeFile(path.join(out, tipo + '.html'), doc.html)
      resultados.push({ tipo, desde, hasta, ...nuevo })
    }
    assert.deepEqual(
      (await base.pool.query('SELECT * FROM ruizcacao.movimientos_cuenta ORDER BY orden')).rows,
      antes
    )
    const mensual = resultados.find((r) => r.tipo === 'mensual'),
      etiquetas = mensual.filas.map((f) => f.concepto)
    for (const e of [
      'Pago total de compra',
      'Cobro total de venta',
      'Abono inicial de compra',
      'Abono inicial de venta',
      'Abono a compra',
      'Abono a venta',
      'Liquidación de compra',
      'Liquidación de venta',
      'Cobro de cuenta manual'
    ])
      assert.ok(etiquetas.includes(e), e)
    assert.equal(
      mensual.filas.find((f) => f.id === liquidacionRetro.movimiento.id).concepto,
      'Liquidación de compra'
    )
    assert.ok(!mensual.filas.some((f) => f.detalle.includes('Pago inicial registrado en la venta')))
    const datos = (await base.cargar()).datos
    for (const c of datos.cuentas) {
      const op =
        datos.compras.find((x) => x.id === c.compraId) ||
        datos.ventas.find((x) => x.id === c.ventaId)
      const conceptos = conceptosCuenta(c, op, datos.movimientosCuenta)
      for (const m of datos.movimientosCuenta.filter(
        (m) => m.cuentaId === c.id && m.tipo === 'Abono'
      ))
        assert.equal(conceptos.get(m.id), mensual.filas.find((f) => f.id === m.id).concepto)
    }
    const reporte = await base.reportePeriodo(filtro)
    await guardar('resultados.json', {
      estado: 'PASS',
      resultados,
      nota: 'Fixtures sintéticos; no son datos del cliente.'
    })
    await guardar('reinicio-antes.json', { datos, filtro, reporte })
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
    await base.login('Pagos', clave)
    await base.jornada('reabrir', clave)
    await base.anularOperacion(randomUUID(), 'compra', total.id, 'Prueba anulación', clave)
    const anulado = await base.reportePeriodo(filtro)
    assert.equal(
      anulado.resumen.totalComprasPagadas,
      Math.round((reporte.resumen.totalComprasPagadas - 501.22) * 100) / 100
    )
    // Historial incompleto o referencia perdida: no fabricar una clasificación.
    await base.pool.query(
      'UPDATE ruizcacao.cuentas SET monto_aplicado=monto_aplicado+1 WHERE compra_id=$1',
      [caso.id]
    )
    assert.match(
      (await base.reportePeriodo(filtro)).filas.find((f) => f.id === abono.movimiento.id).concepto,
      /historial no verificable/
    )
    await assert.rejects(base.reportePeriodo({ categoria: 'invalida' }))
    console.log(
      'PASS pagos: 150 del 20/10; saldo 12.12; 501.22 sin duplicar; gastos 20; etiquetas; SQL/keyset/PDF/totales equivalentes; reinicio; anulaciones e historial ambiguo'
    )
  } finally {
    await base?.cerrar()
    if (creada) await admin.query('DROP DATABASE "' + nombre + '" WITH (FORCE)')
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e.stack)
  process.exitCode = 1
})
