import Paginacion from '../components/Paginacion'
import ContenedorTabla from '../components/ContenedorTabla'
import { useHistorialOperaciones } from '../hooks/useHistorialOperaciones'
import AnularOperacion from '../components/AnularOperacion'
import DetalleOperacion from '../components/DetalleOperacion'
import { ErrorNegocio } from '../../../shared/errorNegocio'
import { useState } from 'react'
import {
  ShoppingCart,
  Plus,
  X,
  Receipt,
  AlertTriangle,
  FileDown,
  Search,
  ChevronDown
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { ClienteFormModal } from './Clientes'
import EmptyState from '../components/EmptyState'
import { FormField, inputClass } from '../components/FormField'
import { useAppData, PRODUCTOS } from '../store/AppDataContext'
import { useNotificacion } from '../store/NotificacionContext'
import { calcularImportes, validarPago } from '../utils/comercio'
import { rangoDiaActual } from '../utils/reportes'
import { useFiltroDiaActual } from '../hooks/useFechaActual'
import type { ClienteFormData, MetodoPago, Producto, Venta } from '../types'
import { construirComprobanteHtml, formatearNumeroComprobante } from '../utils/comprobantePdf'

const METODOS_PAGO: MetodoPago[] = ['Efectivo', 'Transferencia', 'Pago Mixto']
const IMPUESTOS_SUGERIDOS = [1, 1.75, 2, 2.5, 3] as const

interface FormularioVenta {
  clienteId: string
  producto: Producto
  pesoBruto: string
  precioUnitario: string
  impuestoPorcentaje: number
  numeroLote: string
  observaciones: string
  estadoPago: 'completo' | 'abono' | 'pendiente'
  abono: string
  metodoPago: MetodoPago
  montoEfectivo: string
  montoTransferencia: string
}

const FORM_VACIO: FormularioVenta = {
  clienteId: '',
  producto: 'Cacao en Baba',
  pesoBruto: '',
  precioUnitario: '',
  impuestoPorcentaje: 1,
  numeroLote: '',
  observaciones: '',
  estadoPago: 'completo',
  abono: '',
  metodoPago: 'Efectivo',
  montoEfectivo: '',
  montoTransferencia: ''
}

function num(valor: string): number {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

function formatoMoneda(valor: number): string {
  return valor.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function nombreSeguroArchivo(valor: string): string {
  return (
    valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Cliente'
  )
}

type Errores = Partial<
  Record<'clienteId' | 'pesoBruto' | 'precioUnitario' | 'impuesto' | 'abono' | 'pagoMixto', string>
>

function Ventas(): React.JSX.Element {
  const [ventaAnular, setVentaAnular] = useState<Venta | null>(null)
  const [detalle, setDetalle] = useState<Venta | null>(null)
  const {
    clientes,
    clientesActivos,
    crearCliente,
    stock,
    ventas,
    cuentas,
    proximoNumeroFactura,
    proximoNumeroComprobante,
    registrarVenta,
    estadoJornada,
    fechaJornadaActiva
  } = useAppData()
  const { notificar } = useNotificacion()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [clienteBusqueda, setClienteBusqueda] = useState('')
  const [clienteComboAbierto, setClienteComboAbierto] = useState(false)
  const [impuestoComboAbierto, setImpuestoComboAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const {
    desde: filtroDesde,
    hasta: filtroHasta,
    setDesde: setFiltroDesde,
    setHasta: setFiltroHasta
  } = useFiltroDiaActual()
  const [clienteRequeridoAbierto, setClienteRequeridoAbierto] = useState(false)
  const [nuevoClienteAbierto, setNuevoClienteAbierto] = useState(false)
  const [form, setForm] = useState<FormularioVenta>(FORM_VACIO)
  const [errores, setErrores] = useState<Errores>({})
  const [previewAbierto, setPreviewAbierto] = useState(false)
  const [confirmacionAbierta, setConfirmacionAbierta] = useState(false)
  const [ultimaVenta, setUltimaVenta] = useState<Venta | null>(null)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  function actualizar<K extends keyof FormularioVenta>(campo: K, valor: FormularioVenta[K]): void {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  // ===== Cálculos en tiempo real (bloque 2) =====
  const pesoBruto = num(form.pesoBruto)
  const precioUnitario = num(form.precioUnitario)
  const { subtotal, montoImpuesto } = calcularImportes(
    pesoBruto,
    precioUnitario,
    form.impuestoPorcentaje
  )
  const totalVenta = Math.round((subtotal - montoImpuesto) * 100) / 100

  const montoEfectivo = num(form.montoEfectivo)
  const montoTransferencia = num(form.montoTransferencia)
  const montoAbono = num(form.abono)
  const montoRecibido =
    form.estadoPago === 'pendiente' ? 0 : form.estadoPago === 'completo' ? totalVenta : montoAbono
  const saldoPendiente = Math.max(0, Number((totalVenta - montoRecibido).toFixed(2)))

  const stockDisponible = stock[form.producto]
  const stockInsuficiente = pesoBruto > 0 && pesoBruto > stockDisponible

  const clienteSeleccionado = clientesActivos.find((c) => c.id === form.clienteId) ?? null
  const terminoCliente = form.clienteId ? '' : clienteBusqueda.trim().toLocaleLowerCase('es')
  const clientesFiltrados = clientesActivos
    .filter(
      (cliente) =>
        !terminoCliente ||
        cliente.nombreRazonSocial.toLocaleLowerCase('es').includes(terminoCliente) ||
        cliente.identificacion.toLocaleLowerCase('es').includes(terminoCliente)
    )
    .slice(0, 8)

  function validar(): Errores {
    const nuevosErrores: Errores = {}
    if (!form.clienteId) nuevosErrores.clienteId = 'Selecciona un cliente activo.'
    if (pesoBruto <= 0) nuevosErrores.pesoBruto = 'El peso bruto debe ser mayor a 0.'
    if (precioUnitario <= 0) nuevosErrores.precioUnitario = 'El precio unitario debe ser mayor a 0.'
    if (
      !Number.isFinite(form.impuestoPorcentaje) ||
      form.impuestoPorcentaje < 0 ||
      form.impuestoPorcentaje > 3
    )
      nuevosErrores.impuesto = 'El impuesto debe estar entre 0% y 3%.'
    if (form.estadoPago === 'abono' && (montoAbono <= 0 || montoAbono >= totalVenta))
      nuevosErrores.abono = 'El abono debe ser mayor a cero y menor al total.'
    try {
      validarPago(
        totalVenta,
        montoRecibido,
        form.estadoPago === 'pendiente' ? 'Efectivo' : form.metodoPago,
        form.estadoPago !== 'pendiente' && form.metodoPago === 'Pago Mixto'
          ? montoEfectivo
          : undefined,
        form.estadoPago !== 'pendiente' && form.metodoPago === 'Pago Mixto'
          ? montoTransferencia
          : undefined
      )
    } catch (cause) {
      nuevosErrores.pagoMixto = cause instanceof ErrorNegocio ? cause.message : 'Revisa el pago.'
    }
    if (stockInsuficiente) nuevosErrores.pesoBruto = 'No hay stock suficiente.'
    return nuevosErrores
  }

  function abrirNuevaVenta(): void {
    setForm(FORM_VACIO)
    setClienteBusqueda('')
    setClienteComboAbierto(false)
    setImpuestoComboAbierto(false)
    setErrores({})
    setModalAbierto(true)
  }

  async function registrarClienteDesdeVenta(data: ClienteFormData): Promise<void> {
    try {
      const nuevo = await crearCliente({
        ...data,
        nombreRazonSocial: data.nombreRazonSocial.trim(),
        identificacion: data.identificacion.trim(),
        telefono: data.telefono.trim(),
        email: data.email?.trim() || undefined,
        direccion: data.direccion?.trim() || undefined,
        notas: data.notas?.trim() || undefined
      })
      actualizar('clienteId', nuevo.id)
      setClienteBusqueda(`${nuevo.nombreRazonSocial} · ${nuevo.identificacion}`)
      setErrores((prev) => ({ ...prev, clienteId: undefined }))
      setClienteComboAbierto(false)
      setNuevoClienteAbierto(false)
      notificar('exito', 'Cliente registrado y seleccionado para la venta.')
    } catch {
      return
    }
  }

  function guardarVenta(): void {
    if (estadoJornada !== 'activa') {
      notificar('advertencia', 'No se puede realizar venta hasta iniciar o reabrir la jornada.')
      return
    }
    if (!form.clienteId) {
      setErrores((prev) => ({ ...prev, clienteId: 'Selecciona un cliente activo.' }))
      setClienteRequeridoAbierto(true)
      return
    }
    const nuevosErrores = validar()
    setErrores(nuevosErrores)
    if (Object.keys(nuevosErrores).length > 0) return

    // Antes de registrar la venta se muestra una confirmación con todos los
    // datos que se van a guardar. Así el usuario puede corroborar el cliente
    // y evitar registrar la venta a nombre de otra persona por error.
    setConfirmacionAbierta(true)
  }

  async function confirmarGuardarVenta(): Promise<void> {
    if (estadoJornada !== 'activa') {
      notificar('advertencia', 'No se puede realizar venta hasta iniciar o reabrir la jornada.')
      return
    }
    // Segunda barrera de seguridad: aunque la venta haya sido validada en la
    // vista previa, el estado de la jornada se vuelve a comprobar al guardar.
    try {
      const venta = await registrarVenta({
        fechaVenta: fechaJornadaActiva ?? rangoDiaActual().desde,
        clienteId: form.clienteId,
        producto: form.producto,
        pesoBruto,
        precioUnitario,
        impuestoPorcentaje: form.impuestoPorcentaje,
        metodoPago: form.estadoPago === 'pendiente' ? 'Efectivo' : form.metodoPago,
        montoEfectivo:
          form.estadoPago !== 'pendiente' && form.metodoPago === 'Pago Mixto'
            ? montoEfectivo
            : undefined,
        montoTransferencia:
          form.estadoPago !== 'pendiente' && form.metodoPago === 'Pago Mixto'
            ? montoTransferencia
            : undefined,
        montoRecibido,
        numeroLote: form.numeroLote.trim() || undefined,
        observaciones: form.observaciones.trim() || undefined
      })

      setUltimaVenta(venta)
      setConfirmacionAbierta(false)
      setModalAbierto(false)
      notificar('exito', `Venta N.º ${venta.numeroFactura} del día registrada con éxito.`)
    } catch (error) {
      setConfirmacionAbierta(false)
      notificar(
        'advertencia',
        error instanceof ErrorNegocio ? error.message : 'No fue posible registrar la venta.'
      )
    }
  }

  async function generarPdf(venta: Venta): Promise<void> {
    const cliente = clientes.find((c) => c.id === venta.clienteId) ?? null
    if (!window.api?.generarComprobantePDF) {
      notificar('error', 'La generación de PDF no está disponible en esta ejecución de Electron.')
      return
    }

    setGenerandoPdf(true)
    try {
      const html = construirComprobanteHtml(venta, cliente)
      const numeroComprobante = formatearNumeroComprobante(venta.numeroComprobante)
      const nombreCliente = nombreSeguroArchivo(cliente?.nombreRazonSocial ?? 'Cliente')
      const nombreArchivo = `Comprobante_${numeroComprobante}_${nombreCliente}`
      const resultado = await window.api.generarComprobantePDF(html, nombreArchivo)
      if (!resultado.canceled) {
        notificar('exito', `Comprobante N.º ${numeroComprobante} guardado correctamente.`)
      }
    } catch (error) {
      console.error('Error generando comprobante PDF:', error)
      notificar('error', 'No fue posible generar el comprobante PDF.')
    } finally {
      setGenerandoPdf(false)
    }
  }

  const hayVentas = ventas.length > 0
  const historial = useHistorialOperaciones(
    'ventas',
    { desde: filtroDesde, hasta: filtroHasta, busqueda },
    ventas
  )
  const ventasFiltradas = historial.filas

  // Sin jornada activa no se pueden generar ventas nuevas (ver control de
  // jornada en el módulo de Inicio). Consultas, historial, etc. siguen
  // disponibles siempre: esta página solo bloquea "Nueva venta".
  const jornadaBloqueaVenta = estadoJornada !== 'activa'
  const mensajeJornadaBloqueada = 'No se puede realizar venta hasta iniciar o reabrir la jornada.'

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto [&>*]:shrink-0 p-4 sm:p-6 lg:p-7">
      <PageHeader
        greeting="Ventas"
        subtitle="Registro de ventas de cacao y maracuyá, con facturación."
        actions={
          <button
            type="button"
            onClick={abrirNuevaVenta}
            disabled={jornadaBloqueaVenta}
            title={jornadaBloqueaVenta ? mensajeJornadaBloqueada : undefined}
            className="flex items-center gap-2 rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#146b3e] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={16} />
            Nueva venta
          </button>
        }
      />

      {ultimaVenta && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-[#cfe8d8] bg-[#f0f9f3] px-4 py-3">
          <p className="text-[13px] font-semibold text-[#176b3a]">
            Venta guardada. Comprobante N.º{' '}
            {formatearNumeroComprobante(ultimaVenta.numeroComprobante)} listo para generar.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void generarPdf(ultimaVenta)}
              disabled={generandoPdf}
              className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[12px] font-semibold text-[#176b3a] shadow-sm ring-1 ring-[#cfe8d8] hover:bg-[#f8fcf9] disabled:opacity-50"
            >
              <FileDown size={15} />
              {generandoPdf ? 'Generando…' : 'Generar PDF'}
            </button>
            <button
              type="button"
              onClick={() => setUltimaVenta(null)}
              className="text-[#176b3a] hover:text-[#0f5029]"
              aria-label="Cerrar aviso"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {jornadaBloqueaVenta && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#eadfc2] bg-[#fffaf0] px-4 py-3">
          <AlertTriangle size={18} className="shrink-0 text-[#9c7a1f]" />
          <p className="text-[12px] text-[#8d7f57]">{mensajeJornadaBloqueada}</p>
        </div>
      )}

      {hayVentas && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-[#e2e7e2] bg-white px-3 py-2.5">
            <Search size={16} className="shrink-0 text-[#8a938d]" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#a3aaa5]"
              aria-label="Buscar ventas por cliente"
            />
          </div>
          <input
            type="date"
            value={filtroDesde}
            onChange={(e) => setFiltroDesde(e.target.value)}
            className="h-11 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none focus:border-[#16834b]"
            aria-label="Ventas desde"
          />
          <span className="text-[12px] text-[#8a938d]">a</span>
          <input
            type="date"
            value={filtroHasta}
            onChange={(e) => setFiltroHasta(e.target.value)}
            className="h-11 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none focus:border-[#16834b]"
            aria-label="Ventas hasta"
          />
        </div>
      )}

      {historial.cargando ? (
        <p role="status" className="py-6 text-sm text-[#5b635e]">
          Cargando historial...
        </p>
      ) : historial.error ? (
        <div role="alert" className="py-6 text-sm text-[#9d3029]">
          {historial.error}
          <button
            type="button"
            onClick={historial.reintentar}
            className="ml-3 rounded-lg border px-3 py-2"
          >
            Reintentar
          </button>
        </div>
      ) : !hayVentas ? (
        <EmptyState
          icon={ShoppingCart}
          title="Todavía no hay ventas registradas"
          description="Usa el botón 'Nueva venta' para registrar la primera. Cada venta genera su
          factura, descuenta el stock del producto vendido y, si queda saldo pendiente, crea la
          cuenta por cobrar del cliente."
        />
      ) : (
        <>
          <ContenedorTabla
            etiqueta="Historial de ventas"
            reinicio={JSON.stringify([
              historial.numero,
              historial.limite,
              busqueda,
              filtroDesde,
              filtroHasta
            ])}
            className="rounded-2xl border border-[#e2e7e2] bg-white"
          >
            <table className="w-full min-w-[1020px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#e2e7e2] bg-[#fafbfa] text-[11px] font-bold uppercase tracking-wide text-[#8a938d]">
                  <th className="px-4 py-3">Factura</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Peso (qq)</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Estado de cobro</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3 text-right">Comprobante</th>
                </tr>
              </thead>
              <tbody>
                {ventasFiltradas.map((v) => {
                  const cliente = clientes.find((c) => c.id === v.clienteId)
                  const cuenta = cuentas.find((c) => c.ventaId === v.id)
                  const estadoCobro = cuenta
                    ? cuenta.montoPagado >= cuenta.montoTotal
                      ? 'Pagado'
                      : cuenta.montoPagado > 0
                        ? 'Parcial'
                        : 'Pendiente'
                    : v.estadoCobro
                  return (
                    <tr
                      key={v.id}
                      className="border-b border-[#eef1ee] last:border-0 hover:bg-[#fafbfa]"
                    >
                      <td className="px-4 py-3 font-medium text-[#2d332f]">
                        N.º {v.numeroFactura} del día
                      </td>
                      <td className="px-4 py-3 text-[#5b635e]">{v.fechaVenta}</td>
                      <td className="px-4 py-3 text-[#5b635e]">
                        {cliente?.nombreRazonSocial ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[#5b635e]">{v.producto}</td>
                      <td className="px-4 py-3 text-[#5b635e]">{v.pesoBruto}</td>
                      <td className="px-4 py-3 font-semibold text-[#2d332f]">
                        ${formatoMoneda(v.totalVenta)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                            v.estado === 'anulada'
                              ? 'bg-[#fdf1f0] text-[#dc5c52]'
                              : estadoCobro === 'Pagado'
                                ? 'bg-[#e7f2ea] text-[#176b3a]'
                                : estadoCobro === 'Parcial'
                                  ? 'bg-[#fff0c9] text-[#9c7a1f]'
                                  : 'bg-[#fdf1f0] text-[#dc5c52]'
                          ].join(' ')}
                        >
                          {v.estado === 'anulada' ? 'Anulada' : estadoCobro}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#5b635e]">
                        {v.usuarioNombre ?? 'Sistema anterior'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDetalle(v)}
                          className="mr-2 rounded-lg border px-2 py-1 text-xs"
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => setVentaAnular(v)}
                          disabled={v.estado === 'anulada' || estadoJornada !== 'activa'}
                          className="mr-2 rounded-lg border px-2 py-1 text-xs text-[#b23a32] disabled:opacity-35"
                        >
                          Anular venta
                        </button>
                        <button
                          type="button"
                          onClick={() => void generarPdf(v)}
                          disabled={generandoPdf}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#dbe4dc] px-2.5 py-1.5 text-[11px] font-semibold text-[#176b3a] hover:bg-[#f2f8f3] disabled:opacity-50"
                          title={`Generar comprobante N.º ${formatearNumeroComprobante(v.numeroComprobante)}`}
                        >
                          <FileDown size={14} />
                          PDF
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {ventasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-[#8a938d]">
                      No hay ventas que coincidan con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ContenedorTabla>
        </>
      )}

      <Paginacion {...historial} />
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-[720px] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[16px] font-bold text-[#272c29]">Nueva venta</h2>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#f0f4f0]"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6">
              {/* ===== BLOQUE 1: DATOS DE LA VENTA ===== */}
              <div>
                <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[#8a938d]">
                  Datos de la venta
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Cliente" error={errores.clienteId} obligatorio>
                    <div
                      className="relative"
                      onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                          setClienteComboAbierto(false)
                        }
                      }}
                    >
                      <input
                        value={clienteBusqueda}
                        onFocus={() => setClienteComboAbierto(true)}
                        onChange={(e) => {
                          const valor = e.target.value
                          setClienteBusqueda(valor)
                          setClienteComboAbierto(true)
                          const normalizado = valor.trim().toLocaleLowerCase('es')
                          const coincidencias = clientesActivos.filter((cliente) => {
                            const opcion = `${cliente.nombreRazonSocial} · ${cliente.identificacion}`
                            return (
                              opcion.toLocaleLowerCase('es') === normalizado ||
                              cliente.nombreRazonSocial.toLocaleLowerCase('es') === normalizado ||
                              cliente.identificacion.toLocaleLowerCase('es') === normalizado
                            )
                          })
                          actualizar(
                            'clienteId',
                            coincidencias.length === 1 ? coincidencias[0].id : ''
                          )
                          if (coincidencias.length === 1) {
                            setErrores((prev) => ({ ...prev, clienteId: undefined }))
                          }
                        }}
                        className={inputClass(!!errores.clienteId) + ' pr-10'}
                        placeholder="Buscar por nombre o identificación..."
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setClienteComboAbierto((abierto) => !abierto)}
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[#8a938d] hover:text-[#176b3a]"
                        aria-label="Mostrar clientes"
                      >
                        <ChevronDown
                          size={16}
                          className={
                            clienteComboAbierto
                              ? 'rotate-180 transition-transform'
                              : 'transition-transform'
                          }
                        />
                      </button>

                      {clienteComboAbierto && (
                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[#dfe6e0] bg-white p-1.5 shadow-[0_12px_30px_rgba(35,55,43,0.14)]">
                          {clientesFiltrados.length > 0 ? (
                            clientesFiltrados.map((cliente) => (
                              <button
                                key={cliente.id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  actualizar('clienteId', cliente.id)
                                  setClienteBusqueda(
                                    `${cliente.nombreRazonSocial} · ${cliente.identificacion}`
                                  )
                                  setErrores((prev) => ({ ...prev, clienteId: undefined }))
                                  setClienteComboAbierto(false)
                                }}
                                className={[
                                  'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                                  form.clienteId === cliente.id
                                    ? 'bg-[#eef7f1] text-[#176b3a]'
                                    : 'text-[#2d332f] hover:bg-[#f5f8f5]'
                                ].join(' ')}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-[12px] font-semibold">
                                    {cliente.nombreRazonSocial}
                                  </span>
                                  <span className="block truncate text-[11px] text-[#8a938d]">
                                    {cliente.identificacion}
                                  </span>
                                </span>
                                {form.clienteId === cliente.id && (
                                  <span className="shrink-0 rounded-full bg-[#dcefe3] px-2 py-0.5 text-[10px] font-semibold text-[#176b3a]">
                                    Seleccionado
                                  </span>
                                )}
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-3 text-[12px] text-[#8a938d]">
                              No hay clientes que coincidan con la búsqueda.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    {clienteSeleccionado && (
                      <p className="mt-1 text-[11px] text-[#176b3a]">
                        Cliente seleccionado: {clienteSeleccionado.nombreRazonSocial}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => setNuevoClienteAbierto(true)}
                      className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[#16834b] hover:text-[#146b3e]"
                    >
                      <Plus size={14} />
                      Registrar nuevo cliente
                    </button>
                  </FormField>

                  <FormField label="Producto" obligatorio>
                    <select
                      value={form.producto}
                      onChange={(e) => actualizar('producto', e.target.value as Producto)}
                      className={inputClass(false)}
                    >
                      {PRODUCTOS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Peso bruto (qq)" error={errores.pesoBruto} obligatorio>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.pesoBruto}
                      onChange={(e) => actualizar('pesoBruto', e.target.value)}
                      className={inputClass(!!errores.pesoBruto)}
                      placeholder="0.00"
                    />
                    <p className="mt-1 text-[11px] text-[#a3aaa5]">
                      Stock disponible: {stockDisponible} qq
                    </p>
                    {stockInsuficiente && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-[#9c7a1f]">
                        <AlertTriangle size={12} /> Stock insuficiente, pero puedes continuar.
                      </p>
                    )}
                  </FormField>

                  <FormField
                    label="Precio unitario (por qq)"
                    error={errores.precioUnitario}
                    obligatorio
                  >
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.precioUnitario}
                      onChange={(e) => actualizar('precioUnitario', e.target.value)}
                      className={inputClass(!!errores.precioUnitario)}
                      placeholder="0.00"
                    />
                  </FormField>

                  <FormField label="N.º de lote">
                    <input
                      type="text"
                      value={form.numeroLote}
                      onChange={(e) => actualizar('numeroLote', e.target.value)}
                      className={inputClass(false)}
                      placeholder="Opcional"
                    />
                  </FormField>
                </div>

                <div className="mt-4">
                  <FormField label="Observaciones">
                    <textarea
                      value={form.observaciones}
                      onChange={(e) => actualizar('observaciones', e.target.value)}
                      rows={2}
                      className={inputClass(false) + ' resize-none'}
                      placeholder="Opcional"
                    />
                  </FormField>
                </div>
              </div>

              {/* ===== BLOQUE 2: CÁLCULOS E IMPUESTO (solo lectura salvo el selector) ===== */}
              <div className="rounded-2xl border border-[#e2e7e2] bg-[#fafbfa] p-4">
                <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[#8a938d]">
                  Cálculos e impuesto
                </h3>
                <div className="mb-3 w-40">
                  <FormField label="Impuesto (%)" error={errores.impuesto}>
                    <div
                      className="relative"
                      onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                          setImpuestoComboAbierto(false)
                        }
                      }}
                    >
                      <input
                        type="number"
                        min={0}
                        max={3}
                        step="0.01"
                        value={form.impuestoPorcentaje}
                        onFocus={() => setImpuestoComboAbierto(true)}
                        onChange={(e) => {
                          actualizar('impuestoPorcentaje', Number(e.target.value))
                          setImpuestoComboAbierto(true)
                        }}
                        className={
                          inputClass(!!errores.impuesto) +
                          ' pr-10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                        }
                        placeholder="Seleccionar o escribir"
                      />
                      <button
                        type="button"
                        onClick={() => setImpuestoComboAbierto((abierto) => !abierto)}
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[#8a938d] hover:text-[#176b3a]"
                        aria-label="Mostrar impuestos sugeridos"
                      >
                        <ChevronDown
                          size={16}
                          className={
                            impuestoComboAbierto
                              ? 'rotate-180 transition-transform'
                              : 'transition-transform'
                          }
                        />
                      </button>

                      {impuestoComboAbierto && (
                        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-[#dfe6e0] bg-white p-1.5 shadow-[0_12px_30px_rgba(35,55,43,0.14)]">
                          {IMPUESTOS_SUGERIDOS.map((valor) => (
                            <button
                              key={valor}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                actualizar('impuestoPorcentaje', valor)
                                setImpuestoComboAbierto(false)
                              }}
                              className={[
                                'w-full rounded-lg px-3 py-2 text-left text-[12px] transition-colors',
                                form.impuestoPorcentaje === valor
                                  ? 'bg-[#eef7f1] font-semibold text-[#176b3a]'
                                  : 'text-[#2d332f] hover:bg-[#f5f8f5]'
                              ].join(' ')}
                            >
                              {valor}%
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </FormField>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 text-[13px]">
                  <div>
                    <p className="text-[11px] text-[#8a938d]">Subtotal</p>
                    <p className="font-semibold text-[#2d332f]">${formatoMoneda(subtotal)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#8a938d]">Impuesto</p>
                    <p className="font-semibold text-[#2d332f]">${formatoMoneda(montoImpuesto)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#8a938d]">Total</p>
                    <p className="text-[15px] font-bold text-[#16834b]">
                      ${formatoMoneda(totalVenta)}
                    </p>
                  </div>
                </div>
              </div>

              {/* ===== BLOQUE 3: PAGO Y FACTURACIÓN ===== */}
              <div>
                <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[#8a938d]">
                  Pago y facturación
                </h3>
                <fieldset className="mb-4">
                  <legend className="mb-2 text-[12px] font-semibold text-[#5b635e]">
                    Estado del pago
                  </legend>
                  <div className="flex flex-wrap gap-4 text-[13px]">
                    {(
                      [
                        ['completo', 'Pago total'],
                        ['abono', 'Abono'],
                        ['pendiente', 'Pendiente']
                      ] as const
                    ).map(([valor, label]) => (
                      <label key={valor} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="estado-venta"
                          checked={form.estadoPago === valor}
                          onChange={() => actualizar('estadoPago', valor)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {form.estadoPago !== 'pendiente' && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="Método de pago">
                      <select
                        value={form.metodoPago}
                        onChange={(e) => actualizar('metodoPago', e.target.value as MetodoPago)}
                        className={inputClass(false)}
                      >
                        {METODOS_PAGO.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </FormField>

                    {form.estadoPago === 'abono' && (
                      <FormField label="Abono inicial (USD)" error={errores.abono} obligatorio>
                        <input
                          type="number"
                          min={0.01}
                          max={totalVenta}
                          step="0.01"
                          value={form.abono}
                          onChange={(e) => actualizar('abono', e.target.value)}
                          className={inputClass(!!errores.abono)}
                          placeholder="0.00"
                        />
                      </FormField>
                    )}

                    {form.metodoPago === 'Pago Mixto' && (
                      <>
                        <FormField label="Monto efectivo">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={form.montoEfectivo}
                            onChange={(e) => actualizar('montoEfectivo', e.target.value)}
                            className={inputClass(!!errores.pagoMixto)}
                          />
                        </FormField>
                        <FormField label="Monto transferencia">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={form.montoTransferencia}
                            onChange={(e) => actualizar('montoTransferencia', e.target.value)}
                            className={inputClass(!!errores.pagoMixto)}
                          />
                        </FormField>
                      </>
                    )}
                  </div>
                )}

                {errores.pagoMixto && (
                  <p className="mt-2 text-[11px] text-[#dc5c52]">{errores.pagoMixto}</p>
                )}

                <div className="mt-3 flex items-center justify-between rounded-xl bg-[#fafbfa] px-4 py-3 text-[13px]">
                  <span className="text-[#8a938d]">Saldo pendiente</span>
                  <span
                    className={
                      saldoPendiente > 0 ? 'font-bold text-[#dc5c52]' : 'font-bold text-[#176b3a]'
                    }
                  >
                    ${formatoMoneda(saldoPendiente)}
                  </span>
                </div>
                {saldoPendiente > 0 && (
                  <p className="mt-1 text-[11px] text-[#8a938d]">
                    Se generará una cuenta por cobrar para{' '}
                    {clienteSeleccionado?.nombreRazonSocial ?? 'el cliente'} por este saldo.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-[#eef1ee] pt-4">
              <button
                type="button"
                onClick={() => setPreviewAbierto(true)}
                className="flex items-center gap-2 rounded-xl border border-[#e1e5e1] px-4 py-2.5 text-[13px] font-semibold text-[#5b635e] hover:bg-[#f5f7f4]"
              >
                <Receipt size={15} />
                Vista previa factura
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="rounded-xl border border-[#e1e5e1] px-4 py-2.5 text-[13px] font-semibold text-[#5b635e] hover:bg-[#f5f7f4]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={guardarVenta}
                  className="rounded-xl bg-[#16834b] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#146b3e]"
                >
                  Guardar venta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {nuevoClienteAbierto && (
        <ClienteFormModal
          clienteEditando={null}
          clientes={clientes}
          onGuardar={(data) => registrarClienteDesdeVenta(data)}
          onCancelar={() => setNuevoClienteAbierto(false)}
        />
      )}

      {clienteRequeridoAbierto && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-[430px] rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-[#c28b1a]" size={22} />
              <div>
                <h2 className="text-[16px] font-bold text-[#2d332f]">Cliente requerido</h2>
                <p className="mt-2 text-[13px] leading-5 text-[#6d756f]">
                  No se puede generar la venta hasta escoger un cliente de la lista.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setClienteRequeridoAbierto(false)}
                className="rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmacionAbierta && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-[620px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#eadfc2] bg-[#fffaf0] p-4">
              <AlertTriangle className="mt-0.5 shrink-0 text-[#9c7a1f]" size={20} />
              <div>
                <h2 className="text-[15px] font-bold text-[#5b4714]">
                  Verificación de datos de Venta
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-[#f7f8f8] p-3 sm:col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a938d]">
                  Cliente
                </p>
                <p className="mt-1 text-[15px] font-bold text-[#176b3a]">
                  {clienteSeleccionado?.nombreRazonSocial ?? '—'}
                </p>
                {clienteSeleccionado?.identificacion && (
                  <p className="mt-1 text-[11px] text-[#6d756f]">
                    CI/RUC: {clienteSeleccionado.identificacion}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-[#e2e7e2] p-3">
                <p className="text-[10px] text-[#8a938d]">Producto</p>
                <p className="mt-1 font-semibold text-[#2d332f]">{form.producto}</p>
              </div>
              <div className="rounded-xl border border-[#e2e7e2] p-3">
                <p className="text-[10px] text-[#8a938d]">Peso bruto</p>
                <p className="mt-1 font-semibold text-[#2d332f]">
                  {pesoBruto.toLocaleString('es-EC', { maximumFractionDigits: 2 })} qq
                </p>
              </div>
              <div className="rounded-xl border border-[#e2e7e2] p-3">
                <p className="text-[10px] text-[#8a938d]">Precio unitario</p>
                <p className="mt-1 font-semibold text-[#2d332f]">
                  ${formatoMoneda(precioUnitario)}
                </p>
              </div>
              <div className="rounded-xl border border-[#e2e7e2] p-3">
                <p className="text-[10px] text-[#8a938d]">N.º de lote</p>
                <p className="mt-1 font-semibold text-[#2d332f]">{form.numeroLote.trim() || '—'}</p>
              </div>
              <div className="rounded-xl border border-[#e2e7e2] p-3">
                <p className="text-[10px] text-[#8a938d]">Impuesto</p>
                <p className="mt-1 font-semibold text-[#2d332f]">{form.impuestoPorcentaje}%</p>
              </div>
              <div className="rounded-xl border border-[#e2e7e2] p-3">
                <p className="text-[10px] text-[#8a938d]">Estado del pago</p>
                <p className="mt-1 font-semibold text-[#2d332f]">
                  {form.estadoPago === 'completo'
                    ? 'Pago total'
                    : form.estadoPago === 'abono'
                      ? 'Abono'
                      : 'Pendiente'}
                </p>
              </div>
              <div className="rounded-xl border border-[#e2e7e2] p-3">
                <p className="text-[10px] text-[#8a938d]">Método de pago</p>
                <p className="mt-1 font-semibold text-[#2d332f]">
                  {form.estadoPago === 'pendiente' ? '—' : form.metodoPago}
                </p>
              </div>
              {form.estadoPago !== 'pendiente' && form.metodoPago === 'Pago Mixto' ? (
                <>
                  <div className="rounded-xl border border-[#e2e7e2] p-3">
                    <p className="text-[10px] text-[#8a938d]">Efectivo</p>
                    <p className="mt-1 font-semibold text-[#2d332f]">
                      ${formatoMoneda(montoEfectivo)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#e2e7e2] p-3">
                    <p className="text-[10px] text-[#8a938d]">Transferencia</p>
                    <p className="mt-1 font-semibold text-[#2d332f]">
                      ${formatoMoneda(montoTransferencia)}
                    </p>
                  </div>
                </>
              ) : form.estadoPago !== 'pendiente' ? (
                <div className="rounded-xl border border-[#e2e7e2] p-3">
                  <p className="text-[10px] text-[#8a938d]">Monto recibido</p>
                  <p className="mt-1 font-semibold text-[#2d332f]">
                    ${formatoMoneda(montoRecibido)}
                  </p>
                </div>
              ) : null}
              <div className="rounded-xl border border-[#e2e7e2] p-3">
                <p className="text-[10px] text-[#8a938d]">Subtotal</p>
                <p className="mt-1 font-semibold text-[#2d332f]">${formatoMoneda(subtotal)}</p>
              </div>
              <div className="rounded-xl border border-[#e2e7e2] p-3">
                <p className="text-[10px] text-[#8a938d]">Impuesto calculado</p>
                <p className="mt-1 font-semibold text-[#2d332f]">${formatoMoneda(montoImpuesto)}</p>
              </div>
              <div className="rounded-xl border border-[#dcebe1] bg-[#f4faf5] p-3">
                <p className="text-[10px] text-[#8a938d]">Total de la venta</p>
                <p className="mt-1 text-[16px] font-bold text-[#16834b]">
                  ${formatoMoneda(totalVenta)}
                </p>
              </div>
              <div className="rounded-xl border border-[#e2e7e2] p-3">
                <p className="text-[10px] text-[#8a938d]">Saldo pendiente</p>
                <p
                  className={`mt-1 font-bold ${saldoPendiente > 0 ? 'text-[#9c7a1f]' : 'text-[#16834b]'}`}
                >
                  ${formatoMoneda(saldoPendiente)}
                </p>
              </div>
              <div className="rounded-xl border border-[#e2e7e2] p-3 sm:col-span-2">
                <p className="text-[10px] text-[#8a938d]">Observaciones</p>
                <p className="mt-1 text-[12px] text-[#4f5752]">
                  {form.observaciones.trim() || '—'}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-[#eef1ee] pt-4">
              <button
                type="button"
                onClick={() => setConfirmacionAbierta(false)}
                className="rounded-xl border border-[#e1e5e1] px-4 py-2.5 text-[13px] font-semibold text-[#5b635e] hover:bg-[#f5f7f4]"
              >
                Revisar nuevamente
              </button>
              <button
                type="button"
                onClick={confirmarGuardarVenta}
                className="rounded-xl bg-[#16834b] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#146b3e]"
              >
                Sí, confirmar venta
              </button>
            </div>
          </div>
        </div>
      )}

      {previewAbierto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-[#272c29]">Vista previa de factura</h2>
              <button
                type="button"
                onClick={() => setPreviewAbierto(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#f0f4f0]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 text-[13px]">
              <p className="text-[11px] uppercase tracking-wide text-[#a3aaa5]">
                Venta N.º {proximoNumeroFactura} del día · Comprobante N.º{' '}
                {formatearNumeroComprobante(proximoNumeroComprobante)}
              </p>
              <p>
                <span className="text-[#8a938d]">Cliente: </span>
                {clienteSeleccionado?.nombreRazonSocial ?? '—'}
              </p>
              <p>
                <span className="text-[#8a938d]">Producto: </span>
                {form.producto} · {pesoBruto || 0} qq
              </p>
              <p>
                <span className="text-[#8a938d]">Precio unitario: </span>$
                {formatoMoneda(precioUnitario)}
              </p>
              <div className="my-2 border-t border-dashed border-[#e2e7e2]" />
              <p>
                <span className="text-[#8a938d]">Subtotal: </span>${formatoMoneda(subtotal)}
              </p>
              <p>
                <span className="text-[#8a938d]">Impuesto ({form.impuestoPorcentaje}%): </span>
                {form.impuestoPorcentaje === 0 ? 'No aplica' : `-$${formatoMoneda(montoImpuesto)}`}
              </p>
              <p className="text-[15px] font-bold text-[#16834b]">
                Total: ${formatoMoneda(totalVenta)}
              </p>
              <p className="pt-1 text-[#8a938d]">
                Estado del pago:{' '}
                {form.estadoPago === 'completo'
                  ? 'Pago total'
                  : form.estadoPago === 'abono'
                    ? 'Abono'
                    : 'Pendiente'}
              </p>
              {form.estadoPago !== 'pendiente' && (
                <p className="text-[#8a938d]">Método de pago: {form.metodoPago}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {detalle && <DetalleOperacion operacion={detalle} onCerrar={() => setDetalle(null)} />}
      {ventaAnular && (
        <AnularOperacion
          tipo="venta"
          id={ventaAnular.id}
          referencia={`Venta N.º ${ventaAnular.numeroFactura} · ${ventaAnular.fechaVenta}`}
          onCerrar={() => setVentaAnular(null)}
        />
      )}
    </section>
  )
}

export default Ventas
