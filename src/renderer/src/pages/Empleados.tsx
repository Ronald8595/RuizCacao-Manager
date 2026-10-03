import { useEffect, useMemo, useRef, useState } from 'react'
import { Users, Plus, Search, Pencil, Trash2, ArrowUpDown } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ContenedorTabla from '../components/ContenedorTabla'
import EmpleadoFormModal from '../components/EmpleadoFormModal'
import ModalAccesible from '../components/ModalAccesible'
import { useAppData } from '../store/AppDataContext'
import { useNotificacion } from '../store/NotificacionContext'
import { coincideEmpleado } from '../utils/empleados'
import type { Empleado } from '../types'

type Orden = 'id' | 'nombre' | 'cedula' | 'estado'
type Filtro = 'todos' | 'activos' | 'inactivos'
const columnas: { campo: Orden; label: string; ancho?: string }[] = [
  { campo: 'id', label: '#', ancho: '60px' },
  { campo: 'nombre', label: 'Nombre' },
  { campo: 'cedula', label: 'Cédula', ancho: '140px' },
  { campo: 'estado', label: 'Estado', ancho: '100px' }
]

export default function Empleados(): React.JSX.Element {
  const { empleados, desactivarEmpleado } = useAppData()
  const [busqueda, setBusqueda] = useState('')
  const [consulta, setConsulta] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [orden, setOrden] = useState<Orden>('nombre')
  const [ascendente, setAscendente] = useState(true)
  const [pagina, setPagina] = useState(1)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Empleado | null>(null)
  const [eliminando, setEliminando] = useState<Empleado | null>(null)
  const buscador = useRef<HTMLInputElement>(null)
  const { notificar } = useNotificacion()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setConsulta(busqueda)
      setPagina(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [busqueda])

  useEffect(() => {
    function atajo(event: KeyboardEvent): void {
      if (modal || eliminando || !(event.ctrlKey || event.metaKey)) return
      const tecla = event.key.toLowerCase()
      if (tecla === 'n') {
        event.preventDefault()
        setEditando(null)
        setModal(true)
      }
      if (tecla === 'f') {
        event.preventDefault()
        buscador.current?.focus()
      }
    }
    window.addEventListener('keydown', atajo)
    return () => window.removeEventListener('keydown', atajo)
  }, [modal, eliminando])

  const filtrados = useMemo(
    () =>
      empleados
        .filter(
          (empleado) =>
            (filtro === 'todos' || empleado.estado === (filtro === 'activos')) &&
            coincideEmpleado(empleado, consulta)
        )
        .sort((a, b) => {
          const comparacion =
            orden === 'id'
              ? a.id - b.id
              : orden === 'estado'
                ? Number(a.estado) - Number(b.estado)
                : (a[orden] ?? '').localeCompare(b[orden] ?? '', 'es', {
                    sensitivity: 'base',
                    numeric: true
                  })
          return (comparacion || a.id - b.id) * (ascendente ? 1 : -1)
        }),
    [empleados, consulta, filtro, orden, ascendente]
  )
  const paginas = Math.max(1, Math.ceil(filtrados.length / 15))
  const paginaActual = Math.min(pagina, paginas)
  const visibles = filtrados.slice((paginaActual - 1) * 15, paginaActual * 15)

  function ordenar(campo: Orden): void {
    setAscendente(orden === campo ? !ascendente : true)
    setOrden(campo)
    setPagina(1)
  }
  async function confirmarDesactivacion(): Promise<void> {
    if (!eliminando) return
    try {
      await desactivarEmpleado(eliminando.id)
      setEliminando(null)
      notificar('exito', 'Empleado desactivado correctamente.')
    } catch {
      setEliminando(null)
      notificar('error', 'Error al procesar la operación.')
    }
  }
  function encabezado(campo: Orden): React.JSX.Element {
    const columna = columnas.find((c) => c.campo === campo)!
    return (
      <th
        scope="col"
        style={{ width: columna.ancho }}
        aria-sort={orden === campo ? (ascendente ? 'ascending' : 'descending') : 'none'}
        className="px-4 py-3"
      >
        <button
          type="button"
          onClick={() => ordenar(campo)}
          className="flex items-center gap-1 rounded focus-visible:outline-2"
          aria-label={`Ordenar por ${columna.label}`}
        >
          {columna.label}
          <ArrowUpDown size={12} aria-hidden="true" />
        </button>
      </th>
    )
  }
  return (
    <section
      aria-label="Módulo de gestión de empleados"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 lg:p-7 [&>*]:shrink-0"
    >
      <PageHeader
        greeting="Gestión de Empleados"
        subtitle="Registro de trabajadores"
        actions={
          <button
            type="button"
            onClick={() => {
              setEditando(null)
              setModal(true)
            }}
            className="flex items-center gap-2 rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#146b3e]"
          >
            <Plus size={16} />
            Nuevo Empleado
          </button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[#e1e5e1] bg-white px-3 py-2.5">
          <Search size={16} aria-hidden="true" />
          <input
            ref={buscador}
            aria-label="Buscar empleados"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, cédula o teléfono..."
            className="w-full bg-transparent text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#16834b]"
          />
        </div>
        <div role="group" aria-label="Filtrar empleados por estado" className="flex gap-1">
          {(['todos', 'activos', 'inactivos'] as const).map((valor) => (
            <button
              key={valor}
              type="button"
              aria-pressed={filtro === valor}
              onClick={() => {
                setFiltro(valor)
                setPagina(1)
              }}
              className={`rounded-xl border px-3 py-2.5 text-[12px] font-semibold ${filtro === valor ? 'border-[#16834b] bg-[#e7f2ea] text-[#176b3a]' : 'border-[#e1e5e1] bg-white text-[#4a524c]'}`}
            >
              {valor === 'todos' ? 'Todos' : valor === 'activos' ? 'Activos' : 'Inactivos'}
            </button>
          ))}
        </div>
      </div>
      <p role="status" className="mb-3 text-[12px] text-[#5b635e]">
        {filtrados.length} de {empleados.length} empleados
      </p>
      {empleados.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay empleados registrados"
          description="Haz clic en 'Nuevo Empleado' para comenzar."
        />
      ) : (
        <>
          <ContenedorTabla
            etiqueta="Lista de empleados"
            reinicio={JSON.stringify([paginaActual, consulta, filtro, orden, ascendente])}
            className="rounded-2xl border border-[#e2e7e2] bg-white"
          >
            <table className="w-full min-w-[700px] text-left text-[13px]">
              <caption className="sr-only">Empleados registrados</caption>
              <thead>
                <tr className="border-b border-[#e2e7e2] bg-[#fafbfa] text-[11px] font-bold uppercase text-[#5b635e]">
                  {encabezado('id')}
                  {encabezado('nombre')}
                  {encabezado('cedula')}
                  <th scope="col" className="w-[150px] px-4 py-3">
                    Teléfono
                  </th>
                  {encabezado('estado')}
                  <th scope="col" className="px-4 py-3 text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-[#5b635e]">
                      Ningún empleado coincide con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  visibles.map((empleado) => (
                    <tr
                      key={empleado.id}
                      className="border-b border-[#eef1ee] last:border-0 hover:bg-[#fafbfa]"
                    >
                      <td className="px-4 py-3">{empleado.id}</td>
                      <td className="px-4 py-3 font-semibold">{empleado.nombre}</td>
                      <td className="px-4 py-3">{empleado.cedula || '—'}</td>
                      <td className="px-4 py-3">{empleado.telefono || '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${empleado.estado ? 'bg-[#e7f2ea] text-[#176b3a]' : 'bg-[#f2f3f2] text-[#5b635e]'}`}
                        >
                          {empleado.estado ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            title="Editar empleado"
                            aria-label={`Editar a ${empleado.nombre}`}
                            onClick={() => {
                              setEditando(empleado)
                              setModal(true)
                            }}
                            className="rounded-lg p-2 text-[#2b5f9e] hover:bg-[#eaf1fb]"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            title="Eliminar empleado"
                            aria-label={`Desactivar a ${empleado.nombre}`}
                            disabled={!empleado.estado}
                            onClick={() => setEliminando(empleado)}
                            className="rounded-lg p-2 text-[#b43830] hover:bg-[#fdf1f0] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ContenedorTabla>
          <nav
            aria-label="Paginación"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#5b635e]"
          >
            <span>
              15 por página · Página {paginaActual} de {paginas}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={paginaActual <= 1}
                onClick={() => setPagina(paginaActual - 1)}
                className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={paginaActual >= paginas}
                onClick={() => setPagina(paginaActual + 1)}
                className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </nav>
        </>
      )}
      {modal && (
        <EmpleadoFormModal
          empleado={editando}
          onCancelar={() => setModal(false)}
          onGuardado={() => {
            setModal(false)
            notificar(
              'exito',
              editando
                ? 'Empleado actualizado correctamente.'
                : 'Empleado registrado correctamente.'
            )
          }}
        />
      )}
      {eliminando && (
        <ModalAccesible
          tituloId="desactivar-empleado-titulo"
          onCerrar={() => setEliminando(null)}
          ancho="max-w-[440px]"
        >
          <h2 id="desactivar-empleado-titulo" className="mb-3 text-[16px] font-bold">
            ¿Eliminar empleado?
          </h2>
          <p className="text-[13px] leading-relaxed text-[#4a524c]">
            Esta acción desactivará al empleado «{eliminando.nombre}». No se eliminarán sus
            registros históricos en gastos.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              autoFocus
              onClick={() => setEliminando(null)}
              className="rounded-xl border px-4 py-2.5 text-[13px] font-semibold"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarDesactivacion}
              className="rounded-xl bg-[#b43830] px-4 py-2.5 text-[13px] font-semibold text-white"
            >
              Sí, desactivar
            </button>
          </div>
        </ModalAccesible>
      )}
    </section>
  )
}
