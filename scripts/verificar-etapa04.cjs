const assert = require('node:assert/strict'),
  { performance } = require('node:perf_hooks'),
  { createHash } = require('node:crypto')
const { load, root } = require('../tests/loader.cjs')
const { consultarListado, reporteCompleto } = load(root + '/src/main/database/listados.ts')
const { consultarHistorialCompras, consultarHistorialVentas } = load(
  root + '/src/main/database/historial-operaciones.ts'
)
const { consultarHistorialStock } = load(root + '/src/main/database/historial-stock.ts')
const { resumirPeriodo } = load(root + '/src/renderer/src/utils/reportes.ts')
const { documentoReporte } = load(root + '/src/renderer/src/utils/reportePdf.ts')
async function paginas(db, modulo, f, limite, esperadas) {
  let cursor = null,
    filas = [],
    n = 0
  do {
    const pagina = await consultarListado(db, modulo, { ...f, limite, cursor })
    assert.equal(pagina.total, esperadas.length)
    assert.ok(pagina.filas.length <= limite)
    filas.push(...pagina.filas)
    cursor = pagina.siguiente
    assert.ok(++n < 10000)
  } while (cursor)
  assert.deepEqual(filas, esperadas)
  assert.equal(new Set(filas.map((f) => f.id)).size, filas.length)
  return n
}
async function verificarEquivalencia(db, d, { completo = true } = {}) {
  const salida = { finanzas: [], paginacion: [], planes: [] },
    nombres = new Map(d.clientes.map((c) => [c.id, c.nombreRazonSocial]))
  const periodos = [
    ['2026-01-05', '2026-01-05', 'diario'],
    ['2026-01-05', '2026-01-11', 'semanal'],
    ['2026-01-01', '2026-01-31', 'mensual'],
    ['2026-01-01', '2026-09-30', 'mensual'],
    ['2030-01-01', '2030-01-31', 'mensual']
  ]
  for (const [desde, hasta, tipo] of periodos) {
    const f = { desde, hasta },
      t = performance.now(),
      viejo = resumirPeriodo(
        d.ventas,
        d.gastos,
        desde,
        hasta,
        d.movimientosCuenta,
        d.cuentas,
        d.compras
      ),
      msAnterior = performance.now() - t
    const q = performance.now(),
      nuevo = await consultarListado(db, 'reportePeriodo', f),
      msNuevo = performance.now() - q
    const { filas, ...totales } = viejo
    assert.deepEqual(nuevo.resumen, totales)
    assert.equal(nuevo.total, filas.length)
    await paginas(db, 'reportePeriodo', f, 50, filas)
    const exportado = await reporteCompleto(db, f, tipo),
      htmlViejo = documentoReporte(viejo, tipo)
    // Solo fecha/hora de emisión depende del reloj; el resto de HTML debe ser idéntico.
    const limpiar = (s) => s.replace(/Generado: [^<]*/g, 'Generado: FECHA')
    assert.equal(limpiar(exportado.html), limpiar(htmlViejo.html))
    assert.equal(exportado.nombreArchivo, htmlViejo.nombreArchivo)
    salida.finanzas.push({
      desde,
      hasta,
      tipo,
      filas: filas.length,
      totales,
      msAnterior,
      msNuevo,
      bytesPagina: Buffer.byteLength(JSON.stringify(nuevo)),
      bytesPDF: Buffer.byteLength(exportado.html),
      huellaFilas: createHash('sha256').update(JSON.stringify(filas)).digest('hex'),
      htmlPDFIdentico: true
    })
  }
  for (const limite of [10, 15, 25, 50]) {
    const f = { desde: '2026-01-01', hasta: completo ? '2026-09-30' : '2026-01-10' }
    const historial = d.cuentas
      .filter((c) => c.origen !== 'manual' && c.fecha >= f.desde && c.fecha <= f.hasta)
      .map((c) => ({
        ...c,
        titular:
          c.categoria === 'compra'
            ? (c.proveedorNombre ?? 'Proveedor')
            : (nombres.get(c.clienteId) ?? 'Cliente')
      }))
    const gastos = d.gastos
      .filter((g) => g.fecha >= f.desde && g.fecha <= f.hasta)
      .map((g) => ({
        ...g,
        anulada:
          g.tipo === 'automatico' &&
          d.cuentas.some((c) => c.compraId === g.compra_id && c.estado === 'anulado')
      }))
    // Dataset real grande: recorrido completo una vez; cada tamaño cubre 3 páginas.
    for (const [modulo, esperadas] of [
      ['historialCombinado', historial],
      ['listadoGastos', gastos]
    ]) {
      if (limite === 50 || !completo) await paginas(db, modulo, f, limite, esperadas)
      else {
        let cursor = null,
          ids = []
        for (let n = 0; n < 3; n++) {
          const p = await consultarListado(db, modulo, { ...f, limite, cursor })
          assert.equal(p.total, esperadas.length)
          ids.push(...p.filas.map((r) => r.id))
          cursor = p.siguiente
        }
        assert.deepEqual(
          ids,
          esperadas.slice(0, limite * 3).map((r) => r.id)
        )
      }
      salida.paginacion.push({ modulo, limite, total: esperadas.length })
    }
    for (const [modulo, consultar, esperadas] of [
      ['compras', consultarHistorialCompras, d.compras],
      ['ventas', consultarHistorialVentas, d.ventas],
      ['stock', consultarHistorialStock, d.movimientosStock]
    ]) {
      const p = await consultar(db, { limite })
      assert.equal(p.total, esperadas.length)
      assert.deepEqual(
        p.filas.map((f) => f.id),
        esperadas.slice(0, limite).map((f) => f.id)
      )
      await assert.rejects(consultar(db, { limite: limite === 10 ? 15 : 10, cursor: p.siguiente }))
      salida.paginacion.push({ modulo, limite, total: p.total })
    }
  }
  for (const f of [
    { tipo: 'compra' },
    { tipo: 'venta', estado: 'parcial' },
    { estado: 'anulado' },
    { busqueda: 'muñoz' },
    { busqueda: 'peña' },
    { busqueda: '2026-01-05' },
    { busqueda: '%_' },
    { busqueda: 'no-existe' }
  ]) {
    const text = (f.busqueda ?? '').toLowerCase()
    const esperado = d.cuentas
      .filter(
        (c) =>
          c.origen !== 'manual' &&
          (!f.tipo || c.categoria === f.tipo) &&
          (!f.estado || c.estado === f.estado)
      )
      .map((c) => ({
        ...c,
        titular:
          c.categoria === 'compra'
            ? (c.proveedorNombre ?? 'Proveedor')
            : (nombres.get(c.clienteId) ?? 'Cliente')
      }))
      .filter((c) =>
        (c.titular + ' ' + c.fecha + ' ' + (c.numeroCompra ?? c.numeroFactura))
          .toLowerCase()
          .includes(text)
      )
    const p = await consultarListado(db, 'historialCombinado', f)
    assert.equal(p.total, esperado.length)
    assert.deepEqual(p.filas, esperado.slice(0, 15))
    if (p.siguiente)
      await assert.rejects(
        consultarListado(db, 'historialCombinado', { ...f, limite: 10, cursor: p.siguiente })
      )
  }
  for (const f of [
    { tipo: 'manual' },
    { tipo: 'automatico', categoria: 'Inversión en materia prima' },
    { categoria: 'Mano de obra', desde: '2026-01-01', hasta: '2026-01-31' },
    { categoria: 'no-existe' }
  ]) {
    const esperadas = d.gastos.filter(
      (g) =>
        (!f.tipo || g.tipo === f.tipo) &&
        (!f.categoria || g.categoria === f.categoria) &&
        (!f.desde || g.fecha >= f.desde) &&
        (!f.hasta || g.fecha <= f.hasta)
    )
    const p = await consultarListado(db, 'listadoGastos', f)
    assert.equal(p.total, esperadas.length)
    assert.deepEqual(
      p.filas.map((g) => g.id),
      esperadas.slice(0, 15).map((g) => g.id)
    )
  }
  const rango = { desde: '2026-01-01', hasta: '2026-09-30' },
    resumen = await consultarListado(db, 'resumenGastos', rango)
  const categorias = {},
    cuentas = new Map(d.cuentas.map((c) => [c.id, c])),
    sumas = { totalOperativos: 0, totalCompras: 0 }
  for (const g of d.gastos)
    if (g.tipo === 'manual' && g.fecha >= rango.desde && g.fecha <= rango.hasta) {
      categorias[g.categoria] = (categorias[g.categoria] ?? 0) + g.monto
      sumas.totalOperativos += g.monto
    }
  for (const m of d.movimientosCuenta)
    if (
      m.categoria === 'compra' &&
      m.tipo === 'Abono' &&
      m.fecha >= rango.desde &&
      m.fecha <= rango.hasta &&
      cuentas.has(m.cuentaId) &&
      cuentas.get(m.cuentaId).estado !== 'anulado'
    ) {
      categorias['Inversión en materia prima'] =
        (categorias['Inversión en materia prima'] ?? 0) + m.monto
      sumas.totalCompras += m.monto
    }
  for (const [c, total] of Object.entries(categorias))
    assert.equal(resumen.totalesPorCategoria[c].toFixed(2), total.toFixed(2))
  for (const [k, total] of Object.entries(sumas))
    assert.equal(resumen[k].toFixed(2), total.toFixed(2))
  assert.equal(
    resumen.totalEgresos.toFixed(2),
    (sumas.totalCompras + sumas.totalOperativos).toFixed(2)
  )
  salida.resumenGastos = { ...resumen, equivalenteCentavos: true }
  const query = db.query.bind(db),
    consultas = []
  db.query = async (...args) => {
    const t = performance.now(),
      r = await query(...args)
    consultas.push({ sql: args[0], params: args[1], ms: performance.now() - t, filas: r.rowCount })
    return r
  }
  try {
    for (const modulo of ['historialCombinado', 'listadoGastos', 'resumenGastos', 'reportePeriodo'])
      await consultarListado(db, modulo, rango)
  } finally {
    db.query = query
  }
  for (const q of consultas) {
    const plan = (await query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + q.sql, q.params))
      .rows[0]['QUERY PLAN'][0]
    salida.planes.push({ ...q, servidorMs: plan['Execution Time'], plan })
  }
  return salida
}
module.exports = { verificarEquivalencia }
