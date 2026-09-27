import { Menu } from 'lucide-react'
import { menuItems } from '../data/menu'
import type { Page } from '../types'
import { useAppData } from '../store/AppDataContext'
import logoGrupoRuiz from '../assets/brand/logo-grupo-ruiz.jpeg'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
  collapsed: boolean
  onToggle: () => void
}

function Sidebar({ activePage, onNavigate, collapsed, onToggle }: SidebarProps): React.JSX.Element {
  const { usuarioActual } = useAppData()
  const items = menuItems.filter((item) => item.id !== 'usuarios' || usuarioActual?.rol === 'administrador')
  return (
    <aside
      className={[
        'flex h-screen shrink-0 flex-col border-r border-[#e4e8e4] bg-[#fbfcfb] transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-[76px]' : 'w-[250px]'
      ].join(' ')}
    >
      {/* Cabecera: el único control para abrir/cerrar es el botón Menu. */}
      <div
        className={[
          'shrink-0 border-b border-[#e8ebe8]',
          collapsed
            ? 'flex flex-col items-center gap-2 px-2 py-3'
            : 'flex h-[82px] items-center justify-between px-5'
        ].join(' ')}
      >
        <div
          className={[
            'flex items-center',
            collapsed ? 'justify-center' : 'min-w-0 gap-3'
          ].join(' ')}
        >
          <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#e5e8e5] bg-white shadow-sm">
            <img src={logoGrupoRuiz} alt="Grupo Ruiz" className="h-full w-full object-contain" />
          </div>

          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-[19px] font-bold leading-tight tracking-[-0.5px] text-[#4b3428]">
                Ruiz<span className="text-[#176b3a]">Cacao</span>
              </h1>
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-[1.4px] text-[#9a8a4f]">
                Grupo Ruiz
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? 'Mostrar menú' : 'Ocultar menú'}
          aria-label={collapsed ? 'Mostrar menú' : 'Ocultar menú'}
          aria-expanded={!collapsed}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-[#7c8680] transition-all duration-200 hover:border-[#dfe6df] hover:bg-white hover:text-[#176b3a]"
        >
          <Menu size={20} strokeWidth={1.8} />
        </button>
      </div>

      {/* Navegación: no cambia la lógica existente, solo su presentación. */}
      <div className={[
        'flex-1 overflow-y-auto py-6',
        collapsed ? 'px-2' : 'px-4'
      ].join(' ')}>
        {!collapsed && (
          <div className="mb-3 px-3">
            <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#a3aaa5]">
              Menú principal
            </span>
          </div>
        )}

        <nav className="space-y-1.5">
          {items.map((item) => {
            const Icon = item.icon
            const isActive = activePage === item.id

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={[
                  'group flex w-full items-center rounded-xl transition-all duration-200',
                  collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-3 text-left',
                  isActive
                    ? 'bg-[#e7f2ea] text-[#176b3a] shadow-sm'
                    : 'text-[#66706a] hover:bg-[#f0f4f0] hover:text-[#176b3a]'
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                    isActive
                      ? 'bg-white text-[#176b3a] shadow-sm'
                      : 'bg-transparent text-[#7d8780] group-hover:text-[#176b3a]'
                  ].join(' ')}
                >
                  <Icon size={17} strokeWidth={1.8} />
                </span>

                {!collapsed && (
                  <>
                    <span
                      className={[
                        'flex-1 truncate text-[13px]',
                        isActive ? 'font-semibold text-[#176b3a]' : 'font-medium'
                      ].join(' ')}
                    >
                      {item.label}
                    </span>
                    {isActive && <span className="h-2 w-2 shrink-0 rounded-full bg-[#d1a83f]" />}
                  </>
                )}
              </button>
            )
          })}
        </nav>
      </div>

    </aside>
  )
}

export default Sidebar
