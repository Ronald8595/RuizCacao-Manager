import type { ReactNode } from 'react'

interface FormFieldProps {
  label: string
  error?: string
  obligatorio?: boolean
  children: ReactNode
}

// Bloque estándar de campo de formulario: etiqueta, control y mensaje de
// error. Se usa en Clientes y Ventas para que todos los formularios de la
// app se vean y se comporten igual.
export function FormField({ label, error, obligatorio, children }: FormFieldProps): React.JSX.Element {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-[#4a524c]">
        {label}
        {obligatorio && <span className="text-[#dc5c52]"> *</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11px] text-[#dc5c52]">{error}</span>}
    </label>
  )
}

export function inputClass(conError: boolean): string {
  return [
    'w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition-colors',
    'placeholder:text-[#a5aca7] focus:border-[#16834b]',
    conError ? 'border-[#dc5c52]' : 'border-[#e1e5e1]'
  ].join(' ')
}
