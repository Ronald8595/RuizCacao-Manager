import { useCallback, useEffect, useRef, useState } from 'react'
import type { Aviso, Notificaciones, Respuesta } from '../../../shared/persistencia'
import { ColaNotificaciones } from '../utils/colaNotificaciones'

interface EstadoNotificacionesUI {
  avisos: Aviso[]
  noLeidas: number
  actualizandoNotificaciones: boolean
  errorNotificaciones: string
  listarNotificaciones: () => Promise<boolean>
  marcarNotificacionLeida: (id: string) => Promise<boolean>
  marcarTodasNotificacionesLeidas: () => Promise<boolean>
  eliminarNotificacion: (id: string) => Promise<boolean>
  eliminarTodasNotificaciones: () => Promise<boolean>
  limpiarNotificacionesAntiguas: () => Promise<boolean>
}
export default function useNotificaciones(
  iniciales: Aviso[],
  usuarioId?: string
): EstadoNotificacionesUI {
  const [avisos, setAvisos] = useState(iniciales)
  const [pendientes, setPendientes] = useState(0)
  const [errorNotificaciones, setError] = useState('')
  const cola = useRef(new ColaNotificaciones())
  const activa = useRef(false)
  const ejecutar = useCallback(
    async (fn: () => Promise<Respuesta<Notificaciones>>): Promise<boolean> => {
      let iniciada = false
      try {
        return await cola.current.ejecutar(
          async () => {
            iniciada = true
            setPendientes((n) => n + 1)
            setError('')
            const r = await fn()
            if (!r.ok) throw Error(r.error)
            return r.valor
          },
          (r) => setAvisos(r.avisos)
        )
      } catch (e) {
        if (activa.current)
          setError(e instanceof Error ? e.message : 'No se pudo actualizar la notificación.')
        return false
      } finally {
        if (activa.current && iniciada) setPendientes((n) => Math.max(0, n - 1))
      }
    },
    []
  )
  useEffect(() => {
    const solicitudes = cola.current
    activa.current = true
    solicitudes.activar()
    return () => {
      activa.current = false
      solicitudes.invalidar()
    }
  }, [usuarioId])
  // El estado de negocio solo dispara una lectura compacta, nunca sustituye los
  // avisos locales con una copia potencialmente anterior a la última eliminación.
  useEffect(() => {
    if (usuarioId) void ejecutar(() => window.api.datos.listarNotificaciones())
  }, [iniciales, usuarioId, ejecutar])
  return {
    avisos,
    noLeidas: avisos.reduce((n, a) => n + Number(!a.leida), 0),
    actualizandoNotificaciones: pendientes > 0,
    errorNotificaciones,
    listarNotificaciones: () => ejecutar(() => window.api.datos.listarNotificaciones()),
    marcarNotificacionLeida: (id: string) =>
      ejecutar(() => window.api.datos.marcarNotificacionLeida(id)),
    marcarTodasNotificacionesLeidas: () =>
      ejecutar(() => window.api.datos.marcarTodasNotificacionesLeidas()),
    eliminarNotificacion: (id: string) => ejecutar(() => window.api.datos.eliminarNotificacion(id)),
    eliminarTodasNotificaciones: () =>
      ejecutar(() => window.api.datos.eliminarTodasNotificaciones()),
    limpiarNotificacionesAntiguas: () =>
      ejecutar(() => window.api.datos.limpiarNotificacionesAntiguas())
  }
}
