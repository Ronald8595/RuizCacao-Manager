import { useNotificacion } from '../store/NotificacionContext'
import { fechaLocal } from '../utils/reportes'
import { ErrorNegocio } from '../../../shared/errorNegocio'
import { useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useAppData } from '../store/AppDataContext'
import ModalAccesible from './ModalAccesible'
export default function ControlJornada(): React.JSX.Element {
  const { estadoJornada, fechaJornadaActiva, horaInicioJornada, gestionarJornada } = useAppData()
  const { notificar } = useNotificacion()
  const [accion, setAccion] = useState<'abrir' | 'cerrar' | 'reabrir' | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const interrumpida = estadoJornada === 'interrumpida'
  const siguiente =
    estadoJornada === 'activa'
      ? 'cerrar'
      : interrumpida
        ? fechaJornadaActiva === fechaLocal()
          ? 'reabrir'
          : 'cerrar'
        : estadoJornada === 'finalizada'
          ? 'reabrir'
          : 'abrir'
  const etiquetas = {
    abrir: 'Iniciar jornada',
    cerrar: interrumpida ? 'Finalizar jornada interrumpida' : 'Finalizar jornada',
    reabrir: interrumpida ? 'Recuperar jornada de hoy' : 'Reabrir jornada de hoy'
  }
  async function guardar(e?: FormEvent, elegida = accion): Promise<void> {
    e?.preventDefault()
    if (!elegida || ocupado) return
    setOcupado(true)
    setError('')
    try {
      await gestionarJornada(elegida, elegida === 'reabrir' ? password : '')
      notificar('exito', elegida === 'abrir' ? 'Jornada iniciada correctamente.' : elegida === 'cerrar' ? 'Jornada finalizada correctamente.' : 'Jornada reabierta correctamente.')
      setAccion(null)
      setPassword('')
      setMostrarPassword(false)
    } catch (cause) {
      setError(cause instanceof ErrorNegocio ? cause.message : 'No se pudo actualizar la jornada.')
    } finally {
      setOcupado(false)
    }
  }
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e2e7e2] bg-white p-5">
      <div>
        <p className="text-sm font-bold text-[#176b3a]">
          {interrumpida
            ? `Jornada ${fechaJornadaActiva} interrumpida.`
            : estadoJornada === 'activa'
              ? `Jornada ${fechaJornadaActiva} activa desde ${horaInicioJornada}`
              : estadoJornada === 'finalizada'
                ? 'La jornada de hoy está cerrada'
                : 'No hay jornada activa'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          if (siguiente === 'abrir') void guardar(undefined, 'abrir')
          else setAccion(siguiente)
          setPassword('')
          setError('')
        }}
        disabled={ocupado}
        className={`rounded-xl px-5 py-3 text-sm font-semibold ${siguiente === 'cerrar' ? 'bg-[#c73737] text-white' : siguiente === 'reabrir' ? 'bg-[#f4bd43] text-[#523b09]' : 'bg-[#16834b] text-white'}`} 
      >
        {etiquetas[siguiente]}
      </button>
      {error && !accion && <p role="alert" className="text-sm text-[#9d3029]">{error}</p>}
      {accion && (
        <ModalAccesible
          tituloId="jornada-password"
          onCerrar={() => {
            if (!ocupado) {
              setAccion(null)
              setPassword('')
              setMostrarPassword(false)
            }
          }}
        >
          <h2 id="jornada-password" className="font-bold">
            {etiquetas[accion]}
          </h2>
          <form onSubmit={e => void guardar(e)} className="mt-4 space-y-4">
            {accion === 'cerrar' && <p>¿Seguro que deseas finalizar la jornada de hoy?</p>}
            {accion === 'reabrir' && <label className="block text-sm">
              Contraseña
              <div className="relative mt-2">
                <input
                  data-autofocus
                  required
                  type={mostrarPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border p-3 pr-12"
                />
                <button
                  type="button"
                  aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={mostrarPassword}
                  onClick={() => setMostrarPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#657069]"
                >
                  {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>}
            {error && (
              <p role="alert" className="text-sm text-[#9d3029]">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  setAccion(null)
                  setPassword('')
                  setMostrarPassword(false)
                }}
                className="rounded-xl border px-4 py-2"
              >
                Cancelar
              </button>
              <button
                disabled={ocupado}
                type="submit"
                className="rounded-xl bg-[#16834b] px-4 py-2 text-white"
              >
                Confirmar
              </button>
            </div>
          </form>
        </ModalAccesible>
      )}
    </div>
  )
}
