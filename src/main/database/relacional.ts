import type { PoolClient } from 'pg'
import type { Snapshot } from '../../shared/persistencia'

// Mapeo explícito entre los DTO de React y las columnas SQL. No almacena documentos.
type Campo = { propiedad: string; columna: string; tipo: string; opcional: boolean }
const campos = (definicion: string): Campo[] =>
  definicion
    .trim()
    .split(/\s+/)
    .map((item) => {
      const [nombre, tipo = 'text'] = item.split(':')
      const [propiedad, alias] = nombre.replace('?', '').split('=')
      const columna = alias || propiedad.replace(/[A-Z]/g, (letra) => '_' + letra.toLowerCase())
      return {
        propiedad,
        columna,
        tipo:
          (
            {
              n: 'numeric(18,2)',
              f: 'numeric(18,6)',
              i: 'integer',
              b: 'boolean',
              d: 'date',
              t: 'timestamptz'
            } as Record<string, string>
          )[tipo] || tipo,
        opcional: nombre.includes('?')
      }
    })
export const entidades = {
  clientes: {
    tabla: 'clientes',
    campos: campos(
      'nombreRazonSocial identificacion telefono email? direccion? tipoCliente? notas? estado:b fechaRegistro:t'
    )
  },
  proveedores: {
    tabla: 'proveedores',
    campos: campos(
      'nombre ciRuc telefono? correo? numeroCuenta? direccion? estado:b fechaRegistro:t'
    )
  },
  empleados: {
    tabla: 'empleados',
    campos: campos('nombre cedula? telefono? direccion? estado:b fechaRegistro:t')
  },
  compras: {
    tabla: 'compras',
    campos: campos(
      'estado anuladaEn?:t anuladaPorUsuarioId?=anulada_por_usuario_id:uuid anuladaPorNombre? motivoAnulacion? numeroCompra:i fecha:d fechaHoraRegistro:t proveedorId proveedorNombre producto cantidadQq=cantidad_qq:n precioCompraQq:n impuestoPorcentaje:n subtotal:n montoImpuesto:n totalCompra=total:n montoPagadoInicial:n metodoPago montoEfectivo?:n montoTransferencia?:n comprobante? observacion? usuarioId? usuarioNombre?'
    )
  },
  ventas: {
    tabla: 'ventas',
    campos: campos(
      'estado anuladaEn?:t anuladaPorUsuarioId?=anulada_por_usuario_id:uuid anuladaPorNombre? motivoAnulacion? numeroFactura:i numeroComprobante:i subtotal:n montoImpuesto:n totalVenta=total:n saldoPendiente:n estadoCobro fechaVenta:d fechaHoraRegistro:t clienteId producto pesoBruto=cantidad_qq:n precioUnitario:n impuestoPorcentaje:n metodoPago montoEfectivo?:n montoTransferencia?:n montoRecibido:n numeroLote? observaciones? usuarioId? usuarioNombre?'
    )
  },
  cuentas: {
    tabla: 'cuentas',
    campos: campos(
      'origen categoria compraId? numeroCompra?:i proveedorId? proveedorNombre? ventaId? numeroFactura?:i clienteId? montoTotal:n montoPagado=monto_aplicado:n fecha:d fechaHoraRegistro:t fechaUltimoMovimiento:t estado observacion? comprobante? motivoAnulacion? usuarioId? usuarioNombre?'
    )
  },
  movimientosCuenta: {
    tabla: 'movimientos_cuenta',
    campos: campos(
      'cuentaId categoria proveedorId? clienteId? fecha:d fechaHoraRegistro:t tipo monto:n metodoPago montoEfectivo?:n montoTransferencia?:n observacion numeroComprobante? comprobante? usuarioId? usuarioNombre?'
    )
  },
  movimientosStock: {
    tabla: 'movimientos_stock',
    campos: campos(
      'fecha:d fechaHoraRegistro:t tipo producto entradaQq:n salidaQq:n stockResultante:n detalle gastoGeneradoId? ventaId? compraId? conversionId? proveedorId? proveedorNombre? factorConversion?:f cantidadObtenidaQq?:n diferenciaQq?:n estadoPago? montoAbono?:n montoTotal?:n saldoPendiente?:n comprobante? observacion? usuarioId? usuarioNombre?'
    )
  },
  gastos: {
    tabla: 'gastos',
    campos: campos(
      'fecha:d fechaHoraRegistro:t categoria concepto monto:n comprobante? observacion tipo referenciaStockId? compra_id? empleado_id? tipo_pago? empleado_nombre? proveedor_id? proveedor_nombre? estado_pago_proveedor? monto_abono?:n saldo_pendiente_proveedor?:n usuarioId? usuarioNombre?'
    )
  }
} as const
export type Entidad = keyof typeof entidades

