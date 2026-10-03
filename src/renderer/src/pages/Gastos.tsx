import { ErrorNegocio } from '../../../shared/errorNegocio'
import { useState, type FormEvent } from 'react'
import Paginacion from '../components/Paginacion'
import ContenedorTabla from '../components/ContenedorTabla'
import { useListadoGastos, useResumenGastos } from '../hooks/useListados'
import {
  TrendingDown,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  Eye,
  ListChecks,
  BarChart3,
  CheckCircle,
  Clock
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { FormField, inputClass } from '../components/FormField'
import ModalAccesible from '../components/ModalAccesible'
import SelectorEmpleado from '../components/SelectorEmpleado'
import { useAppData, CATEGORIAS_GASTO, CATEGORIAS_GASTO_MANUAL } from '../store/AppDataContext'
import { useNotificacion } from '../store/NotificacionContext'
import { useFechaActual, useFiltroDiaActual } from '../hooks/useFechaActual'
import type { CategoriaGasto, Gasto, GastoFormData, TipoGasto } from '../types'

// ============================================================
// Módulo de Gastos (CRUD de gastos manuales + vista de automáticos)
//
// Un gasto 'automatico' viene de una compra en Stock: aquí sólo se puede
// VER su detalle (con el vínculo al movimiento de Stock que lo generó),
// nunca editarlo ni eliminarlo. Si hubo un error, se corrige en Stock con
// un ajuste inverso — así el gasto y el movimiento de stock nunca quedan
// desincronizados.
//
// Un gasto 'manual' (Transporte, Mano de obra, Insumos, Servicios, Otros)
// sí tiene CRUD completo: se crea, edita y elimina desde aquí.
// ============================================================

type Vista = 'lista' | 'resumen'
type PeriodoResumen = 'diario' | 'semanal' | 'mensual' | 'rango'

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function num(valor: string): number {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

function formatoMoneda(valor: number): string {
  return valor.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fechaDesdeISO(fechaISO: string): Date {
  const [anio, mes, dia] = fechaISO.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

function fechaAISO(fecha: Date): string {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function rangoParaResumen(
  periodo: Exclude<PeriodoResumen, 'rango'>,
  referencia: string
): { desde: string; hasta: string } {
  const fecha = fechaDesdeISO(referencia)
  if (periodo === 'diario') return { desde: referencia, hasta: referencia }
  if (periodo === 'semanal') {
    const inicio = new Date(fecha)
    const desplazamiento = (fecha.getDay() + 6) % 7
    inicio.setDate(fecha.getDate() - desplazamiento)
    const fin = new Date(inicio)
    fin.setDate(inicio.getDate() + 6)
    return { desde: fechaAISO(inicio), hasta: fechaAISO(fin) }
  }
  const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), 1)
  const fin = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0)
  return { desde: fechaAISO(inicio), hasta: fechaAISO(fin) }
}

const FORM_VACIO: GastoFormData = {
  fecha: hoyISO(),
  categoria: 'Transporte',
  concepto: '',
  monto: 0,
  comprobante: '',
  observacion: ''
}

type Errores = Partial<
  Record<'empleado_id' | 'monto' | 'observacion' | 'fecha' | 'general', string>
>

function validar(form: GastoFormData): Errores {
  const errores: Errores = {}
  if (!form.fecha) errores.fecha = 'La fecha es obligatoria.'
  if (form.categoria === 'Mano de obra' && !form.empleado_id)
    errores.empleado_id = 'Selecciona un trabajador de la lista.'
  if (!(form.monto > 0)) errores.monto = 'El monto debe ser mayor a 0.'
  if (form.observacion.length > 500) errores.observacion = 'Máximo 500 caracteres.'
  return errores
}

// ============================================================
// Modal: crear / editar gasto manual
// ============================================================

interface GastoFormModalProps {
  gastoEditando: Gasto | null
  onGuardar: (data: GastoFormData, idActual: string | null) => void
  onCancelar: () => void
}

function GastoFormModal({
  gastoEditando,
  onGuardar,
  onCancelar
}: GastoFormModalProps): React.JSX.Element {
  const { fechaJornadaActiva } = useAppData()
  const [form, setForm] = useState<GastoFormData>(
    gastoEditando
      ? {
          fecha: gastoEditando.fecha,
          categoria: gastoEditando.categoria,
          concepto: gastoEditando.concepto,
          monto: gastoEditando.monto,
          comprobante: gastoEditando.comprobante ?? '',
          observacion: gastoEditando.observacion ?? '',
          empleado_id: gastoEditando.empleado_id,
          tipo_pago: gastoEditando.tipo_pago ?? 'pago'
        }
      : { ...FORM_VACIO, fecha: fechaJornadaActiva ?? hoyISO(), tipo_pago: 'pago' }
  )
  const [montoTexto, setMontoTexto] = useState(gastoEditando ? String(gastoEditando.monto) : '')
  const [errores, setErrores] = useState<Errores>({})
  function actualizar<K extends keyof GastoFormData>(campo: K, valor: GastoFormData[K]): void {
    setForm((prev) => ({ ...prev, [campo]: valor }))
    setErrores((prev) => ({ ...prev, [campo]: undefined, general: undefined }))
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const formConMonto: GastoFormData = { ...form, monto: num(montoTexto) }
    const nuevosErrores = validar(formConMonto)
    setErrores(nuevosErrores)
    if (Object.keys(nuevosErrores).length === 0) {
      try {
        await onGuardar(
          {
            ...formConMonto,
            comprobante: formConMonto.comprobante?.trim() || undefined,
            observacion: formConMonto.observacion.trim()
          },
          gastoEditando?.id ?? null
        )
      } catch (cause) {
        setErrores({
          general: cause instanceof ErrorNegocio ? cause.message : 'Error al procesar la operación'
        })
      }
    }
  }

  return (
    <ModalAccesible tituloId="formulario-gasto-titulo" onCerrar={onCancelar} ancho="max-w-[520px]">
      <div className="mb-5 flex items-center justify-between">
        <h2 id="formulario-gasto-titulo" className="text-[16px] font-bold text-[#272c29]">
          {gastoEditando ? 'Editar gasto' : 'Nuevo gasto'}
        </h2>
        <button
          type="button"
          onClick={onCancelar}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#f0f4f0]"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Fecha" error={errores.fecha} obligatorio>
            <input
              type="date"
              required
              value={form.fecha}
              disabled
              className={`${inputClass(false)} disabled:cursor-not-allowed disabled:bg-[#f5f7f4] disabled:text-[#5b635e]`}
            />
          </FormField>
          <FormField label="Categoría" obligatorio>
            <select
              value={form.categoria}
              onChange={(e) => {
                const categoria = e.target.value as CategoriaGasto
                setForm((prev) => ({
                  ...prev,
                  categoria,
                  empleado_id: undefined,
                  tipo_pago: 'pago',
                  concepto: ''
                }))
                if (categoria === 'Mano de obra') setMontoTexto('')
                setErrores({})
              }}
              className={inputClass(false)}
            >
              {CATEGORIAS_GASTO_MANUAL.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {form.categoria === 'Mano de obra' && (
          <>
            <SelectorEmpleado
              value={form.empleado_id}
              onChange={(value) => actualizar('empleado_id', value)}
              error={errores.empleado_id}
            />
            <fieldset>
              <legend className="mb-2 text-[12px] font-semibold text-[#4a524c]">
                Tipo de pago *
              </legend>
              <div className="flex flex-wrap gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#e1e5e1] px-3 py-2 text-[13px]">
                  <input
                    type="radio"
                    name="tipo_pago"
                    value="pago"
                    checked={form.tipo_pago === 'pago'}
                    onChange={() => actualizar('tipo_pago', 'pago')}
                    required
                  />
                  <CheckCircle size={16} className="text-[#176b3a]" />
                  Pago completo
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#e1e5e1] px-3 py-2 text-[13px]">
                  <input
                    type="radio"
                    name="tipo_pago"
                    value="adelanto"
                    checked={form.tipo_pago === 'adelanto'}
                    onChange={() => {
                      actualizar('tipo_pago', 'adelanto')
                      setMontoTexto('')
                    }}
                  />
                  <Clock size={16} className="text-[#8c6818]" />
                  Adelanto
                </label>
              </div>
            </fieldset>
          </>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Monto ($)" error={errores.monto} obligatorio>
            <input
              type="number"
              min={0}
              step="0.01"
              value={montoTexto}
              onChange={(e) => setMontoTexto(e.target.value)}
              className={inputClass(!!errores.monto)}
              placeholder={
                form.categoria === 'Mano de obra'
                  ? 'Ingrese el valor pagado al trabajador'
                  : undefined
              }
            />
          </FormField>
          <FormField label="Comprobante">
            <input
              type="text"
              maxLength={40}
              value={form.comprobante}
              onChange={(e) => actualizar('comprobante', e.target.value)}
              className={inputClass(false)}
              placeholder="Opcional: N.º de recibo/factura"
            />
          </FormField>
        </div>

        <FormField label="Observación" error={errores.observacion}>
          <textarea
            value={form.observacion}
            onChange={(e) => actualizar('observacion', e.target.value)}
            rows={3}
            maxLength={500}
            className={inputClass(!!errores.observacion) + ' resize-none'}
            placeholder="Detalle adicional del gasto (opcional)"
          />
        </FormField>

        {errores.general && (
          <p role="alert" className="text-[13px] text-[#9d3029]">
            {errores.general}
          </p>
        )}
        <div className="flex items-center justify-end gap-3 border-t border-[#eef1ee] pt-4">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-xl border border-[#e1e5e1] px-4 py-2.5 text-[13px] font-semibold text-[#5b635e] hover:bg-[#f5f7f4]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-xl bg-[#16834b] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#146b3e]"
          >
            Guardar gasto
          </button>
        </div>
      </form>
    </ModalAccesible>
  )
}

// ============================================================
// Página principal
// ============================================================

function Gastos(): React.JSX.Element {
  const {
    gastos,
    movimientosStock,
    estadoJornada,
    fechaJornadaActiva,
    crearGastoManual,
    actualizarGastoManual,
    eliminarGastoManual
  } = useAppData()
  const { notificar } = useNotificacion()

  const fechaActual = useFechaActual()
  const [vista, setVista] = useState<Vista>('lista')
  const [periodoResumen, setPeriodoResumen] = useState<PeriodoResumen>('rango')
  const [fechaResumenManual, setFechaResumenManual] = useState<string | null>(null)
  const fechaResumen = fechaResumenManual ?? fechaJornadaActiva ?? fechaActual
  const [modalAbierto, setModalAbierto] = useState(false)
  const [gastoEditando, setGastoEditando] = useState<Gasto | null>(null)
  const [gastoAEliminar, setGastoAEliminar] = useState<Gasto | null>(null)
  const [gastoDetalle, setGastoDetalle] = useState<Gasto | null>(null)

  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaGasto | 'Todas'>('Todas')
  const [filtroTipo, setFiltroTipo] = useState<TipoGasto | 'Todos'>('Todos')
  const {
    desde: filtroDesde,
    hasta: filtroHasta,
    setDesde: setFiltroDesde,
    setHasta: setFiltroHasta
  } = useFiltroDiaActual()

  function abrirNuevo(): void {
    if (estadoJornada !== 'activa' || !fechaJornadaActiva) {
      notificar('advertencia', 'Debe iniciar una jornada para registrar gastos operativos.')
      return
    }
    setGastoEditando(null)
    setModalAbierto(true)
  }

  function abrirEditar(g: Gasto): void {
    setGastoEditando(g)
    setModalAbierto(true)
  }

  async function guardarGasto(data: GastoFormData, idActual: string | null): Promise<void> {
    try {
      if (idActual) {
        await actualizarGastoManual(idActual, data)
        notificar('exito', 'Gasto actualizado con éxito.')
      } else {
        await crearGastoManual(data)
        notificar('exito', 'Gasto registrado con éxito.')
      }
      setModalAbierto(false)
      setGastoEditando(null)
    } catch {
      return
    }
  }

  async function confirmarEliminar(): Promise<void> {
    try {
      if (gastoAEliminar) await eliminarGastoManual(gastoAEliminar.id)
      setGastoAEliminar(null)
    } catch {
      return
    }
  }

  const historial = useListadoGastos(
    { desde: filtroDesde, hasta: filtroHasta, categoria: filtroCategoria, tipo: filtroTipo },
    gastos,
    vista === 'lista'
  )
  const gastosFiltrados = historial.filas
  const rango =
    periodoResumen === 'rango'
      ? { desde: filtroDesde, hasta: filtroHasta }
      : rangoParaResumen(periodoResumen, fechaResumen)
  const consultaResumen = useResumenGastos(rango, gastos, vista === 'resumen')
  const resumen = consultaResumen.pagina?.resumen ?? {
    ...rango,
    totalesPorCategoria: {} as Record<string, number>,
    totalOperativos: 0,
    totalCompras: 0,
    totalEgresos: 0
  }

  const movimientoDelDetalle = gastoDetalle?.referenciaStockId
    ? (movimientosStock.find((m) => m.id === gastoDetalle.referenciaStockId) ?? null)
    : null

  const hayGastos = gastos.length > 0

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto [&>*]:shrink-0 p-4 sm:p-6 lg:p-7">
      <PageHeader
        greeting="Gastos"
        subtitle="Pagos de compras y gastos operativos registrados manualmente."
        actions={
          <button
            type="button"
            onClick={abrirNuevo}
            className="flex items-center gap-2 rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#146b3e]"
          >
            <Plus size={16} />
            Nuevo gasto
          </button>
        }
      />

      {/* ===== TABS ===== */}
      <div className="mb-5 flex items-center gap-2 border-b border-[#eef1ee]">
        <button
          type="button"
          onClick={() => setVista('lista')}
          className={[
            'flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-semibold',
            vista === 'lista'
              ? 'border-[#16834b] text-[#16834b]'
              : 'border-transparent text-[#8a938d] hover:text-[#5b635e]'
          ].join(' ')}
        >
          <ListChecks size={15} />
          Lista de gastos
        </button>
        <button
          type="button"
          onClick={() => setVista('resumen')}
          className={[
            'flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-semibold',
            vista === 'resumen'
              ? 'border-[#16834b] text-[#16834b]'
              : 'border-transparent text-[#8a938d] hover:text-[#5b635e]'
          ].join(' ')}
        >
          <BarChart3 size={15} />
          Resumen
        </button>
      </div>

      {!hayGastos ? (
        <EmptyState
          icon={TrendingDown}
          title="Todavía no hay gastos registrados"
          description="Las compras aparecen en este modulo con lo pagado y lo pendiente. Puedes registrar gastos operativos de forma manual."
        />
      ) : vista === 'lista' ? (
        <>
          {/* ===== FILTROS ===== */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value as CategoriaGasto | 'Todas')}
              className="h-10 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none"
            >
              <option value="Todas">Todas las categorías</option>
              {CATEGORIAS_GASTO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as TipoGasto | 'Todos')}
              className="h-10 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none"
            >
              <option value="Todos">Compras y gastos operativos</option>
              <option value="automatico">Sólo compras</option>
              <option value="manual">Sólo gastos operativos</option>
            </select>

            <input
              type="date"
              value={filtroDesde}
              onChange={(e) => setFiltroDesde(e.target.value)}
              className="h-10 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none"
              aria-label="Desde"
            />
            <span className="text-[12px] text-[#8a938d]">a</span>
            <input
              type="date"
              value={filtroHasta}
              onChange={(e) => setFiltroHasta(e.target.value)}
              className="h-10 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none"
              aria-label="Hasta"
            />
          </div>

          {historial.cargando && <p role="status">Cargando gastos…</p>}
          {historial.error && (
            <p role="alert">
              {historial.error} <button onClick={historial.reintentar}>Reintentar</button>
            </p>
          )}
          <ContenedorTabla
            etiqueta="Lista de gastos"
            reinicio={JSON.stringify([
              historial.numero,
              historial.limite,
              filtroDesde,
              filtroHasta,
              filtroCategoria,
              filtroTipo
            ])}
            className="rounded-2xl border border-[#e2e7e2] bg-white"
          >
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#e2e7e2] bg-[#fafbfa] text-[11px] font-bold uppercase tracking-wide text-[#8a938d]">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Pagado</th>
                  <th className="px-4 py-3">Pendiente</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gastosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-[12px] text-[#a3aaa5]">
                      Ningún gasto coincide con los filtros.
                    </td>
                  </tr>
                ) : (
                  gastosFiltrados.map((g) => {
                    const anulada = g.anulada
                    const pagado =
                      g.tipo === 'manual'
                        ? g.monto
                        : (g.monto_abono ?? (g.estado_pago_proveedor === 'completo' ? g.monto : 0))
                    const pendiente =
                      g.tipo === 'manual' || anulada
                        ? 0
                        : (g.saldo_pendiente_proveedor ?? Math.max(0, g.monto - pagado))
                    return (
                      <tr
                        key={g.id}
                        className="border-b border-[#eef1ee] last:border-0 hover:bg-[#fafbfa]"
                      >
                        <td className="px-4 py-3 text-[#5b635e]">{g.fecha}</td>
                        <td className="px-4 py-3 text-[#5b635e]">
                          {g.categoria}
                          {anulada && (
                            <span className="ml-2 text-xs text-[#b23a32]">Compra anulada</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-[#2d332f]">
                          {g.tipo === 'automatico'
                            ? g.concepto
                            : g.observacion || 'Sin observación'}
                          {g.tipo === 'automatico' && g.proveedor_nombre && (
                            <span className="mt-1 block text-[11px] text-[#5b635e]">
                              Proveedor: {g.proveedor_nombre}
                            </span>
                          )}
                          {g.categoria === 'Mano de obra' && g.empleado_id && (
                            <span className="mt-1 block text-[11px] text-[#5b635e]">
                              {g.empleado_nombre || 'Trabajador registrado'} ·{' '}
                              {g.tipo_pago === 'adelanto' ? 'Adelanto' : 'Pago completo'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#5b635e]">${formatoMoneda(g.monto)}</td>
                        <td className="px-4 py-3 font-semibold text-[#16834b]">
                          ${formatoMoneda(pagado)}
                        </td>
                        <td
                          className={[
                            'px-4 py-3 font-semibold',
                            pendiente > 0 ? 'text-[#9c7a1f]' : 'text-[#8a938d]'
                          ].join(' ')}
                        >
                          {pendiente > 0 ? `$${formatoMoneda(pendiente)}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={[
                              'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                              g.tipo === 'automatico'
                                ? 'bg-[#fff6e0] text-[#9c7a1f]'
                                : 'bg-[#e7f2ea] text-[#176b3a]'
                            ].join(' ')}
                          >
                            {g.tipo === 'automatico' ? 'Compra' : 'Operativo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#5b635e]">
                          {g.usuarioNombre ?? 'Sistema anterior'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {g.tipo === 'automatico' ? (
                              <button
                                type="button"
                                title="Ver detalle"
                                onClick={() => setGastoDetalle(g)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#f0f4f0] hover:text-[#16834b]"
                              >
                                <Eye size={15} />
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  title="Editar"
                                  onClick={() => abrirEditar(g)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#f0f4f0] hover:text-[#16834b]"
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  title="Eliminar"
                                  onClick={() => setGastoAEliminar(g)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#fdf1f0] hover:text-[#dc5c52]"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </ContenedorTabla>
          <Paginacion {...historial} />
        </>
      ) : (
        <div className="space-y-4">
          {consultaResumen.cargando && <p role="status">Cargando resumen…</p>}
          {consultaResumen.error && (
            <p role="alert">
              {consultaResumen.error}{' '}
              <button onClick={consultaResumen.reintentar}>Reintentar</button>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e2e7e2] bg-white p-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['rango', 'Rango de la lista'],
                  ['diario', 'Diario'],
                  ['semanal', 'Semanal'],
                  ['mensual', 'Mensual']
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setPeriodoResumen(valor)}
                  className={[
                    'rounded-xl px-4 py-2 text-[13px] font-semibold',
                    periodoResumen === valor
                      ? 'bg-[#e7f4eb] text-[#16834b]'
                      : 'border border-[#e1e5e1] bg-white text-[#5b635e] hover:bg-[#f5f7f4]'
                  ].join(' ')}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
            {periodoResumen !== 'rango' && (
              <input
                type="date"
                value={fechaResumen}
                onChange={(e) => setFechaResumenManual(e.target.value)}
                className="ml-auto h-10 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none focus:border-[#16834b]"
                aria-label="Fecha de referencia del resumen"
              />
            )}
            <span className="text-[12px] text-[#8a938d]">
              {resumen.desde === resumen.hasta
                ? resumen.desde
                : `${resumen.desde} a ${resumen.hasta}`}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#e2e7e2] bg-white p-4">
              <p className="text-[11px] text-[#8a938d]">Gastos operativos</p>
              <p className="text-[20px] font-bold text-[#2d332f]">
                ${formatoMoneda(resumen.totalOperativos)}
              </p>
            </div>
            <div className="rounded-2xl border border-[#e2e7e2] bg-white p-4">
              <p className="text-[11px] text-[#8a938d]">
                Pagos netos de compras (menos devoluciones)
              </p>
              <p className="text-[20px] font-bold text-[#9c7a1f]">
                ${formatoMoneda(resumen.totalCompras)}
              </p>
            </div>
            <div className="rounded-2xl border border-[#e2e7e2] bg-white p-4">
              <p className="text-[11px] text-[#8a938d]">Egresos netos de compras y gastos</p>
              <p className="text-[20px] font-bold text-[#16834b]">
                ${formatoMoneda(resumen.totalEgresos)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#e2e7e2] bg-white">
            <table className="w-full min-w-[620px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#e2e7e2] bg-[#fafbfa] text-[11px] font-bold uppercase tracking-wide text-[#8a938d]">
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Total del período</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIAS_GASTO.filter((c) => (resumen.totalesPorCategoria[c] ?? 0) !== 0)
                  .length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-[12px] text-[#a3aaa5]">
                      Sin egresos registrados en este período.
                    </td>
                  </tr>
                ) : (
                  CATEGORIAS_GASTO.filter((c) => (resumen.totalesPorCategoria[c] ?? 0) > 0).map(
                    (c) => (
                      <tr
                        key={c}
                        className="border-b border-[#eef1ee] last:border-0 hover:bg-[#fafbfa]"
                      >
                        <td className="px-4 py-3 font-medium text-[#2d332f]">{c}</td>
                        <td className="px-4 py-3 text-[#5b635e]">
                          ${formatoMoneda(resumen.totalesPorCategoria[c])}
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalAbierto && (
        <GastoFormModal
          gastoEditando={gastoEditando}
          onGuardar={guardarGasto}
          onCancelar={() => {
            setModalAbierto(false)
            setGastoEditando(null)
          }}
        />
      )}

      {gastoDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-[460px] rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-[#272c29]">Detalle del gasto automático</h2>
              <button
                type="button"
                onClick={() => setGastoDetalle(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#f0f4f0]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 text-[13px]">
              <p>
                <span className="text-[#8a938d]">Concepto: </span>
                {gastoDetalle.concepto}
              </p>
              <p>
                <span className="text-[#8a938d]">Categoría: </span>
                {gastoDetalle.categoria}
              </p>
              <p>
                <span className="text-[#8a938d]">Monto: </span>${formatoMoneda(gastoDetalle.monto)}
              </p>
              <p>
                <span className="text-[#8a938d]">Fecha: </span>
                {gastoDetalle.fecha}
              </p>
              {gastoDetalle.proveedor_nombre && (
                <>
                  <p>
                    <span className="text-[#8a938d]">Proveedor: </span>
                    {gastoDetalle.proveedor_nombre}
                  </p>
                  <p>
                    <span className="text-[#8a938d]">Estado de pago: </span>
                    {gastoDetalle.estado_pago_proveedor === 'completo'
                      ? 'Pagado completo'
                      : gastoDetalle.estado_pago_proveedor === 'abono'
                        ? 'Abono parcial'
                        : 'Pendiente'}
                  </p>
                  <p>
                    <span className="text-[#8a938d]">Abono registrado: </span>$
                    {formatoMoneda(gastoDetalle.monto_abono ?? 0)}
                  </p>
                  <p>
                    <span className="text-[#8a938d]">Saldo pendiente: </span>$
                    {formatoMoneda(gastoDetalle.saldo_pendiente_proveedor ?? 0)}
                  </p>
                </>
              )}
              <div className="my-2 border-t border-dashed border-[#e2e7e2]" />
              {movimientoDelDetalle ? (
                <>
                  <p className="text-[11px] uppercase tracking-wide text-[#a3aaa5]">
                    Movimiento de Stock vinculado
                  </p>
                  <p>
                    <span className="text-[#8a938d]">Tipo: </span>
                    {movimientoDelDetalle.tipo}
                  </p>
                  <p>
                    <span className="text-[#8a938d]">Producto: </span>
                    {movimientoDelDetalle.producto} · {movimientoDelDetalle.entradaQq} qq
                  </p>
                  <p>
                    <span className="text-[#8a938d]">Detalle: </span>
                    {movimientoDelDetalle.detalle}
                  </p>
                </>
              ) : (
                <p className="text-[12px] text-[#8a938d]">
                  No se encontró el movimiento de Stock vinculado.
                </p>
              )}
              <p className="pt-2 text-[11px] text-[#8a938d]">
                Este gasto no se puede editar ni eliminar aquí. Si hay un error, corrígelo desde
                Stock con un ajuste inverso.
              </p>
            </div>
          </div>
        </div>
      )}

      {gastoAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fdf1f0] text-[#dc5c52]">
                <AlertTriangle size={20} />
              </div>
              <h2 className="text-[15px] font-bold text-[#272c29]">¿Eliminar gasto?</h2>
            </div>
            <p className="mb-5 text-[13px] leading-relaxed text-[#69716b]">
              Se eliminará el gasto{' '}
              <strong>{gastoAEliminar.observacion || gastoAEliminar.categoria}</strong> por $
              {formatoMoneda(gastoAEliminar.monto)}. Esta acción no se puede deshacer.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setGastoAEliminar(null)}
                className="rounded-xl border border-[#e1e5e1] px-4 py-2.5 text-[13px] font-semibold text-[#5b635e] hover:bg-[#f5f7f4]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEliminar}
                className="rounded-xl bg-[#dc5c52] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#c74f46]"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default Gastos
