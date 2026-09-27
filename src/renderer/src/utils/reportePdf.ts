import { EMPRESA } from '../constants/empresa'
import { LOGO_GRUPO_RUIZ_DATA_URI } from '../assets/brand/logo-grupo-ruiz-data'
import type { ResumenFinanciero } from './reportes'
export type TipoReportePDF = 'diario' | 'semanal' | 'mensual'
const escapar = (valor: string): string =>
  valor.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )
const dinero = (n: number): string =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function documentoReporte(
  resumen: ResumenFinanciero,
  tipo: TipoReportePDF,
  generado = new Date()
): { html: string; nombreArchivo: string } {
  const etiqueta = { diario: 'Diario', semanal: 'Semanal', mensual: 'Mensual' }[tipo]
  const rango =
    resumen.desde === resumen.hasta ? resumen.desde : resumen.desde + '_a_' + resumen.hasta
  const indicadores = [
    ['Ingresos', resumen.totalIngresos],
    ['Pagos de compras', resumen.totalComprasPagadas],
    ['Egresos', resumen.totalGastos],
    ['Saldo del periodo', resumen.saldoPeriodo]
  ] as const
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
 @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#24352a;margin:0}header{display:flex;gap:16px;align-items:center;border-bottom:2px solid #176b3a;padding-bottom:12px}img{width:72px;height:72px;object-fit:contain}h1{font-size:20px;margin:0 0 5px}h2{font-size:17px;color:#176b3a}p{margin:4px 0}.totales{display:flex;gap:8px;margin:18px 0}.total{flex:1;padding:10px;border:1px solid #c9d7cc;border-radius:5px}.total strong{display:block;margin-top:8px;font-size:15px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#edf4ee;text-align:left}th,td{padding:8px 6px;border-bottom:1px solid #dce5de;vertical-align:top;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.dinero{text-align:right;white-space:nowrap}footer{margin-top:16px;color:#637168;font-size:10px}.vacio{padding:24px;border:1px solid #dce5de;text-align:center}</style></head><body>
 <header><img src="${LOGO_GRUPO_RUIZ_DATA_URI}" alt="Grupo Ruiz"><div><h1>${escapar(EMPRESA.nombre)}</h1><p>${escapar(EMPRESA.nombreComercial)} · RuizCacao Manager</p><p>RUC: ${escapar(EMPRESA.ruc)}</p><p>${escapar(EMPRESA.direccion)}</p></div></header>
 <h2>Reporte ${etiqueta}</h2><p>Desde: ${escapar(resumen.desde)} · Hasta: ${escapar(resumen.hasta)}</p><p>Generado: ${escapar(generado.toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }))}</p>
 <div class="totales">${indicadores.map(([titulo, valor]) => `<div class="total">${titulo}<strong>${dinero(valor)}</strong></div>`).join('')}</div>
 ${resumen.filas.length ? `<table><thead><tr><th style="width:14%">Fecha</th><th style="width:19%">Tipo</th><th style="width:39%">Detalle</th><th style="width:14%" class="dinero">Ingreso</th><th style="width:14%" class="dinero">Egreso</th></tr></thead><tbody>${resumen.filas.map((f) => `<tr><td>${escapar(f.fecha)}</td><td>${escapar(f.tipo)}</td><td>${escapar(f.detalle)}</td><td class="dinero">${f.monto > 0 ? dinero(f.monto) : '—'}</td><td class="dinero">${f.monto < 0 ? dinero(-f.monto) : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="vacio">No hay movimientos efectivos en el periodo seleccionado.</p>'}
 <footer>Este reporte muestra dinero efectivamente cobrado o pagado. El saldo del periodo corresponde al flujo de caja.</footer></body></html>`
  return { html, nombreArchivo: `Reporte_${etiqueta}_${rango}` }
}
