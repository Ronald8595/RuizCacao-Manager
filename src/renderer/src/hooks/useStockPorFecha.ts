import { useEffect, useMemo, useRef, useState } from 'react'
import type { LimiteStockFecha, PaginaStockFecha } from '../../../shared/stockPorFecha'
import type { Respuesta } from '../../../shared/persistencia'

export function useStockPorFecha(fecha: string): {
  pagina?: PaginaStockFecha
  error?: string
  cargando: boolean
  limite: LimiteStockFecha
  cambiarLimite: (n: LimiteStockFecha) => void
  numero: number
  total: number
  hayAnterior: boolean
  haySiguiente: boolean
  anterior: () => void
  siguiente: () => void
  reintentar: () => void
} {
  const [limite, cambiarLimite] = useState<LimiteStockFecha>(25)
  const [intento, setIntento] = useState(0)
  const grupo = useMemo(() => ({ fecha, limite, intento }), [fecha, limite, intento])
  const [nav, setNav] = useState<{
    grupo: typeof grupo
    cursores: (string | null)[]
    indice: number
  } | null>(null)
  const indice = nav?.grupo === grupo ? nav.indice : 0
  const cursores = nav?.grupo === grupo ? nav.cursores : [null]
  const cursor = cursores[indice]
  const solicitud = useMemo(() => ({ grupo, cursor }), [grupo, cursor])
  const [respuesta, setRespuesta] = useState<{
    solicitud: typeof solicitud
    pagina?: PaginaStockFecha
    error?: string
  } | null>(null)
  // Reutiliza la promesa en la repetición de efectos de StrictMode; sin timers ni polling.
  const pendiente = useRef<{
    solicitud: typeof solicitud
    promesa: Promise<Respuesta<PaginaStockFecha>>
  } | null>(null)
  useEffect(() => {
    if (!solicitud.grupo.fecha) return
    let vigente = true
    if (pendiente.current?.solicitud !== solicitud) {
      pendiente.current = {
        solicitud,
        promesa: window.api.datos.stockPorFecha({
          fecha: solicitud.grupo.fecha,
          limite: solicitud.grupo.limite,
          cursor: solicitud.cursor
        })
      }
    }
    pendiente.current.promesa
      .then((r) => {
        if (vigente)
          setRespuesta(r.ok ? { solicitud, pagina: r.valor } : { solicitud, error: r.error })
      })
      .catch(() => {
        if (vigente)
          setRespuesta({
            solicitud,
            error: 'No se pudo consultar el stock de esta fecha. Vuelve a intentarlo.'
          })
      })
    return () => {
      vigente = false
    }
  }, [solicitud])
  const actual = respuesta?.solicitud === solicitud ? respuesta : null
  const pagina = actual?.pagina
  const cargando = Boolean(fecha) && actual === null
  return {
    pagina,
    error: actual?.error,
    cargando,
    limite,
    cambiarLimite,
    numero: indice + 1,
    total: pagina?.total ?? 0,
    hayAnterior: indice > 0,
    haySiguiente: Boolean(pagina?.siguiente),
    anterior: () => {
      if (!cargando && indice > 0) setNav({ grupo, cursores, indice: indice - 1 })
    },
    siguiente: () => {
      if (!cargando && pagina?.siguiente)
        setNav({
          grupo,
          cursores: [...cursores.slice(0, indice + 1), pagina.siguiente],
          indice: indice + 1
        })
    },
    reintentar: () => setIntento((n) => n + 1)
  }
}
