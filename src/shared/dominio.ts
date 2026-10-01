import { ErrorNegocio } from './errorNegocio'
import { prepararEmpleado, prepararGastoEmpleado } from '../renderer/src/utils/empleados'
import {
  validarCompra,
  validarPago,
  calcularConversion,
  calcularImportes
} from '../renderer/src/utils/comercio'
import type {
  AbonoInput,
  AjusteConversionInput,
  AjusteStockInput,
  CategoriaGasto,
  Cliente,
  ClienteFormData,
  ConversionCacaoInput,
  Compra,
  CompraInput,
  Cuenta,
  CuentaManualInput,
  EstadoCobro,
  EstadoCuenta,
  EstadoJornada,
  Empleado,
  EmpleadoFormData,
  TipoSaldoCuenta,
  Gasto,
  GastoFormData,
  MermaInput,
  MetodoPago,
  MovimientoCuenta,
  MovimientoStock,
  Proveedor,
  ProveedorFormData,
  Producto,
  Venta
} from '../renderer/src/types'

import type { Snapshot } from './persistencia'
export const PRODUCTOS: Producto[] = ['Cacao en Baba', 'Cacao Seco', 'Maracuyá']

// Opciones fijas del ComboBox de factor de conversión (baba -> seco), tal
export const FACTORES_CONVERSION = [
  2.8, 2.9, 3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.0, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6,
  4.7, 4.8, 4.9, 5.0, 5.1, 5.2, 5.3
] as const

export const CATEGORIAS_GASTO: CategoriaGasto[] = [
  'Inversión en materia prima',
  'Transporte',
  'Mano de obra',
  'Insumos',
  'Servicios',
  'Otros'
]

// Categorías que el usuario puede elegir en el formulario MANUAL de Gastos.
// 'Inversión en materia prima' queda fuera porque esa categoría sólo la usa
// el sistema al generar inversiones automáticas desde Compra/Venta; si el cliente la
// necesitara para un gasto manual, se agregaría aquí explícitamente.
export const CATEGORIAS_GASTO_MANUAL: CategoriaGasto[] = CATEGORIAS_GASTO.filter(
  (c) => c !== 'Inversión en materia prima'
)

export interface NuevaVentaInput {
  fechaVenta: string
  clienteId: string
  producto: Producto
  pesoBruto: number
  precioUnitario: number
  impuestoPorcentaje: number
  metodoPago: MetodoPago
  montoEfectivo?: number
  montoTransferencia?: number
  montoRecibido: number
  numeroLote?: string
  observaciones?: string
}

// Registro interno de la jornada. 'fecha' permite detectar el cambio de día:
// una jornada 'activa' o 'finalizada' que quedó de un día anterior (por
// ejemplo, la app quedó abierta de un día para otro) no debe seguir
// vigente hoy; ver jornadaHoy más abajo.
export interface RegistroJornada {
  estado: EstadoJornada
  fecha: string // YYYY-MM-DD
  horaInicio: string | null // 'HH:MM'
  horaFin: string | null // 'HH:MM'
}

export type ResultadoIniciarJornada = { ok: true } | { ok: false; motivo: 'ya_finalizada_hoy' }

export interface AppDataContextValue {
  empleados: Empleado[]
  empleadosActivos: Empleado[]
  crearEmpleado: (data: EmpleadoFormData) => Empleado
  actualizarEmpleado: (id: number, data: EmpleadoFormData) => Empleado
  desactivarEmpleado: (id: number) => void
  // Control de jornada
  estadoJornada: EstadoJornada
  fechaJornadaActiva: string | null
  horaInicioJornada: string | null
  horaFinJornada: string | null
  iniciarJornada: () => ResultadoIniciarJornada
  finalizarJornada: () => void

  // Clientes
  clientes: Cliente[]
  clientesActivos: Cliente[]
  crearCliente: (data: ClienteFormData) => Cliente
  actualizarCliente: (id: string, data: ClienteFormData) => void
  desactivarCliente: (id: string) => void

  // Proveedores
  proveedores: Proveedor[]
  proveedoresActivos: Proveedor[]
  crearProveedor: (data: ProveedorFormData) => Proveedor
  actualizarProveedor: (id: string, data: ProveedorFormData) => void
  desactivarProveedor: (id: string) => void
  saldoPendienteProveedor: (proveedorId: string) => number

  // Stock
  stock: Record<Producto, number>
  costoUnitarioPromedio: Record<Producto, number>
  movimientosStock: MovimientoStock[]
  ultimoFactorUsado: number
  registrarConversionCacao: (input: ConversionCacaoInput) => void
  registrarDiferenciaConversion: (input: AjusteConversionInput) => void
  registrarAjusteStock: (input: AjusteStockInput) => void
  registrarMerma: (input: MermaInput) => void

  // Gastos
  gastos: Gasto[]
  crearGastoManual: (data: GastoFormData) => void
  actualizarGastoManual: (id: string, data: GastoFormData) => void
  eliminarGastoManual: (id: string) => void

  compras: Compra[]
  registrarCompra: (input: CompraInput) => Compra

  // Ventas y cuentas por cobrar
  ventas: Venta[]
  proximoNumeroFactura: number
  proximoNumeroComprobante: number
  registrarVenta: (input: NuevaVentaInput) => Venta

  // Cuentas
  cuentas: Cuenta[]
  movimientosCuenta: MovimientoCuenta[]
  registrarAbono: (input: AbonoInput) => {
    cerrada: boolean
    saldo: number
    movimiento: MovimientoCuenta | null
  }
  crearCuentaManual: (input: CuentaManualInput) => void
  anularCuenta: (id: string, motivo: string) => void
  saldoAFavorDeCliente: (clienteId: string) => number
}

function generarId(prefijo: string): string {
  return `${prefijo}_${crypto.randomUUID()}`
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}

// El usuario puede registrar una operación con una fecha de operación concreta.
// Conservamos esa fecha y añadimos hora exacta para poder agrupar por día,
// semana y mes sin perder el momento del registro. No sustituye a la fecha
// comercial/operativa; son dos datos complementarios.
function timestampParaFecha(fecha: string): string {
  const ahora = new Date()
  const hora = ahora.toTimeString().slice(0, 8)
  return `${fecha}T${hora}`
}

/**
 * @description Calcula el saldo vigente de una cuenta.
 * @param cuenta Cuenta a evaluar.
 * @returns Saldo en USD. Positivo = el cliente debe; negativo = tiene saldo
 * a favor; 0 = cuenta saldada.
 * @businessLogic El saldo se DERIVA siempre de (montoTotal - montoPagado) en
 * lugar de guardarse como columna propia. Si se almacenara, cualquier abono
 * mal aplicado dejaría el saldo y el historial de movimientos contándose
 * distinto, y no habría forma de saber cuál de los dos miente. Derivándolo,
 * el historial es la única fuente de verdad.
 * @dbMigration En PostgreSQL esto se resuelve con una columna generada o una
 * vista; NO crear una columna 'saldo' actualizable a mano.
 */
