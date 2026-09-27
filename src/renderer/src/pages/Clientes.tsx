import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Users, Truck, Plus, Search, Pencil, Trash2, X, AlertTriangle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { FormField, inputClass } from '../components/FormField'
import { useAppData } from '../store/AppDataContext'
import { useNotificacion } from '../store/NotificacionContext'
import type { Cliente, ClienteFormData, Proveedor, ProveedorFormData, TipoCliente } from '../types'

const TIPOS_CLIENTE: TipoCliente[] = ['Mayorista', 'Minorista', 'Intermediario']
const OPCIONES_POR_PAGINA = [10, 25, 50, 100] as const

const FORM_CLIENTE_VACIO: ClienteFormData = {
  nombreRazonSocial: '',
  identificacion: '',
  telefono: '',
  email: '',
  direccion: '',
  tipoCliente: undefined,
  notas: ''
}

const FORM_PROVEEDOR_VACIO: ProveedorFormData = {
  nombre: '',
  ciRuc: '',
  telefono: '',
  correo: '',
  numeroCuenta: '',
  direccion: '',
  estado: true
}

type ErroresCliente = Partial<Record<keyof ClienteFormData, string>>
type ErroresProveedor = Partial<Record<keyof ProveedorFormData, string>>

function validarCliente(form: ClienteFormData, clientes: Cliente[], idActual: string | null): ErroresCliente {
  const errores: ErroresCliente = {}
  if (!form.nombreRazonSocial.trim()) errores.nombreRazonSocial = 'El nombre / razón social es obligatorio.'
  else if (form.nombreRazonSocial.length > 100) errores.nombreRazonSocial = 'Máximo 100 caracteres.'

  if (form.identificacion.trim()) {
    if (form.identificacion.length > 15) errores.identificacion = 'Máximo 15 caracteres.'
    else if (clientes.some((c) => c.identificacion === form.identificacion.trim() && c.id !== idActual)) errores.identificacion = 'Ya existe un cliente con esta identificación.'
  }

  if (form.telefono.trim()) {
    if (form.telefono.length > 15) errores.telefono = 'Máximo 15 caracteres.'
    else if (!/^[0-9+\-\s()]+$/.test(form.telefono)) errores.telefono = 'Formato de teléfono no válido.'
  }

  if (form.email?.trim()) {
    if (form.email.length > 80) errores.email = 'Máximo 80 caracteres.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errores.email = 'Correo no válido.'
  }
  if (form.direccion && form.direccion.length > 200) errores.direccion = 'Máximo 200 caracteres.'
  return errores
}

function validarProveedor(form: ProveedorFormData, proveedores: Proveedor[], idActual: string | null): ErroresProveedor {
  const errores: ErroresProveedor = {}
  if (!form.nombre.trim()) errores.nombre = 'El nombre / razón social es obligatorio.'
  if (form.ciRuc.trim()) {
    if (!/^\d{10}$|^\d{13}$/.test(form.ciRuc.trim())) errores.ciRuc = 'Debe tener 10 dígitos (CI) o 13 dígitos (RUC).'
    else if (proveedores.some((p) => p.ciRuc === form.ciRuc.trim() && p.id !== idActual)) errores.ciRuc = 'Ya existe un proveedor con esta CI/RUC.'
  }
  if (form.correo?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo)) errores.correo = 'Correo no válido.'
  return errores
}

