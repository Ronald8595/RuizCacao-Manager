// Identificadores de cada página/vista de la aplicación.
// Se usa tanto en el menú lateral (Sidebar) como en el router simple de App.tsx.

export type Page =
  | 'inicio'
  | 'ventas'
  | 'stock'
  | 'cuentas'
  | 'gastos'
  | 'consultas'
  | 'clientes'
  | 'empleados'
  | 'usuarios'

export type PageProps = {
  onNavigate?: (page: Page) => void
  // añade aquí las props compartidas por todas las páginas
}

export interface RegistroAutor {
  usuarioId?: string
  usuarioNombre?: string
}

// ============================================================
// Control de jornada laboral (módulo Inicio)
// ============================================================
// 'no_iniciada'  -> aún no se presionó "Iniciar Jornada" hoy.
// 'activa'       -> jornada en curso; se pueden registrar ventas.
// 'finalizada'   -> jornada cerrada hoy; no se pueden registrar más ventas
//                   hasta iniciar una nueva (recién al día siguiente).
export type EstadoJornada = 'no_iniciada' | 'activa' | 'finalizada' | 'interrumpida'

// ============================================================
// Cliente (módulo Clientes) — sirve de base para el patrón CRUD
// que se replicará en Stock, Ventas, Gastos y Cuentas.
// ============================================================
export type TipoCliente = 'Mayorista' | 'Minorista' | 'Intermediario'

export interface Cliente {
  // Sistema automático
  id: string
  fechaRegistro: string // ISO datetime
  estado: boolean // true = activo, false = inactivo (soft delete)

  // Obligatorios
  nombreRazonSocial: string
  identificacion: string // CI o RUC
  telefono: string

  // Opcionales
  email?: string
  direccion?: string
  tipoCliente?: TipoCliente
  notas?: string
}

// Datos de formulario: todo lo que el usuario llena a mano (sin los campos
// que genera el sistema automáticamente).
export type ClienteFormData = Pick<
  Cliente,
  | 'nombreRazonSocial'
  | 'identificacion'
  | 'telefono'
  | 'email'
  | 'direccion'
  | 'tipoCliente'
  | 'notas'
>

// ============================================================
// Catálogos y tipos compartidos entre Ventas, Stock y Cuentas.
// ============================================================
export type Producto = 'Cacao en Baba' | 'Cacao Seco' | 'Maracuyá'
export type MetodoPago = 'Efectivo' | 'Transferencia' | 'Pago Mixto'
export type EstadoCobro = 'Pagado' | 'Pendiente' | 'Parcial'

export interface EstadoOperacion {
  estado?: 'vigente' | 'anulada'
  anuladaEn?: string
  anuladaPorUsuarioId?: string
  anuladaPorNombre?: string
  motivoAnulacion?: string
}
export interface Venta extends RegistroAutor, EstadoOperacion {
  // Sistema automático
  id: string
  numeroFactura: number
  // Consecutivo oficial global del comprobante. No se reinicia por jornada.
  numeroComprobante: number
  subtotal: number
  montoImpuesto: number
  totalVenta: number
  saldoPendiente: number
  estadoCobro: EstadoCobro

  // Obligatorios
  fechaVenta: string // ISO date del movimiento comercial
  // Marca temporal exacta generada por el sistema al registrar la venta.
  // Se conserva aparte de la fecha comercial para permitir consultas históricas por día/semana/mes.
  fechaHoraRegistro: string // ISO datetime
  clienteId: string
  producto: Producto
  pesoBruto: number
  precioUnitario: number
  impuestoPorcentaje: number

  // Pago
  metodoPago: MetodoPago
  montoEfectivo?: number
  montoTransferencia?: number
  montoRecibido: number

  // Opcionales
  numeroLote?: string
  observaciones?: string
}

