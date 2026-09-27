import { useMemo } from 'react'
import { DollarSign, TrendingDown as GastoIcon } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { menuItems } from '../data/menu'
import { useAppData } from '../store/AppDataContext'
import ControlJornada from '../components/ControlJornada'
import { rangoDiaActual, resumirPeriodo } from '../utils/reportes'
import type { PageProps } from '../types'

// Descripciones cortas de cada módulo para las tarjetas de acceso directo.
// Se muestran junto al ícono/label que ya viven en data/menu.ts, para no
// duplicar esa fuente de verdad (Sidebar y Header la usan tal cual).
const descripcionModulo: Record<string, string> = {
  ventas: 'Registrar compras, ventas y consultar su historial',
  stock: 'Ver y ajustar el inventario disponible',
  cuentas: 'Revisar saldos y registrar abonos',
  gastos: 'Registrar un gasto operativo',
  consultas: 'Reportes diarios, semanales y mensuales',
  clientes: 'Gestionar clientes y proveedores',
  empleados: 'Gestionar trabajadores y mano de obra',
  usuarios: 'Gestionar accesos y operadores'
}

// Accesos directos = todos los módulos del menú excepto Inicio (no tiene
// sentido un acceso directo a la propia página de Inicio).
const accesosDirectos = menuItems.filter((item) => item.id !== 'inicio')

function saludoSegunHora(): string {
  const hora = new Date().getHours()
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function formatearMoneda(valor: number): string {
  return `$${valor.toFixed(2)}`
}

// Inicio: centro de navegación de la app y control de jornada laboral.
// El control de jornada (iniciar/finalizar, y qué habilita/bloquea cada
// estado) vive en AppDataContext; esta página solo lo consume y muestra la
// confirmación/mensajes al usuario.
function Inicio({ onNavigate }: PageProps): React.JSX.Element {
  const { ventas, gastos, movimientosCuenta, cuentas, compras, administrador, usuarioActual } =
    useAppData()


  const hoy = rangoDiaActual().desde
  const resumen = useMemo(() => resumirPeriodo(ventas, gastos, hoy, hoy, movimientosCuenta, cuentas, compras), [ventas,gastos,hoy,movimientosCuenta,cuentas,compras])
  const totalVentasHoy = resumen.totalIngresos
  const totalGastosHoy = resumen.totalGastos
  const hayResumenHoy = resumen.filas.length > 0

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">
      <PageHeader greeting={administrador ? `${saludoSegunHora()}, ${administrador}` : 'Bienvenido'} subtitle="Control de jornada y resumen del día" />

      <ControlJornada />

      {/* ================= RESUMEN RÁPIDO DEL DÍA ================= */}
      {hayResumenHoy && (
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-2xl border border-[#e2e7e2] bg-white p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf6ef] text-[#16834b]">
              <DollarSign size={19} />
            </div>
            <div>
              <p className="text-[12px] text-[#8a938d]">Cobros de hoy</p>
              <p className="text-[15px] font-bold text-[#2d332f]">
                {formatearMoneda(totalVentasHoy)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-[#e2e7e2] bg-white p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fdeeee] text-[#d64545]">
              <GastoIcon size={19} />
            </div>
            <div>
              <p className="text-[12px] text-[#8a938d]">Pagos y gastos de hoy</p>
              <p className="text-[15px] font-bold text-[#2d332f]">{formatearMoneda(totalGastosHoy)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ================= ACCESOS DIRECTOS ================= */}
      <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[#8a938d]">Accesos directos</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accesosDirectos.filter((modulo)=>modulo.id!=='usuarios'||usuarioActual?.rol==='administrador').map((modulo) => {
          const Icon = modulo.icon
          return (
            <button
              key={modulo.id}
              onClick={() => onNavigate?.(modulo.id)}
              className="group flex flex-col items-start rounded-2xl border border-[#e2e7e2] bg-white p-5 text-left shadow-sm transition-colors hover:border-[#16834b]"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf6ef] text-[#16834b]">
                <Icon size={19} />
              </div>
              <p className="text-[13px] font-bold text-[#2d332f]">{modulo.label}</p>
              <p className="mt-1 text-[11px] text-[#8d958f]">{descripcionModulo[modulo.id]}</p>
            </button>
          )
        })}
      </div>

    </section>
  )
}

export default Inicio
