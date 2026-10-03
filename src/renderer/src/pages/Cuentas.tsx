import { useFilasVisibles } from '../hooks/useFilasVisibles'
import { indexarPrimero } from '../utils/indices'
import { ErrorNegocio } from '../../../shared/errorNegocio'
import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Wallet, Plus, X, AlertTriangle, ArrowLeft, HandCoins, Ban } from 'lucide-react'
import DetalleCuenta from '../components/DetalleCuenta'
import PageHeader from '../components/PageHeader'
import Paginacion from '../components/Paginacion'
import EmptyState from '../components/EmptyState'
import { FormField, inputClass } from '../components/FormField'
import { useNotificacion } from '../store/NotificacionContext'
import { useAppData, saldoDeCuenta, tipoSaldoDeCuenta } from '../store/AppDataContext'
import { formatoMoneda, formatoFecha, rangoDiaActual } from '../utils/reportes'
import { construirComprobantePagoHtml, formatearNumeroComprobante } from '../utils/comprobantePdf'
import type { Cuenta, EstadoCuenta, MetodoPago, TipoMovimientoCuenta } from '../types'

// ============================================================
// Módulo de Cuentas
//
// Las cuentas NO se crean aquí en el caso normal: nacen automáticamente
// desde Ventas. Esta pantalla sirve para gestionarlas: ver saldos,
// registrar abonos/ajustes y cerrar la cuenta cuando llega a $0.
//
// La única alta manual permitida es la excepción documentada con el
// cliente (saldo a favor o deuda que no proviene de una venta), y esas sí
// se pueden anular con justificación.
//
// Todos los cálculos de saldo/estado se delegan a AppDataContext
// (saldoDeCuenta, tipoSaldoDeCuenta) para no duplicar reglas de negocio en
// la capa visual.
// ============================================================

type FiltroEstado = 'todas' | 'abiertas' | EstadoCuenta | 'a_favor'
const LIMITES_CUENTAS = [10, 25, 50, 100] as const
type LimiteCuentas = (typeof LIMITES_CUENTAS)[number]

function hoyISO(): string {
  return rangoDiaActual().desde
}

