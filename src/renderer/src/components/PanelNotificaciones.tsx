import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useAppData } from '../store/AppDataContext'
import type { Page } from '../types'
import ModalAccesible from './ModalAccesible'

export default function PanelNotificaciones({
  onNavigate,
  onCerrar
}: {
  onNavigate?: (page: Page) => void
  onCerrar: () => void
}): React.JSX.Element {
  const {
    avisos,
    noLeidas,
    actualizandoNotificaciones: ocupado,
    errorNotificaciones,
    marcarNotificacionLeida,
    marcarTodasNotificacionesLeidas,
    eliminarNotificacion,
    eliminarTodasNotificaciones
  } = useAppData()
  const [menu, setMenu] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const listaMenu = useRef<HTMLDivElement>(null)
  const focoTrasEliminar = useRef<{ id: string; posicion: number } | null>(null)
  useEffect(() => {
    const pendiente = focoTrasEliminar.current
    if (!pendiente || avisos.some((n) => n.id === pendiente.id)) return
    const botones = panel.current?.querySelectorAll<HTMLButtonElement>('[data-menu-aviso]')
    const destino = botones?.[Math.min(pendiente.posicion, botones.length - 1)]
    ;(destino ?? panel.current?.querySelector<HTMLElement>('h2'))?.focus()
    focoTrasEliminar.current = null
  }, [avisos])
  const botonMenu = (id: string): HTMLButtonElement | undefined =>
    [...(panel.current?.querySelectorAll<HTMLButtonElement>('[data-menu-aviso]') ?? [])].find(
      (b) => b.dataset.menuAviso === id
    )
  function cerrarMenu(foco = false): void {
    if (foco && menu) botonMenu(menu)?.focus()
    setMenu(null)
  }
  useEffect(() => {
    if (!menu) return
    listaMenu.current?.querySelector<HTMLButtonElement>('button')?.focus()
    listaMenu.current?.scrollIntoView({ block: 'nearest' })
    const fuera = (e: PointerEvent): void => {
      const elemento = botonMenu(menu)?.closest('li')
      if (!elemento?.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [menu])
  async function actuar(id: string, eliminar: boolean): Promise<void> {
    const botones = [
      ...(panel.current?.querySelectorAll<HTMLButtonElement>('[data-menu-aviso]') ?? [])
    ]
    const posicion = botones.findIndex((b) => b.dataset.menuAviso === id)
    cerrarMenu(true)
    if (eliminar) focoTrasEliminar.current = { id, posicion }
    const correcto = await (eliminar ? eliminarNotificacion(id) : marcarNotificacionLeida(id))
    if (!correcto && eliminar) focoTrasEliminar.current = null
  }
  return (
    <>
      <section
        ref={panel}
        id="avisos-panel"
        aria-labelledby="avisos-titulo"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && menu) {
            e.preventDefault()
            e.stopPropagation()
            cerrarMenu(true)
          }
        }}
        className="absolute right-0 top-full z-50 mt-3 flex max-h-[calc(100dvh-110px)] w-[390px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-[#e2e7e2] bg-white p-4 shadow-xl"
      >
        <h2 id="avisos-titulo" tabIndex={-1} className="mb-3 shrink-0 font-bold">
          Notificaciones
        </h2>
        <div className="mb-3 flex shrink-0 flex-wrap gap-3 text-xs">
          <button
            type="button"
            aria-disabled={ocupado || noLeidas === 0}
            onClick={() => {
              if (!ocupado && noLeidas) void marcarTodasNotificacionesLeidas()
            }}
            className="text-[#16834b] aria-disabled:opacity-50"
          >
            Marcar todas como leídas
          </button>
          <button
            type="button"
            aria-disabled={ocupado || avisos.length === 0}
            onClick={() => {
              if (!ocupado && avisos.length) {
                cerrarMenu()
                setConfirmar(true)
              }
            }}
            className="text-[#9d3029] aria-disabled:opacity-50"
          >
            Eliminar todas
          </button>
        </div>
        {errorNotificaciones && (
          <p role="alert" className="mb-2 text-sm text-[#9d3029]">
            {errorNotificaciones}
          </p>
        )}
        <div className="min-h-0 overflow-y-auto overscroll-contain" aria-busy={ocupado}>
          {!avisos.length && (
            <p role="status" className="text-sm">
              No hay notificaciones.
            </p>
          )}
          <ul className="space-y-3">
            {avisos.map((n) => (
              <li
                key={n.id}
                data-aviso={n.id}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (!ocupado) setMenu(n.id)
                }}
                className={
                  'break-words rounded-xl border p-3 ' + (n.leida ? 'bg-white' : 'bg-[#edf7ef]')
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-semibold">
                    {n.titulo}
                    {!n.leida && <span className="ml-2 text-xs text-[#16834b]">Sin leer</span>}
                  </p>
                  <button
                    type="button"
                    data-menu-aviso={n.id}
                    aria-label={'Opciones de notificación: ' + n.titulo}
                    aria-haspopup="menu"
                    aria-expanded={menu === n.id}
                    aria-controls={'aviso-menu-' + n.id}
                    aria-disabled={ocupado}
                    onClick={() => {
                      if (!ocupado) setMenu(menu === n.id ? null : n.id)
                    }}
                    className="shrink-0 rounded-lg p-1 hover:bg-[#e2e7e2] focus-visible:outline-2 focus-visible:outline-[#16834b]"
                  >
                    <MoreHorizontal size={20} />
                  </button>
                </div>
                <p className="my-1 text-sm">{n.mensaje}</p>
                <p className="text-xs text-[#707972]">
                  {new Date(n.fecha).toLocaleString('es-EC')}
                </p>
                {n.destino && onNavigate && (
                  <button
                    type="button"
                    className="mt-2 text-xs text-[#16834b]"
                    onClick={() => {
                      onNavigate(n.destino!)
                      onCerrar()
                    }}
                  >
                    Ver módulo
                  </button>
                )}
                {menu === n.id && (
                  <div
                    ref={listaMenu}
                    id={'aviso-menu-' + n.id}
                    role="menu"
                    aria-label={'Acciones: ' + n.titulo}
                    className="mt-2 rounded-lg border bg-white p-1 shadow-sm"
                    onBlur={(e) => {
                      if (
                        !e.currentTarget.contains(e.relatedTarget) &&
                        e.relatedTarget !== botonMenu(n.id)
                      )
                        setMenu(null)
                    }}
                    onKeyDown={(e) => {
                      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
                      e.preventDefault()
                      const botones = [
                        ...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
                      ]
                      const i = botones.indexOf(document.activeElement as HTMLButtonElement)
                      const siguiente =
                        e.key === 'Home'
                          ? 0
                          : e.key === 'End'
                            ? botones.length - 1
                            : (i + (e.key === 'ArrowDown' ? 1 : -1) + botones.length) %
                              botones.length
                      botones[siguiente]?.focus()
                    }}
                  >
                    {!n.leida && (
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full rounded p-2 text-left text-xs hover:bg-[#edf7ef]"
                        onClick={() => {
                          if (!ocupado) void actuar(n.id, false)
                        }}
                      >
                        Marcar como leída
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full rounded p-2 text-left text-xs text-[#9d3029] hover:bg-[#edf7ef]"
                      onClick={() => {
                        if (!ocupado) void actuar(n.id, true)
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
      {confirmar && (
        <ModalAccesible
          tituloId="eliminar-notificaciones-titulo"
          onCerrar={() => {
            if (!ocupado) setConfirmar(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.stopPropagation()
          }}
        >
          <h2 id="eliminar-notificaciones-titulo" className="font-bold">
            ¿Eliminar todas las notificaciones?
          </h2>
          <p className="my-4 text-sm">
            Se eliminarán las notificaciones de tu usuario. Esta acción no se puede deshacer.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              data-autofocus
              aria-disabled={ocupado}
              className="rounded-xl border p-3"
              onClick={() => {
                if (!ocupado) setConfirmar(false)
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              aria-disabled={ocupado}
              className="rounded-xl bg-[#9d3029] p-3 text-white"
              onClick={() => {
                if (!ocupado)
                  void eliminarTodasNotificaciones().then((ok) => {
                    if (ok) setConfirmar(false)
                  })
              }}
            >
              Eliminar todas
            </button>
          </div>
          {errorNotificaciones && (
            <p role="alert" className="mt-3 text-sm text-[#9d3029]">
              {errorNotificaciones}
            </p>
          )}
        </ModalAccesible>
      )}
    </>
  )
}
