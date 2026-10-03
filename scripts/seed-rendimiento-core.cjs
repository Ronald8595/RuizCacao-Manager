// Inserción aditiva explícita: sin UPSERT, borrados, cambios de reglas ni credenciales.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { load, root } = require('../tests/loader.cjs')
const { entidades } = load(root + '/src/main/database/relacional.ts')
const productos = ['Cacao en Baba', 'Cacao Seco', 'Maracuyá']
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100
function registro(key, id, values) {
  const r = { id }
  for (const c of entidades[key].campos)
    if (!c.opcional)
      r[c.propiedad] =
        c.tipo.startsWith('numeric') || c.tipo === 'integer'
          ? 0
          : c.tipo === 'boolean'
            ? true
            : c.tipo === 'date'
              ? '2026-01-01'
              : c.tipo === 'timestamptz'
                ? '2026-01-01T17:00:00Z'
                : ''
  return Object.assign(r, values)
}
async function insertarRendimiento(
  db,
  vol = { clientes: 1000, proveedores: 500, compras: 10000, ventas: 15000, gastos: 3000 }
) {
  const prefijo = 'PERF-' + randomUUID() + '-'
  const datos = Object.fromEntries(Object.keys(entidades).map((k) => [k, []]))
  await db.query('BEGIN')
  try {
    await db.query('SELECT pg_advisory_xact_lock(7302026)')
    await db.query("SET LOCAL TIME ZONE 'America/Guayaquil'")
    await db.query('SET CONSTRAINTS ALL DEFERRED')
    const version = (await db.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v
    assert.ok([8, 9, 10].includes(version))
    const huellas = async () => {
      const result = {}
      for (const e of Object.values(entidades))
        result[e.tabla] = (
          await db.query(
            `SELECT count(*)::int filas, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id::text),'')) hash FROM ruizcacao.${e.tabla} t WHERE left(id::text,length($1))<>$1`,
            [prefijo]
          )
        ).rows[0]
      return result
    }
    const antes = await huellas()
    const usuario = (
      await db.query(
        'SELECT id,nombre FROM ruizcacao.usuarios WHERE activo ORDER BY principal DESC,id LIMIT 1'
      )
    ).rows[0]
    assert.ok(usuario, 'Se requiere un usuario existente activo; el seed no crea usuarios.')
    const autor = { usuarioId: usuario.id, usuarioNombre: usuario.nombre }
    const stockInicial = (
      await db.query(
        'SELECT producto,cantidad_qq,costo_unitario_promedio FROM ruizcacao.existencias ORDER BY producto FOR UPDATE'
      )
    ).rows
    const stock = Object.fromEntries(stockInicial.map((r) => [r.producto, Number(r.cantidad_qq)]))
    const costos = Object.fromEntries(
      stockInicial.map((r) => [r.producto, Number(r.costo_unitario_promedio)])
    )
    const diarios = {}
    for (const [key, tabla, col, numero] of [
      ['compra', 'compras', 'fecha', 'numero_compra'],
      ['venta', 'ventas', 'fecha_venta', 'numero_factura']
    ])
      diarios[key] = Object.fromEntries(
        (
          await db.query(
            `SELECT ${col}::text fecha,max(${numero})::int n FROM ruizcacao.${tabla} GROUP BY ${col}`
          )
        ).rows.map((r) => [r.fecha, r.n])
      )
    let comprobante = Number(
      (
        await db.query(
          "SELECT greatest(coalesce((SELECT max(numero_comprobante) FROM ruizcacao.ventas),0),coalesce((SELECT max(nullif(numero_comprobante,'')::integer) FROM ruizcacao.movimientos_cuenta WHERE numero_comprobante ~ '^[0-9]+$'),0)) n"
        )
      ).rows[0].n
    )
    for (const key of ['clientes', 'proveedores'])
      for (let i = 0; i < vol[key]; i++)
        datos[key].push(
          registro(
            key,
            prefijo + key + '-' + i,
            key === 'clientes'
              ? {
                  nombreRazonSocial: prefijo + 'Cliente Muñoz Álvarez ' + i,
                  identificacion: '',
                  telefono: '0000000000'
                }
              : { nombre: prefijo + 'Proveedor Peña Ñandú ' + i, ciRuc: '' }
          )
        )
    let anuladas = { compras: 0, ventas: 0 }
    for (const key of ['compras', 'ventas']) {
      const compra = key === 'compras'
      for (let i = 0; i < vol[key]; i++) {
        const fecha = new Date(Date.UTC(2026, 0, 1 + (i % 270))).toISOString().slice(0, 10)
        const stamp = fecha + 'T17:00:00Z',
          producto = productos[i % 3]
        const cantidad = compra ? 20 + (i % 11) : 1 + (i % 4) / 4,
          precio = round((compra ? 45 : 70) + (i % 23) / 2)
        const subtotal = round(cantidad * precio),
          impuesto = i % 4 === 0 ? 1 : 0,
          montoImpuesto = round((subtotal * impuesto) / 100),
          total = round(subtotal - montoImpuesto)
        const pagado = i % 3 === 0 ? 0 : i % 3 === 1 ? round(total / 2) : total,
          saldo = round(total - pagado)
        const anulada = i % 60 === 0,
          estado = pagado === 0 ? 'pendiente' : saldo === 0 ? 'cerrado' : 'parcial'
        const titular =
          datos[compra ? 'proveedores' : 'clientes'][i % vol[compra ? 'proveedores' : 'clientes']]
        const id = prefijo + key + '-' + i,
          cuentaId = prefijo + 'cuenta-' + key + '-' + i,
          movId = prefijo + 'stock-' + key + '-' + i
        const num = (diarios[compra ? 'compra' : 'venta'][fecha] =
          (diarios[compra ? 'compra' : 'venta'][fecha] ?? 0) + 1)
        const ref = compra
          ? {
              compraId: id,
              numeroCompra: num,
              proveedorId: titular.id,
              proveedorNombre: titular.nombre
            }
          : { ventaId: id, numeroFactura: num, clienteId: titular.id }
        const comun = {
          ...autor,
          estado: anulada ? 'anulada' : 'vigente',
          producto,
          fechaHoraRegistro: stamp,
          subtotal,
          montoImpuesto,
          impuestoPorcentaje: impuesto,
          metodoPago: 'Efectivo',
          montoEfectivo: pagado,
          montoTransferencia: 0
        }
        if (anulada)
          Object.assign(comun, {
            anuladaEn: fecha + 'T18:00:00Z',
            anuladaPorUsuarioId: usuario.id,
            anuladaPorNombre: usuario.nombre,
            motivoAnulacion: prefijo + 'Anulación sintética sin pago'
          })
        const op = registro(
          key,
          id,
          compra
            ? {
                ...comun,
                ...ref,
                fecha,
                cantidadQq: cantidad,
                precioCompraQq: precio,
                totalCompra: total,
                montoPagadoInicial: pagado,
                observacion: prefijo + 'Compra ficticia'
              }
            : {
                ...comun,
                ...ref,
                fechaVenta: fecha,
                pesoBruto: cantidad,
                precioUnitario: precio,
                totalVenta: total,
                montoRecibido: pagado,
                saldoPendiente: saldo,
                estadoCobro: saldo === 0 ? 'Pagado' : pagado ? 'Parcial' : 'Pendiente',
                numeroComprobante: ++comprobante,
                observaciones: prefijo + 'Venta ficticia'
              }
        )
        datos[key].push(op)
        datos.cuentas.push(
          registro('cuentas', cuentaId, {
            ...autor,
            ...ref,
            origen: compra ? 'compra' : 'venta',
            categoria: compra ? 'compra' : 'venta',
            fecha,
            fechaHoraRegistro: stamp,
            fechaUltimoMovimiento: anulada ? comun.anuladaEn : stamp,
            montoTotal: total,
            montoPagado: pagado,
            estado: anulada ? 'anulado' : estado,
            motivoAnulacion: comun.motivoAnulacion
          })
        )
        if (pagado)
          datos.movimientosCuenta.push(
            registro('movimientosCuenta', prefijo + 'abono-' + key + '-' + i, {
              ...autor,
              cuentaId,
              categoria: compra ? 'compra' : 'venta',
              proveedorId: ref.proveedorId,
              clienteId: ref.clienteId,
              fecha,
              fechaHoraRegistro: stamp,
              tipo: 'Abono',
              monto: pagado,
              metodoPago: 'Efectivo',
              montoEfectivo: pagado,
              montoTransferencia: 0,
              observacion: prefijo + 'Pago inicial',
              numeroComprobante: compra ? undefined : String(op.numeroComprobante)
            })
          )
        if (compra)
          costos[producto] = round(
            (stock[producto] * costos[producto] + total) / (stock[producto] + cantidad)
          )
        stock[producto] = round(stock[producto] + (compra ? cantidad : -cantidad))
        assert.ok(stock[producto] >= 0, 'Stock sintético negativo')
        datos.movimientosStock.push(
          registro('movimientosStock', movId, {
            ...autor,
            ...ref,
            fecha,
            fechaHoraRegistro: stamp,
            producto,
            tipo: compra
              ? producto === 'Cacao Seco'
                ? 'Entrada - Compra Seco'
                : 'Entrada - Compra'
              : 'Salida - Venta',
            entradaQq: compra ? cantidad : 0,
            salidaQq: compra ? 0 : cantidad,
            stockResultante: stock[producto],
            detalle: prefijo + 'Operación ficticia',
            gastoGeneradoId: compra ? prefijo + 'inversion-' + i : undefined
          })
        )
        if (compra)
          datos.gastos.push(
            registro('gastos', prefijo + 'inversion-' + i, {
              ...autor,
              fecha,
              fechaHoraRegistro: stamp,
              tipo: 'automatico',
              categoria: 'Inversión en materia prima',
              concepto: prefijo + 'Compra ficticia',
              monto: total,
              observacion: prefijo,
              referenciaStockId: movId,
              compra_id: id,
              proveedor_id: titular.id,
              proveedor_nombre: titular.nombre,
              estado_pago_proveedor: saldo === 0 ? 'completo' : pagado ? 'abono' : 'pendiente',
              monto_abono: pagado,
              saldo_pendiente_proveedor: saldo
            })
          )
        if (anulada) {
          anuladas[key]++
          stock[producto] = round(stock[producto] + (compra ? -cantidad : cantidad))
          datos.movimientosStock.push(
            registro('movimientosStock', prefijo + 'anulacion-' + key + '-' + i, {
              ...autor,
              ...ref,
              fecha,
              fechaHoraRegistro: comun.anuladaEn,
              producto,
              tipo: compra ? 'Salida - Ajuste' : 'Entrada - Ajuste',
              entradaQq: compra ? 0 : cantidad,
              salidaQq: compra ? cantidad : 0,
              stockResultante: stock[producto],
              detalle: comun.motivoAnulacion
            })
          )
        }
      }
    }
    for (let i = 0; i < vol.gastos; i++)
      datos.gastos.push(
        registro('gastos', prefijo + 'manual-' + i, {
          ...autor,
          fecha: new Date(Date.UTC(2026, 0, 1 + (i % 270))).toISOString().slice(0, 10),
          tipo: 'manual',
          categoria: 'Otros',
          concepto: prefijo + 'Gasto ficticio',
          monto: round(5 + (i % 87) / 2),
          observacion: prefijo
        })
      )
    for (const [key, e] of Object.entries(entidades))
      for (let start = 0; start < datos[key].length; start += 500) {
        const cols = ['id', ...e.campos.map((c) => c.columna)]
        const rows = datos[key]
          .slice(start, start + 500)
          .map((r) =>
            Object.fromEntries([
              ['id', r.id],
              ...e.campos.map((c) => [
                c.columna,
                r[c.propiedad] === undefined || (c.opcional && r[c.propiedad] === '')
                  ? null
                  : r[c.propiedad]
              ])
            ])
          )
        await db.query(
          `INSERT INTO ruizcacao.${e.tabla} (${cols.join(',')}) SELECT ${cols.join(',')} FROM jsonb_populate_recordset(NULL::ruizcacao.${e.tabla},$1::jsonb)`,
          [JSON.stringify(rows)]
        )
      }
    for (const producto of productos)
      await db.query(
        'UPDATE ruizcacao.existencias SET cantidad_qq=$2,costo_unitario_promedio=$3 WHERE producto=$1',
        [producto, stock[producto], costos[producto]]
      )
    await db.query('SET CONSTRAINTS ALL IMMEDIATE')
    assert.deepEqual(
      await huellas(),
      antes,
      'Todos los registros comerciales anteriores se conservan byte a byte en JSON SQL'
    )
    const incongruentes = (
      await db.query(
        `SELECT count(*)::int n FROM ruizcacao.cuentas c WHERE left(c.id,length($1))=$1 AND (c.monto_aplicado>c.monto_total OR c.monto_aplicado<>coalesce((SELECT sum(m.monto) FROM ruizcacao.movimientos_cuenta m WHERE m.cuenta_id=c.id AND m.tipo='Abono'),0))`,
        [prefijo]
      )
    ).rows[0].n
    assert.equal(incongruentes, 0)
    const agregados = Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, v.length]))
    await db.query(
      "INSERT INTO ruizcacao.auditoria(accion,responsable,detalle,usuario_id) VALUES('SEED_RENDIMIENTO',$1,$2::jsonb,$3)",
      [usuario.nombre, JSON.stringify({ prefijo, agregados, anuladas }), usuario.id]
    )
    await db.query('COMMIT')
    return {
      prefijo,
      agregados,
      anuladas,
      antes,
      stockAntes: stockInicial,
      stockDespues: stock,
      registrosPreviosConservados: true,
      nota: 'Gastos: 3.000 manuales solicitados más una inversión automática por compra; inserción histórica directa en transacción, sin invocar comandos por jornada ni modificar usuarios/jornadas. Existencias actualizadas por efectos de nuevas operaciones.'
    }
  } catch (e) {
    await db.query('ROLLBACK')
    throw e
  }
}
module.exports = { insertarRendimiento }
