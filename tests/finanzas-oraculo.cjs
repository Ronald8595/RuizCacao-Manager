// Oráculo solo de pruebas: enriquece el cálculo histórico, sin cambiar sus totales.
function conProductos(datos, resumen) {
  const desgloseProductos = Object.fromEntries(
    ['Cacao en Baba', 'Cacao Seco', 'Maracuyá', 'Sin producto de origen'].map((p) => [
      p,
      { ingresos: 0, pagosCompras: 0 }
    ])
  )
  const filas = resumen.filas.map((fila) => {
    const movimiento = datos.movimientosCuenta.find((m) => m.id === fila.id)
    const cuenta =
      fila.tipo === 'Gasto operativo'
        ? null
        : datos.cuentas.find((c) => c.id === movimiento?.cuentaId)
    const origen =
      cuenta?.categoria === 'compra'
        ? datos.compras.find((c) => c.id === cuenta.compraId)
        : datos.ventas.find((v) => v.id === cuenta?.ventaId)
    const producto = origen?.producto ?? null
    const grupo = desgloseProductos[producto ?? 'Sin producto de origen']
    if (fila.monto > 0) grupo.ingresos += Math.round(fila.monto * 100)
    if (fila.tipo === 'Pago de compra') grupo.pagosCompras -= Math.round(fila.monto * 100)
    return { ...fila, producto }
  })
  for (const grupo of Object.values(desgloseProductos)) {
    grupo.ingresos /= 100
    grupo.pagosCompras /= 100
  }
  return { ...resumen, filas, desgloseProductos }
}
module.exports = { conProductos }
