import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
}

// Estado vacío para las páginas que todavía no tienen su módulo construido.
// Se usa en la siguiente iteración de cada página (Ingresos, Egresos, etc.)
// para que la demo no se sienta rota al navegar, en lugar de dejar la
// sección en blanco.
function EmptyState({ icon: Icon, title, description }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[#dfe5df] bg-white">
      <div className="flex max-w-[360px] flex-col items-center px-6 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf6ef] text-[#16834b]">
          <Icon size={24} />
        </div>
        <h2 className="text-[15px] font-bold text-[#303632]">{title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#8a938d]">{description}</p>
      </div>
    </div>
  )
}

export default EmptyState