// ============================================================
// Módulo de Cuentas
//
// Una Cuenta vive separada de la Venta porque las ventas no se pueden
// editar ni eliminar, mientras que la cuenta sí evoluciona con el tiempo a
// medida que el cliente abona.
//
// DECISIÓN DE DISEÑO CLAVE: el saldo NO se almacena como campo fijo. Se
// deriva siempre de (montoTotal - montoPagado) mediante saldoDeCuenta().
// Guardar el saldo duplicado abre la puerta a que quede desincronizado con
// el historial de abonos; derivarlo garantiza que la suma de movimientos y
// el saldo mostrado nunca puedan contradecirse.
// ============================================================

// 'deuda' = el cliente debe; 'a_favor' = pagó de más o hubo devolución;
// 'cerrado' = saldo exactamente en 0.
export type TipoSaldoCuenta = 'deuda' | 'a_favor' | 'cerrado'

// Las cuentas comerciales se anulan junto con la compra o venta que las origina.
// El registro y sus importes históricos se conservan; dejan de representar deuda.
export type EstadoCuenta = 'pendiente' | 'parcial' | 'cerrado' | 'anulado'

export type OrigenCuenta = 'venta' | 'compra' | 'manual'
export type CategoriaCuenta = 'venta' | 'compra'

export interface Compra extends RegistroAutor, EstadoOperacion {
  id: string
  numeroCompra: number
  fecha: string
  fechaHoraRegistro: string
  proveedorId: string
  proveedorNombre: string
  producto: Producto
  cantidadQq: number
  precioCompraQq: number
  impuestoPorcentaje: number
  subtotal: number
  montoImpuesto: number
  totalCompra: number
  montoPagadoInicial: number
  metodoPago: MetodoPago
  montoEfectivo?: number
  montoTransferencia?: number
  comprobante?: string
  observacion?: string
}

export interface CompraInput {
  fecha: string
  proveedorId: string
  producto: Producto
  cantidadQq: number
  precioCompraQq: number
  impuestoPorcentaje: number
  montoPagado: number
  metodoPago: MetodoPago
  montoEfectivo?: number
  montoTransferencia?: number
  comprobante?: string
  observacion?: string
}

export type TipoMovimientoCuenta = 'Abono' | 'Ajuste a favor' | 'Ajuste por devolución'

export interface Cuenta extends RegistroAutor {
  id: string
  origen: OrigenCuenta
  categoria: CategoriaCuenta
  compraId?: string
  numeroCompra?: number
  proveedorId?: string
  proveedorNombre?: string
  // null en cuentas manuales (las que no provienen de una venta).
  ventaId: string | null
  numeroFactura: number | null
  clienteId: string
  // Lo que el cliente debía originalmente. En una cuenta manual de tipo
  // "Saldo a favor" vale 0, de modo que el saldo derivado quede negativo.
  montoTotal: number
  // Suma acumulada de todo lo abonado/ajustado. Incluye el pago inicial
  // hecho en el momento de la venta.
  montoPagado: number
  fecha: string // fecha comercial (ISO date)
  fechaHoraRegistro: string // ISO datetime generado por el sistema
  fechaUltimoMovimiento: string // ISO datetime del último abono o ajuste
  estado: EstadoCuenta
  observacion?: string
  comprobante?: string
  motivoAnulacion?: string
}

// Cada abono o ajuste aplicado a una cuenta. Es el libro mayor del módulo:
// Las devoluciones de anulaciones compensan caja y conservan el importe pagado histórico.
export interface MovimientoCuenta extends RegistroAutor {
  id: string
  cuentaId: string
  categoria: CategoriaCuenta
  proveedorId?: string
  clienteId: string
  fecha: string
  fechaHoraRegistro: string // ISO datetime generado por el sistema
  tipo: TipoMovimientoCuenta
  monto: number
  metodoPago: MetodoPago
  montoEfectivo?: number // sólo en pago mixto
  montoTransferencia?: number // sólo en pago mixto
  observacion: string
  // Número interno automático del comprobante de pago. Puede quedar vacío
  // cuando el movimiento no requiere comprobante formal.
  numeroComprobante?: string
  // Referencia externa opcional (factura, recibo bancario, etc.).
  comprobante?: string
}

