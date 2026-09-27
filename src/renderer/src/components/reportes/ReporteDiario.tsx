import { formatoFecha, formatoMoneda, type ResumenFinanciero } from '../../utils/reportes'
export interface ReporteProps {
  resumen: ResumenFinanciero
}
export function ReporteMovimientos({
  resumen,
  titulo
}: ReporteProps & { titulo: string }): React.JSX.Element {
  return (
    <article className="rounded-2xl border border-[#e2e7e2] bg-white p-5">
      <p className="text-[10px] font-bold uppercase text-[#b68b2c]">
        Grupo Ruiz · RuizCacao Manager
      </p>
      <h2 className="mt-1 text-[17px] font-bold">{titulo}</h2>
      <p className="my-2 text-[12px] text-[#707972]">
        Solo dinero efectivamente cobrado o pagado, según la fecha de cada movimiento. Los
        pendientes no se suman.
      </p>
      <p className="mb-4 text-[12px] text-[#16834b]">
        {formatoFecha(resumen.desde)} — {formatoFecha(resumen.hasta)}
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Ingresos', resumen.totalIngresos],
          ['Pagos de compras', resumen.totalComprasPagadas],
          ['Egresos', resumen.totalGastos],
          ['Saldo del periodo', resumen.saldoPeriodo]
        ].map(([label, monto]) => (
          <div key={label} className="rounded-xl bg-[#f5f7f4] p-3">
            <p className="text-[11px]">{label}</p>
            <strong>
              {'$'}
              {formatoMoneda(Number(monto))}
            </strong>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-[12px]">
          <thead>
            <tr className="border-b text-[#707972]">
              {['Fecha', 'Tipo', 'Detalle', 'Ingreso', 'Egreso'].map((h) => (
                <th key={h} className="p-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resumen.filas.map((f) => (
              <tr key={f.id} className="border-b border-[#eef1ee]">
                <td className="p-2">{formatoFecha(f.fecha)}</td>
                <td className="p-2">{f.tipo}</td>
                <td className="p-2">{f.detalle}</td>
                <td className="p-2">{f.monto > 0 ? '$' + formatoMoneda(f.monto) : '—'}</td>
                <td className="p-2">{f.monto < 0 ? '$' + formatoMoneda(-f.monto) : '—'}</td>
              </tr>
            ))}
            {!resumen.filas.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center">
                  No hay pagos ni cobros en este periodo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  )
}
export default function ReporteDiario(props: ReporteProps): React.JSX.Element {
  return <ReporteMovimientos {...props} titulo="Reporte diario" />
}
