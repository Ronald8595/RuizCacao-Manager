import { EMPRESA } from '../constants/empresa'
import { LOGO_GRUPO_RUIZ_DATA_URI } from '../assets/brand/logo-grupo-ruiz-data'
import type { ResumenFinanciero } from './reportes'
import {
  PRODUCTOS_REPORTE,
  SIN_PRODUCTO_REPORTE,
  type DesgloseProductos
} from '../../../shared/listados'
export type TipoReportePDF = 'diario' | 'semanal' | 'mensual'
const escapar = (valor: string): string =>
  valor.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )
const dinero = (n: number): string =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function documentoReporte(
  resumen: ResumenFinanciero & { desgloseProductos?: DesgloseProductos },
  tipo: TipoReportePDF,
  generado = new Date()
): { html: string; nombreArchivo: string } {
  const etiqueta = { diario: 'Diario', semanal: 'Semanal', mensual: 'Mensual' }[tipo]
  const rango =
    resumen.desde === resumen.hasta ? resumen.desde : resumen.desde + '_a_' + resumen.hasta
  const indicadores = [
    ['Ingresos por ventas', resumen.totalIngresos],
    ['Inversión por compras', resumen.totalComprasPagadas],
    ['Gastos operativos', resumen.totalGastosManuales],
    ['Resultado del período', resumen.saldoPeriodo]
  ] as const
  // El resumen paginado y el PDF reciben los mismos agregados calculados en Main.
  const desglose = resumen.desgloseProductos
  const productos = ([...PRODUCTOS_REPORTE, SIN_PRODUCTO_REPORTE] as const).filter(
    (producto) =>
      producto !== SIN_PRODUCTO_REPORTE ||
      (desglose && (desglose[producto].ingresos !== 0 || desglose[producto].pagosCompras !== 0))
  )
  const tablaProductos = desglose
    ? `<table aria-label="Desglose por producto"><caption style="text-align:left;padding:8px 0;font-weight:bold">Desglose por producto</caption><thead><tr><th>Producto</th><th class="dinero">Ingresos por venta</th><th class="dinero">Inversión por compra</th></tr></thead><tbody>${productos.map((producto) => `<tr><td>${escapar(producto)}</td><td class="dinero">${dinero(desglose[producto].ingresos)}</td><td class="dinero">${dinero(desglose[producto].pagosCompras)}</td></tr>`).join('')}</tbody><tfoot><tr><th>Total</th><th class="dinero"><span class="etiqueta-total">Total ingresos por ventas</span>${dinero(resumen.totalIngresos)}</th><th class="dinero"><span class="etiqueta-total">Total inversión por compras</span>${dinero(resumen.totalComprasPagadas)}</th></tr></tfoot></table><br>`
    : ''
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
 @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#24352a;margin:0}header{display:flex;gap:16px;align-items:center;border-bottom:2px solid #176b3a;padding-bottom:12px}img{width:72px;height:72px;object-fit:contain}h1{font-size:20px;margin:0 0 5px}h2{font-size:17px;color:#176b3a}p{margin:4px 0}.totales{display:flex;gap:8px;margin:12px 0 0}.total{display:flex;flex-direction:column;justify-content:space-between;gap:4px;min-width:0;flex:1;padding:6px 8px;border:1px solid #c9d7cc;border-radius:5px;background:#f5f7f4}.ayuda,.etiqueta-total{display:block;margin-top:6px;font-size:10px;line-height:1.4;color:#4a5f50;white-space:normal}.ayuda{margin:6px 0 12px}.total strong{display:block;font-size:15px;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#edf4ee;text-align:left}th,td{padding:8px 6px;border-bottom:1px solid #dce5de;vertical-align:top;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.dinero{text-align:right;white-space:nowrap}footer{margin-top:16px;color:#637168;font-size:10px}.vacio{padding:24px;border:1px solid #dce5de;text-align:center}</style></head><body>
 <header><img src="${LOGO_GRUPO_RUIZ_DATA_URI}" alt="Grupo Ruiz"><div><h1>${escapar(EMPRESA.nombre)}</h1><p>${escapar(EMPRESA.nombreComercial)} · RuizCacao Manager</p><p>RUC: ${escapar(EMPRESA.ruc)}</p><p>${escapar(EMPRESA.direccion)}</p></div></header>
 <h2>Reporte ${etiqueta}</h2><p>Desde: ${escapar(resumen.desde)} · Hasta: ${escapar(resumen.hasta)}</p><p>Generado: ${escapar(generado.toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }))}</p>
 <div class="totales">${indicadores.map(([titulo, valor]) => `<div class="total"><span>${titulo}</span><strong>${dinero(valor)}</strong></div>`).join('')}</div>
 <p class="ayuda"></p>
 ${tablaProductos}
 ${resumen.filas.length ? `<table aria-label="Detalle financiero"><thead><tr><th style="width:12%">Fecha</th><th style="width:16%">Tipo</th><th style="width:16%">Producto</th><th style="width:28%">Detalle</th><th style="width:14%" class="dinero">Cobrado</th><th style="width:14%" class="dinero">Pagado</th></tr></thead><tbody>${resumen.filas.map((f) => `<tr><td>${escapar(f.fecha)}</td><td>${escapar(f.tipo)}</td><td>${escapar(f.producto ?? '—')}</td><td>${escapar(f.detalle)}</td><td class="dinero">${f.monto > 0 ? dinero(f.monto) : '—'}</td><td class="dinero">${f.monto < 0 ? dinero(-f.monto) : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="vacio">No hay movimientos efectivos en el periodo seleccionado.</p>'}
 <footer> En este modulo solo se muestran valores efectivamente cobrados o pagados dentro del período seleccionado. Los pendientes no se suman hasta que sean abonados. El resultado del período corresponde al flujo de caja, no a la utilidad contable.</footer></body></html>`
  return { html, nombreArchivo: `Reporte_${etiqueta}_${rango}` }
}
