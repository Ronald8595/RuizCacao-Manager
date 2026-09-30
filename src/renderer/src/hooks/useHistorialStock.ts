import { useEffect, useMemo, useState } from 'react'
import type { FiltroHistorialStock, PaginaHistorialStock } from '../../../shared/historialStock'

interface HistorialStock {
  filas: PaginaHistorialStock['filas']
  cargando: boolean
  error?: string
  numero: number
  hayAnterior: boolean
  haySiguiente: boolean
  reintentar: () => void
  anterior: () => void
  siguiente: () => void
}
const inicio: (string | null)[] = [null]
export function useHistorialStock(
  filtro: Omit<FiltroHistorialStock, 'cursor'>,
  revision: unknown
): HistorialStock {
  const { desde, hasta, producto, busqueda } = filtro
  const grupo = useMemo(
    () => ({ filtro: { desde, hasta, producto, busqueda }, revision }),
    [desde, hasta, producto, busqueda, revision]
  )
  const [navegacion, setNavegacion] = useState<{
    grupo: typeof grupo | null
    cursores: (string | null)[]
    indice: number
  }>({ grupo: null, cursores: inicio, indice: 0 })
  const cursores = navegacion.grupo === grupo ? navegacion.cursores : inicio
  const indice = navegacion.grupo === grupo ? navegacion.indice : 0
  const cursor = cursores[indice]
  const [intento, setIntento] = useState(0)
  const solicitud = useMemo(() => ({ grupo, cursor, intento }), [grupo, cursor, intento])
  const [respuesta, setRespuesta] = useState<{
    solicitud: typeof solicitud
    pagina?: PaginaHistorialStock
    error?: string
  } | null>(null)
  useEffect(() => {
    let vigente = true
    const timer = window.setTimeout(() => {
      window.api.datos
        .historialStock({ ...solicitud.grupo.filtro, cursor: solicitud.cursor })
        .then((r) => {
          if (!vigente) return
          setRespuesta(r.ok ? { solicitud, pagina: r.valor } : { solicitud, error: r.error })
        })
        .catch(() => {
          if (vigente)
            setRespuesta({
              solicitud,
              error: 'No se pudo cargar el historial. Vuelve a intentarlo.'
            })
        })
    }, 150)
    return () => {
      vigente = false
      window.clearTimeout(timer)
    }
  }, [solicitud])
  const actual = respuesta?.solicitud === solicitud ? respuesta : null
  const cargando = actual === null
  const pagina = actual?.pagina
  return {
    filas: pagina?.filas ?? [],
    cargando,
    error: actual?.error,
    numero: indice + 1,
    hayAnterior: indice > 0,
    haySiguiente: Boolean(pagina?.siguiente),
    reintentar: () => setIntento((n) => n + 1),
    anterior: () => {
      if (!cargando && indice > 0) setNavegacion({ grupo, cursores, indice: indice - 1 })
    },
    siguiente: () => {
      if (!cargando && pagina?.siguiente)
        setNavegacion({
          grupo,
          cursores: [...cursores.slice(0, indice + 1), pagina.siguiente],
          indice: indice + 1
        })
    }
  }
}