// ----- Datos de entrada de los formularios de Cuentas -----

export interface AbonoInput {
  cuentaId: string
  fecha: string
  monto: number
  metodoPago: MetodoPago
  montoEfectivo?: number
  montoTransferencia?: number
  tipo: TipoMovimientoCuenta
  observacion: string
  comprobante?: string
  generarComprobante?: boolean
}

export interface CuentaManualInput {
  clienteId: string
  // "Saldo a favor" crea la cuenta con montoTotal 0 y montoPagado = monto,
  // lo que produce un saldo negativo (a favor del cliente).
  tipo: 'Saldo a favor' | 'Deuda manual'
  fecha: string
  monto: number
  observacion: string
  comprobante?: string
}

// ============================================================
// Módulo de Stock / Inventario
//
// Sin base de datos todavía (ver AppDataContext): todo vive en arrays en
// memoria. `MovimientoStock` es el registro cronológico único que alimenta
// tanto la vista de "Stock actual" (se recalcula sumando/restando sobre
// stock inicial) como la vista de "Historial de movimientos".
// ============================================================

// Cada tipo de movimiento corresponde 1 a 1 con uno de los formularios de
// entrada/salida definidos con el cliente. 'Salida - Venta' no tiene un
// formulario propio: se genera automáticamente desde el módulo de Ventas
// para que el historial de Stock quede completo (trazabilidad total),
// aunque el cliente nunca la registra a mano aquí.
export type EstadoPagoProveedor = 'completo' | 'abono' | 'pendiente'

export interface Proveedor {
  id: string
  fechaRegistro: string
  estado: boolean
  nombre: string
  ciRuc: string
  telefono?: string
  correo?: string
  numeroCuenta?: string
  direccion?: string
}

export type ProveedorFormData = Pick<
  Proveedor,
  'nombre' | 'ciRuc' | 'telefono' | 'correo' | 'numeroCuenta' | 'direccion' | 'estado'
>

export type TipoMovimientoStock =
  | 'Stock inicial'
  | 'Entrada - Compra'
  | 'Entrada - Compra Seco'
  | 'Entrada - Ajuste'
  | 'Salida - Ajuste'
  | 'Conversión'
  | 'Salida - Procesamiento'
  | 'Salida - Merma'
  | 'Salida - Venta'

export interface MovimientoStock extends RegistroAutor {
  id: string
  fecha: string // ISO date (yyyy-mm-dd)
  fechaHoraRegistro: string // ISO datetime generado por el sistema
  tipo: TipoMovimientoStock
  producto: Producto
  entradaQq: number // En conversión representa el cacao seco obtenido por cálculo
  salidaQq: number // En conversión representa el cacao en baba utilizado
  stockResultante: number // stock del producto INMEDIATAMENTE DESPUÉS de este movimiento
  detalle: string // texto legible para la columna "Detalle" (proveedor, motivo, factor usado, etc.)
  gastoGeneradoId?: string // presente si este movimiento generó un gasto automático (compras)
  ventaId?: string // presente si el movimiento proviene de una venta (Salida - Venta)
  compraId?: string
  conversionId?: string
  proveedorId?: string
  proveedorNombre?: string
  factorConversion?: number
  cantidadObtenidaQq?: number | null // peso físico ingresado después del secado
  diferenciaQq?: number | null // cantidad obtenida - cantidad calculada; positivo = a favor, negativo = en contra
  estadoPago?: EstadoPagoProveedor
  montoAbono?: number
  montoTotal?: number
  saldoPendiente?: number
  comprobante?: string
  observacion?: string
}

// ----- Datos de entrada de cada formulario (lo que llena el usuario) -----

