// Prueba focalizada: un motor nuevo y unas pocas operaciones por APIs reales.
// No lee conexiones de la aplicación, no usa seed ni ejecuta perfiles.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { join } = require('node:path')
const os = require('node:os')
const { randomUUID, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto')
const { load, root } = require('./loader.cjs')
const { conProductos } = require('./finanzas-oraculo.cjs')
const { BaseLocal, hoy } = load(root + '/src/main/database/base.ts')
const { PostgresLocal, localizarPostgres } = load(root + '/src/main/database/postgres-local.ts')
const { resumirPeriodo } = load(root + '/src/renderer/src/utils/reportes.ts')
const { documentoReporte } = load(root + '/src/renderer/src/utils/reportePdf.ts')
const centavos = (n) => Math.round(n * 100)
async function main() {
  const carpeta = await fs.mkdtemp(join(os.tmpdir(), 'ruizcacao-desglose-'))
  const key = randomBytes(32)
  const motor = new PostgresLocal({
    carpeta: join(carpeta, 'motor'),
    binarios: await localizarPostgres(join(root, 'vendor')),
    cifrar: (texto) => {
      const iv = randomBytes(12),
        c = createCipheriv('aes-256-gcm', key, iv)
      const bytes = Buffer.concat([c.update(texto, 'utf8'), c.final()])
      return Buffer.concat([iv, c.getAuthTag(), bytes])
    },
    descifrar: (bytes) => {
      const c = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
      c.setAuthTag(bytes.subarray(12, 28))
      return Buffer.concat([c.update(bytes.subarray(28)), c.final()]).toString('utf8')
    }
  })
  let base
  const evidencia = { carpeta, comprobaciones: [], exito: false }
  const ok = (nombre) => {
    evidencia.comprobaciones.push(nombre)
    console.log('OK ' + nombre)
  }
  try {
    base = new BaseLocal(await motor.iniciar())
    await base.iniciar()
    const clave = 'Desglose-prueba-2026!'
    await base.crearAdministrador('Desglose', clave)
    await base.login('Desglose', clave)
    await base.jornada('abrir')
    const ejecutar = async (comando, ...args) =>
      (await base.ejecutar(randomUUID(), comando, args)).resultado
    const cliente = await ejecutar('crearCliente', {
      nombreRazonSocial: 'Cliente prueba',
      identificacion: '',
      telefono: ''
    })
    const proveedor = await ejecutar('crearProveedor', {
      nombre: 'Proveedor prueba',
      ciRuc: '',
      estado: true
    })
    const fecha = hoy()
    const ayer = (await base.pool.query('SELECT ($1::date-1)::text fecha', [fecha])).rows[0].fecha
    const productos = ['Cacao en Baba', 'Cacao Seco', 'Maracuyá']
    const compras = [],
      ventas = []
    for (const [i, producto] of productos.entries()) {
      compras.push(
        await ejecutar('registrarCompra', {
          fecha: ayer,
          proveedorId: proveedor.id,
          producto,
          cantidadQq: 10,
          precioCompraQq: 10,
          impuestoPorcentaje: 0,
          montoPagado: (i + 1) * 10.11,
          metodoPago: 'Efectivo'
        })
      )
      ventas.push(
        await ejecutar('registrarVenta', {
          fechaVenta: ayer,
          clienteId: cliente.id,
          producto,
          pesoBruto: 1,
          precioUnitario: 50,
          impuestoPorcentaje: 0,
          montoRecibido: (i + 1) * 1.11,
          metodoPago: 'Efectivo'
        })
      )
    }
    await ejecutar('registrarConversionCacao', {
      fecha,
      cacaoBabaUtilizadoQq: 4,
      factorConversion: 4
    })
    for (let i = 0; i < productos.length; i++) {
      const estado = (await base.cargar()).datos
      for (const [campo, origen, monto] of [
        ['compraId', compras[i], 5.01 + i],
        ['ventaId', ventas[i], 4.04 + i]
      ]) {
        const cuenta = estado.cuentas.find((c) => c[campo] === origen.id)
        await ejecutar('registrarAbono', {
          cuentaId: cuenta.id,
          fecha,
          monto,
          tipo: 'Abono',
          metodoPago: 'Efectivo',
          observacion: 'Abono posterior ' + productos[i]
        })
      }
    }
    await ejecutar('crearGastoManual', {
      fecha,
      categoria: 'Transporte',
      monto: 7.25,
      metodoPago: 'Efectivo',
      observacion: '<Gasto de prueba>'
    })
    const periodo = { desde: ayer, hasta: fecha, limite: 10 }
    async function verificar(filtro) {
      const antes = (await base.cargar()).datos
      const anterior = resumirPeriodo(
        antes.ventas,
        antes.gastos,
        filtro.desde,
        filtro.hasta,
        antes.movimientosCuenta,
        antes.cuentas,
        antes.compras
      )
      const esperado = conProductos(antes, anterior)
      const { filas: esperadas, ...totales } = esperado
      let cursor = null,
        filas = [],
        paginas = 0
      do {
        const pagina = await base.reportePeriodo({ ...filtro, cursor })
        assert.deepEqual(pagina.resumen, totales)
        assert.equal(pagina.total, esperadas.length)
        assert.ok(pagina.filas.length <= (filtro.limite ?? 15))
        filas.push(...pagina.filas)
        cursor = pagina.siguiente
        assert.ok(++paginas < 20)
      } while (cursor)
      assert.deepEqual(filas, esperadas)
      for (const campo of [
        'totalIngresos',
        'totalComprasPagadas',
        'totalGastosManuales',
        'totalGastos',
        'saldoPeriodo'
      ])
        assert.equal(totales[campo], anterior[campo], 'Total histórico intacto: ' + campo)
      assert.equal(
        Object.values(totales.desgloseProductos).reduce((s, g) => s + centavos(g.ingresos), 0),
        centavos(anterior.totalIngresos)
      )
      assert.equal(
        Object.values(totales.desgloseProductos).reduce((s, g) => s + centavos(g.pagosCompras), 0),
        centavos(anterior.totalComprasPagadas)
      )
      assert.deepEqual(
        (await base.cargar()).datos,
        antes,
        'Consultas no modifican Snapshot ni negocio'
      )
      return esperado
    }
    const inicial = await verificar({ desde: ayer, hasta: ayer, limite: 10 })
    const abonos = await verificar({ desde: fecha, hasta: fecha, limite: 10 })
    for (const [i, producto] of productos.entries()) {
      assert.equal(centavos(inicial.desgloseProductos[producto].ingresos), (i + 1) * 111)
      assert.equal(centavos(inicial.desgloseProductos[producto].pagosCompras), (i + 1) * 1011)
      assert.equal(centavos(abonos.desgloseProductos[producto].ingresos), 404 + i * 100)
      assert.equal(centavos(abonos.desgloseProductos[producto].pagosCompras), 501 + i * 100)
    }
    assert.equal(abonos.totalGastosManuales, 7.25)
    ok(
      'Pago inicial y abonos por fecha/producto; conversión baba-seco no reclasifica compras; totales históricos idénticos'
    )
    const completo = await verificar(periodo)
    assert.ok(completo.filas.length > 10)
    const primera = await base.reportePeriodo(periodo)
    assert.equal(primera.filas.length, 10)
    for (const tipo of ['diario', 'semanal', 'mensual']) {
      const pdf = await base.documentoReporte(periodo, tipo)
      const esperado = documentoReporte(completo, tipo)
      const sinHora = (s) => s.replace(/Generado: [^<]*/g, 'Generado: FECHA')
      assert.equal(sinHora(pdf.html), sinHora(esperado.html))
      assert.equal(pdf.nombreArchivo, esperado.nombreArchivo)
      assert.ok(
        pdf.html.includes('Desglose por producto') &&
          pdf.html.includes('<th style="width:16%">Producto</th>')
      )
      assert.ok(!pdf.html.includes('Sin producto de origen'))
      const detalle = pdf.html.split('aria-label="Detalle financiero"')[1]
      assert.equal((detalle.match(/<tr>/g) || []).length - 1, completo.filas.length)
      assert.ok(pdf.html.includes('&lt;Gasto de prueba&gt;'))
    }
    ok(
      'Paginación SQL y PDF diario/semanal/mensual completos, con desglose y Producto; fila sin origen oculta si cero'
    )
    await base.anularOperacion(randomUUID(), 'venta', ventas[2].id, 'Prueba de exclusión', clave)
    await base.anularOperacion(randomUUID(), 'compra', compras[2].id, 'Prueba de exclusión', clave)
    const anuladas = await verificar(periodo)
    assert.deepEqual(anuladas.desgloseProductos.Maracuyá, { ingresos: 0, pagosCompras: 0 })
    assert.equal(anuladas.totalGastosManuales, completo.totalGastosManuales)
    ok('Compras y ventas anuladas excluyen pago inicial y abonos sin alterar gastos')
    await ejecutar('crearCuentaManual', {
      clienteId: cliente.id,
      tipo: 'Deuda manual',
      fecha: ayer,
      monto: 30,
      observacion: 'Sin operación origen'
    })
    const manual = (await base.cargar()).datos.cuentas.find((c) => c.origen === 'manual')
    await ejecutar('registrarAbono', {
      cuentaId: manual.id,
      fecha,
      monto: 8.08,
      tipo: 'Abono',
      metodoPago: 'Efectivo',
      observacion: 'Cobro manual'
    })
    const conManual = await verificar(periodo)
    assert.deepEqual(conManual.desgloseProductos['Sin producto de origen'], {
      ingresos: 8.08,
      pagosCompras: 0
    })
    assert.equal(centavos(conManual.totalIngresos - anuladas.totalIngresos), 808)
    for (const tipo of ['diario', 'semanal', 'mensual'])
      assert.ok(
        (await base.documentoReporte(periodo, tipo)).html.includes('Sin producto de origen')
      )
    ok('Cuenta manual conserva total y se identifica sin atribuir un producto arbitrario')
    const vacio = await verificar({ desde: '2000-01-01', hasta: '2000-01-01', limite: 10 })
    assert.equal(vacio.filas.length, 0)
    assert.equal(vacio.saldoPeriodo, 0)
    for (const grupo of Object.values(vacio.desgloseProductos))
      assert.deepEqual(grupo, { ingresos: 0, pagosCompras: 0 })
    ok('Periodo vacío y categorías sin movimientos devuelven cero')
    evidencia.exito = true
  } finally {
    try {
      await base?.cerrar()
    } finally {
      await motor.detener()
    }
    await assert.rejects(fs.stat(join(carpeta, 'motor', 'data', 'postmaster.pid')), {
      code: 'ENOENT'
    })
    evidencia.motorCerrado = true
    const destino = join(root, 'docs/evidencias-desglose-financiero')
    await fs.mkdir(destino, { recursive: true })
    await fs.writeFile(join(destino, 'resultado.json'), JSON.stringify(evidencia, null, 2))
  }
}
main().catch((e) => {
  console.error(e.stack)
  process.exitCode = 1
})