export async function leerEntidades(db: PoolClient, resultado: Snapshot): Promise<void> {
  for (const [key, entidad] of Object.entries(entidades)) {
    // El DTO no consume orden ni actualizado_en. El orden de lectura se conserva.
    const columnas = ['id', ...entidad.campos.map((campo) => campo.columna)].join(',')
    const { rows } = await db.query(
      `SELECT ${columnas} FROM ruizcacao.${entidad.tabla} ORDER BY orden DESC`
    )
    const registros = rows.map((row) => {
      const dto: Record<string, unknown> = { id: key === 'empleados' ? Number(row.id) : row.id }
      for (const campo of entidad.campos) {
        let valor = row[campo.columna]
        if (valor === null) continue
        if (
          campo.tipo.startsWith('numeric') ||
          campo.tipo === 'integer' ||
          campo.propiedad === 'empleado_id'
        )
          valor = Number(valor)
        if (campo.tipo === 'date')
          valor =
            typeof valor === 'string'
              ? valor
              : [
                  valor.getFullYear(),
                  String(valor.getMonth() + 1).padStart(2, '0'),
                  String(valor.getDate()).padStart(2, '0')
                ].join('-')
        if (campo.tipo === 'timestamptz') valor = valor.toISOString()
        dto[campo.propiedad] = valor
      }
      if (key === 'cuentas') {
        dto.clienteId ??= ''
        dto.ventaId ??= null
        dto.numeroFactura ??= null
      }
      if (key === 'movimientosCuenta') dto.clienteId ??= ''
      if (key === 'gastos') dto.referenciaStockId ??= null
      return dto
    })
    Object.assign(resultado, { [key]: registros })
  }
}

export async function guardarRegistro(
  db: PoolClient,
  key: Entidad,
  registro: object
): Promise<void> {
  const entidad = entidades[key],
    dto = registro as Record<string, unknown>
  const nombres = ['id', ...entidad.campos.map((c) => c.columna)]
  const valores = [
    String(dto.id),
    ...entidad.campos.map((c) => {
      const valor = dto[c.propiedad]
      return valor === undefined || valor === null || (c.opcional && valor === '') ? null : valor
    })
  ]
  await db.query(
    `INSERT INTO ruizcacao.${entidad.tabla} (${nombres.join(',')}) VALUES (${nombres.map((_, i) => '$' + (i + 1)).join(',')}) ON CONFLICT(id) DO UPDATE SET ${nombres
      .slice(1)
      .map((n) => `${n}=EXCLUDED.${n}`)
      .join(',')}, actualizado_en=now()`,
    valores
  )
}

