import NovedadesVersion from './components/NovedadesVersion'
import { useEffect, useState, type ComponentType } from 'react'
import Acceso from './components/Acceso'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Inicio from './pages/inicio'
import CompraVenta from './pages/CompraVenta'
import Stock from './pages/Stock'
import Cuentas from './pages/Cuentas'
import Gastos from './pages/Gastos'
import Consultas from './pages/Consultas'
import Clientes from './pages/Clientes'
import Empleados from './pages/Empleados'
import Usuarios from './pages/Usuarios'
import { AppDataProvider } from './store/AppDataContext'
import { NotificacionProvider } from './store/NotificacionContext'
import type { Page, PageProps } from './types'

// Router simple basado en estado.
const pages = {
  inicio: Inicio,
  ventas: CompraVenta,
  stock: Stock,
  cuentas: Cuentas,
  gastos: Gastos,
  consultas: Consultas,
  clientes: Clientes,
  empleados: Empleados,
  usuarios: Usuarios
} as Record<Page, ComponentType<PageProps>>

function App(): React.JSX.Element {
  const [activePage, setActivePage] = useState<Page>('inicio')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // En ventanas pequeñas el sidebar inicia compacto para reservar espacio.
  // El usuario puede abrirlo manualmente con el botón ☰.
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1100px)')
    const updateSidebar = (): void => setSidebarCollapsed(mediaQuery.matches)

    updateSidebar()
    mediaQuery.addEventListener('change', updateSidebar)
    return () => mediaQuery.removeEventListener('change', updateSidebar)
  }, [])

  const ActivePage = pages[activePage]

  return (
    <Acceso>
      {(inicial, onSalir) => (
        <NotificacionProvider>
          <AppDataProvider inicial={inicial} onSalir={onSalir}>
            {inicial.usuarioActual && (
              <NovedadesVersion
                key={inicial.usuarioActual.id}
                usuarioId={inicial.usuarioActual.id}
              />
            )}
            <div className="flex h-screen min-w-0 bg-[#f5f7f4] text-[#292d2a]">
              <Sidebar
                activePage={activePage}
                onNavigate={setActivePage}
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed((value) => !value)}
              />

              <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <Header onNavigate={setActivePage} />
                <ActivePage onNavigate={setActivePage} />
              </main>
            </div>
          </AppDataProvider>
        </NotificacionProvider>
      )}
    </Acceso>
  )
}

export default App
