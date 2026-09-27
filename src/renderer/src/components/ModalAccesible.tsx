import { useEffect, useRef, type ReactNode, type KeyboardEventHandler } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  tituloId: string
  children: ReactNode
  onCerrar: () => void
  onKeyDown?: KeyboardEventHandler<HTMLDialogElement>
  ancho?: string
}

// El diálogo nativo mantiene el foco dentro del modal y lo devuelve al cerrar.
// Un portal permite abrir el formulario de empleados sin anidar formularios HTML.
export default function ModalAccesible({
  tituloId,
  children,
  onCerrar,
  onKeyDown,
  ancho = 'max-w-[600px]'
}: Props): React.JSX.Element {
  const dialogo = useRef<HTMLDialogElement>(null)
  const focoAnterior = useRef(document.activeElement)
  useEffect(() => {
    const elemento = dialogo.current
    const anterior = focoAnterior.current
    elemento?.showModal()
    elemento?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => {
      elemento?.close()
      if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus()
    }
  }, [])
  return createPortal(
    <dialog
      ref={dialogo}
      aria-labelledby={tituloId}
      onCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onCerrar()
      }}
      onKeyDown={onKeyDown}
      className={`fixed inset-0 m-auto max-h-[90vh] w-[calc(100%_-_2rem)] ${ancho} overflow-y-auto rounded-2xl border-0 bg-white p-6 text-[#292d2a] shadow-xl backdrop:bg-black/30`}
    >
      {children}
    </dialog>,
    document.body
  )
}
