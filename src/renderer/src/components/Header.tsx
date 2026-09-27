import type {Page} from '../types'
import {useEffect,useRef,useState} from 'react'
import {Bell,UserRound,ChevronDown} from 'lucide-react'
import {useAppData} from '../store/AppDataContext'
import ModalAccesible from './ModalAccesible'
import CambiarPassword from './CambiarPassword'
export default function Header({onNavigate}:{onNavigate?:(page:Page)=>void}):React.JSX.Element{
 const {avisos,administrador,usuarioActual,leerAviso,cerrarSesion}=useAppData()
 const [panel,setPanel]=useState<'avisos'|'usuario'|null>(null),[salir,setSalir]=useState(false),[password,setPassword]=useState(false)
 const zona=useRef<HTMLDivElement>(null),campana=useRef<HTMLButtonElement>(null),usuario=useRef<HTMLButtonElement>(null)
 const pendientes=avisos.filter(n=>!n.leida).length
 useEffect(()=>{
  if(!panel)return
  const fuera=(e:PointerEvent):void=>{if(!zona.current?.contains(e.target as Node))setPanel(null)}
  const escape=(e:KeyboardEvent):void=>{if(e.key==='Escape'){setPanel(null);(panel==='avisos'?campana:usuario).current?.focus()}}
  document.addEventListener('pointerdown',fuera);document.addEventListener('keydown',escape)
  return ()=>{document.removeEventListener('pointerdown',fuera);document.removeEventListener('keydown',escape)}
 },[panel])
 return <header className="flex h-[76px] shrink-0 items-center justify-end gap-4 border-b border-[#e2e7e2] bg-white px-6">
  <div ref={zona} className="flex items-center gap-4">
   <div className="relative">
    <button ref={campana} type="button" aria-label={'Notificaciones ('+pendientes+' sin leer)'} aria-expanded={panel==='avisos'} aria-controls="avisos-panel" onClick={()=>setPanel(panel==='avisos'?null:'avisos')} className="relative rounded-full border p-3 text-[#69736d]">
     <Bell size={18}/>{pendientes>0&&<span className="absolute -right-1 -top-1 rounded-full bg-[#dc5c52] px-1.5 text-[10px] text-white">{pendientes}</span>}
    </button>
    {panel==='avisos'&&<section id="avisos-panel" aria-labelledby="avisos-titulo" className="absolute right-0 top-full z-50 mt-3 w-[390px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#e2e7e2] bg-white p-4 shadow-xl">
     <h2 id="avisos-titulo" className="mb-3 font-bold">Notificaciones</h2>
     <div className="max-h-[min(460px,65vh)] overflow-y-auto"><ul className="space-y-3">
      {!avisos.length&&<li className="text-sm">No hay notificaciones.</li>}
      {avisos.map(n=><li key={n.id} className={'rounded-xl border p-3 '+(n.leida?'bg-white':'bg-[#edf7ef]')}>
       <p className="text-sm font-semibold">{n.titulo}{!n.leida&&<span className="ml-2 text-xs text-[#16834b]">Sin leer</span>}</p><p className="my-1 text-sm">{n.mensaje}</p><p className="text-xs text-[#707972]">{new Date(n.fecha).toLocaleString('es-EC')}</p>
       {n.destino&&onNavigate&&<button type="button" className="mr-3 mt-2 text-xs text-[#16834b]" onClick={()=>{onNavigate(n.destino!);setPanel(null)}}>Ver módulo</button>}
       {!n.leida&&<button type="button" onClick={()=>void leerAviso(n.id)} className="mt-2 text-xs text-[#16834b]">Marcar como leída</button>}
      </li>)}
     </ul></div>
    </section>}
   </div>
   <div className="relative">
    <button ref={usuario} type="button" aria-label="Opciones de usuario" aria-expanded={panel==='usuario'} aria-controls="usuario-panel" onClick={()=>setPanel(panel==='usuario'?null:'usuario')} className="flex items-center gap-2 rounded-xl p-2 text-sm"><UserRound size={20} className="text-[#16834b]"/><span className="text-left"><span className="block font-semibold">{administrador}</span><span className="block text-[10px] text-[#8a938d]">{usuarioActual?.rol==='administrador'?'Administrador':'Operador'}</span></span><ChevronDown size={15}/></button>
    {panel==='usuario'&&<div id="usuario-panel" className="absolute right-0 top-full z-50 mt-3 w-56 rounded-xl border border-[#e2e7e2] bg-white p-2 shadow-xl">
     <button type="button" onClick={()=>{setPanel(null);setPassword(true)}} className="w-full rounded-lg p-3 text-left text-sm hover:bg-[#edf7ef]">Cambiar contraseña</button>
     <button type="button" onClick={()=>{setPanel(null);setSalir(true)}} className="w-full rounded-lg p-3 text-left text-sm hover:bg-[#edf7ef]">Cerrar sesión</button>
    </div>}
   </div>
  </div>
  {password&&<CambiarPassword onCerrar={()=>setPassword(false)}/>}
  {salir&&<ModalAccesible tituloId="salir-titulo" onCerrar={()=>setSalir(false)}><h2 id="salir-titulo" className="font-bold">¿Cerrar sesión?</h2><p className="my-4 text-sm">Se cerrará también la jornada activa. Los formularios sin guardar se descartarán.</p><div className="flex justify-end gap-3"><button onClick={()=>setSalir(false)} className="rounded-xl border p-3">Cancelar</button><button onClick={()=>void cerrarSesion().catch(()=>{})} className="rounded-xl bg-[#16834b] p-3 text-white">Cerrar sesión y jornada</button></div></ModalAccesible>}
 </header>
}
