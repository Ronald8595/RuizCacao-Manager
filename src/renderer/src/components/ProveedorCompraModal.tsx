import { ErrorNegocio } from '../../../shared/errorNegocio'
import { useState, type FormEvent } from 'react'
import ModalAccesible from './ModalAccesible'
import { FormField, inputClass } from './FormField'
import { useAppData } from '../store/AppDataContext'
import { useNotificacion } from '../store/NotificacionContext'
import type { Proveedor, ProveedorFormData } from '../types'

export default function ProveedorCompraModal({
  onCancelar,
  onCreado
}: {
  onCancelar: () => void
  onCreado: (proveedor: Proveedor) => void
}): React.JSX.Element {
  const { proveedores, crearProveedor } = useAppData()
  const { notificar } = useNotificacion()
  const [form, setForm] = useState<ProveedorFormData>({ nombre: '', ciRuc: '', estado: true })
  const [error, setError] = useState('')
  async function guardar(e: FormEvent): Promise<void> {
    e.preventDefault()
    e.stopPropagation()
    if (!form.nombre.trim()) return setError('El nombre es obligatorio.')
    const ciRuc = form.ciRuc.trim()
    if (ciRuc && !/^(\d{10}|\d{13})$/.test(ciRuc))
      return setError('La CI/RUC debe tener 10 o 13 dígitos cuando se ingresa.')
    if (ciRuc && proveedores.some((p) => p.ciRuc === ciRuc))
      return setError('Ya existe un proveedor con esa CI/RUC.')
    try {
      const proveedor = await crearProveedor({ ...form, nombre: form.nombre.trim(), ciRuc })
      onCreado(proveedor)
      notificar('exito', 'Proveedor registrado con éxito.')
    } catch (cause) {
      setError(cause instanceof ErrorNegocio ? cause.message : 'No se pudo registrar el proveedor.')
    }
  }
  return (
    <ModalAccesible tituloId="nuevo-proveedor-titulo" onCerrar={onCancelar}>
      <h2 id="nuevo-proveedor-titulo" className="mb-4 text-[16px] font-bold">
        Registrar nuevo proveedor
      </h2>
      <form onSubmit={guardar} className="space-y-4">
        <FormField label="Nombre / Razón social" obligatorio>
          <input
            data-autofocus
            required
            maxLength={100}
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className={inputClass(false)}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="CI / RUC">
            <input
              inputMode="numeric"
              maxLength={13}
              value={form.ciRuc}
              onChange={(e) => setForm({ ...form, ciRuc: e.target.value })}
              className={inputClass(false)}
              placeholder="Opcional"
            />
          </FormField>
          <FormField label="Teléfono">
            <input
              type="tel"
              maxLength={20}
              value={form.telefono ?? ''}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              className={inputClass(false)}
            />
          </FormField>
          <FormField label="Correo electrónico">
            <input
              type="email"
              maxLength={100}
              value={form.correo ?? ''}
              onChange={(e) => setForm({ ...form, correo: e.target.value })}
              className={inputClass(false)}
            />
          </FormField>
          <FormField label="Número de cuenta">
            <input
              maxLength={30}
              value={form.numeroCuenta ?? ''}
              onChange={(e) => setForm({ ...form, numeroCuenta: e.target.value })}
              className={inputClass(false)}
            />
          </FormField>
        </div>
        <FormField label="Dirección">
          <textarea
            rows={2}
            maxLength={200}
            value={form.direccion ?? ''}
            onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            className={inputClass(false)}
          />
        </FormField>
        {error && (
          <p role="alert" className="text-[13px] text-[#9d3029]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-xl border px-4 py-2 text-[13px]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-xl bg-[#16834b] px-4 py-2 text-[13px] font-semibold text-white"
          >
            Guardar proveedor
          </button>
        </div>
      </form>
    </ModalAccesible>
  )
}
