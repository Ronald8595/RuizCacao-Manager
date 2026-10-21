// Reconstrucción observada + hipótesis declaradas. Solo acepta el motor de tests/run.cjs.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { spawn } = require('node:child_process')
const { Client } = require('pg')
const { root, load } = require('./loader.cjs')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
const { leerDirectorioPostgres } = load(root + '/src/main/database/postgres-ruta.ts')
const salida = path.join(root, 'docs/evidencias-conciliacion-1.3.2/reproduccion')
const clave = 'Fixture-aislado-2026!'
const dia = '2026-10-19'
// Número, producto, qq, total: transcripción de las tres capturas de Compras.
const observadas = [
  [1, 'Baba', 0.67, 40.7],
  [2, 'Baba', 0.43, 26.66],
  [3, 'Baba', 1.38, 84],
  [4, 'Baba', 3.96, 71],
  [5, 'Baba', 0.45, 27.78],
  [6, 'Baba', 1.9, 117.29],
  [7, 'Baba', 0.53, 33],
  [8, 'Baba', 1.08, 68.04],
  [9, 'Baba', 0.29, 23.2],
  [10, 'Baba', 0.6, 41.58],
  [11, 'Baba', 0.32, 20],
  [12, 'Baba', 0.44, 27],
  [13, 'Seco', 0.24, 51],
  [14, 'Seco', 7.05, 1519.98],
  [15, 'Seco', 0.84, 180.6],
  [16, 'Seco', 2.74, 522.57],
  [17, 'Seco', 2.74, 589],
  [18, 'Seco', 0.58, 122],
  [19, 'Seco', 0.3, 21],
  [20, 'Seco', 0.52, 109]
].map(([numero, producto, cantidadQq, total]) => ({
  numero,
  producto: producto === 'Baba' ? 'Cacao en Baba' : 'Cacao Seco',
  cantidadQq,
  total
}))
const adicionales = [
  ['Compra N. 38', 'Cacao Seco', 600],
  ['Compra N. 39', 'Cacao en Baba', 171.36],
  ['Compra N. 20', 'Cacao Seco', 1500],
  ['Compra N. 18', 'Cacao Seco', 1000]
]
const centavos = (v) => Math.round(Number(v) * 100)
const guardar = (nombre, valor) =>
  fs.writeFile(path.join(salida, nombre), JSON.stringify(valor, null, 2) + '\n')
