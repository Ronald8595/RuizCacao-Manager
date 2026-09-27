import {useState,type FormEvent} from 'react'
import {Eye,EyeOff} from 'lucide-react'
import {ErrorNegocio} from '../../../shared/errorNegocio'
import {validarAcceso,type ErroresAcceso} from '../../../shared/validacionAcceso'
import {useAppData} from '../store/AppDataContext'
import {useNotificacion} from '../store/NotificacionContext'
import ModalAccesible from './ModalAccesible'
export default function CambiarPassword({onCerrar}:{onCerrar:()=>void}):React.JSX.Element{
 const {administrador,cambiarPassword}=useAppData(),{notificar}=useNotificacion()
 const [actual,setActual]=useState(''),[nueva,setNueva]=useState(''),[confirmar,setConfirmar]=useState(''),[error,setError]=useState(''),[ocupado,setOcupado]=useState(false)
 const [verActual,setVerActual]=useState(false),[verNueva,setVerNueva]=useState(false),[verConfirmar,setVerConfirmar]=useState(false)
 const [errores,setErrores]=useState<ErroresAcceso & {actual?:string}>({})
 async function guardar(event:FormEvent):Promise<void>{
  event.preventDefault();if(ocupado)return
  const campos={...validarAcceso({nombre:administrador,password:nueva,confirmar,codigo:'',modo:'crear'}),...(!actual?{actual:'Escribe tu contraseña actual.'}:{})}
  setErrores(campos);setError('');if(Object.keys(campos).length)return
  setOcupado(true)
  try{await cambiarPassword(actual,nueva);setActual('');setNueva('');setConfirmar('');notificar('exito','Contraseña actualizada.');onCerrar()}catch(e){setError(e instanceof ErrorNegocio?e.message:'No se pudo cambiar la contraseña.')}finally{setOcupado(false)}
 }
 const clase='w-full rounded-xl border border-[#dce5de] p-3 pr-12 text-sm'
 const campoPassword=(etiqueta:string,valor:string,setValor:(valor:string)=>void,visible:boolean,setVisible:(valor:boolean)=>void,autoComplete:string,autofocus=false):React.JSX.Element=><div className="relative mt-1"><input data-autofocus={autofocus||undefined} type={visible?'text':'password'} autoComplete={autoComplete} maxLength={128} value={valor} onChange={e=>setValor(e.target.value)} className={clase}/><button type="button" aria-label={visible?`Ocultar ${etiqueta}`:`Mostrar ${etiqueta}`} aria-pressed={visible} onClick={()=>setVisible(!visible)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#657069]">{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
 return <ModalAccesible tituloId="cambiar-password-titulo" onCerrar={()=>{if(!ocupado)onCerrar()}} ancho="max-w-md">
  <h2 id="cambiar-password-titulo" className="font-bold">Cambiar contraseña</h2>
  <form noValidate onSubmit={guardar} className="mt-4 space-y-4">
   <label className="block text-sm">Contraseña actual{campoPassword('contraseña actual',actual,setActual,verActual,setVerActual,'current-password',true)}{errores.actual&&<span role="alert" className="text-xs text-[#9d3029]">{errores.actual}</span>}</label>
   <label className="block text-sm">Nueva contraseña{campoPassword('nueva contraseña',nueva,setNueva,verNueva,setVerNueva,'new-password')}{errores.password&&<span role="alert" className="text-xs text-[#9d3029]">{errores.password}</span>}</label>
   <label className="block text-sm">Confirmar nueva contraseña{campoPassword('confirmación de contraseña',confirmar,setConfirmar,verConfirmar,setVerConfirmar,'new-password')}{errores.confirmar&&<span role="alert" className="text-xs text-[#9d3029]">{errores.confirmar}</span>}</label>
   <p className="text-xs text-[#707972]">Usa entre 12 y 128 caracteres.</p>
   {error&&<p role="alert" className="text-sm text-[#9d3029]">{error}</p>}
   <div className="flex justify-end gap-3"><button type="button" disabled={ocupado} onClick={onCerrar} className="rounded-xl border p-3">Cancelar</button><button type="submit" disabled={ocupado} className="rounded-xl bg-[#16834b] p-3 text-white">Guardar contraseña</button></div>
  </form>
 </ModalAccesible>
}
