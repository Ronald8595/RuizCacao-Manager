import type { AvisoToast } from '../hooks/useToast'
import { CheckCircle2, XCircle, X } from 'lucide-react'

export default function Toast({
  aviso,
  onCerrar
}: {
  aviso: AvisoToast | null
  onCerrar: () => void
}): React.JSX.Element | null {
  if (!aviso) return null
  const Icon = aviso.error ? XCircle : CheckCircle2
  return (
    <div
      role={aviso.error ? 'alert' : 'status'}
      className={`fixed bottom-5 right-5 z-[100] flex max-w-[calc(100%_-_2.5rem)] items-center gap-3 rounded-xl border bg-white p-4 text-[13px] shadow-lg ${aviso.error ? 'border-[#dc5c52] text-[#9d3029]' : 'border-[#16834b] text-[#176b3a]'}`}
    >
      <Icon size={20} className="shrink-0" />
      <span>{aviso.mensaje}</span>
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar notificación"
        className="rounded p-1 focus-visible:outline-2"
      >
        <X size={16} />
      </button>
    </div>
  )
}
