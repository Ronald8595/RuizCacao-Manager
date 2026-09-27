import { ErrorNegocio } from '../../../shared/errorNegocio'
import type { Empleado, EmpleadoFormData, Gasto, GastoFormData } from '../types'

export type ErroresEmpleado = Partial<Record<keyof EmpleadoFormData, string>>

export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
}

export function coincideEmpleado(
  empleado: Empleado,
  texto: string,
  incluirTelefono = true
): boolean {
  const campos = [empleado.nombre, empleado.cedula]
  if (incluirTelefono) campos.push(empleado.telefono)
  const consulta = normalizarBusqueda(texto)
  return campos.some((campo) => normalizarBusqueda(campo ?? '').includes(consulta))
}

export function validarEmpleado(
  data: EmpleadoFormData,
  empleados: Empleado[],
  idActual?: number
): ErroresEmpleado {
  const errores: ErroresEmpleado = {}
  const nombre = data.nombre.trim()
  if (nombre.length < 3 || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(nombre)) {
    errores.nombre =
      'El nombre es obligatorio, debe tener al menos 3 caracteres y solo acepta letras'
  } else if (nombre.length > 100) errores.nombre = 'Máximo 100 caracteres'
  const cedula = data.cedula?.trim() ?? ''
  if (cedula.length > 20 || !/^[0-9]*$/.test(cedula)) {
    errores.cedula = 'La cédula solo acepta números (máximo 20)'
  } else if (cedula && empleados.some((e) => e.id !== idActual && e.cedula === cedula)) {
    errores.cedula = 'La cédula ya está registrada en el sistema'
  }
  const telefono = data.telefono?.trim() ?? ''
  if (telefono.length > 20 || !/^[0-9+\-\s()]*$/.test(telefono)) {
    errores.telefono = 'Formato de teléfono inválido (máximo 20 caracteres)'
  }
  if ((data.direccion?.length ?? 0) > 200) errores.direccion = 'Máximo 200 caracteres'
  return errores
}

export function prepararEmpleado(
  data: EmpleadoFormData,
  empleados: Empleado[],
  idActual?: number
): EmpleadoFormData {
  const errores = validarEmpleado(data, empleados, idActual)
  if (Object.keys(errores).length) throw new ErrorNegocio(Object.values(errores)[0])
  return {
    nombre: data.nombre.trim().replace(/\s+/g, ' '),
    cedula: data.cedula?.trim() || undefined,
    telefono: data.telefono?.trim() || undefined,
    direccion: data.direccion?.trim() || undefined,
    estado: data.estado
  }
}

export function prepararGastoEmpleado(
  data: GastoFormData,
  empleados: Empleado[],
  anterior?: Gasto
): GastoFormData & Pick<Gasto, 'empleado_nombre'> {
  if (!Number.isFinite(data.monto) || data.monto <= 0)
    throw new ErrorNegocio('El monto debe ser mayor a 0')
  if (data.observacion.length > 500) throw new ErrorNegocio('La observación admite hasta 500 caracteres')
  if (data.categoria !== 'Mano de obra') {
    return {
      ...data,
      concepto: data.observacion.trim() || data.categoria,
      observacion: data.observacion.trim(),
      empleado_id: undefined,
      tipo_pago: undefined,
      empleado_nombre: undefined
    }
  }
  const empleado = empleados.find((e) => e.id === data.empleado_id)
  const conservaRelacion =
    anterior?.categoria === 'Mano de obra' && anterior.empleado_id === empleado?.id
  if (!empleado || (!empleado.estado && !conservaRelacion)) {
    throw new ErrorNegocio('Selecciona un trabajador activo de la lista')
  }
  if (data.tipo_pago !== 'pago' && data.tipo_pago !== 'adelanto')
    throw new ErrorNegocio('Selecciona el tipo de pago')
  const nombre = conservaRelacion ? (anterior?.empleado_nombre ?? empleado.nombre) : empleado.nombre
  return {
    ...data,
    empleado_nombre: nombre,
    concepto: `${data.tipo_pago === 'adelanto' ? 'Adelanto' : 'Pago completo'} — ${nombre}${data.observacion.trim() ? ` · ${data.observacion.trim()}` : ''}`,
    observacion: data.observacion.trim()
  }
}
