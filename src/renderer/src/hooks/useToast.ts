import { useEffect, useState } from 'react'

export interface AvisoToast {
  mensaje: string
  error?: boolean
}

export function useToast(): {
  aviso: AvisoToast | null
  notificar: (mensaje: string, error?: boolean) => void
  cerrar: () => void
} {
  const [aviso, setAviso] = useState<AvisoToast | null>(null)
  useEffect(() => {
    if (!aviso) return
    const timer = window.setTimeout(() => setAviso(null), 5000)
    return () => window.clearTimeout(timer)
  }, [aviso])
  return {
    aviso,
    notificar: (mensaje, error = false) => setAviso({ mensaje, error }),
    cerrar: () => setAviso(null)
  }
}