function num(valor: string): number {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

const METODOS_PAGO: MetodoPago[] = ['Efectivo', 'Transferencia', 'Pago Mixto']
const TIPOS_MOVIMIENTO: TipoMovimientoCuenta[] = [
  'Abono',
  'Ajuste a favor',
  'Ajuste por devolución'
]

type OpcionComprobante = { valor: string; etiqueta: string; asociado?: boolean }

// Etiqueta + color de la insignia de estado. Se calcula a partir del saldo
// real y no del campo 'estado' solo, porque una cuenta cerrada con saldo
// negativo debe mostrarse como "A favor", no como "Cerrado".
function insigniaEstado(cuenta: Cuenta): { texto: string; clases: string } {
  if (cuenta.estado === 'anulado') {
    return { texto: 'Anulado', clases: 'bg-[#f2f3f2] text-[#8a938d] line-through' }
  }
  const tipo = tipoSaldoDeCuenta(cuenta)
  if (tipo === 'a_favor') return { texto: 'A favor', clases: 'bg-[#eaf1fb] text-[#2b5f9e]' }
  if (tipo === 'cerrado') return { texto: 'Cerrado', clases: 'bg-[#e7f2ea] text-[#176b3a]' }
  if (cuenta.estado === 'parcial')
    return { texto: 'Parcial', clases: 'bg-[#fff6e0] text-[#9c7a1f]' }
  return { texto: 'Pendiente', clases: 'bg-[#fdf1f0] text-[#dc5c52]' }
}

// ============================================================
// Modal: registrar abono / ajuste
// ============================================================

interface AbonoModalProps {
  cuenta: Cuenta
  nombreCliente: string
  comprobantesVenta: OpcionComprobante[]
  onGuardar: (datos: {
    monto: number
    metodoPago: MetodoPago
    montoEfectivo?: number
    montoTransferencia?: number
    tipo: TipoMovimientoCuenta
    observacion: string
    comprobante?: string
    fecha: string
  }) => void
  onCancelar: () => void
}

function AbonoModal({
  cuenta,
  nombreCliente,
  comprobantesVenta,
  onGuardar,
  onCancelar
}: AbonoModalProps): React.JSX.Element {
  const [fecha, setFecha] = useState(hoyISO())
  const [monto, setMonto] = useState('')
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('Efectivo')
  const [montoEfectivo, setMontoEfectivo] = useState('')
  const [montoTransferencia, setMontoTransferencia] = useState('')
  const [tipo, setTipo] = useState<TipoMovimientoCuenta>('Abono')
  const [observacion, setObservacion] = useState('')
  const [comprobante, setComprobante] = useState(
    cuenta.categoria === 'venta'
      ? (comprobantesVenta.find((item) => item.asociado)?.valor ?? '')
      : ''
  )
  const [comprobanteComboAbierto, setComprobanteComboAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saldoActual = saldoDeCuenta(cuenta)
  const montoNum = num(monto)
  const efectivoNum = num(montoEfectivo)
  const transferenciaNum = num(montoTransferencia)
  const saldoResultante = Math.round((saldoActual - montoNum) * 100) / 100
  const terminoComprobante = comprobante.trim().toLocaleLowerCase('es')
  const comprobantesFiltrados = comprobantesVenta.filter(
    (item) =>
      !terminoComprobante ||
      item.valor.toLocaleLowerCase('es').includes(terminoComprobante) ||
      item.etiqueta.toLocaleLowerCase('es').includes(terminoComprobante)
  )

  async function handleSubmit(e: FormEvent): Promise<void> {
    try {
      e.preventDefault()
      setError(null)

      if (montoNum <= 0) {
        setError('El monto debe ser mayor a 0.')
        return
      }
      if (cuenta.categoria === 'compra' && montoNum > saldoActual) {
        setError('El pago no puede superar el saldo pendiente.')
        return
      }
      if (!observacion.trim()) {
        setError('La observación es obligatoria: explica el contexto del movimiento.')
        return
      }
      if (metodoPago === 'Pago Mixto') {
        const suma = Math.round((efectivoNum + transferenciaNum) * 100) / 100
        if (suma !== montoNum) {
          setError(
            `En pago mixto, efectivo + transferencia debe sumar exactamente el monto ($${formatoMoneda(montoNum)}). Ahora suma $${formatoMoneda(suma)}.`
          )
          return
        }
      }

      await onGuardar({
        fecha,
        monto: montoNum,
        metodoPago,
        montoEfectivo: metodoPago === 'Pago Mixto' ? efectivoNum : undefined,
        montoTransferencia: metodoPago === 'Pago Mixto' ? transferenciaNum : undefined,
        tipo,
        observacion: observacion.trim(),
        comprobante: comprobante.trim() || undefined
      })
    } catch {
      return
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-[#272c29]">
            {cuenta.categoria === 'compra'
              ? 'Registrar pago a proveedor'
              : 'Registrar abono / ajuste'}
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
        <p className="mb-5 text-[12px] text-[#8a938d]">
          {nombreCliente}
          {cuenta.categoria === 'compra'
            ? ` · Compra N.º ${cuenta.numeroCompra} del día`
            : cuenta.numeroFactura
              ? ` · Venta N.º ${cuenta.numeroFactura} del día`
              : ' · Cuenta manual'}{' '}
          · Saldo actual: ${formatoMoneda(saldoActual)}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Fecha" obligatorio>
              <input
                type="date"
                max={hoyISO()}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={inputClass(false)}
              />
            </FormField>
            <FormField label="Monto ($)" obligatorio>
              <input
                autoFocus
                type="number"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className={inputClass(false)}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Tipo de movimiento" obligatorio>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoMovimientoCuenta)}
                className={inputClass(false)}
              >
                {(cuenta.categoria === 'compra' ? (['Abono'] as const) : TIPOS_MOVIMIENTO).map(
                  (t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  )
                )}
              </select>
            </FormField>
            <FormField label="Método de pago" obligatorio>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                className={inputClass(false)}
              >
                {METODOS_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {metodoPago === 'Pago Mixto' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Monto en efectivo ($)" obligatorio>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={montoEfectivo}
                  onChange={(e) => setMontoEfectivo(e.target.value)}
                  className={inputClass(false)}
                />
              </FormField>
              <FormField label="Monto por transferencia ($)" obligatorio>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={montoTransferencia}
                  onChange={(e) => setMontoTransferencia(e.target.value)}
                  className={inputClass(false)}
                />
              </FormField>
            </div>
          )}

          <FormField label="Observación" obligatorio>
            <input
              type="text"
              maxLength={200}
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className={inputClass(false)}
              placeholder="Ej. Abono segunda cuota"
            />
          </FormField>

          <FormField label={cuenta.categoria === 'venta' ? 'Comprobante de venta' : 'Comprobante'}>
            {cuenta.categoria === 'venta' ? (
              <div className="relative">
                <input
                  type="text"
                  value={comprobante}
                  onFocus={() => setComprobanteComboAbierto(true)}
                  onChange={(e) => {
                    setComprobante(e.target.value)
                    setComprobanteComboAbierto(true)
                  }}
                  className={inputClass(false)}
                  placeholder="Buscar por número o cliente..."
                  autoComplete="off"
                />
                {comprobanteComboAbierto && comprobantesFiltrados.length > 0 && (
                  <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-[#dfe5df] bg-white p-1 shadow-lg">
                    {comprobantesFiltrados.map((item) => (
                      <button
                        key={`${item.valor}-${item.etiqueta}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setComprobante(item.valor)
                          setComprobanteComboAbierto(false)
                        }}
                        className="block w-full rounded-lg px-3 py-2 text-left text-[12px] text-[#4a524c] hover:bg-[#edf7f0] hover:text-[#176b3a]"
                      >
                        <span className="font-semibold">N.º {item.valor}</span>
                        <span className="ml-2 text-[#8a938d]">{item.etiqueta}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <input
                type="text"
                maxLength={40}
                value={comprobante}
                onChange={(e) => setComprobante(e.target.value)}
                className={inputClass(false)}
                placeholder="Referencia del proveedor (si aplica)"
              />
            )}
          </FormField>

          <div className="rounded-xl bg-[#fafbfa] px-4 py-3 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-[#8a938d]">Saldo tras el movimiento</span>
              <span
                className={[
                  'font-bold',
                  saldoResultante > 0
                    ? 'text-[#dc5c52]'
                    : saldoResultante < 0
                      ? 'text-[#2b5f9e]'
                      : 'text-[#16834b]'
                ].join(' ')}
              >
                ${formatoMoneda(saldoResultante)}
              </span>
            </div>
            {saldoResultante === 0 && (
              <p className="mt-1 text-[11px] text-[#16834b]">
                Con este movimiento la cuenta queda saldada y pasa a estado Cerrado.
              </p>
            )}
            {saldoResultante < 0 && (
              <p className="mt-1 text-[11px] text-[#2b5f9e]">
                El cliente quedará con ${formatoMoneda(Math.abs(saldoResultante))} a favor.
              </p>
            )}
          </div>

          {error && (
            <p className="rounded-xl bg-[#fdf1f0] px-3 py-2 text-[12px] text-[#dc5c52]">{error}</p>
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
              Guardar movimiento
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================
// Modal: crear cuenta manual (excepción)
// ============================================================

interface CuentaManualModalProps {
  clientes: { id: string; nombre: string }[]
  onGuardar: (datos: {
    clienteId: string
    tipo: 'Saldo a favor' | 'Deuda manual'
    fecha: string
    monto: number
    observacion: string
    comprobante?: string
  }) => void
  onCancelar: () => void
}

function CuentaManualModal({
  clientes,
  onGuardar,
  onCancelar
}: CuentaManualModalProps): React.JSX.Element {
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? '')
  const [tipo, setTipo] = useState<'Saldo a favor' | 'Deuda manual'>('Saldo a favor')
  const [fecha, setFecha] = useState(hoyISO())
  const [monto, setMonto] = useState('')
  const [observacion, setObservacion] = useState('')
  const [comprobante, setComprobante] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent): Promise<void> {
    try {
      e.preventDefault()
      setError(null)
      if (!clienteId) {
        setError('Selecciona un cliente.')
        return
      }
      if (num(monto) <= 0) {
        setError('El monto debe ser mayor a 0.')
        return
      }
      if (!observacion.trim()) {
        setError('La observación es obligatoria para justificar una cuenta manual.')
        return
      }
      await onGuardar({
        clienteId,
        tipo,
        fecha,
        monto: num(monto),
        observacion: observacion.trim(),
        comprobante: comprobante.trim() || undefined
      })
    } catch {
      return
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-[#272c29]">Nueva cuenta manual</h2>
          <button
            type="button"
            onClick={onCancelar}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#f0f4f0]"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-5 text-[12px] text-[#8a938d]">
          Sólo para saldos que no provienen de una venta (por ejemplo, una devolución en efectivo o
          una deuda anterior al sistema).
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Cliente" obligatorio>
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className={inputClass(false)}
            >
              {clientes.length === 0 && <option value="">No hay clientes activos</option>}
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Tipo" obligatorio>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'Saldo a favor' | 'Deuda manual')}
                className={inputClass(false)}
              >
                <option value="Saldo a favor">Saldo a favor</option>
                <option value="Deuda manual">Deuda manual</option>
              </select>
            </FormField>
            <FormField label="Monto ($)" obligatorio>
              <input
                type="number"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className={inputClass(false)}
              />
            </FormField>
          </div>

          <FormField label="Fecha" obligatorio>
            <input
              type="date"
              max={hoyISO()}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={inputClass(false)}
            />
          </FormField>

          <FormField label="Observación" obligatorio>
            <input
              type="text"
              maxLength={200}
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className={inputClass(false)}
              placeholder="Ej. Devolución en efectivo no registrada en ventas"
            />
          </FormField>

          <FormField label="Comprobante">
            <input
              type="text"
              maxLength={40}
              value={comprobante}
              onChange={(e) => setComprobante(e.target.value)}
              className={inputClass(false)}
              placeholder="Opcional"
            />
          </FormField>

          {error && (
            <p className="rounded-xl bg-[#fdf1f0] px-3 py-2 text-[12px] text-[#dc5c52]">{error}</p>
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
              Crear cuenta
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================
// Página principal
// ============================================================

function Cuentas(): React.JSX.Element {
  const {
    cuentas,
    movimientosCuenta,
    clientes,
    clientesActivos,
    ventas,
    registrarAbono,
    crearCuentaManual,
    anularCuenta
  } = useAppData()

  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('todas')
  const [detalleCompra, setDetalleCompra] = useState<Cuenta | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('abiertas')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [limite, setLimite] = useState<LimiteCuentas>(25)
  const [pagina, setPagina] = useState(1)

  const [cuentaAbono, setCuentaAbono] = useState<Cuenta | null>(null)
  const [modalManual, setModalManual] = useState(false)
  const [cuentaAnular, setCuentaAnular] = useState<Cuenta | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [confirmoError, setConfirmoError] = useState(false)
  const [clienteDetalle, setClienteDetalle] = useState<string | null>(null)
  const { notificar } = useNotificacion()

  const clientesPorId = useMemo(() => indexarPrimero(clientes, (c) => c.id), [clientes])
  const ventasPorId = useMemo(() => indexarPrimero(ventas, (v) => v.id), [ventas])
  const nombreCliente = useCallback(
    (clienteId: string): string =>
      clientesPorId.get(clienteId)?.nombreRazonSocial ?? 'Cliente eliminado',
    [clientesPorId]
  )

  function nombreTitular(c: Cuenta): string {
    return c.categoria === 'compra'
      ? (c.proveedorNombre ?? 'Proveedor')
      : nombreCliente(c.clienteId)
  }

  const cuentasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    return cuentas.filter((c) => {
      if (categoria !== 'todas' && c.categoria !== categoria) return false
      const tipoSaldo = tipoSaldoDeCuenta(c)

      if (filtroEstado === 'abiertas' && (c.estado === 'cerrado' || c.estado === 'anulado'))
        return false
      if (filtroEstado === 'a_favor' && !(tipoSaldo === 'a_favor' && c.estado !== 'anulado'))
        return false
      if (
        filtroEstado !== 'todas' &&
        filtroEstado !== 'abiertas' &&
        filtroEstado !== 'a_favor' &&
        c.estado !== filtroEstado
      ) {
        return false
      }
      if (filtroDesde && c.fecha < filtroDesde) return false
      if (filtroHasta && c.fecha > filtroHasta) return false

      if (termino) {
        const titular =
          c.categoria === 'compra'
            ? (c.proveedorNombre ?? 'Proveedor')
            : (clientesPorId.get(c.clienteId ?? '')?.nombreRazonSocial ?? 'Cliente eliminado')
        const coincideCliente = titular.toLowerCase().includes(termino)
        const venta = c.ventaId ? ventasPorId.get(c.ventaId) : null
        const numeroComprobante = venta ? formatearNumeroComprobante(venta.numeroComprobante) : ''
        const coincideOperacion = String(c.numeroCompra ?? c.numeroFactura ?? '').includes(termino)
        const coincideComprobante = numeroComprobante.includes(termino)
        if (!coincideCliente && !coincideOperacion && !coincideComprobante) return false
      }
      return true
    })
  }, [
    cuentas,
    clientesPorId,
    ventasPorId,
    busqueda,
    filtroEstado,
    filtroDesde,
    filtroHasta,
    categoria
  ])

  const totalPaginas = Math.max(1, Math.ceil(cuentasFiltradas.length / limite))
  const paginaActual = Math.min(pagina, totalPaginas)
  // Si una actualización de las cuentas reduce el listado, conservar una página
  // válida también en el estado, sin recuperar una página antigua al crecer.
  if (pagina !== paginaActual) setPagina(paginaActual)
  const cuentasPagina = useMemo(
    () => cuentasFiltradas.slice((paginaActual - 1) * limite, paginaActual * limite),
    [cuentasFiltradas, paginaActual, limite]
  )
  const {
    contenedor,
    inicio: inicioVisible,
    fin: finVisible,
    antes: espacioAntes,
    despues: espacioDespues
  } = useFilasVisibles(cuentasPagina, !clienteDetalle)

  // Tarjetas de resumen: se calculan sobre TODAS las cuentas vigentes, no
  // sobre las filtradas, porque representan la situación global del negocio.
  const resumen = useMemo(() => {
    let totalPorCobrar = 0
    let totalPorPagar = 0
    let abiertas = 0

    for (const c of cuentas) {
      if (c.estado === 'anulado') continue
      const saldo = saldoDeCuenta(c)
      if (saldo > 0) {
        if (c.categoria === 'compra') totalPorPagar += saldo
        else totalPorCobrar += saldo
        abiertas += 1
      }
    }
    return {
      totalPorPagar: Math.round(totalPorPagar * 100) / 100,
      totalPorCobrar: Math.round(totalPorCobrar * 100) / 100,
      abiertas
    }
  }, [cuentas])

  // ----- Vista detalle de un cliente -----
  const detalle = useMemo(() => {
    if (!clienteDetalle) return null
    const suyas = cuentas.filter((c) => c.clienteId === clienteDetalle && c.estado !== 'anulado')
    const totalComprado = suyas.reduce((t, c) => t + c.montoTotal, 0)
    const totalPagado = suyas.reduce((t, c) => t + c.montoPagado, 0)
    return {
      cuentas: suyas,
      abiertas: suyas.filter((c) => c.estado === 'pendiente' || c.estado === 'parcial'),
      abonos: movimientosCuenta.filter((m) => m.clienteId === clienteDetalle),
      totalComprado: Math.round(totalComprado * 100) / 100,
      totalPagado: Math.round(totalPagado * 100) / 100,
      saldoAcumulado: Math.round((totalComprado - totalPagado) * 100) / 100
    }
  }, [clienteDetalle, cuentas, movimientosCuenta])

  const comprobantesCuentaAbono = useMemo<OpcionComprobante[]>(() => {
    if (!cuentaAbono || cuentaAbono.categoria !== 'venta') return []
    const opciones = ventas
      .filter((venta) => venta.clienteId === cuentaAbono.clienteId)
      .map((venta) => ({
        valor: formatearNumeroComprobante(venta.numeroComprobante),
        etiqueta: `${nombreCliente(venta.clienteId)} · ${venta.fechaVenta} · $${formatoMoneda(venta.totalVenta)}`,
        asociado: venta.id === cuentaAbono.ventaId
      }))
    return opciones.sort((a, b) => Number(Boolean(b.asociado)) - Number(Boolean(a.asociado)))
  }, [cuentaAbono, ventas, nombreCliente])

  async function guardarAbono(datos: Parameters<AbonoModalProps['onGuardar']>[0]): Promise<void> {
    if (!cuentaAbono) return

    const cuentaProcesada = cuentaAbono
    let resultado: Awaited<ReturnType<typeof registrarAbono>>
    try {
      resultado = await registrarAbono({
        cuentaId: cuentaProcesada.id,
        ...datos,
        generarComprobante: cuentaProcesada.categoria === 'venta'
      })
    } catch (cause) {
      notificar(
        'error',
        cause instanceof ErrorNegocio ? cause.message : 'No se pudo registrar el movimiento.'
      )
      return
    }

    setCuentaAbono(null)

    if (cuentaProcesada.categoria === 'venta' && resultado.movimiento?.numeroComprobante) {
      const venta = cuentaProcesada.ventaId
        ? (ventas.find((item) => item.id === cuentaProcesada.ventaId) ?? null)
        : null
      const cliente = clientes.find((item) => item.id === cuentaProcesada.clienteId) ?? null
      const cuentaActualizada: Cuenta = {
        ...cuentaProcesada,
        montoPagado:
          Math.round((cuentaProcesada.montoPagado + resultado.movimiento.monto) * 100) / 100,
        estado: resultado.saldo <= 0 ? 'cerrado' : 'parcial',
        fechaUltimoMovimiento: resultado.movimiento.fechaHoraRegistro
      }

      if (window.api?.generarComprobantePDF) {
        try {
          const html = construirComprobantePagoHtml(
            cuentaActualizada,
            resultado.movimiento,
            venta,
            cliente
          )
          const nombreClienteArchivo =
            (cliente?.nombreRazonSocial ?? 'Cliente')
              .trim()
              .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '_')
              .replace(/^_+|_+$/g, '') || 'Cliente'
          const nombreArchivo = `Comprobante_Pago_${resultado.movimiento.numeroComprobante}_${nombreClienteArchivo}`
          const pdf = await window.api.generarComprobantePDF(html, nombreArchivo)
          if (!pdf.canceled) {
            notificar(
              'exito',
              resultado.cerrada
                ? `Pago registrado y cuenta saldada. Comprobante ${resultado.movimiento.numeroComprobante} guardado correctamente.`
                : `Abono registrado. Comprobante ${resultado.movimiento.numeroComprobante} guardado correctamente.`
            )
            return
          }
        } catch (cause) {
          notificar(
            'advertencia',
            `El pago quedó registrado, pero no fue posible generar el PDF: ${cause instanceof ErrorNegocio ? cause.message : 'error desconocido'}.`
          )
          return
        }
      } else {
        notificar(
          'advertencia',
          'El pago quedó registrado, pero la generación de PDF no está disponible en esta ejecución.'
        )
        return
      }
    }

    if (resultado.cerrada) {
      notificar(
        'exito',
        `La cuenta de ${nombreTitular(cuentaProcesada)} ha sido saldada completamente. Estado: Cerrado.`
      )
    } else {
      notificar('exito', `Abono registrado. Saldo restante: $${formatoMoneda(resultado.saldo)}.`)
    }
  }

  async function confirmarAnulacion(): Promise<void> {
    try {
      if (!cuentaAnular || !motivoAnulacion.trim() || !confirmoError) return
      await anularCuenta(cuentaAnular.id, motivoAnulacion.trim())
      setCuentaAnular(null)
      setMotivoAnulacion('')
      setConfirmoError(false)
      notificar('exito', 'Cuenta anulada. Se conserva en el historial.')
    } catch {
      return
    }
  }

  // ============================================================
  // Render
  // ============================================================

  if (clienteDetalle && detalle) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 lg:p-7">
        <button
          type="button"
          onClick={() => setClienteDetalle(null)}
          className="mb-4 flex w-fit items-center gap-2 text-[13px] font-semibold text-[#16834b] hover:underline"
        >
          <ArrowLeft size={15} />
          Volver a todas las cuentas
        </button>

        <PageHeader
          greeting={nombreCliente(clienteDetalle)}
          subtitle="Resumen de cuentas y movimientos de este cliente."
        />

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#e2e7e2] bg-white p-4">
            <p className="text-[11px] text-[#8a938d]">Total histórico comprado</p>
            <p className="text-[19px] font-bold text-[#2d332f]">
              ${formatoMoneda(detalle.totalComprado)}
            </p>
          </div>
          <div className="rounded-2xl border border-[#e2e7e2] bg-white p-4">
            <p className="text-[11px] text-[#8a938d]">Total pagado</p>
            <p className="text-[19px] font-bold text-[#16834b]">
              ${formatoMoneda(detalle.totalPagado)}
            </p>
          </div>
          <div className="rounded-2xl border border-[#e2e7e2] bg-white p-4">
            <p className="text-[11px] text-[#8a938d]">Saldo actual acumulado</p>
            <p
              className={[
                'text-[19px] font-bold',
                detalle.saldoAcumulado > 0
                  ? 'text-[#dc5c52]'
                  : detalle.saldoAcumulado < 0
                    ? 'text-[#2b5f9e]'
                    : 'text-[#16834b]'
              ].join(' ')}
            >
              ${formatoMoneda(detalle.saldoAcumulado)}
            </p>
          </div>
        </div>

        <h3 className="mb-2 text-[13px] font-bold text-[#2d332f]">Cuentas abiertas</h3>
        <div className="mb-6 overflow-x-auto rounded-2xl border border-[#e2e7e2] bg-white">
          <table className="w-full min-w-[620px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#e2e7e2] bg-[#fafbfa] text-[11px] font-bold uppercase tracking-wide text-[#8a938d]">
                <th className="px-4 py-3">Operación</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Pagado</th>
                <th className="px-4 py-3">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {detalle.abiertas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[12px] text-[#a3aaa5]">
                    Este cliente no tiene cuentas abiertas.
                  </td>
                </tr>
              ) : (
                detalle.abiertas.map((c) => (
                  <tr key={c.id} className="border-b border-[#eef1ee] last:border-0">
                    <td className="px-4 py-3 text-[#5b635e]">
                      {c.categoria === 'compra'
                        ? `Compra N.º ${c.numeroCompra} del día`
                        : c.numeroFactura
                          ? `Venta N.º ${c.numeroFactura} del día`
                          : 'Manual'}
                    </td>
                    <td className="px-4 py-3 text-[#5b635e]">{formatoFecha(c.fecha)}</td>
                    <td className="px-4 py-3 text-[#5b635e]">${formatoMoneda(c.montoTotal)}</td>
                    <td className="px-4 py-3 text-[#5b635e]">${formatoMoneda(c.montoPagado)}</td>
                    <td className="px-4 py-3 font-semibold text-[#dc5c52]">
                      ${formatoMoneda(saldoDeCuenta(c))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <h3 className="mb-2 text-[13px] font-bold text-[#2d332f]">Historial de abonos</h3>
        <div className="overflow-x-auto rounded-2xl border border-[#e2e7e2] bg-white">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#e2e7e2] bg-[#fafbfa] text-[11px] font-bold uppercase tracking-wide text-[#8a938d]">
                <th className="px-4 py-3">Fecha y hora</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Monto</th>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3">Observación</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {detalle.abonos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[12px] text-[#a3aaa5]">
                    Sin movimientos registrados.
                  </td>
                </tr>
              ) : (
                detalle.abonos.map((m) => (
                  <tr key={m.id} className="border-b border-[#eef1ee] last:border-0">
                    <td className="px-4 py-3 text-[#5b635e]">
                      {formatoFecha(m.fecha)} · {m.fechaHoraRegistro.slice(11, 16)}
                    </td>
                    <td className="px-4 py-3 text-[#5b635e]">{m.tipo}</td>
                    <td className="px-4 py-3 font-semibold text-[#16834b]">
                      ${formatoMoneda(m.monto)}
                    </td>
                    <td className="px-4 py-3 text-[#5b635e]">{m.metodoPago}</td>
                    <td className="px-4 py-3 text-[#8a938d]">{m.observacion}</td>
                    <td className="px-4 py-3 text-[#5b635e]">
                      {m.usuarioNombre ?? 'Sistema anterior'}
                    </td>
                    <td className="px-4 py-3 text-[#8a938d]">{m.comprobante ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 lg:p-7">
      <PageHeader
        greeting="Cuentas"
        subtitle="Ventas por cobrar y compras por pagar. Registra los abonos y consulta las cuentas saldadas."
        actions={
          <button
            type="button"
            onClick={() => setModalManual(true)}
            className="flex items-center gap-2 rounded-xl border border-[#e1e5e1] px-4 py-2.5 text-[13px] font-semibold text-[#5b635e] hover:bg-[#f5f7f4]"
          >
            <Plus size={16} />
            Cuenta manual
          </button>
        }
      />

      <div className="mb-4 flex gap-2">
        {[
          ['todas', 'Todas'],
          ['venta', 'Ventas · por cobrar'],
          ['compra', 'Compras · por pagar']
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={categoria === id}
            onClick={() => {
              setCategoria(id)
              setPagina(1)
            }}
            className={
              'rounded-xl px-4 py-2 text-sm ' +
              (categoria === id ? 'bg-[#e7f4eb] text-[#16834b]' : 'bg-white')
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#e2e7e2] bg-white p-4">
          <p className="text-[11px] text-[#8a938d]">Total por cobrar a clientes</p>
          <p className="text-[19px] font-bold text-[#dc5c52]">
            ${formatoMoneda(resumen.totalPorCobrar)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#e2e7e2] bg-white p-4">
          <p className="text-[11px] text-[#8a938d]">Total por pagar a proveedores</p>
          <p className="text-[19px] font-bold text-[#9c7a1f]">
            ${formatoMoneda(resumen.totalPorPagar)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#e2e7e2] bg-white p-4">
          <p className="text-[11px] text-[#8a938d]">Cuentas abiertas</p>
          <p className="text-[19px] font-bold text-[#2d332f]">{resumen.abiertas}</p>
        </div>
      </div>

      {cuentas.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Todavía no hay cuentas"
          description="Las cuentas aparecen automáticamente en este modulo al registrar movimientos de compra o venta. También puedes crear
          una cuenta manual para un saldo a favor o una deuda que no venga de una venta."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setPagina(1)
              }}
              placeholder="Buscar cliente, proveedor o número"
              className="h-10 min-w-[220px] flex-1 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none focus:border-[#16834b]"
            />
            <select
              value={filtroEstado}
              onChange={(e) => {
                setFiltroEstado(e.target.value as FiltroEstado)
                setPagina(1)
              }}
              className="h-10 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none"
            >
              <option value="abiertas">Cuentas abiertas</option>
              <option value="todas">Todas</option>
              <option value="pendiente">Pendientes</option>
              <option value="parcial">Parciales</option>
              <option value="a_favor">Con saldo a favor</option>
              <option value="cerrado">Cerradas</option>
              <option value="anulado">Anuladas</option>
            </select>
            <input
              type="date"
              value={filtroDesde}
              onChange={(e) => {
                setFiltroDesde(e.target.value)
                setPagina(1)
              }}
              className="h-10 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none"
              aria-label="Desde"
            />
            <span className="text-[12px] text-[#8a938d]">a</span>
            <input
              type="date"
              value={filtroHasta}
              onChange={(e) => {
                setFiltroHasta(e.target.value)
                setPagina(1)
              }}
              className="h-10 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none"
              aria-label="Hasta"
            />
          </div>

          <p className="mb-2 text-xs text-[#69716b]">{cuentasFiltradas.length} cuentas coinciden</p>
          <div
            ref={contenedor}
            tabIndex={0}
            role="region"
            aria-label="Listado de cuentas"
            style={{ maxHeight: '65vh', overflow: 'auto' }}
            className="rounded-2xl border border-[#e2e7e2] bg-white"
          >
            <table
              aria-rowcount={cuentasPagina.length + 1}
              className="w-full min-w-[1100px] text-left text-[13px]"
            >
              <thead>
                <tr className="border-b border-[#e2e7e2] bg-[#fafbfa] text-[11px] font-bold uppercase tracking-wide text-[#8a938d]">
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Titular</th>
                  <th className="px-4 py-3">Operación</th>
                  <th className="px-4 py-3">Total operación</th>
                  <th className="px-4 py-3">Pagado</th>
                  <th className="px-4 py-3">Saldo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cuentasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[12px] text-[#a3aaa5]">
                      Ninguna cuenta coincide con los filtros.
                    </td>
                  </tr>
                ) : (
                  <>
                    {espacioAntes > 0 && (
                      <tr aria-hidden="true">
                        <td colSpan={8} style={{ height: espacioAntes, padding: 0 }} />
                      </tr>
                    )}
                    {cuentasPagina.slice(inicioVisible, finVisible).map((c, indice) => {
                      const saldo = saldoDeCuenta(c)
                      const insignia = insigniaEstado(c)
                      const puedeAbonar = c.estado !== 'anulado' && saldo > 0
                      return (
                        <tr
                          key={c.id}
                          data-cuenta-id={c.id}
                          aria-rowindex={inicioVisible + indice + 2}
                          style={{ height: 56 }}
                          className="border-b border-[#eef1ee] last:border-0 hover:bg-[#fafbfa] [&>td]:whitespace-nowrap"
                        >
                          <td className="px-4 py-3">
                            <span
                              className={[
                                'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                c.categoria === 'compra'
                                  ? 'bg-[#fff6e0] text-[#9c7a1f]'
                                  : 'bg-[#e7f2ea] text-[#176b3a]'
                              ].join(' ')}
                            >
                              {c.categoria === 'compra' ? 'Proveedor' : 'Cliente'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                c.categoria === 'compra'
                                  ? setDetalleCompra(c)
                                  : setClienteDetalle(c.clienteId)
                              }
                              className="font-medium text-[#16834b] hover:underline"
                            >
                              {nombreTitular(c)}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-[#5b635e]">
                            {c.categoria === 'compra'
                              ? `Compra N.º ${c.numeroCompra} del día`
                              : c.numeroFactura
                                ? `Venta N.º ${c.numeroFactura} del día`
                                : 'Manual'}
                          </td>
                          <td className="px-4 py-3 text-[#5b635e]">
                            ${formatoMoneda(c.montoTotal)}
                          </td>
                          <td className="px-4 py-3 text-[#5b635e]">
                            ${formatoMoneda(c.montoPagado)}
                          </td>
                          <td
                            className={[
                              'px-4 py-3 font-semibold',
                              saldo > 0
                                ? 'text-[#dc5c52]'
                                : saldo < 0
                                  ? 'text-[#2b5f9e]'
                                  : 'text-[#16834b]'
                            ].join(' ')}
                          >
                            ${formatoMoneda(saldo)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={[
                                'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                insignia.clases
                              ].join(' ')}
                            >
                              {insignia.texto}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {puedeAbonar && (
                                <button
                                  type="button"
                                  title="Registrar abono"
                                  onClick={() => setCuentaAbono(c)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#f0f4f0] hover:text-[#16834b]"
                                >
                                  <HandCoins size={15} />
                                </button>
                              )}
                              {c.origen === 'manual' && c.estado !== 'anulado' && (
                                <button
                                  type="button"
                                  title="Anular cuenta"
                                  onClick={() => setCuentaAnular(c)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#fdf1f0] hover:text-[#dc5c52]"
                                >
                                  <Ban size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {espacioDespues > 0 && (
                      <tr aria-hidden="true">
                        <td colSpan={8} style={{ height: espacioDespues, padding: 0 }} />
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
          <Paginacion
            total={cuentasFiltradas.length}
            limite={limite}
            limites={LIMITES_CUENTAS}
            numero={paginaActual}
            hayAnterior={paginaActual > 1}
            haySiguiente={paginaActual < totalPaginas}
            anterior={() => setPagina(paginaActual - 1)}
            siguiente={() => setPagina(paginaActual + 1)}
            cambiarLimite={(nuevo) => {
              setLimite(nuevo)
              setPagina(1)
            }}
          />
        </>
      )}

      {detalleCompra && (
        <DetalleCuenta cuenta={detalleCompra} onCerrar={() => setDetalleCompra(null)} />
      )}
      {cuentaAbono && (
        <AbonoModal
          cuenta={cuentaAbono}
          nombreCliente={nombreTitular(cuentaAbono)}
          comprobantesVenta={comprobantesCuentaAbono}
          onGuardar={guardarAbono}
          onCancelar={() => setCuentaAbono(null)}
        />
      )}

      {modalManual && (
        <CuentaManualModal
          clientes={clientesActivos.map((c) => ({ id: c.id, nombre: c.nombreRazonSocial }))}
          onGuardar={async (datos) => {
            try {
              await crearCuentaManual(datos)
              setModalManual(false)
              notificar('exito', 'Cuenta manual creada con éxito.')
            } catch {
              return
            }
          }}
          onCancelar={() => setModalManual(false)}
        />
      )}

      {cuentaAnular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fdf1f0] text-[#dc5c52]">
                <AlertTriangle size={20} />
              </div>
              <h2 className="text-[15px] font-bold text-[#272c29]">Anular cuenta manual</h2>
            </div>
            <p className="mb-4 text-[13px] leading-relaxed text-[#69716b]">
              La cuenta no se elimina: queda marcada como anulada y se conserva en el historial.
            </p>

            <FormField label="Motivo de la anulación" obligatorio>
              <input
                type="text"
                maxLength={200}
                value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
                className={inputClass(false)}
                placeholder="Ej. Cuenta duplicada por error de registro"
              />
            </FormField>

            <label className="mt-3 flex items-start gap-2 text-[12px] text-[#5b635e]">
              <input
                type="checkbox"
                checked={confirmoError}
                onChange={(e) => setConfirmoError(e.target.checked)}
                className="mt-0.5"
              />
              Confirmo que esta cuenta fue creada por error
            </label>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCuentaAnular(null)
                  setMotivoAnulacion('')
                  setConfirmoError(false)
                }}
                className="rounded-xl border border-[#e1e5e1] px-4 py-2.5 text-[13px] font-semibold text-[#5b635e] hover:bg-[#f5f7f4]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!motivoAnulacion.trim() || !confirmoError}
                onClick={confirmarAnulacion}
                className="rounded-xl bg-[#dc5c52] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#c74f46] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anular cuenta
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default Cuentas
