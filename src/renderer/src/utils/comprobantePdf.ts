import type { Cliente, Cuenta, MovimientoCuenta, Venta } from '../types'
import { EMPRESA } from '../constants/empresa'
import { LOGO_GRUPO_RUIZ_DATA_URI } from '../assets/brand/logo-grupo-ruiz-data'

/**
 * @description Formatea el consecutivo oficial del comprobante con seis dígitos.
 * @param numero Consecutivo global de comprobante.
 * @returns Cadena como 000001, 000002, 000003.
 * @businessLogic Este número NO se reinicia por jornada; es progresivo entre días.
 * @dbMigration PostgreSQL deberá asignarlo de forma transaccional y única.
 */
export function formatearNumeroComprobante(numero: number): string {
  return String(numero).padStart(6, '0')
}

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function moneda(valor: number): string {
  return `$${valor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fechaLarga(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  if (!anio || !mes || !dia) return fecha
  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(anio, mes - 1, dia))
}

function datosEmpresaHtml(): string {
  return `
    <div class="brand-logo"><img src="${LOGO_GRUPO_RUIZ_DATA_URI}" alt="Grupo Ruiz" /></div>
    <div class="empresa">
      <h1>${escaparHtml(EMPRESA.nombre)}</h1>
      <p>${escaparHtml(EMPRESA.nombreComercial)}</p>
      <p>${escaparHtml(EMPRESA.direccion)}</p>
      ${EMPRESA.ruc ? `<p>RUC: ${escaparHtml(EMPRESA.ruc)}</p>` : ''}
      ${EMPRESA.telefono ? `<p>Teléfono: ${escaparHtml(EMPRESA.telefono)}</p>` : ''}
    </div>`
}

function estilosBase(): string {
  return `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16mm 18mm;
    font-family: Arial, Helvetica, sans-serif;
    color: #303430;
    font-size: 11px;
    background: #fff;
  }
  .header {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 24px;
    align-items: start;
    padding-bottom: 13px;
    border-bottom: 3px solid #1d6427;
  }
  .brand-wrap { display: flex; align-items: center; gap: 12px; }
  .brand-logo { width: 88px; height: 72px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .brand-logo img { width: 72px; height: 72px; object-fit: contain; }
  .empresa h1 { margin: 0 0 4px; color: #1d6427; font-family: Georgia, serif; font-size: 21px; }
  .empresa p { margin: 3px 0; color: #6a6f6b; }
  .comprobante { min-width: 185px; text-align: right; }
  .comprobante h2 { margin: 0 0 8px; color: #303430; font-family: Georgia, serif; font-size: 17px; }
  .numero { color: #1d6427; font-size: 22px; font-weight: 800; }
  .fecha { margin-top: 6px; color: #626762; }
  .cards { display: grid; grid-template-columns: 1.7fr 1fr; gap: 16px; margin-top: 21px; }
  .card { min-height: 92px; padding: 15px 18px; background: #f7f8f8; border-left: 5px solid #c9a24a; border-radius: 4px; }
  .card-title { margin-bottom: 10px; color: #1d6427; font-size: 10px; font-weight: 800; text-transform: uppercase; }
  .card p { margin: 5px 0; line-height: 1.25; }
  .card strong { color: #303430; }
  table { width: 100%; border-collapse: collapse; margin-top: 26px; }
  th { padding: 9px 10px; background: #176523; color: #fff; text-align: left; font-size: 10px; text-transform: uppercase; }
  th.right, td.right { text-align: right; }
  td { padding: 11px 10px; border-bottom: 1px solid #dfe2df; }
  .lower { display: grid; grid-template-columns: 1fr 340px; gap: 28px; margin-top: 28px; }
  .observaciones { color: #6d726e; line-height: 1.45; }
  .observaciones strong { display: block; margin-bottom: 6px; color: #666b67; }
  .totales { width: 100%; }
  .total-line { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13px; }
  .total-final { border-top: 3px solid #c9a24a; margin-top: 2px; padding-top: 11px; color: #1d6427; font-size: 16px; font-weight: 800; }
  .thanks { margin-top: 39px; text-align: center; color: #1d6427; font-family: Georgia, serif; font-size: 17px; font-style: italic; }
  .footer { margin-top: 43px; padding-top: 10px; border-top: 1px solid #dfe2df; color: #9a9f9b; text-align: center; font-size: 9px; }
  `
}

/**
 * @description Genera el comprobante de venta con el diseño de Grupo Ruiz.
 * @param venta Venta registrada.
 * @param cliente Cliente asociado, si existe.
 * @returns HTML autocontenido para impresión A4.
 * @businessLogic Conserva la estructura de la plantilla entregada: cabecera,
 * datos del cliente, detalles de venta, observaciones y totales.
 * @dbMigration Los datos seguirán llegando desde Venta/Cliente al migrar a DB.
 */
export function construirComprobanteHtml(venta: Venta, cliente: Cliente | null): string {
  const numero = formatearNumeroComprobante(venta.numeroComprobante)
  const nombreCliente = cliente?.nombreRazonSocial ?? 'Cliente no especificado'
  const identificacion = cliente?.identificacion ?? '—'
  const telefono = cliente?.telefono ?? '—'
  const observacion = venta.observaciones?.trim() || 'Ninguna observación registrada para este lote.'
  const detalle = `${venta.producto}${venta.numeroLote ? ` · Lote ${venta.numeroLote}` : ''}`
  const detallePago =
    venta.estadoCobro === 'Parcial'
      ? `<div class="total-line"><span>Abono recibido:</span><span>${moneda(venta.montoRecibido)}</span></div><div class="total-line"><span>Saldo pendiente:</span><span>${moneda(venta.saldoPendiente)}</span></div>`
      : venta.estadoCobro === 'Pendiente'
        ? `<div class="total-line"><span>Pago recibido:</span><span>${moneda(0)}</span></div><div class="total-line"><span>Saldo pendiente:</span><span>${moneda(venta.saldoPendiente)}</span></div>`
        : ''

  return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><title>Comprobante ${numero}</title><style>${estilosBase()}</style></head><body>
    <div class="header">
      <div class="brand-wrap">${datosEmpresaHtml()}</div>
      <div class="comprobante"><h2>Comprobante de Pago</h2><div class="numero">N° ${numero}</div><div class="fecha">Fecha: ${fechaLarga(venta.fechaVenta)}</div></div>
    </div>
    <div class="cards">
      <div class="card"><div class="card-title">Datos del cliente</div><p><strong>Cliente:</strong> ${escaparHtml(nombreCliente)}</p><p><strong>RUC/CI:</strong> ${escaparHtml(identificacion)}</p><p><strong>Teléfono:</strong> ${escaparHtml(telefono)}</p></div>
      <div class="card"><div class="card-title">Detalles de venta</div><p><strong>Forma de pago:</strong></p><p>${escaparHtml(venta.metodoPago)}</p><p><strong>Estado:</strong> ${escaparHtml(venta.estadoCobro)}</p></div>
    </div>
    <table><thead><tr><th>Descripción</th><th class="right">Peso neto</th><th class="right">P. Unit.</th><th class="right">Total</th></tr></thead><tbody>
      <tr><td>${escaparHtml(detalle)}</td><td class="right">${venta.pesoBruto.toLocaleString('es-EC', { maximumFractionDigits: 2 })} qq</td><td class="right">${moneda(venta.precioUnitario)}</td><td class="right"><strong>${moneda(venta.subtotal)}</strong></td></tr>
    </tbody></table>
    <div class="lower"><div class="observaciones"><strong>Observaciones:</strong>${escaparHtml(observacion)}</div><div class="totales"><div class="total-line"><span>Subtotal:</span><span>${moneda(venta.subtotal)}</span></div><div class="total-line"><span>Impuesto (${venta.impuestoPorcentaje}%):</span><span>-${moneda(venta.montoImpuesto)}</span></div><div class="total-line total-final"><span>Total:</span><span>${moneda(venta.totalVenta)}</span></div>${detallePago}</div></div>
    <div class="thanks">¡Gracias por preferirnos!</div>
    <div class="footer">Comprobante oficial generado por el sistema interno ${escaparHtml(EMPRESA.nombreComercial)} · ${escaparHtml(EMPRESA.nombre)}</div>
  </body></html>`
}

/**
 * @description Genera el comprobante de un movimiento de Cuentas usando la
 * misma plantilla visual entregada para Grupo Ruiz.
 * @param cuenta Cuenta afectada por el movimiento.
 * @param movimiento Movimiento recién registrado.
 * @param venta Venta de origen, cuando la cuenta proviene de Ventas.
 * @param cliente Cliente asociado.
 * @returns HTML autocontenido para impresión A4.
 * @businessLogic El número impreso es el correlativo automático del movimiento,
 * no el número de factura; así ambos identificadores permanecen independientes.
 * @dbMigration La cuenta, movimiento, venta y cliente serán relaciones de DB.
 */
export function construirComprobantePagoHtml(
  cuenta: Cuenta,
  movimiento: MovimientoCuenta,
  venta: Venta | null,
  cliente: Cliente | null
): string {
  const numero = movimiento.numeroComprobante ?? '—'
  const nombreCliente = cliente?.nombreRazonSocial ?? 'Cliente no especificado'
  const identificacion = cliente?.identificacion ?? '—'
  const telefono = cliente?.telefono ?? '—'
  const saldo = Math.max(0, cuenta.montoTotal - cuenta.montoPagado)
  const observacion = movimiento.observacion.trim() || 'Ninguna observación registrada.'
  const detalle = venta
    ? `${venta.producto}${venta.numeroLote ? ` · Lote ${venta.numeroLote}` : ''}`
    : movimiento.tipo
  const totalVenta = venta?.totalVenta ?? cuenta.montoTotal
  const cantidad = venta?.pesoBruto
  const precio = venta?.precioUnitario

  return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><title>Comprobante de Pago ${numero}</title><style>${estilosBase()}</style></head><body>
    <div class="header">
      <div class="brand-wrap">${datosEmpresaHtml()}</div>
      <div class="comprobante"><h2>Comprobante de Pago</h2><div class="numero">N° ${escaparHtml(numero)}</div><div class="fecha">Fecha: ${fechaLarga(movimiento.fecha)}</div></div>
    </div>
    <div class="cards">
      <div class="card"><div class="card-title">Datos del cliente</div><p><strong>Cliente:</strong> ${escaparHtml(nombreCliente)}</p><p><strong>RUC/CI:</strong> ${escaparHtml(identificacion)}</p><p><strong>Teléfono:</strong> ${escaparHtml(telefono)}</p></div>
      <div class="card"><div class="card-title">Detalles de venta</div><p><strong>Forma de pago:</strong></p><p>${escaparHtml(movimiento.metodoPago)}</p><p><strong>Estado:</strong> ${escaparHtml(cuenta.estado === 'cerrado' ? 'Pagado' : 'Parcial')}</p></div>
    </div>
    <table><thead><tr><th>Descripción</th><th class="right">Peso neto</th><th class="right">P. Unit.</th><th class="right">Total</th></tr></thead><tbody>
      <tr><td>${escaparHtml(detalle)}</td><td class="right">${cantidad !== undefined ? `${cantidad.toLocaleString('es-EC', { maximumFractionDigits: 2 })} qq` : '—'}</td><td class="right">${precio !== undefined ? moneda(precio) : '—'}</td><td class="right"><strong>${moneda(movimiento.monto)}</strong></td></tr>
    </tbody></table>
    <div class="lower"><div class="observaciones"><strong>Observaciones:</strong>${escaparHtml(observacion)}<p><strong>Movimiento:</strong> ${escaparHtml(movimiento.tipo)}</p>${saldo > 0 ? `<p><strong>Saldo pendiente:</strong> ${moneda(saldo)}</p>` : ''}</div><div class="totales"><div class="total-line"><span>Valor de venta:</span><span>${moneda(totalVenta)}</span></div><div class="total-line"><span>Pago registrado:</span><span>${moneda(movimiento.monto)}</span></div><div class="total-line total-final"><span>Saldo:</span><span>${moneda(saldo)}</span></div></div></div>
    <div class="thanks">¡Gracias por preferirnos!</div>
    <div class="footer">Comprobante oficial generado por el sistema interno ${escaparHtml(EMPRESA.nombreComercial)} · ${escaparHtml(EMPRESA.nombre)}</div>
  </body></html>`
}
