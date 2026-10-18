import { formatoFecha, formatoMoneda, type FilaFinanciera } from '../../utils/reportes'
import {
  PRODUCTOS_REPORTE,
  SIN_PRODUCTO_REPORTE,
  type TotalesFinancieros
} from '../../../../shared/listados'
import ContenedorTabla from '../ContenedorTabla'
export interface ReporteProps {
  resumen: TotalesFinancieros
  filas: FilaFinanciera[]
  reinicio: string
}
export function ReporteMovimientos({
  resumen,
  filas,
  reinicio,
  titulo
}: ReporteProps & { titulo: string }): React.JSX.Element {
  const sinProducto = resumen.desgloseProductos[SIN_PRODUCTO_REPORTE]
  const productos = ([...PRODUCTOS_REPORTE, SIN_PRODUCTO_REPORTE] as const).filter(
    (producto) =>
      producto !== SIN_PRODUCTO_REPORTE ||
      sinProducto.ingresos !== 0 ||
      sinProducto.pagosCompras !== 0
  )
  return (
    <article className="min-w-0 shrink-0 rounded-2xl border border-[#d5e1d7] bg-white p-4 shadow-sm sm:p-5">
      <p className="text-[10px] font-bold uppercase text-[#b68b2c]">
        Grupo Ruiz · RuizCacao Manager
      </p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[22px] font-bold tracking-tight text-[#24352a]">{titulo}</h2>
        <p className="text-[12px] font-medium text-[#24643e]">
          {formatoFecha(resumen.desde)} — {formatoFecha(resumen.hasta)}
        </p>
      </div>
      <p className="mb-4 mt-2 text-[12px] leading-relaxed text-[#59635c]">
        Este modulo solo se muestran valores efectivamente cobrados o pagados dentro del período seleccionado.
        Los pendientes no se suman hasta que sean abonados.
      </p>
      <div className="grid auto-rows-fr grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: 'Ingresos por ventas', monto: resumen.totalIngresos },
          { label: 'Inversión por compras', monto: resumen.totalComprasPagadas },
          {
            label: 'Gastos operativos',
            monto: resumen.totalGastosManuales
          },
          {
            label: 'Resultado del período',
            monto: resumen.saldoPeriodo,
            resultado: true
          }
        ].map(({ label, monto, resultado }) => (
          <div
            key={label}
            className="flex min-w-0 flex-col justify-between gap-1 rounded-xl border border-[#e2e7e2] bg-[#f5f7f4] px-3 py-2"
          >
            <p className="text-[11px] leading-4 text-[#59635c]">{label}</p>
            <strong
              className={[
                'block break-words text-xl leading-6 tabular-nums',
                resultado && monto > 0
                  ? 'text-[#16834b]'
                  : resultado && monto < 0
                    ? 'text-[#9d3029]'
                    : 'text-[#24352a]'
              ].join(' ')}
            >
              {'$'}
              {formatoMoneda(monto)}
            </strong>
          </div>
        ))}
      </div>
      <p className="mb-4 mt-2 text-[11px] leading-relaxed text-[#59635c]">

      </p>
      <div className="mb-5 overflow-x-auto rounded-xl border border-[#e2e7e2]">
        <table className="w-full min-w-[420px] text-left text-[12px]">
          <caption className="p-3 text-left font-semibold">Desglose por producto</caption>
          <thead className="bg-[#f5f7f4] text-[#707972]">
            <tr>
              <th scope="col" className="p-3">
                Producto
              </th>
              <th scope="col" className="p-3 text-right">
                Ingresos por venta
              </th>
              <th scope="col" className="p-3 text-right">
                Inversión por compra
              </th>
            </tr>
          </thead>
          <tbody>
            {productos.map((producto) => (
              <tr key={producto} className="border-t border-[#eef1ee]">
                <th scope="row" className="p-3 font-normal">
                  {producto}
                </th>
                <td className="p-3 text-right tabular-nums">
                  ${formatoMoneda(resumen.desgloseProductos[producto].ingresos)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  ${formatoMoneda(resumen.desgloseProductos[producto].pagosCompras)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-[#e2e7e2] font-semibold">
            <tr>
              <th scope="row" className="p-3">
                Total
              </th>
              <td className="p-3 text-right tabular-nums">
                <span className="mb-1 block text-[11px] font-normal">Total ingresos por ventas</span>$
                {formatoMoneda(resumen.totalIngresos)}
              </td>
              <td className="p-3 text-right tabular-nums">
                <span className="mb-1 block text-[11px] font-normal">
                  Total invertido por compras
                </span>
                ${formatoMoneda(resumen.totalComprasPagadas)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <ContenedorTabla etiqueta="Detalle financiero del periodo" reinicio={reinicio}>
        <table className="w-full min-w-[760px] text-left text-[12px]">
          <thead>
            <tr className="border-b text-[#707972]">
              {['Fecha', 'Tipo', 'Producto', 'Detalle', 'Cobrado', 'Pagado'].map((h) => (
                <th key={h} className="p-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-b border-[#eef1ee]">
                <td className="p-2">{formatoFecha(f.fecha)}</td>
                <td className="p-2">{f.tipo}</td>
                <td className="p-2">{f.producto ?? '—'}</td>
                <td className="p-2">{f.detalle}</td>
                <td className="p-2">{f.monto > 0 ? '$' + formatoMoneda(f.monto) : '—'}</td>
                <td className="p-2">{f.monto < 0 ? '$' + formatoMoneda(-f.monto) : '—'}</td>
              </tr>
            ))}
            {!filas.length && (
              <tr>
                <td colSpan={6} className="p-6 text-center">
                  No hay pagos ni cobros en este periodo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ContenedorTabla>
    </article>
  )
}
export default function ReporteDiario(props: ReporteProps): React.JSX.Element {
  return <ReporteMovimientos {...props} titulo="Reporte diario" />
}
