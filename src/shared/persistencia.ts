import type {
  Cliente,
  Proveedor,
  Empleado,
  Compra,
  Venta,
  Cuenta,
  MovimientoCuenta,
  MovimientoStock,
  Gasto,
  Producto
} from '../renderer/src/types'
import type { RegistroJornada } from './dominio'
export interface Snapshot {
  empleados: Empleado[]
  clientes: Cliente[]
  proveedores: Proveedor[]
  compras: Compra[]
  ventas: Venta[]
  cuentas: Cuenta[]
  movimientosCuenta: MovimientoCuenta[]
  movimientosStock: MovimientoStock[]
  gastos: Gasto[]
  stock: Record<Producto, number>
  costoUnitarioPromedio: Record<Producto, number>
  ultimoFactorUsado: number
  jornada: RegistroJornada
}
export function estadoInicial(): Snapshot {
  return {
    empleados: [],
    clientes: [],
    proveedores: [],
    compras: [],
    ventas: [],
    cuentas: [],
    movimientosCuenta: [],
    movimientosStock: [],
    gastos: [],
    stock: { 'Cacao en Baba': 0, 'Cacao Seco': 0, Maracuyá: 0 },
    costoUnitarioPromedio: { 'Cacao en Baba': 0, 'Cacao Seco': 0, Maracuyá: 0 },
    ultimoFactorUsado: 3.5,
    jornada: { estado: 'no_iniciada', fecha: '', horaInicio: null, horaFin: null }
  }
}
export const comandos = [
  'crearEmpleado',
  'actualizarEmpleado',
  'desactivarEmpleado',
  'crearCliente',
  'actualizarCliente',
  'desactivarCliente',
  'crearProveedor',
  'actualizarProveedor',
  'desactivarProveedor',
  'registrarConversionCacao',
  'registrarDiferenciaConversion',
  'registrarAjusteStock',
  'registrarMerma',
  'crearGastoManual',
  'actualizarGastoManual',
  'eliminarGastoManual',
  'registrarCompra',
  'registrarVenta',
  'registrarAbono',
  'crearCuentaManual',
  'anularCuenta'
] as const
export type Comando = (typeof comandos)[number]
export interface Aviso {
  id: string
  titulo: string
  mensaje: string
  fecha: string
  destino?: 'inicio' | 'cuentas' | 'consultas' | 'stock'
  leida: boolean
}

export type RolUsuario = 'administrador' | 'operador'
export interface UsuarioResumen {
  id: string
  nombre: string
  rol: RolUsuario
  activo: boolean
  principal: boolean
  creadoEn: string
}
export interface UsuarioSesion {
  id: string
  nombre: string
  rol: RolUsuario
  principal: boolean
}

export interface EstadoAplicacion {
  umbralesStock: Record<Producto, number | null>
  stockInicialRegistrado: boolean
  stockInicialRegistradoEn: string | null
  datos: Snapshot
  avisos: Aviso[]
  administrador: string
  usuarioActual: UsuarioSesion | null
  usuarios: UsuarioResumen[]
}

export interface StockInicialInput {
  cantidades: Record<Producto, number>
  costosUnitarios: Record<Producto, number | null>
  observacion?: string
}

export interface ConexionLocal {
  host: string
  port: number
  database: string
  user: string
  password: string
}
export interface EstadoAcceso {
  configurada: boolean
  administradorExiste: boolean
  autenticado: boolean
  error?: string
}
export type Respuesta<T> = { ok: true; valor: T } | { ok: false; error: string }
export interface ApiPersistencia {
  historialCombinado: (
    filtro: import('./listados').FiltroListado
  ) => Promise<Respuesta<import('./listados').Listados['historialCombinado']>>
  listadoGastos: (
    filtro: import('./listados').FiltroListado
  ) => Promise<Respuesta<import('./listados').Listados['listadoGastos']>>
  resumenGastos: (
    filtro: import('./listados').FiltroListado
  ) => Promise<Respuesta<import('./listados').Listados['resumenGastos']>>
  reportePeriodo: (
    filtro: import('./listados').FiltroListado
  ) => Promise<Respuesta<import('./listados').Listados['reportePeriodo']>>
  documentoReporte: (
    filtro: import('./listados').FiltroListado,
    tipo: 'diario' | 'semanal' | 'mensual'
  ) => Promise<Respuesta<{ html: string; nombreArchivo: string }>>

  historialCompras: (
    filtro: import('./historialOperaciones').FiltroHistorialOperaciones
  ) => Promise<Respuesta<import('./historialOperaciones').PaginaCompras>>
  historialVentas: (
    filtro: import('./historialOperaciones').FiltroHistorialOperaciones
  ) => Promise<Respuesta<import('./historialOperaciones').PaginaVentas>>
  historialStock: (
    filtro: import('./historialStock').FiltroHistorialStock
  ) => Promise<Respuesta<import('./historialStock').PaginaHistorialStock>>
  anularOperacion: (
    solicitud: string,
    tipo: 'compra' | 'venta',
    id: string,
    motivo: string,
    password: string
  ) => Promise<Respuesta<EstadoAplicacion>>
  cambiarPassword: (actual: string, nueva: string) => Promise<Respuesta<void>>
  crearUsuario: (nombre: string, password: string) => Promise<Respuesta<EstadoAplicacion>>
  cambiarEstadoUsuario: (id: string, activo: boolean) => Promise<Respuesta<EstadoAplicacion>>
  restablecerPasswordUsuario: (id: string, nueva: string) => Promise<Respuesta<void>>
  estado: () => Promise<Respuesta<EstadoAcceso>>
  crearAdministrador: (nombre: string, password: string) => Promise<Respuesta<void>>
  login: (nombre: string, password: string) => Promise<Respuesta<EstadoAplicacion>>
  solicitarRecuperacion: (nombre: string) => Promise<Respuesta<{ solicitud: string }>>
  recuperar: (nombre: string, codigo: string, password: string) => Promise<Respuesta<void>>
  cargar: () => Promise<Respuesta<EstadoAplicacion>>
  ejecutar: (
    id: string,
    comando: Comando,
    args: unknown[]
  ) => Promise<Respuesta<{ estado: EstadoAplicacion; resultado: unknown }>>
  jornada: (
    accion: 'abrir' | 'cerrar' | 'reabrir',
    password: string
  ) => Promise<Respuesta<EstadoAplicacion>>
  leerAviso: (id: string) => Promise<Respuesta<EstadoAplicacion>>
  configurarUmbralStock: (
    producto: string,
    valor: number | null
  ) => Promise<Respuesta<EstadoAplicacion>>
  registrarStockInicial: (input: StockInicialInput) => Promise<Respuesta<EstadoAplicacion>>
  salir: () => Promise<Respuesta<void>>
}