export function ClienteFormModal({ clienteEditando, clientes, onGuardar, onCancelar }: { clienteEditando: Cliente | null; clientes: Cliente[]; onGuardar: (data: ClienteFormData, idActual: string | null) => void; onCancelar: () => void }): React.JSX.Element {
  const [form, setForm] = useState<ClienteFormData>(clienteEditando ? {
    nombreRazonSocial: clienteEditando.nombreRazonSocial,
    identificacion: clienteEditando.identificacion,
    telefono: clienteEditando.telefono,
    email: clienteEditando.email ?? '',
    direccion: clienteEditando.direccion ?? '',
    tipoCliente: clienteEditando.tipoCliente,
    notas: clienteEditando.notas ?? ''
  } : FORM_CLIENTE_VACIO)
  const [errores, setErrores] = useState<ErroresCliente>({})

  function actualizar<K extends keyof ClienteFormData>(campo: K, valor: ClienteFormData[K]): void { setForm((prev) => ({ ...prev, [campo]: valor })) }
  async function handleSubmit(e: FormEvent): Promise<void> {
 try {

    e.preventDefault()
    const idActual = clienteEditando?.id ?? null
    const nuevos = validarCliente(form, clientes, idActual)
    setErrores(nuevos)
    if (Object.keys(nuevos).length === 0) await onGuardar(form, idActual)
  
 } catch { return }
}
  function handleKeyDown(e: KeyboardEvent<HTMLFormElement>): void {
    if (e.key === 'Escape') { e.preventDefault(); onCancelar() }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleSubmit(e as unknown as FormEvent) }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div className="w-full max-w-[560px] rounded-2xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-[16px] font-bold text-[#272c29]">{clienteEditando ? 'Editar cliente' : 'Nuevo cliente'}</h2><button type="button" onClick={onCancelar} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#f0f4f0]" aria-label="Cerrar"><X size={18} /></button></div><form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-4">
    <FormField label="Nombre / Razón social" error={errores.nombreRazonSocial} obligatorio><input autoFocus maxLength={100} value={form.nombreRazonSocial} onChange={(e) => actualizar('nombreRazonSocial', e.target.value)} className={inputClass(!!errores.nombreRazonSocial)} /></FormField>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FormField label="Identificación (CI/RUC)" error={errores.identificacion}><input maxLength={15} value={form.identificacion} onChange={(e) => actualizar('identificacion', e.target.value)} className={inputClass(!!errores.identificacion)} placeholder="Opcional" /></FormField><FormField label="Teléfono" error={errores.telefono}><input maxLength={15} value={form.telefono} onChange={(e) => actualizar('telefono', e.target.value)} className={inputClass(!!errores.telefono)} placeholder="Opcional" /></FormField></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FormField label="Correo electrónico" error={errores.email}><input type="email" maxLength={80} value={form.email ?? ''} onChange={(e) => actualizar('email', e.target.value)} className={inputClass(!!errores.email)} /></FormField><FormField label="Tipo de cliente"><select value={form.tipoCliente ?? ''} onChange={(e) => actualizar('tipoCliente', (e.target.value || undefined) as TipoCliente | undefined)} className={inputClass(false)}><option value="">Sin especificar</option>{TIPOS_CLIENTE.map((t) => <option key={t}>{t}</option>)}</select></FormField></div>
    <FormField label="Dirección" error={errores.direccion}><input maxLength={200} value={form.direccion ?? ''} onChange={(e) => actualizar('direccion', e.target.value)} className={inputClass(!!errores.direccion)} /></FormField>
    <FormField label="Notas"><textarea value={form.notas ?? ''} onChange={(e) => actualizar('notas', e.target.value)} rows={3} className={inputClass(false) + ' resize-none'} /></FormField>
    <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onCancelar} className="rounded-xl border border-[#e1e5e1] px-4 py-2.5 text-[13px] font-semibold text-[#5b635e]">Cancelar</button><button type="submit" className="rounded-xl bg-[#16834b] px-5 py-2.5 text-[13px] font-semibold text-white">Guardar</button></div>
  </form></div></div>
}

