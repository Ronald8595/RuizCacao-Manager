import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Wallet,
  TrendingDown,
  ClipboardList,
  Users,
  type LucideIcon
} from 'lucide-react'

import type { Page } from '../types'

export interface MenuItem {
  id: Page
  label: string
  icon: LucideIcon
}

// Fuente única de verdad para el menú: la usan tanto el Sidebar (para
// pintar los botones) como App.tsx (para saber qué título/subtítulo
// mostrar en el encabezado de cada página).
//
// Orden y nombres según la estructura acordada con el cliente (documento
// de reestructuración post-reunión): sigue el flujo natural de trabajo
// ver resumen -> registrar venta -> revisar stock -> ver cuentas -> consultar.
export const menuItems: MenuItem[] = [
  { id: 'inicio', label: 'Inicio', icon: LayoutDashboard },
  { id: 'ventas', label: 'Compra/Venta', icon: ShoppingCart },
  { id: 'stock', label: 'Stock / Inventario', icon: Package },
  { id: 'cuentas', label: 'Cuentas', icon: Wallet },
  { id: 'gastos', label: 'Gastos', icon: TrendingDown },
  { id: 'consultas', label: 'Consultas y Reportes', icon: ClipboardList },
  { id: 'empleados', label: 'Empleados', icon: Users },
  { id: 'clientes', label: 'Clientes y Proveedores', icon: Users },
  { id: 'usuarios', label: 'Usuarios', icon: Users }
]
