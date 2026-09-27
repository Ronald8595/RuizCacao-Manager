import { useRef, useState, type FormEvent } from 'react'
import { ErrorNegocio } from '../../../shared/errorNegocio'
import { useAppData } from '../store/AppDataContext'
import { useNotificacion } from '../store/NotificacionContext'
import ModalAccesible from './ModalAccesible'
export default function AnularOperacion({
  tipo,
  id,
  referencia,
  onCerrar
}: {
  tipo: 'compra' | 'venta'
  id: string
  referencia: string
  onCerrar: () => void
}): React.JSX.Element {
  const { anularOperacion } = useAppData(),
    { notificar } = useNotificacion()
  const [motivo, setMotivo] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [ocupado, setOcupado] = useState(false)
  const enviando = useRef(false),
    solicitud = useRef(crypto.randomUUID())
  async function confirmar(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (enviando.current) return
    if (!motivo.trim()) {
      setError('Ingresa el motivo de la anulación.')
      return
    }
    if (!password) {
      setError('Ingresa tu contraseña.')
      return
    }
    enviando.current = true
    setOcupado(true)
    setError('')
    try {
      await anularOperacion(solicitud.current, tipo, id, motivo.trim(), password)
      setPassword('')
      onCerrar()
      notificar(
        'exito',
        tipo === 'compra' ? 'Compra anulada correctamente.' : 'Venta anulada correctamente.'
      )
    } catch (e) {
      setPassword('')
      setError(e instanceof ErrorNegocio ? e.message : 'No se pudo anular. Vuelve a intentarlo.')
    } finally {
      enviando.current = false
      setOcupado(false)
    }
  }
  return (
    <ModalAccesible
      tituloId="anular-operacion"
      onCerrar={() => {
        if (!enviando.current) onCerrar()
      }}
      ancho="max-w-[500px]"
    >
      <h2 id="anular-operacion" className="font-bold">
        ¿Está seguro de anular esta {tipo}?
      </h2>
      <p className="mt-3 text-sm">{referencia}</p>
      <p className="mt-2 text-sm text-[#69716b]">
        Esta acción conservará el registro original y realizará los ajustes correspondientes.
      </p>
      <form onSubmit={confirmar} noValidate className="mt-4 space-y-4">
        <label className="block text-sm">
          Motivo de la anulación
          <textarea
            data-autofocus
            required
            maxLength={500}
            value={motivo}
            disabled={ocupado}
            onChange={(e) => {
              setMotivo(e.target.value)
              solicitud.current = crypto.randomUUID()
            }}
            className="mt-1 w-full rounded-xl border p-3"
            rows={3}
          />
        </label>
        <label className="block text-sm">
          Contraseña
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={ocupado}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border p-3"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-[#9d3029]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            disabled={ocupado}
            onClick={onCerrar}
            className="rounded-xl border px-4 py-2"
          >
            Cancelar
          </button>
          <button
            disabled={ocupado}
            type="submit"
            className="rounded-xl bg-[#dc5c52] px-4 py-2 text-white disabled:opacity-50"
          >
            {ocupado ? 'Guardando…' : `Sí, anular ${tipo}`}
          </button>
        </div>
      </form>
    </ModalAccesible>
  )
}
