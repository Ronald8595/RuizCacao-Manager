import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { Plus, Search } from 'lucide-react'
import EmpleadoFormModal from './EmpleadoFormModal'
import { inputClass } from './FormField'
import { useAppData } from '../store/AppDataContext'
import { useNotificacion } from '../store/NotificacionContext'
import { coincideEmpleado, normalizarBusqueda } from '../utils/empleados'
import type { Empleado } from '../types'

interface Props {
  value?: number
  onChange: (id: number | undefined) => void
  error?: string
}

export default function SelectorEmpleado({ value, onChange, error }: Props): React.JSX.Element {
  const { empleados, empleadosActivos } = useAppData()
  const seleccionado = empleados.find((e) => e.id === value)
  const id = useId()
  const [texto, setTexto] = useState(seleccionado?.nombre ?? '')
  const [consulta, setConsulta] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(-1)
  const [crear, setCrear] = useState(false)
  const { notificar } = useNotificacion()
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setConsulta(texto)
      setActivo(-1)
    }, 200)
    return () => window.clearTimeout(timer)
  }, [texto])
  const buscando = texto !== consulta
  const resultados = useMemo(
    () =>
      consulta.trim().length < 2
        ? []
        : empleadosActivos
            .filter((empleado) => coincideEmpleado(empleado, consulta, false))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [empleadosActivos, consulta]
  )
  const mostrarResultados = abierto && !buscando && consulta.trim().length >= 2
  useEffect(() => {
    if (activo >= 0)
      document.getElementById(`${id}-opcion-${activo}`)?.scrollIntoView({ block: 'nearest' })
  }, [activo, id])
  function seleccionar(empleado: Empleado): void {
    onChange(empleado.id)
    setTexto(empleado.nombre)
    setAbierto(false)
    setActivo(-1)
  }
  function resaltar(valor: string): ReactNode {
    const indice = normalizarBusqueda(valor).indexOf(normalizarBusqueda(consulta))
    if (indice < 0) return valor
    const fin = indice + consulta.trim().length
    return (
      <>
        {valor.slice(0, indice)}
        <mark className="rounded bg-[#fff0c9] text-inherit">{valor.slice(indice, fin)}</mark>
        {valor.slice(fin)}
      </>
    )
  }
  const opcionActiva =
    mostrarResultados && activo >= 0 && activo < resultados.length
      ? `${id}-opcion-${activo}`
      : undefined
  return (
    <div>
      <label
        htmlFor={`${id}-buscar`}
        className="mb-1.5 block text-[12px] font-semibold text-[#4a524c]"
      >
        Trabajador <span aria-hidden="true">*</span>
      </label>
      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setAbierto(false)
        }}
      >
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-3.5 text-[#5b635e]"
            aria-hidden="true"
          />
          <input
            id={`${id}-buscar`}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={mostrarResultados}
            aria-controls={`${id}-lista`}
            aria-activedescendant={opcionActiva}
            aria-required="true"
            aria-invalid={!!error}
            aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ''}`}
            autoComplete="off"
            value={texto}
            placeholder="Escriba el nombre del trabajador..."
            className={inputClass(!!error) + ' pl-9'}
            onFocus={() => setAbierto(true)}
            onChange={(event) => {
              setTexto(event.target.value)
              onChange(undefined)
              setAbierto(true)
              setActivo(-1)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && abierto) {
                event.preventDefault()
                event.stopPropagation()
                setAbierto(false)
                return
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setAbierto(true)
                if (resultados.length && !buscando)
                  setActivo((prev) =>
                    event.key === 'ArrowDown'
                      ? Math.min(prev + 1, resultados.length - 1)
                      : Math.max(prev - 1, 0)
                  )
              }
              if (event.key === 'Enter' && abierto) {
                event.preventDefault()
                if (opcionActiva) seleccionar(resultados[activo])
              }
            }}
          />
        </div>
        {mostrarResultados && (
          <div
            id={`${id}-lista`}
            role="listbox"
            aria-label="Trabajadores activos"
            className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-[#c3cfc5] bg-white py-1 shadow-lg"
          >
            {resultados.length === 0 ? (
              <p role="status" className="px-3 py-3 text-[12px] text-[#5b635e]">
                No se encontró al trabajador
              </p>
            ) : (
              resultados.map((empleado, indice) => (
                <div
                  key={empleado.id}
                  id={`${id}-opcion-${indice}`}
                  role="option"
                  aria-selected={activo === indice}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActivo(indice)}
                  onClick={() => seleccionar(empleado)}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${activo === indice ? 'bg-[#e7f2ea]' : 'hover:bg-[#f5f7f4]'}`}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7f2ea] text-[12px] font-bold text-[#176b3a]"
                  >
                    {empleado.nombre
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((parte) => parte[0])
                      .join('')}
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold">
                      {resaltar(empleado.nombre)}
                    </span>
                    <span className="block text-[11px] text-[#4a524c]">
                      {empleado.cedula ? `Cédula: ${empleado.cedula}` : 'Sin cédula registrada'}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        )}
        <p id={`${id}-ayuda`} className="mt-1 text-[11px] text-[#5b635e]">
          {seleccionado
            ? `${seleccionado.nombre}${seleccionado.estado ? ' · Seleccionado' : ' · Inactivo (registro histórico)'}`
            : buscando
              ? 'Buscando…'
              : 'Escribe al menos 2 caracteres y selecciona un trabajador.'}
        </p>
        {error && (
          <p id={`${id}-error`} role="alert" className="mt-1 text-[12px] text-[#9d3029]">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setAbierto(false)
            setCrear(true)
          }}
          className="mt-2 flex items-center gap-1 rounded text-[12px] font-semibold text-[#176b3a] underline-offset-2 hover:underline"
        >
          <Plus size={14} />
          Registrar nuevo trabajador
        </button>
      </div>
      {crear && (
        <EmpleadoFormModal
          onCancelar={() => setCrear(false)}
          onGuardado={(empleado) => {
            setCrear(false)
            if (empleado.estado) {
              seleccionar(empleado)
              notificar('exito', 'Empleado registrado correctamente.')
            } else
              notificar('advertencia', 'Empleado registrado como inactivo. Actívalo para asignarlo a un gasto.')
          }}
        />
      )}
    </div>
  )
}
