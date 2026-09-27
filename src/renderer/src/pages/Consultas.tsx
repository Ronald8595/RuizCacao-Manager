import { useNotificacion } from '../store/NotificacionContext'
import { documentoReporte } from '../utils/reportePdf'
import { useEffect, useState } from 'react'
import { CalendarDays, ClipboardList } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ReporteDiario from '../components/reportes/ReporteDiario'
import ReporteSemanal from '../components/reportes/ReporteSemanal'
import ReporteMensual from '../components/reportes/ReporteMensual'
import { useAppData } from '../store/AppDataContext'
import {
  rangoDiaActual,
  rangoMesActual,
  rangoSemanaActual,
  resumirPeriodo
} from '../utils/reportes'

type TipoReporte = 'diario' | 'semanal' | 'mensual'

/**
 * Consultas trabaja con rangos arbitrarios. Los tres formatos de reporte
 * son fijos y automáticos; el usuario elige el periodo, no la plantilla.
 */
function Consultas(): React.JSX.Element {
  const { ventas, gastos, movimientosCuenta, cuentas, compras } = useAppData()
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
      const doc = documentoReporte(resumen, tipoReporte)
      const resultado = await window.api.generarReportePDF(
        doc.html,
        doc.nombreArchivo,
        () => notificar('exito', 'Reporte generado correctamente. Selecciona dónde guardarlo.')
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

  const resumen = resumirPeriodo(ventas, gastos, desde, hasta, movimientosCuenta, cuentas, compras)

  function seleccionarTipo(tipo: TipoReporte): void {
    setTipoReporte(tipo)
    setRangoAutomatico(true)
    const rango =
      tipo === 'diario' ? rangoDiaActual() : tipo === 'semanal' ? rangoSemanaActual() : rangoMesActual()
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
    tipoReporte === 'diario' ? ReporteDiario : tipoReporte === 'semanal' ? ReporteSemanal : ReporteMensual

  const hayDatos = movimientosCuenta.length > 0 || gastos.some(g => g.tipo === 'manual')

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 lg:p-7">
      <PageHeader
        greeting="Consultas y Reportes"
        subtitle=""
      />

      <div className="mb-5 rounded-2xl border border-[#e2e7e2] bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {([
            ['diario', 'Diario'],
            ['semanal', 'Semanal'],
            ['mensual', 'Mensual']
          ] as const).map(([tipo, label]) => (
            <button
              key={tipo}
              type="button"
              onClick={() => seleccionarTipo(tipo)}
              className={[
                'flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12px] font-semibold transition-colors',
                tipoReporte === tipo
                  ? 'bg-[#e7f4eb] text-[#16834b]'
                  : 'text-[#707972] hover:bg-[#f5f7f4]'
              ].join(' ')}
            >
              <CalendarDays size={15} />
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-[#4a524c]">Desde</span>
            <input
              type="date"
              value={desde}
              onChange={(e) => { setDesde(e.target.value); setRangoAutomatico(false) }}
              className="w-full rounded-xl border border-[#e1e5e1] px-3 py-2.5 text-[13px] outline-none focus:border-[#16834b]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-[#4a524c]">Hasta</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => { setHasta(e.target.value); setRangoAutomatico(false) }}
              className="w-full rounded-xl border border-[#e1e5e1] px-3 py-2.5 text-[13px] outline-none focus:border-[#16834b]"
            />
          </label>
          
        </div>
      </div>

      <div className="mb-4">
        <button type="button" onClick={()=>void generarPDF()} disabled={exportando} className="rounded-xl bg-[#16834b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{exportando?'Generando…':'Generar PDF'}</button>
        {errorPDF&&<p role="alert" className="mt-3 text-sm text-[#9d3029]">{errorPDF}</p>}
      </div>
      {!hayDatos ? (
        <EmptyState
          icon={ClipboardList}
          title="Aún no hay movimientos para consultar"
          description="Cuando registres cobros, pagos de compras o gastos, podrás consultar cualquier rango de fechas y ver el resumen diario, semanal o mensual en este modulo."
        />
      ) : (
        <>
          <ReporteActual resumen={resumen} />
        </>
      )}
    </section>
  )
}

export default Consultas
