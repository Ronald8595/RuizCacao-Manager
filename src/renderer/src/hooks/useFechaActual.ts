import { useEffect, useState } from 'react'
import { rangoDiaActual } from '../utils/reportes'

/** Mantiene sincronizada la fecha visible con el día actual de la PC. */
export function useFechaActual(): string {
  const [fecha, setFecha] = useState(() => rangoDiaActual().desde)

  useEffect(() => {
    const actualizar = (): void => setFecha(rangoDiaActual().desde)
    const intervalo = window.setInterval(actualizar, 60_000)
    const alCambiarVisibilidad = (): void => {
      if (document.visibilityState === 'visible') actualizar()
    }

    window.addEventListener('focus', actualizar)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      window.clearInterval(intervalo)
      window.removeEventListener('focus', actualizar)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [])

  return fecha
}

/**
 * Inicia ambos filtros en el día actual. Si el usuario cambia uno manualmente,
 * ese valor se conserva; los campos que sigan en modo automático cambian con el día.
 */
export function useFiltroDiaActual(): {
  desde: string
  hasta: string
  setDesde: (valor: string) => void
  setHasta: (valor: string) => void
  mostrarHoy: () => void
} {
  const fechaActual = useFechaActual()
  const [desdeManual, setDesdeManual] = useState<string | null>(null)
  const [hastaManual, setHastaManual] = useState<string | null>(null)

  return {
    desde: desdeManual ?? fechaActual,
    hasta: hastaManual ?? fechaActual,
    setDesde: (valor) => setDesdeManual(valor === fechaActual ? null : valor),
    setHasta: (valor) => setHastaManual(valor === fechaActual ? null : valor),
    mostrarHoy: () => {
      setDesdeManual(null)
      setHastaManual(null)
    }
  }
}
