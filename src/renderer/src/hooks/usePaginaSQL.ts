import { useEffect, useMemo, useState } from 'react'
import type { LimitePagina } from '../../../shared/listados'
import type { Respuesta } from '../../../shared/persistencia'
interface Pagina {
  filas: unknown[]
  siguiente: string | null
  total: number
}
const inicio: (string | null)[] = [null]
export interface ControlPagina<T extends Pagina> {
  pagina?: T
  filas: T['filas']
  total: number
  limite: LimitePagina
  cambiarLimite: (limite: LimitePagina) => void
  numero: number
  cargando: boolean
  error?: string
  hayAnterior: boolean
  haySiguiente: boolean
  reintentar: () => void
  anterior: () => void
  siguiente: () => void
}
// La identidad incluye filtros, tamaño, revisión y vista; toda respuesta vieja se ignora.
export function usePaginaSQL<T extends Pagina>(
  consultar: (f: Record<string, unknown>) => Promise<Respuesta<T>>,
  filtro: object,
  revision: unknown,
  activo = true
): ControlPagina<T> {
  const [limite, cambiarLimite] = useState<LimitePagina>(15)
  const clave = JSON.stringify(filtro)
  const grupo = useMemo(
    () => ({ filtro: JSON.parse(clave), limite, revision, activo }),
    [clave, limite, revision, activo]
  )
  const [nav, setNav] = useState<{
    grupo: typeof grupo | null
    cursores: (string | null)[]
    indice: number
  }>({ grupo: null, cursores: inicio, indice: 0 })
  const indice = nav.grupo === grupo ? nav.indice : 0
  const cursores = nav.grupo === grupo ? nav.cursores : inicio
  const cursor = cursores[indice]
  const [intento, setIntento] = useState(0)
  const solicitud = useMemo(() => ({ grupo, cursor, intento }), [grupo, cursor, intento])
  const [respuesta, setRespuesta] = useState<{
    solicitud: typeof solicitud
    pagina?: T
    error?: string
  } | null>(null)
  useEffect(() => {
    if (!solicitud.grupo.activo) return
    let vigente = true
    const timer = window.setTimeout(() => {
      consultar({
        ...solicitud.grupo.filtro,
        limite: solicitud.grupo.limite,
        cursor: solicitud.cursor
      })
        .then((r) => {
          if (vigente)
            setRespuesta(r.ok ? { solicitud, pagina: r.valor } : { solicitud, error: r.error })
        })
        .catch(() => {
          if (vigente)
            setRespuesta({ solicitud, error: 'No se pudo consultar. Vuelve a intentarlo.' })
        })
    }, 150)
    return () => {
      vigente = false
      window.clearTimeout(timer)
    }
  }, [solicitud, consultar])
  const actual = respuesta?.solicitud === solicitud ? respuesta : null
  const pagina = actual?.pagina
  const cargando = activo && actual === null
  return {
    pagina,
    filas: (pagina?.filas ?? []) as T['filas'],
    total: pagina?.total ?? 0,
    limite,
    cambiarLimite,
    numero: indice + 1,
    cargando,
    error: actual?.error,
    hayAnterior: indice > 0,
    haySiguiente: Boolean(pagina?.siguiente),
    reintentar: () => setIntento((n) => n + 1),
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
    }
  }
}
