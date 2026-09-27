import AnularOperacion from '../components/AnularOperacion'
import DetalleOperacion from '../components/DetalleOperacion'
import { ErrorNegocio } from '../../../shared/errorNegocio'
import { useRef, useState, type FormEvent } from 'react'
import { Plus, Search, ShoppingBasket, ChevronDown, Ban, AlertTriangle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ModalAccesible from '../components/ModalAccesible'
import ProveedorCompraModal from '../components/ProveedorCompraModal'
import { FormField, inputClass } from '../components/FormField'
import { useAppData, PRODUCTOS, saldoDeCuenta } from '../store/AppDataContext'
import { useNotificacion } from '../store/NotificacionContext'
import { calcularImportes } from '../utils/comercio'
import { formatoMoneda, rangoDiaActual } from '../utils/reportes'
import { useFiltroDiaActual } from '../hooks/useFechaActual'
import type { Compra, CompraInput, MetodoPago, Producto, Proveedor } from '../types'

const IMPUESTOS_SUGERIDOS = [1, 1.75, 2, 2.5, 3] as const

function etiquetaProveedor(proveedor: Pick<Proveedor, 'nombre' | 'ciRuc'>): string {
  return proveedor.ciRuc ? `${proveedor.nombre} · ${proveedor.ciRuc}` : proveedor.nombre
}

function CompraModal({
  onCerrar,
  onGuardado
}: {
  onCerrar: () => void
  onGuardado: () => void
}): React.JSX.Element {
  const { proveedoresActivos, registrarCompra, estadoJornada } = useAppData()
  const guardando = useRef(false)
  const [proveedorId, setProveedorId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [proveedorComboAbierto, setProveedorComboAbierto] = useState(false)
  const [impuestoComboAbierto, setImpuestoComboAbierto] = useState(false)
  const [crearProveedor, setCrearProveedor] = useState(false)
  const [fecha, setFecha] = useState(rangoDiaActual().desde)
  const [producto, setProducto] = useState<Producto>('Cacao en Baba')
  const [cantidad, setCantidad] = useState('')
  const [precio, setPrecio] = useState('')
  const [impuesto, setImpuesto] = useState('1')
  const [estadoPago, setEstadoPago] = useState<'completo' | 'abono' | 'pendiente'>('completo')
  const [abono, setAbono] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago>('Efectivo')
  const [efectivo, setEfectivo] = useState('')
  const [transferencia, setTransferencia] = useState('')
  const [observacion, setObservacion] = useState('')
  const [comprobante, setComprobante] = useState('')
  const [error, setError] = useState('')
  const [pendienteConfirmacion, setPendienteConfirmacion] = useState<CompraInput | null>(null)
  const calculo = calcularImportes(Number(cantidad), Number(precio), Number(impuesto))
  const totalCalculado = calculo.subtotal - calculo.montoImpuesto
  const total = Number.isFinite(totalCalculado) ? Math.round(totalCalculado * 100) / 100 : 0
  const pago = estadoPago === 'pendiente' ? 0 : estadoPago === 'completo' ? total : Number(abono)
  const proveedor = proveedoresActivos.find((p) => p.id === proveedorId)
  const terminoProveedor = proveedorId ? '' : busqueda.trim().toLocaleLowerCase('es')
  const proveedoresFiltrados = proveedoresActivos
    .filter(
      (p) =>
        !terminoProveedor ||
        p.nombre.toLocaleLowerCase('es').includes(terminoProveedor) ||
        p.ciRuc.toLocaleLowerCase('es').includes(terminoProveedor)
    )
    .slice(0, 8)
  function guardar(event: FormEvent): void {
    event.preventDefault()
    if (guardando.current) return
    setError('')
    if (estadoJornada !== 'activa')
      return setError('No se puede realizar compra hasta iniciar o reabrir la jornada.')
    if (!proveedorId) return setError('Selecciona un proveedor registrado.')
    if (estadoPago === 'abono' && (!Number.isFinite(pago) || pago <= 0 || pago >= total))
      return setError('El abono debe ser mayor a cero y menor al total.')
    setPendienteConfirmacion({
      fecha,
      proveedorId,
      producto,
      cantidadQq: Number(cantidad),
      precioCompraQq: Number(precio),
      impuestoPorcentaje: Number(impuesto),
      montoPagado: pago,
      metodoPago: estadoPago === 'pendiente' ? 'Efectivo' : metodo,
      montoEfectivo:
        metodo === 'Pago Mixto' && estadoPago !== 'pendiente' ? Number(efectivo) : undefined,
      montoTransferencia:
        metodo === 'Pago Mixto' && estadoPago !== 'pendiente' ? Number(transferencia) : undefined,
      observacion,
      comprobante
    })
  }

  async function confirmarCompra(): Promise<void> {
    if (!pendienteConfirmacion || guardando.current) return
    setError('')
    try {
      guardando.current = true
      await registrarCompra(pendienteConfirmacion)
      onGuardado()
    } catch (cause) {
      guardando.current = false
      setPendienteConfirmacion(null)
      setError(cause instanceof ErrorNegocio ? cause.message : 'No se pudo registrar la compra.')
    }
  }
  return (
    <ModalAccesible tituloId="compra-titulo" onCerrar={onCerrar} ancho="max-w-[720px]">
      <h2 id="compra-titulo" className="mb-5 text-[17px] font-bold">
        Nueva compra
      </h2>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Proveedor" obligatorio>
            <div
              className="relative"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setProveedorComboAbierto(false)
                }
              }}
            >
              <input
                data-autofocus
                required
                value={busqueda}
                placeholder="Buscar por nombre o CI/RUC..."
                className={inputClass(false) + ' pr-10'}
                autoComplete="off"
                onFocus={() => setProveedorComboAbierto(true)}
                onChange={(e) => {
                  const valor = e.target.value
                  setBusqueda(valor)
                  setProveedorComboAbierto(true)
                  const normalizado = valor.trim().toLocaleLowerCase('es')
                  const coincidencias = proveedoresActivos.filter((p) => {
                    const opcion = etiquetaProveedor(p)
                    return (
                      opcion.toLocaleLowerCase('es') === normalizado ||
                      p.ciRuc.toLocaleLowerCase('es') === normalizado ||
                      p.nombre.toLocaleLowerCase('es') === normalizado
                    )
                  })
                  setProveedorId(coincidencias.length === 1 ? coincidencias[0].id : '')
                }}
              />
              <button
                type="button"
                onClick={() => setProveedorComboAbierto((abierto) => !abierto)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[#8a938d] hover:text-[#176b3a]"
                aria-label="Mostrar proveedores"
              >
                <ChevronDown
                  size={16}
                  className={
                    proveedorComboAbierto
                      ? 'rotate-180 transition-transform'
                      : 'transition-transform'
                  }
                />
              </button>

              {proveedorComboAbierto && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[#dfe6e0] bg-white p-1.5 shadow-[0_12px_30px_rgba(35,55,43,0.14)]">
                  {proveedoresFiltrados.length > 0 ? (
                    proveedoresFiltrados.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setProveedorId(p.id)
                          setBusqueda(etiquetaProveedor(p))
                          setProveedorComboAbierto(false)
                        }}
                        className={[
                          'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                          proveedorId === p.id
                            ? 'bg-[#eef7f1] text-[#176b3a]'
                            : 'text-[#2d332f] hover:bg-[#f5f8f5]'
                        ].join(' ')}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-semibold">
                            {p.nombre}
                          </span>
                          <span className="block truncate text-[11px] text-[#8a938d]">
                            {p.ciRuc || 'Sin CI/RUC'}
                          </span>
                        </span>
                        {proveedorId === p.id && (
                          <span className="shrink-0 rounded-full bg-[#dcefe3] px-2 py-0.5 text-[10px] font-semibold text-[#176b3a]">
                            Seleccionado
                          </span>
                        )}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-3 text-[12px] text-[#8a938d]">
                      No hay proveedores que coincidan con la búsqueda.
                    </p>
                  )}
                </div>
              )}
            </div>
          </FormField>
          <FormField label="Fecha de compra" obligatorio>
            <input
              type="date"
              required
              max={rangoDiaActual().desde}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={inputClass(false)}
            />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <span className="text-[#5b635e]">
            {proveedor
              ? `Proveedor seleccionado: ${proveedor.nombre}`
              : 'Selecciona un proveedor registrado.'}
          </span>
          <button
            type="button"
            onClick={() => setCrearProveedor(true)}
            className="font-semibold text-[#176b3a]"
          >
            + Registrar nuevo proveedor
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Producto" obligatorio>
            <select
              value={producto}
              onChange={(e) => setProducto(e.target.value as Producto)}
              className={inputClass(false)}
            >
              {PRODUCTOS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Cantidad (qq)" obligatorio>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className={inputClass(false)}
            />
          </FormField>
          <FormField label="Precio por qq (USD)" obligatorio>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              className={inputClass(false)}
            />
          </FormField>
          <FormField label="Impuesto (%)">
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
                value={impuesto}
                onFocus={() => setImpuestoComboAbierto(true)}
                onChange={(e) => {
                  setImpuesto(e.target.value)
                  setImpuestoComboAbierto(true)
                }}
                className={
                  inputClass(false) +
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
                        setImpuesto(String(valor))
                        setImpuestoComboAbierto(false)
                      }}
                      className={[
                        'w-full rounded-lg px-3 py-2 text-left text-[12px] transition-colors',
                        Number(impuesto) === valor
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
        <div className="rounded-xl bg-[#f5f7f4] p-3 text-[13px]">
          Subtotal: ${formatoMoneda(calculo.subtotal || 0)} · Impuesto: -$
          {formatoMoneda(calculo.montoImpuesto || 0)}{' '}
          <strong className="mt-1 block text-[#176b3a]">Total: ${formatoMoneda(total)}</strong>
        </div>
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold">Estado del pago</legend>
          <div className="flex flex-wrap gap-4 text-[13px]">
            {(
              [
                ['completo', 'Pago completo'],
                ['abono', 'Abono'],
                ['pendiente', 'Pendiente']
              ] as const
            ).map(([valor, label]) => (
              <label key={valor} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="estado-compra"
                  checked={estadoPago === valor}
                  onChange={() => setEstadoPago(valor)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {estadoPago !== 'pendiente' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Método de pago">
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as MetodoPago)}
                className={inputClass(false)}
              >
                {['Efectivo', 'Transferencia', 'Pago Mixto'].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </FormField>
            {estadoPago === 'abono' && (
              <FormField label="Abono inicial (USD)" obligatorio>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={total}
                  value={abono}
                  onChange={(e) => setAbono(e.target.value)}
                  className={inputClass(false)}
                />
              </FormField>
            )}
            {metodo === 'Pago Mixto' && (
              <>
                <FormField label="Efectivo (USD)">
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={efectivo}
                    onChange={(e) => setEfectivo(e.target.value)}
                    className={inputClass(false)}
                  />
                </FormField>
                <FormField label="Transferencia (USD)">
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={transferencia}
                    onChange={(e) => setTransferencia(e.target.value)}
                    className={inputClass(false)}
                  />
                </FormField>
              </>
            )}
          </div>
        )}
        <p className="text-[13px] font-semibold">
          Saldo por pagar: ${formatoMoneda(Math.max(0, total - (pago || 0)))}
        </p>
        <FormField label="Comprobante">
          <input
            maxLength={40}
            value={comprobante}
            onChange={(e) => setComprobante(e.target.value)}
            className={inputClass(false)}
            placeholder="Referencia del proveedor (opcional)"
          />
        </FormField>
        <FormField label="Observación">
          <textarea
            rows={2}
            maxLength={500}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            className={inputClass(false)}
          />
        </FormField>
        {error && (
          <p role="alert" className="text-[13px] text-[#9d3029]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-xl border px-4 py-2.5 text-[13px]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            Registrar compra
          </button>
        </div>
      </form>
      {crearProveedor && (
        <ProveedorCompraModal
          onCancelar={() => setCrearProveedor(false)}
          onCreado={(p) => {
            setProveedorId(p.id)
            setBusqueda(etiquetaProveedor(p))
            setCrearProveedor(false)
          }}
        />
      )}
      {pendienteConfirmacion && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-[460px] rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fff4d8] text-[#9a6a00]">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold">¿Está seguro de confirmar la compra?</h3>
                <p className="mt-1 text-[12px] text-[#69716b]">
                  Revisa proveedor, producto, cantidad y valores antes de continuar.
                </p>
              </div>
            </div>
            <div className="mb-5 rounded-xl bg-[#f5f7f4] p-3 text-[13px] text-[#4a524c]">
              <p>
                <strong>Proveedor:</strong> {proveedor?.nombre ?? '—'}
              </p>
              <p>
                <strong>Producto:</strong> {producto}
              </p>
              <p>
                <strong>Cantidad:</strong> {cantidad || '0'} qq
              </p>
              <p>
                <strong>Total:</strong> ${formatoMoneda(total)}
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendienteConfirmacion(null)}
                className="rounded-xl border px-4 py-2.5 text-[13px]"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={confirmarCompra}
                className="rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white"
              >
                Sí, confirmar compra
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalAccesible>
  )
}

export default function Compras(): React.JSX.Element {
  const { compras, cuentas, estadoJornada } = useAppData()
  const [modal, setModal] = useState(false)
  const [detalle, setDetalle] = useState<Compra | null>(null)
  const [compraAEliminar, setCompraAEliminar] = useState<Compra | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const {
    desde: filtroDesde,
    hasta: filtroHasta,
    setDesde: setFiltroDesde,
    setHasta: setFiltroHasta
  } = useFiltroDiaActual()
  const { notificar } = useNotificacion()
  const termino = busqueda.trim().toLocaleLowerCase('es')
  const comprasFiltradas = compras.filter((compra) => {
    if (filtroDesde && compra.fecha < filtroDesde) return false
    if (filtroHasta && compra.fecha > filtroHasta) return false
    return !termino || compra.proveedorNombre.toLocaleLowerCase('es').includes(termino)
  })
  const jornadaBloqueaCompra = estadoJornada !== 'activa'
  const mensajeJornadaBloqueada =
    'No se puede realizar compra hasta iniciar o reabrir la jornada.'

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">
      <PageHeader
        greeting="Compras"
        subtitle="Compra de productos y cuentas por pagar a proveedores."
        actions={
          <button
            type="button"
            onClick={() => setModal(true)}
            disabled={jornadaBloqueaCompra}
            title={jornadaBloqueaCompra ? mensajeJornadaBloqueada : undefined}
            className="flex items-center gap-2 rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#146b3e] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={16} />
            Nueva compra
          </button>
        }
      />
      {jornadaBloqueaCompra && (
        <div
          role="status"
          className="mb-4 flex items-center gap-3 rounded-2xl border border-[#eadfc2] bg-[#fffaf0] px-4 py-3"
        >
          <AlertTriangle size={18} className="shrink-0 text-[#9c7a1f]" />
          <p className="text-[12px] text-[#8d7f57]">{mensajeJornadaBloqueada}</p>
        </div>
      )}
      {compras.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-[#e2e7e2] bg-white px-3 py-2.5">
            <Search size={16} className="shrink-0 text-[#8a938d]" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar proveedor..."
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#a3aaa5]"
              aria-label="Buscar compras por proveedor"
            />
          </div>
          <input
            type="date"
            value={filtroDesde}
            onChange={(e) => setFiltroDesde(e.target.value)}
            className="h-11 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none focus:border-[#16834b]"
            aria-label="Compras desde"
          />
          <span className="text-[12px] text-[#8a938d]">a</span>
          <input
            type="date"
            value={filtroHasta}
            onChange={(e) => setFiltroHasta(e.target.value)}
            className="h-11 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none focus:border-[#16834b]"
            aria-label="Compras hasta"
          />
        </div>
      )}
      {compras.length === 0 ? (
        <EmptyState
          icon={ShoppingBasket}
          title="Todavía no hay compras"
          description="Registra una compra para ingresar el producto a Stock y generar su cuenta de proveedor."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-[#e2e7e2] bg-white">
            <table className="w-full min-w-[1000px] text-left text-[13px]">
              <thead>
                <tr className="border-b bg-[#fafbfa] text-[11px] uppercase text-[#5b635e]">
                  {[
                    'Compra',
                    'Fecha',
                    'Proveedor',
                    'Producto',
                    'Cantidad',
                    'Total',
                    'Pagado',
                    'Por pagar',
                    'Estado',
                    'Usuario',
                    'Acciones'
                  ].map((c) => (
                    <th key={c} className="px-3 py-3">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comprasFiltradas.map((compra) => {
                  const cuenta = cuentas.find((c) => c.compraId === compra.id)
                  const anulada = compra.estado === 'anulada'
                  const saldo = anulada
                    ? 0
                    : cuenta
                      ? Math.max(0, saldoDeCuenta(cuenta))
                      : compra.totalCompra - compra.montoPagadoInicial
                  const pagado = cuenta?.montoPagado ?? compra.montoPagadoInicial
                  return (
                    <tr
                      key={compra.id}
                      className={
                        'border-b border-[#eef1ee] ' + (anulada ? 'bg-[#fffafa] opacity-75' : '')
                      }
                    >
                      <td className="px-3 py-3">N.º {compra.numeroCompra} del día</td>
                      <td className="px-3 py-3">{compra.fecha}</td>
                      <td className="px-3 py-3">{compra.proveedorNombre}</td>
                      <td className="px-3 py-3">{compra.producto}</td>
                      <td className="px-3 py-3">{compra.cantidadQq} qq</td>
                      <td className="px-3 py-3">${formatoMoneda(compra.totalCompra)}</td>
                      <td className="px-3 py-3">${formatoMoneda(pagado)}</td>
                      <td className="px-3 py-3">${formatoMoneda(saldo)}</td>
                      <td className="px-3 py-3 font-semibold">
                        {anulada ? (
                          <span className="rounded-full bg-[#fdf1f0] px-2 py-1 text-[11px] text-[#b23a32]">
                            Anulada
                          </span>
                        ) : saldo <= 0 ? (
                          'Pagado'
                        ) : pagado > 0 ? (
                          'Parcial'
                        ) : (
                          'Pendiente'
                        )}
                      </td>
                      <td className="px-3 py-3 text-[#5b635e]">
                        {compra.usuarioNombre ?? 'Sistema anterior'}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setDetalle(compra)}
                            className="rounded-lg border px-2 text-xs"
                          >
                            Ver
                          </button>
                          <button
                            type="button"
                            title={anulada ? 'Compra anulada' : 'Anular compra'}
                            disabled={estadoJornada !== 'activa' || anulada}
                            onClick={() => {
                              setCompraAEliminar(compra)
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#fdf1f0] hover:text-[#dc5c52] disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            <Ban size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {comprasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-6 text-center text-[#8a938d]">
                      No hay compras que coincidan con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {modal && (
        <CompraModal
          onCerrar={() => setModal(false)}
          onGuardado={() => {
            setModal(false)
            notificar(
              'exito',
              'Compra registrada con éxito. Stock y cuenta de proveedor actualizados.'
            )
          }}
        />
      )}
      {detalle && <DetalleOperacion operacion={detalle} onCerrar={() => setDetalle(null)} />}
      {compraAEliminar && (
        <AnularOperacion
          tipo="compra"
          id={compraAEliminar.id}
          referencia={`Compra N.º ${compraAEliminar.numeroCompra} · ${compraAEliminar.fecha} · ${compraAEliminar.proveedorNombre}`}
          onCerrar={() => setCompraAEliminar(null)}
        />
      )}
    </section>
  )
}
