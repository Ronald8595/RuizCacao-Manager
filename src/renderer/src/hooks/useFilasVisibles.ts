import { useLayoutEffect, useRef, useState } from 'react'
import { rangoFilas } from '../utils/filasVisibles'
export function useFilasVisibles(
  filas: readonly unknown[],
  activa = true
): {
  contenedor: React.RefObject<HTMLDivElement | null>
  inicio: number
  fin: number
  antes: number
  despues: number
} {
  const contenedor = useRef<HTMLDivElement>(null)
  const [posicion, setPosicion] = useState({ scroll: 0, alto: 500 })
  useLayoutEffect(() => {
    const elemento = contenedor.current
    if (!elemento) return
    elemento.scrollTop = 0
    const actualizar = (): void => {
      const rango = rangoFilas(filas.length, elemento.scrollTop, elemento.clientHeight)
      const foco = document.activeElement?.closest('[data-cuenta-id]')
      const indice = Number(foco?.getAttribute('aria-rowindex')) - 2
      if (foco && elemento.contains(foco) && (indice < rango.inicio || indice >= rango.fin))
        elemento.focus({ preventScroll: true })
      setPosicion((prev) =>
        prev.scroll === elemento.scrollTop && prev.alto === elemento.clientHeight
          ? prev
          : { scroll: elemento.scrollTop, alto: elemento.clientHeight }
      )
    }
    actualizar()
    elemento.addEventListener('scroll', actualizar, { passive: true })
    const observer = new ResizeObserver(actualizar)
    observer.observe(elemento)
    return () => {
      observer.disconnect()
      elemento.removeEventListener('scroll', actualizar)
    }
  }, [filas, activa])
  return { contenedor, ...rangoFilas(filas.length, posicion.scroll, posicion.alto) }
}