function ProveedorFormModal({ proveedorEditando, proveedores, onGuardar, onCancelar }: { proveedorEditando: Proveedor | null; proveedores: Proveedor[]; onGuardar: (data: ProveedorFormData, idActual: string | null) => void; onCancelar: () => void }): React.JSX.Element {
  const [form, setForm] = useState<ProveedorFormData>(proveedorEditando ? {
    nombre: proveedorEditando.nombre,
    ciRuc: proveedorEditando.ciRuc,
    telefono: proveedorEditando.telefono ?? '',
    correo: proveedorEditando.correo ?? '',
    numeroCuenta: proveedorEditando.numeroCuenta ?? '',
    direccion: proveedorEditando.direccion ?? '',
    estado: proveedorEditando.estado
  } : FORM_PROVEEDOR_VACIO)
  const [errores, setErrores] = useState<ErroresProveedor>({})

  function actualizar<K extends keyof ProveedorFormData>(campo: K, valor: ProveedorFormData[K]): void { setForm((prev) => ({ ...prev, [campo]: valor })) }
  async function submit(e: FormEvent): Promise<void> {
 try {

    e.preventDefault()
    const id = proveedorEditando?.id ?? null
    const nuevos = validarProveedor(form, proveedores, id)
    setErrores(nuevos)
    if (Object.keys(nuevos).length === 0) await onGuardar(form, id)
  
 } catch { return }
}

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div className="w-full max-w-[600px] rounded-2xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-[16px] font-bold text-[#272c29]">{proveedorEditando ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h2><button type="button" onClick={onCancelar}><X size={18} /></button></div><form onSubmit={submit} className="space-y-4">
    <FormField label="Nombre completo / Razón social" error={errores.nombre} obligatorio><input autoFocus maxLength={100} value={form.nombre} onChange={(e) => actualizar('nombre', e.target.value)} className={inputClass(!!errores.nombre)} /></FormField>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FormField label="CI / RUC" error={errores.ciRuc}><input maxLength={13} value={form.ciRuc} onChange={(e) => actualizar('ciRuc', e.target.value.replace(/\D/g, ''))} className={inputClass(!!errores.ciRuc)} placeholder="Opcional" /></FormField><FormField label="Teléfono"><input maxLength={20} value={form.telefono ?? ''} onChange={(e) => actualizar('telefono', e.target.value)} className={inputClass(false)} /></FormField></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FormField label="Correo electrónico" error={errores.correo}><input type="email" maxLength={100} value={form.correo ?? ''} onChange={(e) => actualizar('correo', e.target.value)} className={inputClass(!!errores.correo)} /></FormField><FormField label="Número de cuenta"><input maxLength={30} value={form.numeroCuenta ?? ''} onChange={(e) => actualizar('numeroCuenta', e.target.value)} className={inputClass(false)} /></FormField></div>
    <FormField label="Dirección"><textarea rows={2} maxLength={200} value={form.direccion ?? ''} onChange={(e) => actualizar('direccion', e.target.value)} className={inputClass(false) + ' resize-none'} /></FormField>
    <label className="flex items-center gap-2 text-[13px] text-[#5b635e]"><input type="checkbox" checked={form.estado} onChange={(e) => actualizar('estado', e.target.checked)} />Proveedor activo</label>
    <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onCancelar} className="rounded-xl border border-[#e1e5e1] px-4 py-2.5 text-[13px] font-semibold text-[#5b635e]">Cancelar</button><button type="submit" className="rounded-xl bg-[#16834b] px-5 py-2.5 text-[13px] font-semibold text-white">Guardar</button></div>
  </form></div></div>
}