async function electron(config, nombre, fase) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  await new Promise((resolve, reject) => {
    const child = spawn(
      require('electron'),
      [path.join(__dirname, 'reproduccion-cliente-ui.cjs'), config, nombre, fase],
      { env, windowsHide: true, stdio: 'inherit' }
    )
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(Error('UI ' + fase + ': ' + code))))
  })
}
async function main() {
  const archivo = path.resolve(process.argv[2])
  const carpeta = path.dirname(archivo)
  assert.match(path.basename(carpeta), /^ruizcacao-tests-/)
  const config = JSON.parse(await fs.readFile(archivo, 'utf8'))
  const admin = new Client(config)
  await admin.connect()
  const bases = []
  let base
  await fs.mkdir(salida, { recursive: true })
  const nueva = async () => {
    const nombre = 'rcm_repro_' + randomUUID().replaceAll('-', '')
    await admin.query('CREATE DATABASE "' + nombre + '"')
    bases.push(nombre)
    base = new BaseLocal({ ...config, database: nombre })
    await base.iniciar()
    await base.crearAdministrador('Fixture', clave)
    await base.login('Fixture', clave)
    await base.jornada('abrir')
    return nombre
  }
  const exec = async (cmd, ...args) => (await base.ejecutar(randomUUID(), cmd, args)).resultado
  const compra = (proveedor, fecha, producto, cantidadQq, total, pagado) =>
    exec('registrarCompra', {
      proveedorId: proveedor.id,
      fecha,
      producto,
      cantidadQq,
      precioCompraQq: total / cantidadQq,
      impuestoPorcentaje: 0,
      montoPagado: pagado,
      metodoPago: 'Efectivo'
    })
  const cuentaDe = async (c) => (await base.cargar()).datos.cuentas.find((a) => a.compraId === c.id)
  const abonar = async (c, monto, fecha = dia) =>
    exec('registrarAbono', {
      cuentaId: (await cuentaDe(c)).id,
      fecha,
      monto,
      tipo: 'Abono',
      metodoPago: 'Efectivo',
      observacion: 'HIPÓTESIS: pago de compra anterior'
    })
  const movimientos = async () =>
    (
      await base.pool.query(`
    SELECT m.id movimiento_id,m.cuenta_id,c.compra_id,p.numero_compra,
      p.fecha::text fecha_compra,p.producto,p.cantidad_qq,p.total AS total_compra,
      m.fecha::text fecha_pago,m.tipo,m.monto,c.monto_aplicado AS monto_pagado,c.monto_total,c.estado
    FROM ruizcacao.movimientos_cuenta m
    JOIN ruizcacao.cuentas c ON c.id=m.cuenta_id
    LEFT JOIN ruizcacao.compras p ON p.id=c.compra_id ORDER BY m.orden`)
    ).rows
  try {
    assert.equal(
      (await fs.realpath(await leerDirectorioPostgres(admin))).toLowerCase(),
      (await fs.realpath(path.join(carpeta, 'motor/data'))).toLowerCase()
    )
    if (!process.argv.includes('--solo-b')) {
      const nombre = await nueva()
      const proveedor = await exec('crearProveedor', {
        nombre: 'GALO RUIZ',
        ciRuc: '',
        estado: true
      })
      const trazabilidad = []
      for (const o of observadas) {
        const c = await compra(proveedor, dia, o.producto, o.cantidadQq, o.total, o.total)
        assert.equal(c.numeroCompra, o.numero)
        assert.equal(centavos(c.totalCompra), centavos(o.total))
        trazabilidad.push({ observado: o, compraFixture: c })
      }
      const hipotesis = []
      for (const [etiqueta, producto, monto] of adicionales) {
        const c = await compra(proveedor, '2026-10-18', producto, 1, monto, 0)
        assert.equal((await cuentaDe(c)).estado, 'pendiente')
        await abonar(c, monto)
        assert.equal((await cuentaDe(c)).estado, 'cerrado')
        hipotesis.push({ etiquetaObservada: etiqueta, compraFixture: c })
      }
      await guardar('datos-observados.json', {
        fuentes: [
          '01_compras_pagina1_superior.jpg',
          '02_compras_pagina1_inferior.jpg',
          '03_compras_pagina2.jpg',
          '04_reporte_diario.jpg',
          '05_detalle_tramo_superior.png',
          '06_detalle_tramo_intermedio.png',
          '07_detalle_tramo_inferior.png',
          '08_video_original.mp4'
        ],
        observadas: trazabilidad,
        hipotesis,
        advertencia:
          'IDs exclusivos del fixture. No son los IDs del cliente. Precios unitarios=total/qq e impuesto 0 son auxiliares sintéticos; no se observaron en las capturas. Las cuatro compras anteriores, sus fechas, cantidades, números diarios y vínculos son hipotéticos. Las etiquetas observadas NO se presentan como números reales de esas compras inventadas.'
      })
      await base.cerrar()
      base = undefined
      await electron(archivo, nombre, 'crear')
      await electron(archivo, nombre, 'reabrir')
      base = new BaseLocal({ ...config, database: nombre })
      await base.iniciar()
      await base.login('Fixture', clave)
      const h = await base.historialCompras({ desde: dia, hasta: dia, limite: 50 })
      assert.equal(h.total, 20)
      for (const [producto, n, qq, total] of [
        ['Cacao en Baba', 12, 12.05, 580.25],
        ['Cacao Seco', 8, 15.01, 3115.15]
      ]) {
        const filas = h.filas.filter((c) => c.producto === producto)
        assert.equal(filas.length, n)
        assert.equal(centavos(filas.reduce((s, c) => s + c.cantidadQq, 0)), centavos(qq))
        assert.equal(
          filas.reduce((s, c) => s + centavos(c.totalCompra), 0),
          centavos(total)
        )
      }
      const movs = await movimientos()
      assert.equal(movs.length, 24)
      assert.equal(new Set(movs.map((m) => m.movimiento_id)).size, 24)
      assert.equal(
        movs.reduce((s, m) => s + centavos(m.monto), 0),
        696676
      )
      assert.ok(
        movs.every(
          (m) => m.estado === 'cerrado' && centavos(m.monto_pagado) === centavos(m.monto_total)
        )
      )
      await guardar('movimientos-A.json', movs)
      const resultados = []
      for (const [tipo, desde, hasta] of [
        ['diario', dia, dia],
        ['semanal', dia, '2026-10-25'],
        ['mensual', '2026-10-01', '2026-10-31']
      ]) {
        let resumen
        for (const limite of [10, 15, 25, 50, 100]) {
          const filas = []
          let cursor
          do {
            const r = await base.reportePeriodo({
              desde,
              hasta,
              limite,
              ...(cursor ? { cursor } : {})
            })
            assert.equal(r.total, 28)
            assert.equal(r.resumen.totalComprasPagadas, 6966.76)
            assert.equal(r.resumen.totalGastosManuales, 190)
            assert.equal(r.resumen.totalIngresos, 0)
            assert.equal(r.resumen.saldoPeriodo, -7156.76)
            if (resumen) assert.deepEqual(r.resumen, resumen)
            resumen = r.resumen
            filas.push(...r.filas)
            cursor = r.siguiente
          } while (cursor)
          assert.equal(filas.length, 28)
          assert.equal(new Set(filas.map((f) => f.id)).size, 28)
          assert.equal(filas.filter((f) => f.tipo === 'Pago de compra').length, 24)
          const pdf = await base.documentoReporte({ desde, hasta, limite }, tipo)
          assert.equal(
            (pdf.html.split('aria-label="Detalle financiero"')[1].match(/<tr>/g) || []).length - 1,
            28
          )
          for (const f of filas) assert.ok(pdf.html.includes(f.detalle))
        }
        resultados.push({ tipo, resumen, filas: 28, limites: [10, 15, 25, 50, 100] })
      }
      assert.equal(resultados[0].resumen.desgloseProductos['Cacao en Baba'].pagosCompras, 751.61)
      assert.equal(resultados[0].resumen.desgloseProductos['Cacao Seco'].pagosCompras, 6215.15)
      await guardar('escenario-A.json', { estado: 'PASS', compras: 3695.4, resultados })
      console.log(
        'PASS A: 20 compras observadas, 24 pagos únicos, 4 gastos UI; SQL/keyset/PDF diario/semanal/mensual'
      )
      await base.cerrar()
      base = undefined
    }
    await nueva()
    const p = await exec('crearProveedor', {
      nombre: 'Proveedor B sintético',
      ciRuc: '',
      estado: true
    })
    const parcial = await compra(p, dia, 'Cacao Seco', 1, 100, 20)
    const repetida = await compra(p, '2026-10-18', 'Cacao Seco', 1, 200, 0)
    assert.equal(parcial.numeroCompra, repetida.numeroCompra)
    assert.notEqual(parcial.id, repetida.id)
    await abonar(parcial, 30)
    assert.equal((await cuentaDe(parcial)).estado, 'parcial')
    assert.equal((await cuentaDe(parcial)).montoPagado, 50)
    assert.equal((await cuentaDe(repetida)).estado, 'pendiente')
    await abonar(parcial, 50)
    assert.equal((await cuentaDe(parcial)).estado, 'cerrado')
    await assert.rejects(
      abonar(parcial, 1),
      /El pago debe estar entre 0 y el total de la operación/
    )
    await assert.rejects(
      exec('registrarAbono', {
        cuentaId: (await cuentaDe(repetida)).id,
        fecha: dia,
        monto: 2,
        tipo: 'Ajuste por devolución',
        metodoPago: 'Efectivo',
        observacion: 'Prueba'
      }),
      /abono|compra|tipo/i
    )
    let r = await base.reportePeriodo({ desde: dia, hasta: dia, limite: 100 })
    assert.equal(r.resumen.totalComprasPagadas, 100)
    assert.equal(r.filas.length, 3)
    const antes = await movimientos()
    assert.equal(new Set(antes.map((m) => m.movimiento_id)).size, 3)
    await base.anularOperacion(randomUUID(), 'compra', parcial.id, 'Prueba aislada', clave)
    r = await base.reportePeriodo({ desde: dia, hasta: dia, limite: 100 })
    assert.equal(r.resumen.totalComprasPagadas, 0)
    assert.equal(r.filas.length, 0)
    assert.equal((await cuentaDe(parcial)).estado, 'anulado')
    assert.equal((await movimientos()).length, 3, 'Anulación conserva trazabilidad')
    const cliente = await exec('crearCliente', {
      nombreRazonSocial: 'Cliente B',
      identificacion: '',
      telefono: ''
    })
    await exec('crearCuentaManual', {
      clienteId: cliente.id,
      tipo: 'Deuda manual',
      fecha: dia,
      monto: 10,
      observacion: 'Fixture B'
    })
    const manual = (await base.cargar()).datos.cuentas.find((c) => c.origen === 'manual')
    await exec('registrarAbono', {
      cuentaId: manual.id,
      fecha: dia,
      monto: 2,
      tipo: 'Ajuste por devolución',
      metodoPago: 'Efectivo',
      observacion: 'Fixture B'
    })
    const final = (await base.cargar()).datos.cuentas.find((c) => c.id === manual.id)
    assert.equal(final.montoPagado, 2)
    assert.equal(final.estado, 'parcial')
    assert.equal((await base.reportePeriodo({ desde: dia, hasta: dia })).resumen.saldoPeriodo, 0)
    await guardar('escenario-B.json', {
      estado: 'PASS',
      movimientosAntesAnular: antes,
      movimientosDespues: await movimientos(),
      numeroDiarioRepetido: { numero: parcial.numeroCompra, ids: [parcial.id, repetida.id] },
      devolucion: {
        cuenta: final,
        efectoCajaReporte: 0,
        politica: 'Ajuste de cuenta manual; no Abono efectivo. Compra solo admite Abono.'
      }
    })
    console.log(
      'PASS B: inicial/abonos una vez, cerrado rechaza sobrepago, números repetidos, anulación, devolución'
    )
  } finally {
    await base?.cerrar()
    for (const nombre of bases) await admin.query('DROP DATABASE "' + nombre + '"')
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e.stack)
  process.exitCode = 1
})