// Se aplica dentro de la misma transacción que registra la versión. Si falla,
// PostgreSQL conserva íntegra la versión anterior, incluidos sus documentos.
export function sqlNormalizacion(): string {
  const sql = [
    "SET LOCAL TIME ZONE 'America/Guayaquil'; SET CONSTRAINTS ALL IMMEDIATE;",
    'DROP VIEW ruizcacao.v_saldos; DROP VIEW ruizcacao.v_flujo_caja;'
  ]
  const generadas: Record<string, string[]> = {
    compras: ['proveedor_id', 'producto', 'cantidad_qq', 'total'],
    ventas: ['cliente_id', 'producto', 'cantidad_qq', 'total'],
    cuentas: [
      'cliente_id',
      'proveedor_id',
      'compra_id',
      'venta_id',
      'monto_total',
      'monto_aplicado'
    ],
    movimientos_cuenta: ['cuenta_id', 'monto'],
    movimientos_stock: ['compra_id', 'venta_id', 'conversion_id', 'producto'],
    gastos: ['compra_id', 'empleado_id', 'monto']
  }
  for (const entidad of Object.values(entidades)) {
    const tabla = 'ruizcacao.' + entidad.tabla
    for (const columna of generadas[entidad.tabla] || [])
      sql.push(`ALTER TABLE ${tabla} ALTER COLUMN ${columna} DROP EXPRESSION;`)
    for (const c of entidad.campos) {
      // usuarioId/usuarioNombre pertenecen a la migración 5. Se excluyen aquí para que
      // la migración histórica 2 permanezca inmutable en instalaciones v1/v2/v3/v4.
      if (
        ['compras', 'ventas'].includes(entidad.tabla) &&
        [
          'estado',
          'anuladaEn',
          'anuladaPorUsuarioId',
          'anuladaPorNombre',
          'motivoAnulacion'
        ].includes(c.propiedad)
      )
        continue
      if (c.propiedad === 'usuarioId' || c.propiedad === 'usuarioNombre') continue
      sql.push(`ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS ${c.columna} ${c.tipo};`)
      sql.push(
        `UPDATE ${tabla} SET ${c.columna}=${c.tipo === 'text' && !c.opcional ? `datos->>'${c.propiedad}'` : `NULLIF(datos->>'${c.propiedad}','')::${c.tipo}`};`
      )
      if (!c.opcional) sql.push(`ALTER TABLE ${tabla} ALTER COLUMN ${c.columna} SET NOT NULL;`)
    }
    sql.push(`ALTER TABLE ${tabla} DROP COLUMN datos CASCADE;`)
  }
  sql.push(`
CREATE TABLE ruizcacao.existencias(producto text PRIMARY KEY REFERENCES ruizcacao.productos(nombre), cantidad_qq numeric(18,2) NOT NULL CHECK(cantidad_qq>=0), costo_unitario_promedio numeric(18,6) NOT NULL CHECK(costo_unitario_promedio>=0));
INSERT INTO ruizcacao.existencias SELECT p.nombre, coalesce((c.datos->'stock'->>p.nombre)::numeric,0), coalesce((c.datos->'costoUnitarioPromedio'->>p.nombre)::numeric,0) FROM ruizcacao.productos p LEFT JOIN ruizcacao.configuracion c ON c.id=1;
ALTER TABLE ruizcacao.configuracion ADD COLUMN ultimo_factor_usado numeric(8,3) NOT NULL DEFAULT 3.5 CHECK(ultimo_factor_usado BETWEEN 2.8 AND 5.3);
UPDATE ruizcacao.configuracion SET ultimo_factor_usado=coalesce((datos->>'ultimoFactorUsado')::numeric,3.5);
ALTER TABLE ruizcacao.configuracion DROP COLUMN datos;
INSERT INTO ruizcacao.configuracion(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE UNIQUE INDEX cliente_identificacion ON ruizcacao.clientes(identificacion) WHERE identificacion<>'';
CREATE UNIQUE INDEX proveedor_identificacion ON ruizcacao.proveedores(ci_ruc) WHERE ci_ruc<>'';
CREATE UNIQUE INDEX empleado_cedula ON ruizcacao.empleados(cedula) WHERE cedula<>'';
CREATE UNIQUE INDEX compra_numero_diario ON ruizcacao.compras(fecha,numero_compra);
CREATE UNIQUE INDEX venta_numero_diario ON ruizcacao.ventas(fecha_venta,numero_factura);
CREATE UNIQUE INDEX venta_comprobante ON ruizcacao.ventas(numero_comprobante);
ALTER TABLE ruizcacao.cuentas ADD CONSTRAINT titular_valido CHECK ((categoria='compra' AND proveedor_id IS NOT NULL AND cliente_id IS NULL) OR (categoria='venta' AND cliente_id IS NOT NULL AND proveedor_id IS NULL)), ADD CHECK(origen IN ('manual','compra','venta')), ADD CHECK(estado IN ('pendiente','parcial','cerrado','anulado')), ADD CHECK(monto_total>=0 AND monto_aplicado>=0);
ALTER TABLE ruizcacao.compras ADD CHECK(total>0 AND cantidad_qq>0 AND precio_compra_qq>0 AND monto_pagado_inicial BETWEEN 0 AND total), ADD CHECK(impuesto_porcentaje BETWEEN 0 AND 3);
ALTER TABLE ruizcacao.ventas ADD CHECK(total>0 AND cantidad_qq>0 AND precio_unitario>0), ADD CHECK(impuesto_porcentaje BETWEEN 0 AND 3);
ALTER TABLE ruizcacao.movimientos_cuenta ADD CHECK(monto>0), ADD CHECK(tipo IN ('Abono','Ajuste a favor','Ajuste por devolución')), ADD FOREIGN KEY(cliente_id) REFERENCES ruizcacao.clientes(id) DEFERRABLE INITIALLY DEFERRED, ADD FOREIGN KEY(proveedor_id) REFERENCES ruizcacao.proveedores(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE ruizcacao.movimientos_stock ADD CHECK(entrada_qq>=0 AND salida_qq>=0 AND stock_resultante>=0), ADD FOREIGN KEY(proveedor_id) REFERENCES ruizcacao.proveedores(id) DEFERRABLE INITIALLY DEFERRED, ADD FOREIGN KEY(gasto_generado_id) REFERENCES ruizcacao.gastos(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE ruizcacao.gastos ADD CHECK(tipo IN ('manual','automatico')), ADD FOREIGN KEY(referencia_stock_id) REFERENCES ruizcacao.movimientos_stock(id) DEFERRABLE INITIALLY DEFERRED, ADD FOREIGN KEY(proveedor_id) REFERENCES ruizcacao.proveedores(id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX movimientos_cuenta_cuenta_fecha ON ruizcacao.movimientos_cuenta(cuenta_id,fecha);
CREATE INDEX movimientos_stock_producto_fecha ON ruizcacao.movimientos_stock(producto,fecha);
CREATE INDEX gastos_fecha ON ruizcacao.gastos(fecha);
CREATE VIEW ruizcacao.v_saldos AS SELECT id,categoria,cliente_id,proveedor_id,monto_total,monto_aplicado,monto_total-monto_aplicado AS saldo FROM ruizcacao.cuentas WHERE estado<>'anulado';
CREATE VIEW ruizcacao.v_flujo_caja AS SELECT m.id,m.fecha,c.categoria,CASE WHEN c.categoria='compra' THEN -m.monto ELSE m.monto END AS monto FROM ruizcacao.movimientos_cuenta m JOIN ruizcacao.cuentas c ON c.id=m.cuenta_id WHERE m.tipo='Abono' AND c.estado<>'anulado' UNION ALL SELECT id,fecha,'gasto_operativo',-monto FROM ruizcacao.gastos WHERE tipo='manual';
COMMENT ON TABLE ruizcacao.existencias IS 'Saldo de inventario y costo promedio; actualizado atómicamente con los movimientos.';
COMMENT ON TABLE ruizcacao.operaciones IS 'Idempotencia de comandos: el JSON guarda la respuesta técnica para reintentos, no las entidades de negocio.';
COMMENT ON TABLE ruizcacao.auditoria IS 'Trazabilidad; el detalle JSON es una evidencia histórica, no la fuente de datos comerciales.';
COMMENT ON COLUMN ruizcacao.compras.proveedor_nombre IS 'Nombre histórico al registrar la compra.';
COMMENT ON COLUMN ruizcacao.movimientos_stock.diferencia_qq IS 'Resultado físico menos conversión; informativo según la regla actual del negocio.';
`)
  return sql.join('\n')
}