export function saldoDeCuenta(cuenta: Cuenta): number {
  if (cuenta.estado === 'anulado') return 0
  return redondear(cuenta.montoTotal - cuenta.montoPagado)
}

/**
 * @description Traduce el saldo numérico al tipo de saldo que se muestra en
 * la interfaz.
 * @param cuenta Cuenta a evaluar.
 * @returns 'deuda' | 'a_favor' | 'cerrado'.
 */
export function tipoSaldoDeCuenta(cuenta: Cuenta): TipoSaldoCuenta {
  const saldo = saldoDeCuenta(cuenta)
  if (saldo > 0) return 'deuda'
  if (saldo < 0) return 'a_favor'
  return 'cerrado'
}

/**
 * @description Determina el estado de una cuenta a partir de sus montos.
 * @param montoTotal Monto original adeudado.
 * @param montoPagado Suma acumulada de abonos y ajustes.
 * @returns 'pendiente' (nada pagado), 'parcial' (pagado algo pero aún debe)
 * o 'cerrado' (saldo 0 o a favor).
 * @businessLogic Un saldo a favor (negativo) también cuenta como 'cerrado':
 * el cliente ya no debe nada, y el excedente se refleja aparte mediante
 * tipoSaldoDeCuenta() para poder aplicarlo en una venta futura.
 */
export function calcularEstadoCuenta(montoTotal: number, montoPagado: number): EstadoCuenta {
  const saldo = redondear(montoTotal - montoPagado)
  if (saldo <= 0) return 'cerrado'
  if (montoPagado > 0) return 'parcial'
  return 'pendiente'
}

/**
 * @description Calcula el nuevo costo unitario promedio ponderado de un
 * producto cuando ingresa una cantidad nueva a un costo distinto.
 * @param stockPrevio Cantidad en stock (qq) antes del ingreso.
 * @param costoPrevio Costo unitario promedio (USD/qq) antes del ingreso.
 * @param cantidadIngreso Cantidad (qq) que ingresa.
 * @param costoIngreso Costo unitario (USD/qq) de la cantidad que ingresa.
 * @returns El nuevo costo unitario promedio (USD/qq).
 * @logic
 *   1. Si no había stock previo, el promedio nuevo es directamente el costo
 *      de ingreso (no hay nada con qué promediar).
 *   2. Si había stock previo, se promedia ponderando por cantidad:
 *      (valorTotalPrevio + valorTotalIngreso) / cantidadTotal.
 * @why Se usa costo promedio ponderado (en vez de FIFO/LIFO) porque el
 * cliente no distingue lotes de compra en la interfaz — es la aproximación
 * más simple que sigue siendo razonablemente precisa para valorar el stock
 * en el costo interno de inventario.
 */
function actualizarCostoPromedio(
  stockPrevio: number,
  costoPrevio: number,
  cantidadIngreso: number,
  costoIngreso: number
): number {
  if (cantidadIngreso <= 0) return costoPrevio
  if (stockPrevio <= 0) return redondear(costoIngreso)
  const valorTotal = stockPrevio * costoPrevio + cantidadIngreso * costoIngreso
  const cantidadTotal = stockPrevio + cantidadIngreso
  return redondear(valorTotal / cantidadTotal)
}

// Fecha comercial de "hoy" en formato YYYY-MM-DD, usada para saber si el
// registro de jornada guardado corresponde al día en curso.
function fechaHoy(): string {
  const ahora = new Date()
  return [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0')
  ].join('-')
}

// Hora local 'HH:MM' para mostrar en el módulo de Inicio (no se usa para
// cálculos, solo para que el usuario vea a qué hora abrió/cerró jornada).
function horaActual(): string {
  return new Date().toTimeString().slice(0, 5)
}

