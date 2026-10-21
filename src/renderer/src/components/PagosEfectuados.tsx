import { useMemo } from 'react'
import { useAppData } from '../store/AppDataContext'
import { useReportePeriodo } from '../hooks/useListados'
import { LIMITES_PAGINA_REPORTE } from '../../../shared/listados'
import { formatoFecha, formatoMoneda } from '../utils/reportes'
import Paginacion from './Paginacion'
import ContenedorTabla from './ContenedorTabla'
import { inputClass } from './FormField'

export default function PagosEfectuados({
  desde,
  hasta,
  setDesde,
  setHasta
}: {
  desde: string
  hasta: string
  setDesde: (v: string) => void
  setHasta: (v: string) => void
}): React.JSX.Element {
  const { movimientosCuenta, gastos, cuentas } = useAppData()
  const revision = useMemo(
    () => [movimientosCuenta, gastos, cuentas],
    [movimientosCuenta, gastos, cuentas]
  )
  const consulta = useReportePeriodo({ desde, hasta, categoria: 'pagos' }, revision)
  const resumen = consulta.pagina?.resumen
  return (
    <div className="space-y-4">
      <p className="text-xs text-[#59635c]">
        Pagos de compras y gastos operativos por fecha efectiva. La compra conserva su fecha
        original; cada pago aparece una sola vez.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">
          Desde
          <input
            aria-label="Pagos desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className={inputClass(false)}
          />
        </label>
        <label className="text-xs">
          Hasta
          <input
            aria-label="Pagos hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className={inputClass(false)}
          />
        </label>
      </div>
      {consulta.cargando && <p role="status">Cargando pagos…</p>}
      {consulta.error && (
        <p role="alert">
          {consulta.error} <button onClick={consulta.reintentar}>Reintentar</button>
        </p>
      )}
      {resumen && (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3">
            <dt className="text-xs">Inversión por compras</dt>
            <dd className="text-lg font-bold">${formatoMoneda(resumen.totalComprasPagadas)}</dd>
          </div>
          <div className="rounded-xl border p-3">
            <dt className="text-xs">Gastos operativos</dt>
            <dd className="text-lg font-bold">${formatoMoneda(resumen.totalGastosManuales)}</dd>
          </div>
        </dl>
      )}
      <ContenedorTabla
        etiqueta="Pagos efectuados"
        reinicio={JSON.stringify([desde, hasta, consulta.numero, consulta.limite])}
      >
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead>
            <tr>
              {['Fecha efectiva', 'Concepto', 'Referencia / fecha original', 'Importe'].map((h) => (
                <th key={h} className="p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {consulta.filas.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="p-3">{formatoFecha(f.fecha)}</td>
                <td className="p-3">{f.concepto ?? f.tipo}</td>
                <td className="p-3">
                  {f.detalle}
                  <span className="mt-1 block text-[#59635c]">{f.trazabilidad}</span>
                </td>
                <td className="p-3 font-semibold">${formatoMoneda(-f.monto)}</td>
              </tr>
            ))}
            {!consulta.cargando && !consulta.error && !consulta.filas.length && (
              <tr>
                <td colSpan={4} className="p-5 text-center">
                  No hay pagos en este período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ContenedorTabla>
      <Paginacion {...consulta} limites={LIMITES_PAGINA_REPORTE} />
    </div>
  )
}
