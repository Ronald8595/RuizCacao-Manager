import { useLayoutEffect, useRef, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  etiqueta: string
  reinicio: string
  className?: string
}

// El desplazamiento es nativo. Solo medimos el espacio disponible y reiniciamos
// la posición vertical cuando cambia la página o sus filtros.
export default function ContenedorTabla({
  children,
  etiqueta,
  reinicio,
  className = ''
}: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const tabla = ref.current
    const pagina = tabla?.closest('section')
    if (!tabla || !pagina) return
    const ajustar = (): void => {
      const nav = pagina.querySelector<HTMLElement>('nav[aria-label="Paginación"]')
      const rect = tabla.getBoundingClientRect()
      // No ampliar el listado cuando se desplaza la página exterior.
      const superior = rect.top + pagina.scrollTop
      const inferior = nav ? nav.getBoundingClientRect().bottom - rect.bottom : 0
      const margen = parseFloat(getComputedStyle(pagina).paddingBottom) + inferior
      tabla.style.setProperty('--tabla-espacio', `${Math.ceil(superior + margen)}px`)
    }
    ajustar()
    const observer = new ResizeObserver(ajustar)
    observer.observe(pagina)
    for (const hijo of pagina.children) observer.observe(hijo)
    window.addEventListener('resize', ajustar)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', ajustar)
    }
  })

  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = 0
  }, [reinicio])

  return (
    <div
      ref={ref}
      role="region"
      aria-label={etiqueta}
      tabIndex={0}
      className={`contenedor-tabla min-w-0 shrink-0 ${className}`}
    >
      {children}
    </div>
  )
}