function memo<T>(fn: () => T, deps?: unknown[]): T {
  void deps
  return fn()
}
export function crearDominio(initial: Snapshot): {
  value: AppDataContextValue
  snapshot: () => Snapshot
} {
  let empleados: Snapshot['empleados'] = structuredClone(initial.empleados)
  const setEmpleados = (
    update: Snapshot['empleados'] | ((prev: Snapshot['empleados']) => Snapshot['empleados'])
  ): void => {
    empleados = typeof update === 'function' ? update(empleados) : update
  }
  // La referencia evita duplicar cédulas/consecutivos en dos altas del mismo ciclo.
  const empleadosActuales = { current: empleados }

  function guardarEmpleados(lista: Empleado[]): void {
    empleadosActuales.current = lista
    setEmpleados(lista)
  }

  function crearEmpleado(data: EmpleadoFormData): Empleado {
    const lista = empleadosActuales.current
    const datos = prepararEmpleado(data, lista)
    const empleado: Empleado = {
      ...datos,
      id: lista.reduce((maximo, e) => Math.max(maximo, e.id), 0) + 1,
      fechaRegistro: new Date().toISOString()
    }
    guardarEmpleados([...lista, empleado])
    return empleado
  }

  function actualizarEmpleado(id: number, data: EmpleadoFormData): Empleado {
    const lista = empleadosActuales.current
    const anterior = lista.find((e) => e.id === id)
    if (!anterior) throw new ErrorNegocio('No se encontró al empleado')
    const empleado = { ...anterior, ...prepararEmpleado(data, lista, id) }
    guardarEmpleados(lista.map((e) => (e.id === id ? empleado : e)))
    return empleado
  }

  function desactivarEmpleado(id: number): void {
    const lista = empleadosActuales.current
    if (!lista.some((e) => e.id === id)) throw new ErrorNegocio('No se encontró al empleado')
    guardarEmpleados(lista.map((e) => (e.id === id ? { ...e, estado: false } : e)))
  }

  let clientes: Snapshot['clientes'] = structuredClone(initial.clientes)
  const setClientes = (
    update: Snapshot['clientes'] | ((prev: Snapshot['clientes']) => Snapshot['clientes'])
  ): void => {
    clientes = typeof update === 'function' ? update(clientes) : update
  }
  let proveedores: Snapshot['proveedores'] = structuredClone(initial.proveedores)
  const setProveedores = (
    update: Snapshot['proveedores'] | ((prev: Snapshot['proveedores']) => Snapshot['proveedores'])
  ): void => {
    proveedores = typeof update === 'function' ? update(proveedores) : update
  }

  // ----- Control de jornada -----
  // Se guarda en memoria (useState) como el resto de los datos mock; cuando
  // exista persistencia real (PostgreSQL/AutoRecover), este registro pasa a
  // leerse/escribirse ahí para sobrevivir a un cierre inesperado de la app.
  let jornada: Snapshot['jornada'] = structuredClone(initial.jornada)
  const setJornada = (
    update: Snapshot['jornada'] | ((prev: Snapshot['jornada']) => Snapshot['jornada'])
  ): void => {
    jornada = typeof update === 'function' ? update(jornada) : update
  }

  /**
   * Una jornada activa no termina por cambiar la fecha del sistema.
   * Se mantiene vigente hasta que el usuario la finaliza explícitamente.
   * Si la última jornada ya estaba finalizada y pertenece a una fecha
   * anterior, el día actual queda disponible para iniciar una nueva.
   */
  const jornadaHoy = memo<RegistroJornada>(() => {
    if (jornada.estado === 'activa' || jornada.estado === 'interrumpida') return jornada
    if (jornada.fecha !== fechaHoy()) {
      return { estado: 'no_iniciada', fecha: fechaHoy(), horaInicio: null, horaFin: null }
    }
    return jornada
  }, [jornada])

  /**
   * @description Inicia la jornada laboral del día.
   * @returns { ok: true } si se inició; { ok: false, motivo: 'ya_finalizada_hoy' }
   * si la jornada de hoy ya se cerró (no se puede reabrir el mismo día).
   * @businessLogic El caso "ya hay una jornada activa" no requiere lógica
   * aparte acá: mientras estadoJornada sea 'activa', el módulo de Inicio no
   * muestra el botón "Iniciar Jornada" (muestra "Finalizar Jornada" en su
   * lugar), así que esta función no puede ser llamada dos veces sin pasar
   * primero por finalizarJornada().
   */
  function iniciarJornada(): ResultadoIniciarJornada {
    if (jornadaHoy.estado === 'finalizada') {
      return { ok: false, motivo: 'ya_finalizada_hoy' }
    }
    setJornada({ estado: 'activa', fecha: fechaHoy(), horaInicio: horaActual(), horaFin: null })
    return { ok: true }
  }

  /**
   * @description Cierra la jornada laboral del día. A partir de este punto
   * queda bloqueada la generación de nuevas ventas hasta el día siguiente.
   * @why La confirmación ("¿Está seguro de finalizar la jornada?") y la
   * validación de cambios sin guardar viven en la UI (módulo de Inicio),
   * no acá: esta función asume que ya se confirmó y solo aplica el cambio
   * de estado.
   */
  function finalizarJornada(): void {
    setJornada((prev) => ({ ...prev, estado: 'finalizada', horaFin: horaActual() }))
  }

  // ----- Stock -----
  let stock: Snapshot['stock'] = structuredClone(initial.stock)
  const setStock = (
    update: Snapshot['stock'] | ((prev: Snapshot['stock']) => Snapshot['stock'])
  ): void => {
    stock = typeof update === 'function' ? update(stock) : update
  }
  // Stock físico registrado. Las conversiones baba -> seco pasan
  // directamente al stock de Cacao Seco y cualquier variación posterior
  // se registra como sobrante o faltante sobre la conversión.
  let costoUnitarioPromedio: Snapshot['costoUnitarioPromedio'] = structuredClone(
    initial.costoUnitarioPromedio
  )
  const setCostoUnitarioPromedio = (
    update:
      | Snapshot['costoUnitarioPromedio']
      | ((prev: Snapshot['costoUnitarioPromedio']) => Snapshot['costoUnitarioPromedio'])
  ): void => {
    costoUnitarioPromedio = typeof update === 'function' ? update(costoUnitarioPromedio) : update
  }
  let movimientosStock: Snapshot['movimientosStock'] = structuredClone(initial.movimientosStock)
  const setMovimientosStock = (
    update:
      | Snapshot['movimientosStock']
      | ((prev: Snapshot['movimientosStock']) => Snapshot['movimientosStock'])
  ): void => {
    movimientosStock = typeof update === 'function' ? update(movimientosStock) : update
  }
  // Recuerda el último factor de conversión usado para pre-cargarlo la
  // próxima vez en el ComboBox de conversión baba -> seco.
  let ultimoFactorUsado: Snapshot['ultimoFactorUsado'] = structuredClone(initial.ultimoFactorUsado)
  const setUltimoFactorUsado = (
    update:
      | Snapshot['ultimoFactorUsado']
      | ((prev: Snapshot['ultimoFactorUsado']) => Snapshot['ultimoFactorUsado'])
  ): void => {
    ultimoFactorUsado = typeof update === 'function' ? update(ultimoFactorUsado) : update
  }

  // ----- Gastos -----
  let gastos: Snapshot['gastos'] = structuredClone(initial.gastos)
  const setGastos = (
    update: Snapshot['gastos'] | ((prev: Snapshot['gastos']) => Snapshot['gastos'])
  ): void => {
    gastos = typeof update === 'function' ? update(gastos) : update
  }

  // ----- Ventas y cuentas por cobrar -----
  let compras: Snapshot['compras'] = structuredClone(initial.compras)
  const setCompras = (
    update: Snapshot['compras'] | ((prev: Snapshot['compras']) => Snapshot['compras'])
  ): void => {
    compras = typeof update === 'function' ? update(compras) : update
  }
  let ventas: Snapshot['ventas'] = structuredClone(initial.ventas)
  const setVentas = (
    update: Snapshot['ventas'] | ((prev: Snapshot['ventas']) => Snapshot['ventas'])
  ): void => {
    ventas = typeof update === 'function' ? update(ventas) : update
  }
  let cuentas: Snapshot['cuentas'] = structuredClone(initial.cuentas)
  const setCuentas = (
    update: Snapshot['cuentas'] | ((prev: Snapshot['cuentas']) => Snapshot['cuentas'])
  ): void => {
    cuentas = typeof update === 'function' ? update(cuentas) : update
  }
  let movimientosCuenta: Snapshot['movimientosCuenta'] = structuredClone(initial.movimientosCuenta)
  const setMovimientosCuenta = (
    update:
      | Snapshot['movimientosCuenta']
      | ((prev: Snapshot['movimientosCuenta']) => Snapshot['movimientosCuenta'])
  ): void => {
    movimientosCuenta = typeof update === 'function' ? update(movimientosCuenta) : update
  }

  // ============================================================
  // Clientes (sin cambios respecto a la versión anterior)
  // ============================================================

  function crearCliente(data: ClienteFormData): Cliente {
    const nuevo: Cliente = {
      id: generarId('cli'),
      fechaRegistro: new Date().toISOString(),
      estado: true,
      ...data
    }
    setClientes((prev) => [nuevo, ...prev])
    return nuevo
  }

  function actualizarCliente(id: string, data: ClienteFormData): void {
    setClientes((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)))
  }

  function desactivarCliente(id: string): void {
    // Eliminación lógica (soft delete).
    // TODO: una vez que Ventas/Cuentas estén completas, bloquear esta acción
    // si el cliente tiene ventas o cuentas pendientes asociadas.
    setClientes((prev) => prev.map((c) => (c.id === id ? { ...c, estado: false } : c)))
  }

  // ============================================================
  // Proveedores
  // ============================================================

  function crearProveedor(data: ProveedorFormData): Proveedor {
    const nuevo: Proveedor = {
      id: generarId('prov'),
      fechaRegistro: new Date().toISOString(),
      ...data,
      estado: data.estado ?? true
    }
    setProveedores((prev) => [nuevo, ...prev])
    return nuevo
  }

  function actualizarProveedor(id: string, data: ProveedorFormData): void {
    setProveedores((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)))
  }

  function desactivarProveedor(id: string): void {
    setProveedores((prev) => prev.map((p) => (p.id === id ? { ...p, estado: false } : p)))
  }

  function saldoPendienteProveedor(proveedorId: string): number {
    return redondear(
      cuentas
        .filter(
          (c) => c.categoria === 'compra' && c.proveedorId === proveedorId && c.estado !== 'anulado'
        )
        .reduce((total, c) => total + Math.max(0, saldoDeCuenta(c)), 0)
    )
  }

  // ============================================================
  // Gastos — funciones internas de integración con Stock
  // ============================================================

  /**
   * @description Crea el objeto Gasto automático que corresponde a un
   * movimiento de compra de Stock (Cacao en Baba o Maracuyá) y lo agrega
   * al array global de gastos.
   * @param params Datos mínimos necesarios para armar el gasto.
   * @param params.movimientoId Id del MovimientoStock que origina el gasto (para trazabilidad).
   * @param params.producto Producto comprado.
   * @param params.cantidadQq Cantidad comprada, para el concepto legible.
   * @param params.precioQq Precio unitario pagado, para el concepto legible.
   * @param params.montoTotal Monto total del gasto (costo_total de la compra).
   * @param params.fecha Misma fecha del movimiento de Stock.
   * @returns El Gasto recién creado (para poder enlazarlo de vuelta al movimiento).
   * @logic
   *   1. Arma el concepto automático: "Compra de X qq de [producto] a $Y/qq".
   *   2. Crea el gasto con categoria='Inversión en materia prima', tipo='automatico'.
   *   3. Lo agrega al array global de gastos.
   * @why Se centraliza aquí (en vez de duplicar en cada formulario de Stock)
   * para que las reglas de "qué es un gasto automático" vivan en un solo
   * lugar, igual que pide el JSON de requerimientos
   * (generarInversionDesdeCompra).
   */
  function generarInversionDesdeCompra(params: {
    movimientoId: string
    compraId: string
    producto: Producto
    cantidadQq: number
    precioQq: number
    montoTotal: number
    fecha: string
    proveedorId?: string
    proveedorNombre?: string
    estadoPago?: 'completo' | 'abono' | 'pendiente'
    montoAbono?: number
    saldoPendiente?: number
  }): Gasto {
    const gasto: Gasto = {
      id: generarId('gasto'),
      fecha: params.fecha,
      fechaHoraRegistro: timestampParaFecha(params.fecha),
      categoria: 'Inversión en materia prima',
      concepto: `Compra de ${params.cantidadQq} qq de ${params.producto} a $${params.precioQq.toFixed(2)}/qq`,
      monto: redondear(params.montoTotal),
      observacion: `Compra registrada en Compra/Venta. Movimiento ${params.movimientoId}.`,
      tipo: 'automatico',
      referenciaStockId: params.movimientoId,
      compra_id: params.compraId,
      proveedor_id: params.proveedorId,
      proveedor_nombre: params.proveedorNombre,
      estado_pago_proveedor: params.estadoPago,
      monto_abono: params.montoAbono,
      saldo_pendiente_proveedor: params.saldoPendiente
    }
    setGastos((prev) => [gasto, ...prev])
    return gasto
  }

  function crearGastoManual(data: GastoFormData): void {
    if (jornadaHoy.estado !== 'activa') {
      throw new ErrorNegocio('Debe iniciar una jornada para registrar gastos operativos.')
    }

    const fechaOperativa = jornadaHoy.fecha
    const datos = prepararGastoEmpleado(
      { ...data, fecha: fechaOperativa },
      empleadosActuales.current
    )
    const nuevo: Gasto = {
      id: generarId('gasto'),
      tipo: 'manual',
      referenciaStockId: null,
      fechaHoraRegistro: new Date().toISOString(),
      ...datos,
      fecha: fechaOperativa,
      monto: redondear(datos.monto)
    }
    setGastos((prev) => [nuevo, ...prev])
  }

  function actualizarGastoManual(id: string, data: GastoFormData): void {
    const anterior = gastos.find((g) => g.id === id && g.tipo === 'manual')
    if (!anterior) return
    const datos = prepararGastoEmpleado(
      { ...data, fecha: anterior.fecha },
      empleadosActuales.current,
      anterior
    )
    // Las inversiones automáticas conservan el vínculo a la compra original.
    setGastos((prev) =>
      prev.map((g) =>
        g.id === id && g.tipo === 'manual' ? { ...g, ...datos, monto: redondear(datos.monto) } : g
      )
    )
  }

  function eliminarGastoManual(id: string): void {
    setGastos((prev) => prev.filter((g) => !(g.id === id && g.tipo === 'manual')))
  }

  // ============================================================
  // Stock — entradas
  // ============================================================

  // La compra se registra una sola vez: inversión, inventario y cuenta por pagar.
  function registrarCompra(input: CompraInput): Compra {
    if (jornadaHoy.estado !== 'activa')
      throw new ErrorNegocio('Inicia o reabre una jornada antes de registrar una compra.')
    const proveedor = proveedores.find((p) => p.id === input.proveedorId && p.estado)
    if (!proveedor) throw new ErrorNegocio('Selecciona un proveedor activo.')
    const { subtotal, montoImpuesto } = validarCompra(input)
    const total = redondear(subtotal - montoImpuesto)
    const pagado = redondear(input.montoPagado)
    const pendiente = redondear(total - pagado)
    const fechaHoraRegistro = timestampParaFecha(input.fecha)
    // El consecutivo de compra se reinicia por fecha comercial: 1, 2, 3...
    // Cada jornada/día mantiene su propia numeración.
    const numeroCompra =
      compras
        .filter((c) => c.fecha === input.fecha)
        .reduce((maximo, c) => Math.max(maximo, c.numeroCompra), 0) + 1
    const compra: Compra = {
      estado: 'vigente',
      ...input,
      id: generarId('compra'),
      numeroCompra,
      proveedorNombre: proveedor.nombre,
      fechaHoraRegistro,
      subtotal,
      montoImpuesto,
      totalCompra: total,
      montoPagadoInicial: pagado,
      comprobante: input.comprobante?.trim() || undefined,
      observacion: input.observacion?.trim() || undefined
    }
    const cuenta: Cuenta = {
      id: generarId('cta'),
      origen: 'compra',
      categoria: 'compra',
      compraId: compra.id,
      numeroCompra: compra.numeroCompra,
      proveedorId: proveedor.id,
      proveedorNombre: proveedor.nombre,
      clienteId: '',
      ventaId: null,
      numeroFactura: null,
      montoTotal: total,
      montoPagado: pagado,
      estado: calcularEstadoCuenta(total, pagado),
      fecha: input.fecha,
      fechaHoraRegistro,
      fechaUltimoMovimiento: fechaHoraRegistro,
      observacion: compra.observacion,
      comprobante: compra.comprobante
    }
    const movimientoId = generarId('mov')
    const nuevoStock = redondear(stock[input.producto] + input.cantidadQq)
    const gasto = generarInversionDesdeCompra({
      movimientoId,
      compraId: compra.id,
      producto: input.producto,
      cantidadQq: input.cantidadQq,
      precioQq: input.precioCompraQq,
      montoTotal: total,
      fecha: input.fecha,
      proveedorId: proveedor.id,
      proveedorNombre: proveedor.nombre,
      estadoPago: pendiente === 0 ? 'completo' : pagado > 0 ? 'abono' : 'pendiente',
      montoAbono: pagado,
      saldoPendiente: pendiente
    })
    const movimiento: MovimientoStock = {
      id: movimientoId,
      compraId: compra.id,
      fecha: input.fecha,
      fechaHoraRegistro,
      tipo: input.producto === 'Cacao Seco' ? 'Entrada - Compra Seco' : 'Entrada - Compra',
      producto: input.producto,
      entradaQq: input.cantidadQq,
      salidaQq: 0,
      stockResultante: nuevoStock,
      proveedorId: proveedor.id,
      proveedorNombre: proveedor.nombre,
      detalle: 'Compra N.º ' + compra.numeroCompra + ' del día · ' + proveedor.nombre,
      observacion: compra.observacion,
      gastoGeneradoId: gasto.id
    }
    setCompras((prev) => [compra, ...prev])
    setCuentas((prev) => [cuenta, ...prev])
    setStock((prev) => ({ ...prev, [input.producto]: nuevoStock }))
    setCostoUnitarioPromedio((prev) => ({
      ...prev,
      [input.producto]: actualizarCostoPromedio(
        stock[input.producto],
        prev[input.producto],
        input.cantidadQq,
        total / input.cantidadQq
      )
    }))
    setMovimientosStock((prev) => [movimiento, ...prev])
    if (pagado > 0) {
      const pago: MovimientoCuenta = {
        id: generarId('pago'),
        cuentaId: cuenta.id,
        categoria: 'compra',
        clienteId: '',
        proveedorId: proveedor.id,
        fecha: input.fecha,
        fechaHoraRegistro,
        tipo: 'Abono',
        monto: pagado,
        metodoPago: input.metodoPago,
        montoEfectivo: input.montoEfectivo,
        montoTransferencia: input.montoTransferencia,
        observacion: 'Pago inicial de compra N.º ' + compra.numeroCompra + ' del día',
        comprobante: compra.comprobante
      }
      setMovimientosCuenta((prev) => [pago, ...prev])
    }
    return compra
  }

  function registrarConversionCacao(input: ConversionCacaoInput): void {
    const resultado = calcularConversion(
      stock['Cacao en Baba'],
      stock['Cacao Seco'],
      input.cacaoBabaUtilizadoQq,
      input.factorConversion
    )
    const secoConvertido = resultado.producido
    const nuevoStockBaba = resultado.baba
    const nuevoStockSeco = resultado.seco

    setStock((prev) => ({
      ...prev,
      'Cacao en Baba': nuevoStockBaba,
      'Cacao Seco': nuevoStockSeco
    }))
    setCostoUnitarioPromedio((prev) => {
      const costoBabaConsumida = input.cacaoBabaUtilizadoQq * prev['Cacao en Baba']
      const costoSecoConvertidoQq = secoConvertido > 0 ? costoBabaConsumida / secoConvertido : 0
      return {
        ...prev,
        'Cacao Seco': actualizarCostoPromedio(
          stock['Cacao Seco'],
          prev['Cacao Seco'],
          secoConvertido,
          costoSecoConvertidoQq
        )
      }
    })
    setUltimoFactorUsado(input.factorConversion)

    const movimiento: MovimientoStock = {
      id: generarId('mov'),
      fecha: input.fecha,
      fechaHoraRegistro: timestampParaFecha(input.fecha),
      tipo: 'Conversión',
      producto: 'Cacao Seco',
      entradaQq: secoConvertido,
      salidaQq: input.cacaoBabaUtilizadoQq,
      stockResultante: nuevoStockSeco,
      detalle: `Conversión de ${input.cacaoBabaUtilizadoQq} qq de baba · Factor ${input.factorConversion} · Resultado ${secoConvertido} qq de seco`,
      factorConversion: input.factorConversion,
      cantidadObtenidaQq: null,
      diferenciaQq: null,
      observacion: input.observacion?.trim() || undefined
    }
    setMovimientosStock((prev) => [movimiento, ...prev])
  }

  function registrarDiferenciaConversion(input: AjusteConversionInput): void {
    const movimiento = movimientosStock.find(
      (m) => m.id === input.movimientoId && m.tipo === 'Conversión'
    )
    if (!movimiento) throw new ErrorNegocio('No se encontró la conversión seleccionada.')
    if (movimiento.diferenciaQq !== null && movimiento.diferenciaQq !== undefined) {
      throw new ErrorNegocio('Esta conversión ya tiene una cantidad obtenida registrada.')
    }
    if (!Number.isFinite(input.cantidadObtenidaQq) || input.cantidadObtenidaQq <= 0) {
      throw new ErrorNegocio('La cantidad obtenida debe ser mayor a 0.')
    }

    // La cantidad obtenida es el peso físico medido después del secado.
    // Se compara contra el valor calculado por el factor para obtener la diferencia:
    // positiva = a favor, negativa = en contra. Este registro NO modifica el stock,
    // que conserva el valor calculado al momento de la conversión.
    const cantidadObtenida = redondear(input.cantidadObtenidaQq)
    const diferencia = redondear(cantidadObtenida - movimiento.entradaQq)

    setMovimientosStock((prev) =>
      prev.map((m) =>
        m.id === input.movimientoId
          ? {
              ...m,
              cantidadObtenidaQq: cantidadObtenida,
              diferenciaQq: diferencia,
              observacion: input.motivo?.trim() || m.observacion
            }
          : m
      )
    )
  }

  function registrarAjusteStock(input: AjusteStockInput): void {
    if (jornadaHoy.estado !== 'activa')
      throw new ErrorNegocio('Inicia o reabre una jornada antes de ajustar el stock.')
    if (input.fecha !== jornadaHoy.fecha)
      throw new ErrorNegocio('El ajuste de stock debe registrarse en la jornada activa.')

    const motivo = typeof input.motivo === 'string' ? input.motivo.trim() : ''
    if (!motivo) throw new ErrorNegocio('Indica por qué se realiza el ajuste de inventario.')
    if (motivo.length > 500)
      throw new ErrorNegocio('La observación del ajuste no puede superar 500 caracteres.')
    if (
      !Number.isFinite(input.cantidadQq) ||
      input.cantidadQq === 0 ||
      stock[input.producto] + input.cantidadQq < 0
    )
      throw new ErrorNegocio('El ajuste debe ser distinto de cero y no puede dejar stock negativo.')

    const nuevoStock = redondear(stock[input.producto] + input.cantidadQq)
    setStock((prev) => ({ ...prev, [input.producto]: nuevoStock }))

    const movimiento: MovimientoStock = {
      id: generarId('mov'),
      fecha: input.fecha,
      fechaHoraRegistro: timestampParaFecha(input.fecha),
      tipo: input.cantidadQq > 0 ? 'Entrada - Ajuste' : 'Salida - Ajuste',
      producto: input.producto,
      entradaQq: input.cantidadQq > 0 ? input.cantidadQq : 0,
      salidaQq: input.cantidadQq < 0 ? Math.abs(input.cantidadQq) : 0,
      stockResultante: nuevoStock,
      detalle: `Ajuste manual de inventario · Motivo: ${motivo}`,
      observacion: motivo
    }
    setMovimientosStock((prev) => [movimiento, ...prev])
  }

  // ============================================================
  // Stock — salidas
  // ============================================================

  /**
   * Flujo heredado de procesamiento directo. Registra una salida de baba y
   * una entrada de seco sin generar un gasto nuevo; el gasto corresponde a
   * la compra original de la materia prima.
   */

  function registrarMerma(input: MermaInput): void {
    const nuevoStock = redondear(stock[input.producto] - input.cantidadQq)

    setStock((prev) => ({ ...prev, [input.producto]: nuevoStock }))

    const movimiento: MovimientoStock = {
      id: generarId('mov'),
      fecha: input.fecha,
      fechaHoraRegistro: timestampParaFecha(input.fecha),
      tipo: 'Salida - Merma',
      producto: input.producto,
      entradaQq: 0,
      salidaQq: input.cantidadQq,
      stockResultante: nuevoStock,
      detalle: `Motivo: ${input.motivo}`
    }
    setMovimientosStock((prev) => [movimiento, ...prev])
  }

  // ============================================================
  // Ventas y cuentas por cobrar
  // ============================================================

  /**
   * @description Registra una venta y genera sus integraciones de Stock y Cuentas.
   * @param input Datos comerciales, producto y forma de pago.
   * @returns Venta creada con su número de factura diario.
   * @businessLogic El número de factura se reinicia por fecha comercial y se
   * asigna como máximo existente de ese día + 1; la venta sigue siendo la fuente
   * que origina el movimiento de Stock y la cuenta asociada.
   * @dbMigration La asignación del consecutivo y las tres escrituras deberán
   * ejecutarse dentro de una transacción PostgreSQL.
   */
  function registrarVenta(input: NuevaVentaInput): Venta {
    // Defensa adicional: la UI de Ventas ya deshabilita "Nueva venta" (y no
    // debería llegar a llamar esta función) cuando la jornada no está
    // activa, pero se valida también acá para que el registro de una venta
    // nunca dependa únicamente de que un botón haya quedado deshabilitado.
    if (jornadaHoy.estado !== 'activa') {
      throw new ErrorNegocio(
        jornadaHoy.estado === 'finalizada'
          ? 'La jornada ya fue finalizada. Inicie una nueva jornada para registrar ventas.'
          : 'Debe iniciar la jornada para registrar ventas.'
      )
    }

    if (!clientes.some((c) => c.id === input.clienteId && c.estado))
      throw new ErrorNegocio('Selecciona un cliente activo.')
    if (
      !Number.isFinite(input.pesoBruto) ||
      input.pesoBruto <= 0 ||
      !Number.isFinite(input.precioUnitario) ||
      input.precioUnitario <= 0
    )
      throw new ErrorNegocio('Cantidad y precio deben ser mayores a cero.')
    if (
      !Number.isFinite(input.impuestoPorcentaje) ||
      input.impuestoPorcentaje < 0 ||
      input.impuestoPorcentaje > 3
    )
      throw new ErrorNegocio('El impuesto debe estar entre 0% y 3%.')
    if (!PRODUCTOS.includes(input.producto) || input.pesoBruto > stock[input.producto])
      throw new ErrorNegocio('No hay stock suficiente para esta venta.')
    const { subtotal, montoImpuesto } = calcularImportes(
      input.pesoBruto,
      input.precioUnitario,
      input.impuestoPorcentaje
    )
    const totalVenta = redondear(subtotal - montoImpuesto)
    validarPago(
      totalVenta,
      input.montoRecibido,
      input.metodoPago,
      input.montoEfectivo,
      input.montoTransferencia
    )
    const saldoPendiente = Math.max(0, redondear(totalVenta - input.montoRecibido))
    const estadoCobro: EstadoCobro =
      saldoPendiente <= 0 ? 'Pagado' : input.montoRecibido > 0 ? 'Parcial' : 'Pendiente'

    // El consecutivo de factura se reinicia por día: 1, 2, 3... dentro de
    // cada fecha comercial. Esto evita arrastrar la numeración de días anteriores.
    const numeroFactura =
      ventas
        .filter((v) => v.fechaVenta === input.fechaVenta)
        .reduce((maximo, v) => Math.max(maximo, v.numeroFactura), 0) + 1

    // El comprobante oficial usa un consecutivo global que no se reinicia al cambiar de día.
    const numeroComprobante =
      Math.max(
        ventas.reduce((maximo, v) => Math.max(maximo, v.numeroComprobante ?? 0), 0),
        movimientosCuenta.reduce(
          (maximo, m) => Math.max(maximo, Number(m.numeroComprobante ?? 0)),
          0
        )
      ) + 1

    const venta: Venta = {
      estado: 'vigente',
      ...input,
      id: generarId('venta'),
      fechaHoraRegistro: timestampParaFecha(input.fechaVenta),
      numeroFactura,
      numeroComprobante,
      subtotal,
      montoImpuesto,
      totalVenta,
      saldoPendiente,
      estadoCobro
    }

    setVentas((prev) => [venta, ...prev])

    // El stock se descuenta al confirmar la venta, no antes.
    const nuevoStockProducto = redondear(stock[input.producto] - input.pesoBruto)
    setStock((prev) => ({
      ...prev,
      [input.producto]: nuevoStockProducto
    }))

    // Nota (nota_ventas en requerimientos): las salidas por venta NO tienen
    // un formulario manual en Stock (ya se descuentan aquí), pero sí quedan
    // registradas en el historial de movimientos para que la trazabilidad
    // de Stock quede completa (compras, ajustes, mermas y ventas en un solo
    // lugar cronológico).
    const movimientoVenta: MovimientoStock = {
      id: generarId('mov'),
      fecha: venta.fechaVenta,
      fechaHoraRegistro: timestampParaFecha(venta.fechaVenta),
      tipo: 'Salida - Venta',
      producto: input.producto,
      entradaQq: 0,
      salidaQq: input.pesoBruto,
      stockResultante: nuevoStockProducto,
      detalle: `Venta N.º ${numeroFactura} del día`,
      ventaId: venta.id
    }
    setMovimientosStock((prev) => [movimientoVenta, ...prev])

    // INTEGRACIÓN VENTAS -> CUENTAS
    // Se crea SIEMPRE una cuenta, incluso cuando la venta se pagó completa.
    // En ese caso nace ya 'cerrada' con saldo 0: no aparece entre las
    // cuentas abiertas, pero conserva el historial de que esa factura
    // existió y se cobró. Si sólo creáramos cuentas con saldo pendiente, el
    // detalle por cliente ("total histórico comprado / total pagado")
    // quedaría incompleto.
    const timestampCuenta = timestampParaFecha(venta.fechaVenta)
    const cuenta: Cuenta = {
      id: generarId('cta'),
      origen: 'venta',
      categoria: 'venta',
      ventaId: venta.id,
      numeroFactura,
      clienteId: venta.clienteId,
      // El monto total de la cuenta es el total de la VENTA (no sólo el
      // saldo), y el pago inicial entra como montoPagado. Así el saldo
      // derivado coincide con el pendiente real y el detalle del cliente
      // puede mostrar cuánto compró y cuánto lleva pagado.
      montoTotal: totalVenta,
      montoPagado: redondear(Math.min(input.montoRecibido, totalVenta)),
      fecha: venta.fechaVenta,
      fechaHoraRegistro: timestampCuenta,
      fechaUltimoMovimiento: timestampCuenta,
      estado: calcularEstadoCuenta(totalVenta, input.montoRecibido),
      observacion: `Generada automáticamente por la venta (N.º ${numeroFactura} del día)`,
      comprobante: String(numeroComprobante).padStart(6, '0')
    }
    setCuentas((prev) => [cuenta, ...prev])

    // El pago hecho en el mostrador queda como primer movimiento del
    // historial de abonos, para que la suma de movimientos siempre
    // reconstruya el montoPagado de la cuenta.
    if (input.montoRecibido > 0) {
      const pagoInicial: MovimientoCuenta = {
        id: generarId('abono'),
        cuentaId: cuenta.id,
        categoria: 'venta',
        clienteId: venta.clienteId,
        fecha: venta.fechaVenta,
        fechaHoraRegistro: timestampCuenta,
        tipo: 'Abono',
        monto: cuenta.montoPagado,
        metodoPago: input.metodoPago,
        montoEfectivo: input.montoEfectivo,
        montoTransferencia: input.montoTransferencia,
        observacion: 'Pago inicial registrado en la venta',
        comprobante: String(numeroComprobante).padStart(6, '0')
      }
      setMovimientosCuenta((prev) => [pagoInicial, ...prev])
    }

    return venta
  }

  // ============================================================
  // Cuentas (abonos, ajustes y cierre)
  // ============================================================

  /**
   * @description Registra un abono o ajuste sobre una cuenta y recalcula su
   * estado.
   * @param input Monto, método de pago, tipo de movimiento, observación y
   * comprobante opcional.
   * @returns { cerrada, saldo } para que la interfaz pueda avisar al usuario
   * cuando la cuenta acaba de quedar saldada.
   * @businessLogic
   *   1. Suma el monto al montoPagado acumulado de la cuenta.
   *   2. Recalcula el estado con calcularEstadoCuenta() — no se toca un
   *      campo 'saldo', porque el saldo se deriva (ver saldoDeCuenta).
   *   3. Deja constancia del movimiento en movimientosCuenta con timestamp.
   *   4. Actualiza fechaUltimoMovimiento.
   * Los tres tipos de movimiento ('Abono', 'Ajuste a favor', 'Ajuste por
   * devolución') suman al montoPagado: los tres reducen lo que el cliente
   * debe. Se conservan como tipos distintos únicamente para que el historial
   * explique POR QUÉ bajó la deuda, que es lo que el cliente necesita
   * auditar después.
   * @why No se permite abonar sobre cuentas anuladas ni inexistentes: son
   * registros muertos que sólo se conservan para el historial.
   * @dbMigration Esta función pasa a ser una transacción: INSERT en
   * movimientos_cuenta + UPDATE del acumulado de la cuenta. Ambas cosas
   * deben ocurrir juntas o ninguna.
   */
  function registrarAbono(input: AbonoInput): {
    cerrada: boolean
    saldo: number
    movimiento: MovimientoCuenta | null
  } {
    const cuenta = cuentas.find((c) => c.id === input.cuentaId)
    if (!cuenta || cuenta.estado === 'anulado')
      throw new ErrorNegocio('Esta cuenta no admite pagos.')

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.fecha) ||
      input.fecha < cuenta.fecha ||
      input.fecha > fechaHoy()
    )
      throw new ErrorNegocio('La fecha del pago debe estar entre la fecha de la operación y hoy.')
    if (cuenta.categoria === 'compra' && input.tipo !== 'Abono')
      throw new ErrorNegocio('Las compras admiten pagos a proveedores.')
    if (!Number.isFinite(input.monto) || redondear(input.monto) <= 0)
      throw new ErrorNegocio('El abono debe ser mayor a cero.')
    validarPago(
      cuenta.categoria === 'compra'
        ? Math.max(0, saldoDeCuenta(cuenta))
        : Math.max(input.monto, saldoDeCuenta(cuenta)),
      input.monto,
      input.metodoPago,
      input.montoEfectivo,
      input.montoTransferencia
    )
    const nuevoMontoPagado = redondear(cuenta.montoPagado + input.monto)
    const nuevoEstado = calcularEstadoCuenta(cuenta.montoTotal, nuevoMontoPagado)
    const nuevoSaldo = redondear(cuenta.montoTotal - nuevoMontoPagado)
    const timestamp = timestampParaFecha(input.fecha)

    setCuentas((prev) =>
      prev.map((c) =>
        c.id === cuenta.id
          ? {
              ...c,
              montoPagado: nuevoMontoPagado,
              estado: nuevoEstado,
              fechaUltimoMovimiento: timestamp
            }
          : c
      )
    )

    const numeroComprobante = input.generarComprobante
      ? String(
          Math.max(
            ventas.reduce((maximo, v) => Math.max(maximo, v.numeroComprobante ?? 0), 0),
            movimientosCuenta
              .map((m) => Number(m.numeroComprobante ?? '0'))
              .filter((n) => Number.isFinite(n))
              .reduce((maximo, n) => Math.max(maximo, n), 0)
          ) + 1
        ).padStart(6, '0')
      : undefined

    const movimiento: MovimientoCuenta = {
      id: generarId('abono'),
      cuentaId: cuenta.id,
      categoria: cuenta.categoria,
      proveedorId: cuenta.proveedorId,
      clienteId: cuenta.clienteId,
      fecha: input.fecha,
      fechaHoraRegistro: timestamp,
      tipo: input.tipo,
      monto: redondear(input.monto),
      metodoPago: input.metodoPago,
      montoEfectivo: input.montoEfectivo,
      montoTransferencia: input.montoTransferencia,
      observacion: input.observacion,
      numeroComprobante,
      comprobante: input.comprobante
    }
    setMovimientosCuenta((prev) => [movimiento, ...prev])

    if (cuenta.compraId) {
      setGastos((prev) =>
        prev.map((g) =>
          g.compra_id === cuenta.compraId
            ? {
                ...g,
                monto_abono: nuevoMontoPagado,
                saldo_pendiente_proveedor: Math.max(0, nuevoSaldo),
                estado_pago_proveedor: nuevoSaldo <= 0 ? 'completo' : 'abono'
              }
            : g
        )
      )
    }
    // La venta confirmada conserva los valores originales. El saldo actual vive en su cuenta.

    // 'cerrada' se reporta sólo en la transición: la cuenta no estaba
    // cerrada antes y ahora sí, que es cuando tiene sentido avisar.
    return {
      cerrada: cuenta.estado !== 'cerrado' && nuevoEstado === 'cerrado',
      saldo: nuevoSaldo,
      movimiento
    }
  }

  /**
   * @description Crea una cuenta manual, para los casos que NO nacen de una
   * venta (por ejemplo, una devolución en efectivo que quedó a favor del
   * cliente, o una deuda antigua que se está migrando al sistema).
   * @param input Cliente, tipo ('Saldo a favor' | 'Deuda manual'), monto y
   * observación obligatoria.
   * @businessLogic Un "Saldo a favor" se modela como una cuenta con
   * montoTotal = 0 y montoPagado = monto. Así el saldo derivado sale
   * negativo sin necesidad de un campo especial ni de lógica aparte: la
   * misma fórmula (montoTotal - montoPagado) sirve para deudas y para
   * saldos a favor.
   * @why La observación es obligatoria aquí (a diferencia de las cuentas
   * automáticas) porque una cuenta manual no tiene una factura que la
   * explique: sin contexto escrito, en dos meses nadie sabría de dónde salió.
   */
  function crearCuentaManual(input: CuentaManualInput): void {
    const esSaldoAFavor = input.tipo === 'Saldo a favor'
    const monto = redondear(input.monto)
    const timestamp = timestampParaFecha(input.fecha)

    const montoTotal = esSaldoAFavor ? 0 : monto
    const montoPagado = esSaldoAFavor ? monto : 0

    const cuenta: Cuenta = {
      id: generarId('cta'),
      origen: 'manual',
      categoria: 'venta',
      ventaId: null,
      numeroFactura: null,
      clienteId: input.clienteId,
      montoTotal,
      montoPagado,
      fecha: input.fecha,
      fechaHoraRegistro: timestamp,
      fechaUltimoMovimiento: timestamp,
      estado: calcularEstadoCuenta(montoTotal, montoPagado),
      observacion: input.observacion,
      comprobante: input.comprobante
    }
    setCuentas((prev) => [cuenta, ...prev])
  }

  /**
   * @description Anula una cuenta creada manualmente por error.
   * @param id Id de la cuenta a anular.
   * @param motivo Justificación obligatoria de la anulación.
   * @businessLogic NO borra el registro: lo marca como 'anulado' y guarda el
   * motivo. Las cuentas comerciales se anulan exclusivamente a través del
   * flujo de anulación de compra/venta, que también compensa inventario y caja.
   */
  function anularCuenta(id: string, motivo: string): void {
    setCuentas((prev) =>
      prev.map((c) =>
        c.id === id && c.origen === 'manual'
          ? { ...c, estado: 'anulado', motivoAnulacion: motivo }
          : c
      )
    )
  }

  /**
   * @description Suma todo el saldo a favor vigente de un cliente.
   * @param clienteId Cliente a consultar.
   * @returns Monto positivo disponible a favor (0 si no tiene).
   * @businessLogic Recorre las cuentas no anuladas del cliente y acumula
   * únicamente los saldos negativos, devolviéndolos en positivo. Lo consume
   * el formulario de Ventas para avisar "este cliente tiene $X a favor,
   * ¿desea aplicarlo?".
   */
  function saldoAFavorDeCliente(clienteId: string): number {
    const total = cuentas
      .filter(
        (c) => c.categoria !== 'compra' && c.clienteId === clienteId && c.estado !== 'anulado'
      )
      .reduce((acumulado, c) => {
        const saldo = saldoDeCuenta(c)
        return saldo < 0 ? acumulado + Math.abs(saldo) : acumulado
      }, 0)
    return redondear(total)
  }

  const clientesActivos = memo(() => clientes.filter((c) => c.estado), [clientes])
  const proveedoresActivos = memo(() => proveedores.filter((p) => p.estado), [proveedores])

  /**
   * @description Obtiene el siguiente número de factura para el día actual.
   * @returns Consecutivo diario listo para la vista previa de Ventas.
   * @businessLogic No reutiliza el contador global; sólo considera ventas de hoy.
   * @dbMigration En PostgreSQL deberá consultarse el consecutivo por fecha.
   */
  const proximoNumeroFactura = memo(() => {
    const fechaConsecutivo = jornadaHoy.estado === 'activa' ? jornadaHoy.fecha : fechaHoy()
    return (
      ventas
        .filter((v) => v.fechaVenta === fechaConsecutivo)
        .reduce((maximo, v) => Math.max(maximo, v.numeroFactura), 0) + 1
    )
  }, [ventas, jornadaHoy])

  const proximoNumeroComprobante = memo(
    () =>
      Math.max(
        ventas.reduce((maximo, v) => Math.max(maximo, v.numeroComprobante ?? 0), 0),
        movimientosCuenta.reduce(
          (maximo, m) => Math.max(maximo, Number(m.numeroComprobante ?? 0)),
          0
        )
      ) + 1,
    [ventas, movimientosCuenta]
  )

  const value: AppDataContextValue = {
    empleados,
    empleadosActivos: empleados.filter((e) => e.estado),
    crearEmpleado,
    actualizarEmpleado,
    desactivarEmpleado,
    estadoJornada: jornadaHoy.estado,
    fechaJornadaActiva: ['activa', 'interrumpida'].includes(jornadaHoy.estado)
      ? jornadaHoy.fecha
      : null,
    horaInicioJornada: jornadaHoy.horaInicio,
    horaFinJornada: jornadaHoy.horaFin,
    iniciarJornada,
    finalizarJornada,

    clientes,
    clientesActivos,
    crearCliente,
    actualizarCliente,
    desactivarCliente,

    proveedores,
    proveedoresActivos,
    crearProveedor,
    actualizarProveedor,
    desactivarProveedor,
    saldoPendienteProveedor,

    stock,
    costoUnitarioPromedio,
    movimientosStock,
    ultimoFactorUsado,
    registrarConversionCacao,
    registrarDiferenciaConversion,
    registrarAjusteStock,
    registrarMerma,

    gastos,
    crearGastoManual,
    actualizarGastoManual,
    eliminarGastoManual,

    compras,
    registrarCompra,
    ventas,
    proximoNumeroFactura,
    proximoNumeroComprobante,
    registrarVenta,

    cuentas,
    movimientosCuenta,
    registrarAbono,
    crearCuentaManual,
    anularCuenta,
    saldoAFavorDeCliente
  }

  return {
    value,
    snapshot: () => ({
      empleados,
      clientes,
      proveedores,
      jornada,
      stock,
      costoUnitarioPromedio,
      movimientosStock,
      ultimoFactorUsado,
      gastos,
      compras,
      ventas,
      cuentas,
      movimientosCuenta
    })
  }
}
