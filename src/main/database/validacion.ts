import { ErrorNegocio } from '../../shared/errorNegocio'
import type { Comando } from '../../shared/persistencia'
const cliente = [
  'nombreRazonSocial',
  'identificacion',
  'telefono',
  'email',
  'direccion',
  'tipoCliente',
  'notas'
]
const proveedor = ['nombre', 'ciRuc', 'telefono', 'correo', 'numeroCuenta', 'direccion', 'estado']
const empleado = ['nombre', 'cedula', 'telefono', 'direccion', 'estado']
const gasto = [
  'fecha',
  'categoria',
  'concepto',
  'monto',
  'comprobante',
  'observacion',
  'empleado_id',
  'tipo_pago'
]
const campos: Partial<Record<Comando, string[]>> = {
  crearCliente: cliente,
  actualizarCliente: cliente,
  crearProveedor: proveedor,
  actualizarProveedor: proveedor,
  crearEmpleado: empleado,
  actualizarEmpleado: empleado,
  crearGastoManual: gasto,
  actualizarGastoManual: gasto,
  registrarCompra: [
    'fecha',
    'proveedorId',
    'producto',
    'cantidadQq',
    'precioCompraQq',
    'impuestoPorcentaje',
    'montoPagado',
    'metodoPago',
    'montoEfectivo',
    'montoTransferencia',
    'comprobante',
    'observacion'
  ],
  registrarVenta: [
    'fechaVenta',
    'clienteId',
    'producto',
    'pesoBruto',
    'precioUnitario',
    'impuestoPorcentaje',
    'metodoPago',
    'montoEfectivo',
    'montoTransferencia',
    'montoRecibido',
    'numeroLote',
    'observaciones'
  ],
  registrarAbono: [
    'cuentaId',
    'fecha',
    'monto',
    'metodoPago',
    'montoEfectivo',
    'montoTransferencia',
    'tipo',
    'observacion',
    'comprobante',
    'generarComprobante'
  ],
  crearCuentaManual: ['clienteId', 'tipo', 'fecha', 'monto', 'observacion', 'comprobante'],
  registrarConversionCacao: ['fecha', 'cacaoBabaUtilizadoQq', 'factorConversion', 'observacion'],
  registrarDiferenciaConversion: ['movimientoId', 'cantidadObtenidaQq', 'motivo'],
  registrarAjusteStock: ['fecha', 'producto', 'cantidadQq', 'motivo'],
  registrarMerma: ['fecha', 'producto', 'cantidadQq', 'motivo']
}
const numericos = new Set([
  'monto',
  'empleado_id',
  'cantidadQq',
  'precioCompraQq',
  'impuestoPorcentaje',
  'montoPagado',
  'montoEfectivo',
  'montoTransferencia',
  'pesoBruto',
  'precioUnitario',
  'montoRecibido',
  'cacaoBabaUtilizadoQq',
  'factorConversion',
  'cantidadObtenidaQq'
])
const booleanos = new Set(['estado', 'generarComprobante'])
export function validarArgumentos(comando: Comando, args: unknown[]): unknown[] {
  const indice = comando.startsWith('actualizar') ? 1 : 0
  const lista = campos[comando]
  if (!lista) {
    const argumentosEsperados = comando === 'anularCuenta' ? 2 : 1
    if (args.length !== argumentosEsperados) throw new ErrorNegocio('Argumentos no válidos.')
    if (comando === 'desactivarEmpleado') {
      if (!Number.isInteger(args[0]) || Number(args[0]) <= 0)
        throw new ErrorNegocio('Empleado no válido.')
    } else if (typeof args[0] !== 'string' || !args[0])
      throw new ErrorNegocio('Registro no válido.')
    if (comando === 'anularCuenta' && (typeof args[1] !== 'string' || !args[1].trim()))
      throw new ErrorNegocio('Indica el motivo de anulación.')
    return args
  }
  if (args.length !== indice + 1) throw new ErrorNegocio('Argumentos no válidos.')
  if (
    indice &&
    !(comando === 'actualizarEmpleado' ? Number.isInteger(args[0]) : typeof args[0] === 'string')
  )
    throw new ErrorNegocio('Identificador no válido.')
  const objeto = args[indice]
  if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto))
    throw new ErrorNegocio('Datos no válidos.')
  const limpio: Record<string, unknown> = {}
  for (const campo of lista) {
    const valor = (objeto as Record<string, unknown>)[campo]
    if (valor === undefined) continue
    if (numericos.has(campo)) {
      if (typeof valor !== 'number' || !Number.isFinite(valor))
        throw new ErrorNegocio('Revisa los valores numéricos.')
    } else if (booleanos.has(campo)) {
      if (typeof valor !== 'boolean') throw new ErrorNegocio('Estado no válido.')
    } else if (typeof valor !== 'string' || valor.length > 2000)
      throw new ErrorNegocio('Revisa los campos de texto.')
    limpio[campo] = valor
  }
  const texto = (key: string): string =>
    typeof limpio[key] === 'string' ? (limpio[key] as string).trim() : ''
  if (comando.includes('Cliente') && !texto('nombreRazonSocial'))
    throw new ErrorNegocio('El nombre / razón social del cliente es obligatorio.')
  if (comando.includes('Cliente') && texto('identificacion').length > 15)
    throw new ErrorNegocio('La identificación del cliente admite máximo 15 caracteres.')
  if (comando.includes('Proveedor') && !texto('nombre'))
    throw new ErrorNegocio('El nombre / razón social del proveedor es obligatorio.')
  if (comando.includes('Proveedor') && texto('ciRuc') && !/^\d{10}$|^\d{13}$/.test(texto('ciRuc')))
    throw new ErrorNegocio('La CI/RUC del proveedor debe tener 10 o 13 dígitos cuando se ingresa.')
  for (const campo of ['fecha', 'fechaVenta'])
    if (campo in limpio) {
      const valor = String(limpio[campo])
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(valor) ||
        !Number.isFinite(Date.parse(valor + 'T12:00:00Z')) ||
        new Date(valor + 'T12:00:00Z').toISOString().slice(0, 10) !== valor
      )
        throw new ErrorNegocio('Fecha no válida.')
    }
  if (
    comando === 'crearCuentaManual' &&
    (!['Saldo a favor', 'Deuda manual'].includes(texto('tipo')) ||
      Number(limpio.monto) <= 0 ||
      !texto('observacion'))
  )
    throw new ErrorNegocio('Revisa tipo, monto y observación de la cuenta.')
  if (comando === 'registrarMerma' && Number(limpio.cantidadQq) <= 0)
    throw new ErrorNegocio('La merma debe ser positiva.')
  if (
    comando === 'registrarAbono' &&
    !['Abono', 'Ajuste a favor', 'Ajuste por devolución'].includes(texto('tipo'))
  )
    throw new ErrorNegocio('Tipo de movimiento no válido.')
  return indice ? [args[0], limpio] : [limpio]
}
