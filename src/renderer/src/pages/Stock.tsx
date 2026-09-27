import { ErrorNegocio } from '../../../shared/errorNegocio'
import { useMemo, useState, type FormEvent } from 'react'
import { Package, Edit3, Search, X, ArrowRightLeft } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ModalAccesible from '../components/ModalAccesible'
import { FormField, inputClass } from '../components/FormField'
import { FACTORES_CONVERSION, PRODUCTOS, useAppData } from '../store/AppDataContext'
import { useNotificacion } from '../store/NotificacionContext'
import { rangoDiaActual } from '../utils/reportes'
import { useFiltroDiaActual } from '../hooks/useFechaActual'
import type { MovimientoStock, Producto } from '../types'

function hoyISO(): string {
  return rangoDiaActual().desde
}

function num(valor: string): number {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}

function ConversionModal({ onCancelar }: { onCancelar: () => void }): React.JSX.Element {
  const { stock, ultimoFactorUsado, registrarConversionCacao } = useAppData()
  const { notificar } = useNotificacion()
  const [fecha, setFecha] = useState(hoyISO())
  const [cantidad, setCantidad] = useState('')
  const [factor, setFactor] = useState(String(ultimoFactorUsado))
  const [observacion, setObservacion] = useState('')
  const [error, setError] = useState('')
  const resultado = redondear(num(cantidad) / num(factor))

  async function guardar(e: FormEvent): Promise<void> {
    e.preventDefault()
    try {
      await registrarConversionCacao({
        fecha,
        cacaoBabaUtilizadoQq: num(cantidad),
        factorConversion: num(factor),
        observacion
      })
      onCancelar()
      notificar('exito', 'Conversión registrada con éxito.')
    } catch (cause) {
      setError(cause instanceof ErrorNegocio ? cause.message : 'No se pudo convertir el cacao.')
    }
  }

  return (
    <ModalAccesible tituloId="conversion-titulo" onCerrar={onCancelar}>
      <h2 id="conversion-titulo" className="mb-4 text-[16px] font-bold">
        Convertir baba a seco
      </h2>
      <form onSubmit={guardar} className="space-y-4">
        <FormField label="Fecha" obligatorio>
          <input
            type="date"
            required
            max={hoyISO()}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={inputClass(false)}
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Cantidad" obligatorio>
            <input
              data-autofocus
              required
              type="number"
              min="0.01"
              max={stock['Cacao en Baba']}
              step="0.01"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className={inputClass(false)}
            />
          </FormField>
          <FormField label="Factor de conversión" obligatorio>
            <select
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
              className={inputClass(false)}
            >
              {FACTORES_CONVERSION.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-[#fafbfa] px-4 py-3 text-[12px]">
            <span className="text-[#8a938d]">Baba disponible</span>
            <strong className="float-right text-[#2d332f]">
              {redondear(stock['Cacao en Baba'] - num(cantidad))} qq
            </strong>
          </div>
          <div className="rounded-xl bg-[#fafbfa] px-4 py-3 text-[12px]">
            <span className="text-[#8a938d]">Seco resultante</span>
            <strong className="float-right text-[#2d332f]">
              {Number.isFinite(resultado) ? resultado : 0} qq
            </strong>
          </div>
        </div>

        <p className="text-[12px] text-[#5b635e]">
          El seco resultante se calcula con el factor seleccionado. Cuando termine el secado,
          registra la cantidad obtenida y el sistema calculará automáticamente la diferencia.
        </p>

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
            onClick={onCancelar}
            className="rounded-xl border px-4 py-2.5 text-[13px]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            Registrar conversión
          </button>
        </div>
      </form>
    </ModalAccesible>
  )
}

function DiferenciaConversionModal({
  movimientos,
  onCancelar
}: {
  movimientos: MovimientoStock[]
  onCancelar: () => void
}): React.JSX.Element {
  const { registrarDiferenciaConversion } = useAppData()
  const { notificar } = useNotificacion()
  const [movimientoId, setMovimientoId] = useState(movimientos[0]?.id ?? '')
  const [cantidadObtenida, setCantidadObtenida] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')

  const movimiento = movimientos.find((m) => m.id === movimientoId) ?? movimientos[0]
  const diferencia = movimiento ? redondear(num(cantidadObtenida) - movimiento.entradaQq) : 0

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!movimiento) return setError('No hay una conversión pendiente para registrar.')
    try {
      await registrarDiferenciaConversion({
        movimientoId: movimiento.id,
        cantidadObtenidaQq: num(cantidadObtenida),
        motivo
      })
      onCancelar()
      notificar('exito', 'Cantidad obtenida registrada con éxito.')
    } catch (cause) {
      setError(
        cause instanceof ErrorNegocio ? cause.message : 'No se pudo registrar la cantidad obtenida.'
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-[540px] rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-[#272c29]">Registrar cantidad obtenida</h2>
          <button type="button" onClick={onCancelar}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {movimientos.length > 1 && (
            <FormField label="Conversión pendiente" obligatorio>
              <select
                value={movimiento?.id ?? ''}
                onChange={(e) => {
                  setMovimientoId(e.target.value)
                  setCantidadObtenida('')
                  setError('')
                }}
                className={inputClass(false)}
              >
                {movimientos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fecha} · {m.entradaQq} qq calculados · Factor {m.factorConversion}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-[#fafbfa] px-4 py-3 text-[12px]">
              <span className="text-[#8a938d]">Cantidad calculada</span>
              <strong className="float-right text-[#2d332f]">
                {movimiento?.entradaQq ?? 0} qq
              </strong>
            </div>
            <div className="rounded-xl bg-[#fafbfa] px-4 py-3 text-[12px]">
              <span className="text-[#8a938d]">Diferencia</span>
              <strong
                className={
                  'float-right ' +
                  (diferencia < 0
                    ? 'text-[#b43d35]'
                    : diferencia > 0
                      ? 'text-[#16834b]'
                      : 'text-[#2d332f]')
                }
              >
                {cantidadObtenida ? `${diferencia} qq` : '—'}
              </strong>
            </div>
          </div>

          <FormField label="Cantidad obtenida (qq)" obligatorio>
            <input
              autoFocus
              required
              type="number"
              min={0.01}
              step="0.01"
              value={cantidadObtenida}
              onChange={(e) => {
                setCantidadObtenida(e.target.value)
                setError('')
              }}
              className={inputClass(false)}
              placeholder="0.00"
            />
          </FormField>

          <FormField label="Observación (opcional)">
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              className={inputClass(false) + ' resize-none'}
            />
          </FormField>

          <p className="text-[12px] text-[#5b635e]">
            La cantidad obtenida se compara con la cantidad calculada por el factor. Este registro
            es informativo y no modifica el stock disponible de cacao seco.
          </p>

          {error && (
            <p className="rounded-xl bg-[#fdf1f0] px-3 py-2 text-[12px] text-[#dc5c52]">{error}</p>
          )}

          <div className="flex justify-end gap-3 border-t border-[#eef1ee] pt-4">
            <button
              type="button"
              onClick={onCancelar}
              className="rounded-xl border border-[#e1e5e1] px-4 py-2.5 text-[13px] font-semibold text-[#5b635e]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white"
            >
              Registrar cantidad
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AjusteStockModal({ onCancelar }: { onCancelar: () => void }): React.JSX.Element {
  const { stock, registrarAjusteStock, fechaJornadaActiva } = useAppData()
  const { notificar } = useNotificacion()
  const [producto, setProducto] = useState<Producto>('Cacao en Baba')
  const [tipo, setTipo] = useState<'agregar' | 'retirar'>('retirar')
  const [cantidad, setCantidad] = useState('')
  const [observacion, setObservacion] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cantidadNumerica = num(cantidad)
  const cantidadFirmada = tipo === 'retirar' ? -cantidadNumerica : cantidadNumerica
  const stockActual = stock[producto]
  const stockResultante = redondear(stockActual + cantidadFirmada)

  async function guardar(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (guardando) return
    const motivo = observacion.trim()
    if (!Number.isFinite(cantidadNumerica) || cantidadNumerica <= 0) {
      setError('Ingresa una cantidad mayor a 0.')
      return
    }
    if (tipo === 'retirar' && cantidadNumerica > stockActual) {
      setError('No puedes retirar una cantidad mayor al stock disponible.')
      return
    }
    if (!motivo) {
      setError('Indica por qué se realiza el ajuste de inventario.')
      return
    }
    if (motivo.length > 500) {
      setError('La observación no puede superar 500 caracteres.')
      return
    }

    setGuardando(true)
    setError('')
    try {
      await registrarAjusteStock({
        fecha: fechaJornadaActiva ?? hoyISO(),
        producto,
        cantidadQq: cantidadFirmada,
        motivo
      })
      notificar(
        'exito',
        tipo === 'retirar'
          ? 'Salida por ajuste registrada con éxito.'
          : 'Entrada por ajuste registrada con éxito.'
      )
      onCancelar()
    } catch (cause) {
      setError(
        cause instanceof ErrorNegocio ? cause.message : 'No se pudo registrar el ajuste de stock.'
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ModalAccesible tituloId="ajuste-stock-titulo" onCerrar={() => !guardando && onCancelar()}>
      <h2 id="ajuste-stock-titulo" className="mb-2 text-[16px] font-bold text-[#272c29]">
        Ajustar stock
      </h2>
      <p className="mb-4 text-[12px] leading-5 text-[#5b635e]">
        Usa esta opción para corregir diferencias de inventario por errores de registro. La compra
        original no se modifica: se crea un movimiento de ajuste con su observación y usuario para
        conservar la trazabilidad.
      </p>

      <form onSubmit={guardar} className="space-y-4">
        <FormField label="Producto" obligatorio>
          <select
            value={producto}
            onChange={(event) => {
              setProducto(event.target.value as Producto)
              setError('')
            }}
            className={inputClass(false)}
          >
            {PRODUCTOS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Tipo de ajuste" obligatorio>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setTipo('agregar')
                setError('')
              }}
              className={
                'rounded-xl border px-4 py-2.5 text-[13px] font-semibold ' +
                (tipo === 'agregar'
                  ? 'border-[#16834b] bg-[#eef8f2] text-[#16834b]'
                  : 'border-[#e1e5e1] bg-white text-[#5b635e]')
              }
            >
              Agregar
            </button>
            <button
              type="button"
              onClick={() => {
                setTipo('retirar')
                setError('')
              }}
              className={
                'rounded-xl border px-4 py-2.5 text-[13px] font-semibold ' +
                (tipo === 'retirar'
                  ? 'border-[#b43d35] bg-[#fdf1f0] text-[#9d3029]'
                  : 'border-[#e1e5e1] bg-white text-[#5b635e]')
              }
            >
              Retirar
            </button>
          </div>
        </FormField>

        <FormField label="Cantidad (qq)" obligatorio>
          <input
            data-autofocus
            required
            type="number"
            min="0.01"
            max={tipo === 'retirar' ? stockActual : undefined}
            step="0.01"
            value={cantidad}
            onChange={(event) => {
              setCantidad(event.target.value)
              setError('')
            }}
            className={inputClass(false)}
            placeholder="0.00"
          />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-[#fafbfa] px-4 py-3 text-[12px]">
            <span className="text-[#8a938d]">Stock actual</span>
            <strong className="float-right text-[#2d332f]">{stockActual} qq</strong>
          </div>
          <div className="rounded-xl bg-[#fafbfa] px-4 py-3 text-[12px]">
            <span className="text-[#8a938d]">Stock resultante</span>
            <strong
              className={
                'float-right ' + (stockResultante < 0 ? 'text-[#b43d35]' : 'text-[#2d332f]')
              }
            >
              {stockResultante} qq
            </strong>
          </div>
        </div>

        <FormField label="Observación / motivo del ajuste" obligatorio>
          <textarea
            required
            rows={3}
            maxLength={500}
            value={observacion}
            onChange={(event) => {
              setObservacion(event.target.value)
              setError('')
            }}
            className={inputClass(false) + ' resize-none'}
            placeholder="Ej.: Corrección por cantidad ingresada por error en la compra N.º 2 del día."
          />
        </FormField>

        <div className="rounded-xl border border-[#ead68e] bg-[#fff9e8] px-4 py-3 text-[12px] leading-5 text-[#6f5618]">
          Este ajuste modifica las existencias, pero no cambia el valor, pago, cuenta ni comprobante
          de la compra original.
        </div>

        {error && (
          <p role="alert" className="text-[12px] text-[#9d3029]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-[#eef1ee] pt-4">
          <button
            type="button"
            disabled={guardando}
            onClick={onCancelar}
            className="rounded-xl border border-[#e1e5e1] px-4 py-2.5 text-[13px] font-semibold text-[#5b635e] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {guardando ? 'Registrando…' : 'Confirmar ajuste'}
          </button>
        </div>
      </form>
    </ModalAccesible>
  )
}

function StockInicialModal({ onCancelar }: { onCancelar: () => void }): React.JSX.Element {
  const { registrarStockInicial } = useAppData()
  const { notificar } = useNotificacion()
  const [cantidades, setCantidades] = useState<Record<Producto, string>>({
    'Cacao en Baba': '',
    'Cacao Seco': '',
    Maracuyá: ''
  })
  const [costos, setCostos] = useState<Record<Producto, string>>({
    'Cacao en Baba': '',
    'Cacao Seco': '',
    Maracuyá: ''
  })
  const [observacion, setObservacion] = useState('Inventario existente previo al uso del sistema')
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cantidadesNumericas = Object.fromEntries(
    PRODUCTOS.map((producto) => [producto, num(cantidades[producto])])
  ) as Record<Producto, number>

  function continuar(event: FormEvent): void {
    event.preventDefault()
    if (!PRODUCTOS.some((producto) => cantidadesNumericas[producto] > 0)) {
      setError('Ingresa al menos una cantidad mayor a 0.')
      return
    }
    if (
      PRODUCTOS.some(
        (producto) =>
          cantidades[producto].trim() !== '' &&
          (!Number.isFinite(Number(cantidades[producto])) || Number(cantidades[producto]) < 0)
      )
    ) {
      setError('Las cantidades deben ser números iguales o mayores a 0.')
      return
    }
    if (
      PRODUCTOS.some(
        (producto) =>
          costos[producto].trim() !== '' &&
          (!Number.isFinite(Number(costos[producto])) || Number(costos[producto]) < 0)
      )
    ) {
      setError('Los costos deben ser números iguales o mayores a 0.')
      return
    }
    setError('')
    setConfirmando(true)
  }

  async function confirmar(): Promise<void> {
    if (guardando) return
    setGuardando(true)
    setError('')
    try {
      await registrarStockInicial({
        cantidades: cantidadesNumericas,
        costosUnitarios: Object.fromEntries(
          PRODUCTOS.map((producto) => [
            producto,
            costos[producto].trim() === '' ? null : Number(costos[producto])
          ])
        ) as Record<Producto, number | null>,
        observacion
      })
      notificar('exito', 'Stock inicial registrado con éxito.')
      onCancelar()
    } catch (cause) {
      setError(
        cause instanceof ErrorNegocio ? cause.message : 'No se pudo registrar el stock inicial.'
      )
      setConfirmando(false)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ModalAccesible tituloId="stock-inicial-titulo" onCerrar={() => !guardando && onCancelar()}>
      <h2 id="stock-inicial-titulo" className="mb-2 text-[16px] font-bold text-[#272c29]">
        Registrar stock inicial
      </h2>
      {!confirmando ? (
        <form onSubmit={continuar} className="space-y-4">
          <p className="text-[12px] leading-5 text-[#5b635e]">
            Utiliza esta opción una sola vez para incorporar el inventario que el negocio ya poseía
            antes de comenzar a trabajar con RuizCacao Manager. No genera compras, gastos ni cuentas
            por pagar.
          </p>

          <div className="overflow-hidden rounded-xl border border-[#e2e7e2]">
            <div className="grid grid-cols-[1.2fr_1fr_1fr] bg-[#fafbfa] px-3 py-2 text-[11px] font-bold uppercase text-[#6f7771]">
              <span>Producto</span>
              <span>Cantidad (qq)</span>
              <span>Costo/qq opcional</span>
            </div>
            {PRODUCTOS.map((producto) => (
              <div
                key={producto}
                className="grid grid-cols-[1.2fr_1fr_1fr] items-center gap-2 border-t border-[#eef1ee] px-3 py-2"
              >
                <span className="text-[12px] font-medium text-[#2d332f]">{producto}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cantidades[producto]}
                  onChange={(event) =>
                    setCantidades((prev) => ({ ...prev, [producto]: event.target.value }))
                  }
                  className={inputClass(false)}
                  aria-label={`Cantidad inicial de ${producto}`}
                  placeholder="0.00"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costos[producto]}
                  onChange={(event) =>
                    setCostos((prev) => ({ ...prev, [producto]: event.target.value }))
                  }
                  className={inputClass(false)}
                  aria-label={`Costo inicial por quintal de ${producto}`}
                  placeholder="Opcional"
                />
              </div>
            ))}
          </div>

          <FormField label="Observación">
            <textarea
              rows={2}
              maxLength={500}
              value={observacion}
              onChange={(event) => setObservacion(event.target.value)}
              className={inputClass(false)}
            />
          </FormField>

          {error && (
            <p role="alert" className="text-[12px] text-[#9d3029]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancelar}
              className="rounded-xl border px-4 py-2.5 text-[13px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white"
            >
              Continuar
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#ead68e] bg-[#fff9e8] p-4 text-[12px] leading-5 text-[#6f5618]">
            <strong className="block text-[13px]">Confirma la carga inicial</strong>
            Esta operación sumará estas existencias al inventario actual y quedará auditada. Solo
            puede realizarse una vez y no será tratada como compra.
          </div>
          <div className="space-y-2 rounded-xl bg-[#fafbfa] p-4 text-[12px]">
            {PRODUCTOS.filter((producto) => cantidadesNumericas[producto] > 0).map((producto) => (
              <div key={producto} className="flex justify-between gap-4">
                <span>{producto}</span>
                <strong>
                  {cantidadesNumericas[producto]} qq
                  {costos[producto].trim() !== ''
                    ? ` · $${Number(costos[producto]).toFixed(2)}/qq`
                    : ''}
                </strong>
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-[12px] text-[#9d3029]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              disabled={guardando}
              onClick={() => setConfirmando(false)}
              className="rounded-xl border px-4 py-2.5 text-[13px]"
            >
              Volver
            </button>
            <button
              type="button"
              disabled={guardando}
              onClick={confirmar}
              className="rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {guardando ? 'Registrando…' : 'Registrar stock inicial'}
            </button>
          </div>
        </div>
      )}
    </ModalAccesible>
  )
}

export default function Stock(): React.JSX.Element {
  const {
    stock,
    movimientosStock,
    umbralesStock,
    configurarUmbralStock,
    usuarioActual,
    stockInicialRegistrado,
    estadoJornada
  } = useAppData()
  const [productoUmbral, setProductoUmbral] = useState<Producto | null>(null)
  const [umbral, setUmbral] = useState('')
  const [errorUmbral, setErrorUmbral] = useState('')
  const [guardandoUmbral, setGuardandoUmbral] = useState(false)
  async function guardarUmbral(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!productoUmbral || guardandoUmbral) return
    const valor = umbral.trim() === '' ? null : Number(umbral)
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
      setErrorUmbral('Ingresa una cantidad válida o deja el campo vacío para desactivar el aviso.')
      return
    }
    setGuardandoUmbral(true)
    setErrorUmbral('')
    try {
      await configurarUmbralStock(productoUmbral, valor)
      setProductoUmbral(null)
    } catch (e) {
      setErrorUmbral(e instanceof ErrorNegocio ? e.message : 'No se pudo guardar el umbral.')
    } finally {
      setGuardandoUmbral(false)
    }
  }
  const [stockInicialAbierto, setStockInicialAbierto] = useState(false)
  const [ajusteAbierto, setAjusteAbierto] = useState(false)
  const [conversion, setConversion] = useState(false)
  const [diferenciaAbierta, setDiferenciaAbierta] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [producto, setProducto] = useState<Producto | 'Todos'>('Todos')
  const {
    desde: fechaDesde,
    hasta: fechaHasta,
    setDesde: setFechaDesde,
    setHasta: setFechaHasta
  } = useFiltroDiaActual()
  const [pagina, setPagina] = useState(1)

  const conversionesPendientes = useMemo(
    () =>
      movimientosStock.filter(
        (m) => m.tipo === 'Conversión' && (m.diferenciaQq === null || m.diferenciaQq === undefined)
      ),
    [movimientosStock]
  )

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return movimientosStock.filter(
      (m) =>
        (producto === 'Todos' || m.producto === producto) &&
        (!fechaDesde || m.fecha >= fechaDesde) &&
        (!fechaHasta || m.fecha <= fechaHasta) &&
        [m.fecha, m.producto, m.proveedorNombre, m.observacion].some((v) =>
          (v ?? '').toLowerCase().includes(texto)
        )
    )
  }, [movimientosStock, producto, busqueda, fechaDesde, fechaHasta])

  const paginas = Math.max(1, Math.ceil(filtrados.length / 15))
  const actual = Math.min(pagina, paginas)

  return (
    <section
      className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7"
      aria-label="Stock e inventario"
    >
      {productoUmbral && (
        <ModalAccesible
          tituloId="umbral-titulo"
          onCerrar={() => {
            if (!guardandoUmbral) setProductoUmbral(null)
          }}
        >
          <h2 id="umbral-titulo" className="font-bold">
            Aviso de stock bajo · {productoUmbral}
          </h2>
          <form className="mt-4 space-y-4" onSubmit={guardarUmbral}>
            <label className="block text-sm">
              Avisar al llegar a (qq)
              <input
                data-autofocus
                type="number"
                min="0"
                step="0.01"
                value={umbral}
                onChange={(e) => setUmbral(e.target.value)}
                className={inputClass(!!errorUmbral)}
              />
            </label>
            <p className="text-xs text-[#5b635e]">
              Deja el campo vacío para desactivar el aviso. Este ajuste no cambia las existencias.
            </p>
            {errorUmbral && (
              <p role="alert" className="text-sm text-[#9d3029]">
                {errorUmbral}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={guardandoUmbral}
                onClick={() => setProductoUmbral(null)}
                className="rounded-xl border px-4 py-2"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoUmbral}
                className="rounded-xl bg-[#16834b] px-4 py-2 text-white"
              >
                Guardar
              </button>
            </div>
          </form>
        </ModalAccesible>
      )}
      <PageHeader
        greeting="Stock / Inventario"
        subtitle="Existencias y conversiones. Las compras se registran en Compra/Venta."
        actions={
          <div className="flex flex-wrap gap-2">
            {usuarioActual?.rol === 'administrador' && !stockInicialRegistrado && (
              <button
                type="button"
                onClick={() => setStockInicialAbierto(true)}
                className="flex items-center gap-2 rounded-xl border border-[#16834b] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#16834b]"
              >
                <Package size={16} />
                Registrar stock inicial
              </button>
            )}
            <button
              type="button"
              onClick={() => setAjusteAbierto(true)}
              disabled={estadoJornada !== 'activa'}
              title={
                estadoJornada === 'activa'
                  ? 'Registrar una corrección manual de inventario'
                  : 'Inicia o reabre la jornada para ajustar el stock'
              }
              className="flex items-center gap-2 rounded-xl border border-[#16834b] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#16834b] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Edit3 size={16} />
              Ajustar stock
            </button>
            <button
              type="button"
              onClick={() => setDiferenciaAbierta(true)}
              disabled={conversionesPendientes.length === 0}
              className="flex items-center gap-2 rounded-xl border border-[#d9c276] bg-[#fff9e8] px-4 py-2.5 text-[13px] font-semibold text-[#8c6818] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Edit3 size={16} />
              Registrar cantidad obtenida
            </button>
            <button
              type="button"
              onClick={() => setConversion(true)}
              disabled={stock['Cacao en Baba'] <= 0}
              className="flex items-center gap-2 rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              <ArrowRightLeft size={16} />
              Convertir baba a seco
            </button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {PRODUCTOS.map((p) => (
          <div key={p} className="rounded-2xl border border-[#e2e7e2] bg-white p-4">
            <p className="text-[12px] text-[#5b635e]">{p}</p>
            <p className="mt-1 text-[23px] font-bold text-[#176b3a]">{stock[p]} qq</p>
            <button
              type="button"
              className="mt-2 text-xs text-[#16834b]"
              onClick={() => {
                setProductoUmbral(p)
                setUmbral(umbralesStock[p] === null ? '' : String(umbralesStock[p]))
                setErrorUmbral('')
              }}
            >
              {umbralesStock[p] === null
                ? 'Configurar aviso de stock bajo'
                : `Aviso de stock bajo: ${umbralesStock[p]} qq`}
            </button>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <label className="flex min-w-[230px] flex-1 items-center gap-2 rounded-xl border bg-white px-3">
          <Search size={16} />
          <input
            aria-label="Buscar movimientos"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setPagina(1)
            }}
            placeholder="Buscar registros..."
            className="w-full py-2.5 text-[13px] outline-none"
          />
        </label>
        <select
          aria-label="Filtrar producto"
          value={producto}
          onChange={(e) => {
            setProducto(e.target.value as Producto | 'Todos')
            setPagina(1)
          }}
          className="h-10 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none focus:border-[#16834b]"
        >
          <option>Todos</option>
          {PRODUCTOS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => {
            setFechaDesde(e.target.value)
            setPagina(1)
          }}
          className="h-10 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none focus:border-[#16834b]"
          aria-label="Filtrar stock desde"
          title="Desde"
        />
        <span className="self-center text-[12px] text-[#8a938d]">a</span>
        <input
          type="date"
          value={fechaHasta}
          onChange={(e) => {
            setFechaHasta(e.target.value)
            setPagina(1)
          }}
          min={fechaDesde || undefined}
          className="h-10 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px] text-[#4a524c] outline-none focus:border-[#16834b]"
          aria-label="Filtrar stock hasta"
          title="Hasta"
        />
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No hay registros de inventario"
          description="Registra productos desde Compra/Venta o realiza una conversión."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-[#e2e7e2] bg-white">
            <table className="w-full min-w-[900px] text-left text-[12px]">
              <thead>
                <tr className="border-b bg-[#fafbfa] text-[11px] uppercase text-[#5b635e]">
                  {[
                    'Fecha',
                    'Producto',
                    'Cantidad (qq)',
                    'Factor',
                    'Cantidad obtenida (qq)',
                    'Diferencia (qq)',
                    'Usuario'
                  ].map((c) => (
                    <th key={c} className="px-3 py-3">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.slice((actual - 1) * 15, actual * 15).map((m) => {
                  const esConversion = m.tipo === 'Conversión'
                  const cantidadMovimiento =
                    m.entradaQq > 0 ? m.entradaQq : m.salidaQq > 0 ? -m.salidaQq : 0
                  const cantidadObtenida =
                    esConversion &&
                    m.cantidadObtenidaQq !== null &&
                    m.cantidadObtenidaQq !== undefined
                      ? m.cantidadObtenidaQq
                      : esConversion && m.diferenciaQq !== null && m.diferenciaQq !== undefined
                        ? redondear(m.entradaQq + m.diferenciaQq)
                        : null

                  return (
                    <tr key={m.id} className="border-b border-[#eef1ee]">
                      <td className="px-3 py-3">{m.fecha}</td>
                      <td className="px-3 py-3">
                        {m.producto}
                        {m.tipo === 'Stock inicial' && (
                          <span className="ml-2 rounded-full bg-[#fff4d6] px-2 py-0.5 text-[10px] font-semibold text-[#8c6818]">
                            Stock inicial
                          </span>
                        )}
                        {(m.tipo === 'Entrada - Ajuste' || m.tipo === 'Salida - Ajuste') && (
                          <>
                            <span className="ml-2 rounded-full bg-[#eef8f2] px-2 py-0.5 text-[10px] font-semibold text-[#16834b]">
                              Ajuste
                            </span>
                            {m.observacion && (
                              <p
                                className="mt-1 max-w-[280px] truncate text-[10px] text-[#6f7771]"
                                title={m.observacion}
                              >
                                {m.observacion}
                              </p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-3">{cantidadMovimiento || '—'}</td>
                      <td className="px-3 py-3">
                        {esConversion ? (m.factorConversion ?? '—') : '—'}
                      </td>
                      <td className="px-3 py-3">
                        {esConversion
                          ? cantidadObtenida === null
                            ? 'Pendiente'
                            : cantidadObtenida
                          : '—'}
                      </td>
                      <td
                        className={
                          'px-3 py-3 font-semibold ' +
                          (!esConversion || m.diferenciaQq === undefined || m.diferenciaQq === null
                            ? 'text-[#5b635e]'
                            : m.diferenciaQq < 0
                              ? 'text-[#b43d35]'
                              : m.diferenciaQq > 0
                                ? 'text-[#16834b]'
                                : 'text-[#2d332f]')
                        }
                      >
                        {!esConversion || m.diferenciaQq === undefined || m.diferenciaQq === null
                          ? '—'
                          : `${m.diferenciaQq} qq`}
                      </td>
                      <td className="px-3 py-3 text-[#5b635e]">
                        {m.usuarioNombre ?? 'Sistema anterior'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-[12px]">
            <span>
              {filtrados.length} registros · Página {actual} de {paginas}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={actual <= 1}
                onClick={() => setPagina(actual - 1)}
                className="rounded-lg border px-3 py-2 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={actual >= paginas}
                onClick={() => setPagina(actual + 1)}
                className="rounded-lg border px-3 py-2 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}

      {stockInicialAbierto && (
        <StockInicialModal onCancelar={() => setStockInicialAbierto(false)} />
      )}
      {ajusteAbierto && <AjusteStockModal onCancelar={() => setAjusteAbierto(false)} />}
      {conversion && <ConversionModal onCancelar={() => setConversion(false)} />}
      {diferenciaAbierta && conversionesPendientes.length > 0 && (
        <DiferenciaConversionModal
          movimientos={conversionesPendientes}
          onCancelar={() => setDiferenciaAbierta(false)}
        />
      )}
    </section>
  )
}
