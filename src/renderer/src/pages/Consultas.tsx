import { useNotificacion } from '../store/NotificacionContext'
import Paginacion from '../components/Paginacion'
import { useReportePeriodo } from '../hooks/useListados'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ClipboardList } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ReporteDiario from '../components/reportes/ReporteDiario'
import ReporteSemanal from '../components/reportes/ReporteSemanal'
import ReporteMensual from '../components/reportes/ReporteMensual'
import { useAppData } from '../store/AppDataContext'
import { rangoDiaActual, rangoMesActual, rangoSemanaActual } from '../utils/reportes'
import { LIMITES_PAGINA_REPORTE } from '../../../shared/listados'

type TipoReporte = 'diario' | 'semanal' | 'mensual'

/**
 * Consultas trabaja con rangos arbitrarios. Los tres formatos de reporte
 * son fijos y automáticos; el usuario elige el periodo, no la plantilla.
 */
function Consultas(): React.JSX.Element {
  const { cuentas } = useAppData()
  const { notificar } = useNotificacion()
  const [exportando, setExportando] = useState(false)
  const [errorPDF, setErrorPDF] = useState('')

  async function generarPDF(): Promise<void> {
    if (!desde || !hasta || desde > hasta) {
      const mensaje = 'Revisa el rango de fechas.'
      setErrorPDF(mensaje)
      notificar('error', mensaje)
      return
    }

    setExportando(true)
    setErrorPDF('')
    try {
      const respuesta = await window.api.datos.documentoReporte({ desde, hasta }, tipoReporte)
      if (!respuesta.ok) throw new Error(respuesta.error)
      const doc = respuesta.valor
      const resultado = await window.api.generarReportePDF(doc.html, doc.nombreArchivo, () =>
        notificar('exito', 'Reporte generado correctamente. Selecciona dónde guardarlo.')
      )
      if (resultado.error) {
        setErrorPDF(resultado.error)
        notificar('error', resultado.error)
      } else if (!resultado.canceled && resultado.filePath) {
        notificar('exito', 'Reporte guardado con éxito.')
      }
    } catch {
      const mensaje = 'No se pudo generar el PDF. Intenta nuevamente.'
      setErrorPDF(mensaje)
      notificar('error', mensaje)
    } finally {
      setExportando(false)
    }
  }
  const [tipoReporte, setTipoReporte] = useState<TipoReporte>('diario')
  const inicial = rangoDiaActual()
  const [desde, setDesde] = useState(inicial.desde)
  const [hasta, setHasta] = useState(inicial.hasta)
  const [rangoAutomatico, setRangoAutomatico] = useState(true)

  // El modo también invalida la navegación, incluso cuando conserva el rango.
  const revision = useMemo(() => ({ cuentas, tipoReporte }), [cuentas, tipoReporte])
  const historial = useReportePeriodo({ desde, hasta }, revision)
  const resumen = historial.pagina?.resumen

  function seleccionarTipo(tipo: TipoReporte): void {
    setTipoReporte(tipo)
    setRangoAutomatico(true)
    const rango =
      tipo === 'diario'
        ? rangoDiaActual()
        : tipo === 'semanal'
          ? rangoSemanaActual()
          : rangoMesActual()
    setDesde(rango.desde)
    setHasta(rango.hasta)
  }

  useEffect(() => {
    if (!rangoAutomatico) return
    const sincronizar = (): void => {
      const rango =
        tipoReporte === 'diario'
          ? rangoDiaActual()
          : tipoReporte === 'semanal'
            ? rangoSemanaActual()
            : rangoMesActual()
      setDesde(rango.desde)
      setHasta(rango.hasta)
    }
    sincronizar()
    const timer = window.setInterval(sincronizar, 60_000)
    return () => window.clearInterval(timer)
  }, [tipoReporte, rangoAutomatico])

  const ReporteActual =
    tipoReporte === 'diario'
      ? ReporteDiario
      : tipoReporte === 'semanal'
        ? ReporteSemanal
        : ReporteMensual

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto [&>*]:shrink-0 p-4 sm:p-6 lg:p-7">
      <PageHeader greeting="Consultas y Reportes" subtitle="" />

      <div
        role="group"
        aria-label="Filtros del reporte"
        className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[#e2e7e2] bg-[#f5f7f4] p-2.5"
      >
        <div className="flex items-center gap-1">
          {(
            [
              ['diario', 'Diario'],
              ['semanal', 'Semanal'],
              ['mensual', 'Mensual']
            ] as const
          ).map(([tipo, label]) => (
            <button
              key={tipo}
              type="button"
              aria-pressed={tipoReporte === tipo}
              onClick={() => seleccionarTipo(tipo)}
              className={[
                'flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16834b]',
                tipoReporte === tipo
                  ? 'bg-white text-[#16834b] shadow-sm'
                  : 'text-[#59635c] hover:bg-white'
              ].join(' ')}
            >
              <CalendarDays size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="grid min-w-0 flex-1 basis-72 grid-cols-2 gap-2 sm:flex-none sm:basis-auto">
          <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-[11px] font-semibold text-[#4a524c]">Desde</span>
            <input
              type="date"
              value={desde}
              onChange={(e) => {
                setDesde(e.target.value)
                setRangoAutomatico(false)
              }}
              className="min-w-0 w-full rounded-lg border border-[#e1e5e1] bg-white px-2 py-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16834b] sm:w-36"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-[11px] font-semibold text-[#4a524c]">Hasta</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => {
                setHasta(e.target.value)
                setRangoAutomatico(false)
              }}
              className="min-w-0 w-full rounded-lg border border-[#e1e5e1] bg-white px-2 py-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16834b] sm:w-36"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void generarPDF()}
          disabled={exportando || !resumen || historial.cargando}
          className="ml-auto shrink-0 rounded-lg border border-[#cbd6cd] bg-white px-3 py-2 text-[12px] font-semibold text-[#24643e] hover:bg-[#e7f4eb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16834b] disabled:opacity-40"
        >
          {exportando ? 'Generando…' : 'Generar PDF'}
        </button>
      </div>
      {errorPDF && (
        <p role="alert" className="mb-3 text-sm text-[#9d3029]">
          {errorPDF}
        </p>
      )}
      {historial.cargando ? (
        <p role="status">Cargando reporte…</p>
      ) : historial.error ? (
        <p role="alert">
          {historial.error} <button onClick={historial.reintentar}>Reintentar</button>
        </p>
      ) : !resumen ? (
        <EmptyState
          icon={ClipboardList}
          title="Aún no hay movimientos para consultar"
          description="Cuando registres cobros, pagos de compras o gastos, podrás consultar cualquier rango de fechas y ver el resumen diario, semanal o mensual en este modulo."
        />
      ) : (
        <>
          <ReporteActual
            resumen={resumen}
            filas={historial.filas}
            reinicio={JSON.stringify([
              historial.numero,
              historial.limite,
              desde,
              hasta,
              tipoReporte
            ])}
          />
        </>
      )}
      <Paginacion {...historial} limites={LIMITES_PAGINA_REPORTE} />
    </section>
  )
}

export default Consultas