function Clientes(): React.JSX.Element {
  const {
    clientes,
    crearCliente,
    actualizarCliente,
    desactivarCliente,
    proveedores,
    crearProveedor,
    actualizarProveedor,
    desactivarProveedor
  } = useAppData()
  const { notificar } = useNotificacion()

  const [vista, setVista] = useState<'clientes' | 'proveedores'>('clientes')
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<TipoCliente | 'Todos'>('Todos')
  const [mostrarInactivos, setMostrarInactivos] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState<(typeof OPCIONES_POR_PAGINA)[number]>(10)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null)
  const [clienteAEliminar, setClienteAEliminar] = useState<Cliente | null>(null)

  const [busquedaProveedor, setBusquedaProveedor] = useState('')
  const [modalProveedor, setModalProveedor] = useState(false)
  const [proveedorEditando, setProveedorEditando] = useState<Proveedor | null>(null)
  const [proveedorAEliminar, setProveedorAEliminar] = useState<Proveedor | null>(null)

  const clientesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return clientes.filter((c) => {
      if (!mostrarInactivos && !c.estado) return false
      if (filtroTipo !== 'Todos' && c.tipoCliente !== filtroTipo) return false
      return !q || c.nombreRazonSocial.toLowerCase().includes(q) || c.identificacion.toLowerCase().includes(q)
    })
  }, [clientes, busqueda, filtroTipo, mostrarInactivos])

  const proveedoresFiltrados = useMemo(() => {
    const q = busquedaProveedor.trim().toLowerCase()
    return proveedores.filter((p) => !q || [p.nombre, p.ciRuc, p.telefono, p.correo, p.numeroCuenta].some((v) => String(v ?? '').toLowerCase().includes(q)))
  }, [proveedores, busquedaProveedor])

  const totalPaginas = Math.max(1, Math.ceil(clientesFiltrados.length / porPagina))
  const paginaSegura = Math.min(pagina, totalPaginas)
  const clientesPagina = clientesFiltrados.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina)

  function limpiarCliente(data: ClienteFormData): ClienteFormData { return { ...data, nombreRazonSocial: data.nombreRazonSocial.trim(), identificacion: data.identificacion.trim(), telefono: data.telefono.trim(), email: data.email?.trim() || undefined, direccion: data.direccion?.trim() || undefined, notas: data.notas?.trim() || undefined } }
  async function guardarCliente(data: ClienteFormData, id: string | null): Promise<void> {
 try {

    const limpio = limpiarCliente(data)
    if (id) {
      await actualizarCliente(id, limpio)
      notificar('exito', 'Cliente actualizado con éxito.')
    } else {
      await crearCliente(limpio)
      notificar('exito', 'Cliente registrado con éxito.')
    }
    setModalAbierto(false)
    setClienteEditando(null)
  
 } catch { return }
}
  async function guardarProveedor(data: ProveedorFormData, id: string | null): Promise<void> {
 try {

    const limpio: ProveedorFormData = { ...data, nombre: data.nombre.trim(), ciRuc: data.ciRuc.trim(), telefono: data.telefono?.trim() || undefined, correo: data.correo?.trim() || undefined, numeroCuenta: data.numeroCuenta?.trim() || undefined, direccion: data.direccion?.trim() || undefined }
    if (id) {
      await actualizarProveedor(id, limpio)
      notificar('exito', 'Proveedor actualizado con éxito.')
    } else {
      await crearProveedor(limpio)
      notificar('exito', 'Proveedor registrado con éxito.')
    }
    setModalProveedor(false)
    setProveedorEditando(null)
  
 } catch { return }
}

  return <section className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 lg:p-7">
    <PageHeader greeting={vista === 'clientes' ? 'Clientes' : 'Proveedores'} subtitle={vista === 'clientes' ? 'Registro y gestión de clientes.' : 'Registro de proveedores de Grupo Ruiz.'} actions={vista === 'clientes' ? <button type="button" onClick={() => { setClienteEditando(null); setModalAbierto(true) }} className="flex items-center gap-2 rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white"><Plus size={16} />Nuevo cliente</button> : <button type="button" onClick={() => { setProveedorEditando(null); setModalProveedor(true) }} className="flex items-center gap-2 rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white"><Plus size={16} />Nuevo Proveedor</button>} />

    <div className="mb-5 flex gap-2 border-b border-[#e2e7e2]"><button type="button" onClick={() => setVista('clientes')} className={['flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-semibold', vista === 'clientes' ? 'border-[#16834b] text-[#16834b]' : 'border-transparent text-[#8a938d]'].join(' ')}><Users size={15} />Clientes</button><button type="button" onClick={() => setVista('proveedores')} className={['flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-semibold', vista === 'proveedores' ? 'border-[#16834b] text-[#16834b]' : 'border-transparent text-[#8a938d]'].join(' ')}><Truck size={15} />Proveedores</button></div>

    {vista === 'clientes' ? <>
      {clientes.length === 0 ? <EmptyState icon={Users} title="Todavía no hay clientes registrados" description="Usa el botón 'Nuevo cliente' para registrar el primero." /> : <>
        <div className="mb-4 flex flex-wrap items-center gap-3"><div className="flex h-10 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[#929a95]"><Search size={16} /><input value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(1) }} placeholder="Buscar por nombre o identificación..." className="w-full bg-transparent text-[13px] outline-none" /></div><select value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value as TipoCliente | 'Todos'); setPagina(1) }} className="h-10 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[13px]"><option value="Todos">Todos los tipos</option>{TIPOS_CLIENTE.map((t) => <option key={t}>{t}</option>)}</select><label className="flex h-10 items-center gap-2 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[12px]"><input type="checkbox" checked={mostrarInactivos} onChange={(e) => { setMostrarInactivos(e.target.checked); setPagina(1) }} />Mostrar inactivos</label></div>
        <div className="overflow-x-auto rounded-2xl border border-[#e2e7e2] bg-white"><table className="w-full min-w-[760px] text-left text-[13px]"><thead><tr className="border-b border-[#e2e7e2] bg-[#fafbfa] text-[11px] font-bold uppercase tracking-wide text-[#8a938d]"><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Identificación</th><th className="px-4 py-3">Teléfono</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead><tbody>{clientesPagina.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-[12px] text-[#a3aaa5]">Ningún cliente coincide con la búsqueda.</td></tr> : clientesPagina.map((c) => <tr key={c.id} className="border-b border-[#eef1ee] last:border-0 hover:bg-[#fafbfa]"><td className="px-4 py-3 font-medium">{c.nombreRazonSocial}</td><td className="px-4 py-3 text-[#5b635e]">{c.identificacion || '—'}</td><td className="px-4 py-3 text-[#5b635e]">{c.telefono || '—'}</td><td className="px-4 py-3 text-[#5b635e]">{c.tipoCliente ?? '—'}</td><td className="px-4 py-3"><span className={['rounded-full px-2.5 py-1 text-[11px] font-semibold', c.estado ? 'bg-[#e7f2ea] text-[#176b3a]' : 'bg-[#f2f3f2] text-[#8a938d]'].join(' ')}>{c.estado ? 'Activo' : 'Inactivo'}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" title="Editar" onClick={() => { setClienteEditando(c); setModalAbierto(true) }} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#f0f4f0] hover:text-[#16834b]"><Pencil size={15} /></button>{c.estado && <button type="button" title="Eliminar" onClick={() => setClienteAEliminar(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#fdf1f0] hover:text-[#dc5c52]"><Trash2 size={15} /></button>}</div></td></tr>)}</tbody></table></div>
        <div className="mt-4 flex items-center justify-between text-[12px] text-[#8a938d]"><div className="flex items-center gap-2"><span>Mostrar</span><select value={porPagina} onChange={(e) => { setPorPagina(Number(e.target.value) as (typeof OPCIONES_POR_PAGINA)[number]); setPagina(1) }} className="rounded-lg border border-[#e1e5e1] bg-white px-2 py-1">{OPCIONES_POR_PAGINA.map((n) => <option key={n}>{n}</option>)}</select><span>de {clientesFiltrados.length} registros</span></div><div className="flex items-center gap-2"><button disabled={paginaSegura <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} className="rounded-lg border border-[#e1e5e1] bg-white px-3 py-1.5 font-semibold disabled:opacity-40">Anterior</button><span>Página {paginaSegura} de {totalPaginas}</span><button disabled={paginaSegura >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} className="rounded-lg border border-[#e1e5e1] bg-white px-3 py-1.5 font-semibold disabled:opacity-40">Siguiente</button></div></div>
      </>}
    </> : <>
      <div className="mb-4 flex h-10 items-center gap-2 rounded-xl border border-[#e1e5e1] bg-white px-3 text-[#929a95]"><Search size={16} /><input value={busquedaProveedor} onChange={(e) => setBusquedaProveedor(e.target.value)} placeholder="Buscar por nombre, CI/RUC, teléfono..." className="w-full bg-transparent text-[13px] outline-none" /></div>
      {proveedores.length === 0 ? <EmptyState icon={Truck} title="Todavía no hay proveedores registrados" description="Registra proveedores para seleccionarlos desde las compras de Stock." /> : <div className="overflow-x-auto rounded-2xl border border-[#e2e7e2] bg-white"><table className="w-full min-w-[980px] text-left text-[13px]"><thead><tr className="border-b border-[#e2e7e2] bg-[#fafbfa] text-[11px] font-bold uppercase tracking-wide text-[#8a938d]"><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">CI / RUC</th><th className="px-4 py-3">Teléfono</th><th className="px-4 py-3">Correo</th><th className="px-4 py-3">N° Cuenta</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead><tbody>{proveedoresFiltrados.map((p) => <tr key={p.id} className="border-b border-[#eef1ee] last:border-0 hover:bg-[#fafbfa]"><td className="px-4 py-3 font-medium">{p.nombre}</td><td className="px-4 py-3 text-[#5b635e]">{p.ciRuc || '—'}</td><td className="px-4 py-3 text-[#5b635e]">{p.telefono || '—'}</td><td className="px-4 py-3 text-[#5b635e]">{p.correo || '—'}</td><td className="px-4 py-3 text-[#5b635e]">{p.numeroCuenta || '—'}</td><td className="px-4 py-3"><span className={['rounded-full px-2.5 py-1 text-[11px] font-semibold', p.estado ? 'bg-[#e7f2ea] text-[#176b3a]' : 'bg-[#f2f3f2] text-[#8a938d]'].join(' ')}>{p.estado ? 'Activo' : 'Inactivo'}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" title="Editar" onClick={() => { setProveedorEditando(p); setModalProveedor(true) }} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#f0f4f0] hover:text-[#16834b]"><Pencil size={15} /></button>{p.estado && <button type="button" title="Eliminar" onClick={() => setProveedorAEliminar(p)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a938d] hover:bg-[#fdf1f0] hover:text-[#dc5c52]"><Trash2 size={15} /></button>}</div></td></tr>)}</tbody></table></div>}
    </>}

    {modalAbierto && <ClienteFormModal clienteEditando={clienteEditando} clientes={clientes} onGuardar={guardarCliente} onCancelar={() => { setModalAbierto(false); setClienteEditando(null) }} />}
    {modalProveedor && <ProveedorFormModal proveedorEditando={proveedorEditando} proveedores={proveedores} onGuardar={guardarProveedor} onCancelar={() => { setModalProveedor(false); setProveedorEditando(null) }} />}
    {clienteAEliminar && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-xl"><div className="mb-4 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fdf1f0] text-[#dc5c52]"><AlertTriangle size={20} /></div><h2 className="font-bold">¿Eliminar cliente?</h2></div><p className="mb-5 text-[13px] text-[#69716b]">Se marcará a <strong>{clienteAEliminar.nombreRazonSocial}</strong> como inactivo.</p><div className="flex justify-end gap-3"><button onClick={() => setClienteAEliminar(null)} className="rounded-xl border px-4 py-2.5 text-[13px]">Cancelar</button><button onClick={async () => {
 try {
 await desactivarCliente(clienteAEliminar.id); setClienteAEliminar(null) 
 } catch { return }
}} className="rounded-xl bg-[#dc5c52] px-4 py-2.5 text-[13px] font-semibold text-white">Sí, eliminar</button></div></div></div>}
    {proveedorAEliminar && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-xl"><div className="mb-4 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fdf1f0] text-[#dc5c52]"><AlertTriangle size={20} /></div><h2 className="font-bold">¿Eliminar proveedor?</h2></div><p className="mb-5 text-[13px] text-[#69716b]">Esta acción desactivará a <strong>{proveedorAEliminar.nombre}</strong>. Sus compras y saldos históricos se conservan.</p><div className="flex justify-end gap-3"><button onClick={() => setProveedorAEliminar(null)} className="rounded-xl border px-4 py-2.5 text-[13px]">Cancelar</button><button onClick={async () => {
 try {
 await desactivarProveedor(proveedorAEliminar.id); setProveedorAEliminar(null) 
 } catch { return }
}} className="rounded-xl bg-[#dc5c52] px-4 py-2.5 text-[13px] font-semibold text-white">Sí, eliminar</button></div></div></div>}
  </section>
}

export default Clientes