export interface CompraCacaoBabaInput {
  fecha: string
  cantidadQq: number
  precioCompraQq: number
  factorConversion?: number
  proveedor?: string
  proveedorId?: string
  impuestoPorcentaje?: number
  estadoPago?: EstadoPagoProveedor
  montoAbono?: number
  comprobante?: string
  observacion?: string
}

export interface CompraCacaoSecoInput {
  fecha: string
  cantidadQq: number
  precioCompraQq: number
  proveedorId?: string
  impuestoPorcentaje?: number
  estadoPago?: EstadoPagoProveedor
  montoAbono?: number
  comprobante?: string
  observacion?: string
}

export interface ConversionCacaoInput {
  fecha: string
  cacaoBabaUtilizadoQq: number
  factorConversion: number
  observacion?: string
}

export interface AjusteConversionInput {
  movimientoId: string
  cantidadObtenidaQq: number
  motivo?: string
}

export interface AbonoProveedorInput {
  movimientoId: string
  monto: number
  fecha: string
  observacion?: string
}

export interface IngresoMaracuyaInput {
  fecha: string
  cantidadQq: number
  precioCompraQq: number
  proveedor?: string
}

export interface AjusteStockInput {
  fecha: string
  producto: Producto
  // Puede ser negativo (corrección a la baja) o positivo (corrección al alza).
  cantidadQq: number
  motivo: string
}

export interface ProcesamientoInput {
  fecha: string
  cacaoBabaUtilizadoQq: number
  cacaoSecoObtenidoQq: number
}

export interface MermaInput {
  fecha: string
  producto: Producto
  cantidadQq: number
  motivo: string
}

// ============================================================
// Módulo de Gastos
//
// Un gasto es 'automatico' (generado desde Stock al comprar materia prima,
// no editable/eliminable desde aquí) o 'manual' (CRUD completo, gastos
// operativos como transporte o mano de obra).
// ============================================================

export type CategoriaGasto =
  'Inversión en materia prima' | 'Transporte' | 'Mano de obra' | 'Insumos' | 'Servicios' | 'Otros'

export type TipoGasto = 'automatico' | 'manual'

export interface Empleado {
  id: number
  nombre: string
  cedula?: string
  telefono?: string
  direccion?: string
  estado: boolean
  fechaRegistro: string
}

export type EmpleadoFormData = Omit<Empleado, 'id' | 'fechaRegistro'>
export type TipoPagoEmpleado = 'pago' | 'adelanto'

export interface Gasto extends RegistroAutor {
  id: string
  fecha: string // ISO date (yyyy-mm-dd)
  fechaHoraRegistro: string // ISO datetime generado por el sistema
  categoria: CategoriaGasto
  concepto: string
  monto: number
  // El comprobante es opcional porque existen gastos sin documento formal.
  comprobante?: string // N.º de recibo/factura (solo aplica a gastos manuales)
  // Contexto del movimiento. Se recomienda/solicita en el formulario aunque no sea un comprobante formal.
  observacion: string
  tipo: TipoGasto
  // Id del MovimientoStock que originó este gasto. null en gastos manuales.
  referenciaStockId: string | null
  compra_id?: string
  empleado_id?: number
  tipo_pago?: TipoPagoEmpleado
  // Nombre conservado al registrar el gasto, incluso si la ficha cambia después.
  empleado_nombre?: string
  proveedor_id?: string
  proveedor_nombre?: string
  estado_pago_proveedor?: EstadoPagoProveedor
  monto_abono?: number
  saldo_pendiente_proveedor?: number
}

// Datos de formulario para el CRUD manual de Gastos (fecha, categoría,
// concepto, monto y comprobante — todo lo que el usuario llena a mano).
export type GastoFormData = Pick<
  Gasto,
  | 'fecha'
  | 'categoria'
  | 'concepto'
  | 'monto'
  | 'comprobante'
  | 'observacion'
  | 'empleado_id'
  | 'tipo_pago'
>
