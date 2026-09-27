import type { ReactNode } from 'react'

interface PageHeaderProps {
  greeting: string
  subtitle: string
  actions?: ReactNode
}

const today = new Date().toLocaleDateString('es-EC', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

// Encabezado reutilizable para todas las páginas.
function PageHeader({ greeting, subtitle, actions }: PageHeaderProps): React.JSX.Element {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-medium capitalize text-[#8a938d] sm:text-[12px]">{today}</p>
        <h1 className="truncate text-[23px] font-bold tracking-[-0.6px] text-[#272c29] sm:text-[26px]">
          {greeting}
        </h1>
        <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-[#8a938d] sm:text-[13px]">
          {subtitle}
        </p>
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-3">{actions}</div>}
    </div>
  )
}

export default PageHeader
