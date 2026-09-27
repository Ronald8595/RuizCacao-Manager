import { ErrorNegocio } from '../../../shared/errorNegocio'
import { useId, useState, type FormEvent } from 'react'
import { Save, X } from 'lucide-react'
import { inputClass } from './FormField'
import ModalAccesible from './ModalAccesible'
import Toast from './Toast'
import { useToast } from '../hooks/useToast'
import { useAppData } from '../store/AppDataContext'
import { validarEmpleado } from '../utils/empleados'
import type { Empleado, EmpleadoFormData } from '../types'

interface Props {
  empleado?: Empleado | null
  onGuardado: (empleado: Empleado) => void
  onCancelar: () => void
}

export default function EmpleadoFormModal({
  empleado,
  onGuardado,
  onCancelar
}: Props): React.JSX.Element {
  const { empleados, crearEmpleado, actualizarEmpleado } = useAppData()
  const id = useId()
  const { aviso, notificar, cerrar } = useToast()
  const [form, setForm] = useState<EmpleadoFormData>(() =>
    empleado
      ? { ...empleado }
      : {
          nombre: '',
          cedula: '',
          telefono: '',
          direccion: '',
          estado: true
        }
  )
  const [tocados, setTocados] = useState<Partial<Record<keyof EmpleadoFormData, boolean>>>({})
  const [error, setError] = useState('')
  const datos = form
  const errores = validarEmpleado(datos, empleados, empleado?.id)
  const invalido = Object.keys(errores).length > 0

  function actualizar<K extends keyof EmpleadoFormData>(
    campo: K,
    valor: EmpleadoFormData[K]
  ): void {
    setForm((prev) => ({ ...prev, [campo]: valor }))
    setTocados((prev) => ({ ...prev, [campo]: true }))
    setError('')
    if (campo === 'cedula') {
      const errorCedula = validarEmpleado({ ...datos, [campo]: valor }, empleados, empleado?.id).cedula
      if (errorCedula === 'La cédula ya está registrada en el sistema') notificar(errorCedula, true)
    }
  }
  async function guardar(event: FormEvent): Promise<void> {
    event.preventDefault()
    event.stopPropagation()
    setTocados({ nombre: true, cedula: true, telefono: true, direccion: true, estado: true })
    if (invalido) return
    try {
      const resultado = empleado ? await actualizarEmpleado(empleado.id, datos) : await crearEmpleado(datos)
      onGuardado(resultado)
    } catch (cause) {
      const mensaje = cause instanceof ErrorNegocio ? cause.message : 'Error al procesar la operación'
      setError(mensaje)
      notificar(mensaje, true)
    }
  }
  function propiedades(campo: keyof EmpleadoFormData): {
    id: string
    'aria-invalid': boolean
    'aria-describedby': string | undefined
    className: string
  } {
    const visible = !!(tocados[campo] && errores[campo])
    return {
      id: `${id}-${campo}`,
      'aria-invalid': visible,
      'aria-describedby': visible ? `${id}-${campo}-error` : undefined,
      className: inputClass(visible)
    }
  }
  function mensaje(campo: keyof EmpleadoFormData): React.JSX.Element | null {
    return tocados[campo] && errores[campo] ? (
      <p id={`${id}-${campo}-error`} className="mt-1 text-[12px] text-[#9d3029]" aria-live="polite">
        {errores[campo]}
      </p>
    ) : null
  }
  const label = 'mb-1.5 block text-[12px] font-semibold text-[#4a524c]'
  return (
    <ModalAccesible
      tituloId={`${id}-titulo`}
      onCerrar={onCancelar}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
          event.currentTarget.querySelector('form')?.requestSubmit()
        }
      }}
    >
      <div className="mb-5 flex items-center justify-between">
        <h2 id={`${id}-titulo`} className="text-[16px] font-bold">
          {empleado ? 'Editar Empleado' : 'Nuevo Empleado'}
        </h2>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Cerrar formulario de empleado"
          className="rounded-lg p-2 hover:bg-[#f0f4f0]"
        >
          <X size={18} />
        </button>
      </div>
      <form onSubmit={guardar} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-nombre`} className={label}>
              Nombre completo <span aria-hidden="true">*</span>
            </label>
            <input
              {...propiedades('nombre')}
              data-autofocus
              autoFocus
              required
              maxLength={100}
              value={form.nombre}
              onChange={(e) => actualizar('nombre', e.target.value)}
              placeholder="Ej: Juan Pérez García"
            />
            {mensaje('nombre')}
          </div>
          <div>
            <label htmlFor={`${id}-cedula`} className={label}>
              Cédula
            </label>
            <input
              {...propiedades('cedula')}
              inputMode="numeric"
              maxLength={20}
              value={form.cedula ?? ''}
              onChange={(e) => actualizar('cedula', e.target.value)}
              placeholder="Ej: 1234567890 (opcional)"
            />
            {mensaje('cedula')}
          </div>
          <div>
            <label htmlFor={`${id}-telefono`} className={label}>
              Teléfono
            </label>
            <input
              {...propiedades('telefono')}
              type="tel"
              maxLength={20}
              value={form.telefono ?? ''}
              onChange={(e) => actualizar('telefono', e.target.value)}
              placeholder="Ej: 0987654321"
            />
            {mensaje('telefono')}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-direccion`} className={label}>
              Dirección
            </label>
            <textarea
              {...propiedades('direccion')}
              rows={2}
              maxLength={200}
              value={form.direccion ?? ''}
              onChange={(e) => actualizar('direccion', e.target.value)}
              placeholder="Dirección completa (opcional)"
            />
            {mensaje('direccion')}
          </div>
          <div>
            <span id={`${id}-estado-label`} className={label}>
              Estado
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={form.estado}
              aria-labelledby={`${id}-estado-label ${id}-estado-texto`}
              onClick={() => actualizar('estado', !form.estado)}
              className="flex items-center gap-3 rounded-lg py-2 focus-visible:outline-2 focus-visible:outline-[#16834b]"
            >
              <span
                aria-hidden="true"
                className={`flex h-6 w-11 items-center rounded-full p-1 ${form.estado ? 'justify-end bg-[#16834b]' : 'justify-start bg-[#69736d]'}`}
              >
                <span className="h-4 w-4 rounded-full bg-white" />
              </span>
              <span id={`${id}-estado-texto`} className="text-[13px]">
                {form.estado ? 'Activo' : 'Inactivo'}
              </span>
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-[13px] text-[#9d3029]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 border-t border-[#e2e7e2] pt-4">
          <button
            type="button"
            onClick={onCancelar}
            className="flex items-center gap-2 rounded-xl border border-[#e1e5e1] px-4 py-2.5 text-[13px] font-semibold"
          >
            <X size={16} />
            Cancelar
          </button>
          <button
            type="submit"
            disabled={invalido}
            className="flex items-center gap-2 rounded-xl bg-[#16834b] px-5 py-2.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={16} />
            Guardar
          </button>
        </div>
        <p className="text-right text-[11px] text-[#5b635e]">
          Ctrl+S para guardar · Esc para cancelar
        </p>
      </form>
      <Toast aviso={aviso} onCerrar={cerrar} />
    </ModalAccesible>
  )
}
