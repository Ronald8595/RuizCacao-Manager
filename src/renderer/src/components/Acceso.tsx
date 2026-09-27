import logoGrupoRuiz from '../assets/brand/logo-grupo-ruiz.jpeg'
import { validarAcceso, type ErroresAcceso } from '../../../shared/validacionAcceso'
import { ErrorNegocio } from '../../../shared/errorNegocio'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { desenvolver } from '../store/AppDataContext'
import type { EstadoAcceso, EstadoAplicacion } from '../../../shared/persistencia'
async function consultarAcceso(): Promise<EstadoAcceso> {
  if (!window.api?.datos) throw new ErrorNegocio('Abre RuizCacao Manager desde su acceso directo.')
  return desenvolver(await window.api.datos.estado())
}
export default function Acceso({
  children
}: {
  children: (estado: EstadoAplicacion, onSalir: () => void) => ReactNode
}): React.JSX.Element {
  const [acceso, setAcceso] = useState<EstadoAcceso | null>(null)
  const [sesion, setSesion] = useState<EstadoAplicacion | null>(null)
  const [nombre, setNombre] = useState('')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [recuperar, setRecuperar] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [solicitud, setSolicitud] = useState('')
  const [copiada, setCopiada] = useState(false)
  const [errores, setErrores] = useState<ErroresAcceso>({})
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false)
  async function cargar(): Promise<void> {
    try {
      setAcceso(await consultarAcceso())
    } catch (e) {
      setError(e instanceof ErrorNegocio ? e.message : 'Error de conexión')
    }
  }
  useEffect(() => {
    let vigente = true
    void consultarAcceso()
      .then((estado) => {
        if (vigente) setAcceso(estado)
      })
      .catch((error) => {
        if (vigente)
          setError(error instanceof ErrorNegocio ? error.message : 'No se pudo iniciar el acceso.')
      })
    return () => {
      vigente = false
    }
  }, [])
  async function enviar(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (ocupado) return
    setError('')
    setMensaje('')
    const nuevos = validarAcceso({
      nombre,
      password,
      confirmar,
      codigo,
      modo: recuperar ? 'recuperar' : acceso?.administradorExiste ? 'ingresar' : 'crear'
    })
    setErrores(nuevos)
    if (Object.keys(nuevos).length) return
    setOcupado(true)
    try {
      if (!acceso?.configurada)
        throw new ErrorNegocio('El almacenamiento todavía no está disponible.')
      if (!acceso.administradorExiste || recuperar) {
        if (password !== confirmar) throw new ErrorNegocio('Las contraseñas no coinciden.')
        desenvolver(
          await (recuperar
            ? window.api.datos.recuperar(nombre, codigo, password)
            : window.api.datos.crearAdministrador(nombre, password))
        )
        if (recuperar)
          setMensaje('Contraseña restablecida correctamente. Ya puedes iniciar sesión.')
        setSolicitud('')
        setCodigo('')
        setPassword('')
        setConfirmar('')
        setRecuperar(false)
        await cargar()
        return
      }
      const estado = desenvolver(await window.api.datos.login(nombre, password))
      setPassword('')
      setSesion(estado)
    } catch (e) {
      setError(e instanceof ErrorNegocio ? e.message : 'No se pudo completar el acceso.')
    } finally {
      setOcupado(false)
    }
  }
  if (sesion)
    return (
      <>
        {children(sesion, () => {
          setSesion(null)
          setPassword('')
          void cargar()
        })}
      </>
    )
  const campo =
    'mt-1 w-full rounded-xl border border-[#dce5de] bg-white p-3 text-sm outline-none focus:border-[#16834b]'
  const campoPassword =
    'w-full rounded-xl border border-[#dce5de] bg-white p-3 pr-12 text-sm outline-none focus:border-[#16834b]'
  const crear = acceso?.configurada && !acceso.administradorExiste
  return (
    <main className="h-full overflow-y-auto bg-[#f5f7f4]">
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <section className="w-full max-w-md rounded-2xl border border-[#e2e7e2] bg-white p-5 shadow-sm sm:p-7">
          <img src={logoGrupoRuiz} alt="Grupo Ruiz" className="mb-3 h-20 w-20 object-contain" />
          <p className="text-xs font-bold uppercase tracking-widest text-[#b68b2c]">Grupo Ruiz</p>
          <h1 className="mt-2 text-2xl font-bold text-[#176b3a]">RuizCacao Manager</h1>
          {!acceso || acceso.error ? (
            <div className="mt-5">
              <p className="text-sm">{acceso?.error || error || 'Preparando RuizCacao Manager…'}</p>
              <button onClick={() => void cargar()} className="mt-4 rounded-xl border p-3">
                Reintentar conexión
              </button>
            </div>
          ) : (
            <form noValidate onSubmit={enviar} className="mt-5 space-y-4">
              <h2 className="font-semibold">
                {crear ? 'Crear usuario' : recuperar ? 'Recuperar acceso' : 'Iniciar sesión'}
              </h2>
              <label className="block text-sm">
                Usuario
                <input
                  required
                  autoComplete="username"
                  maxLength={80}
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value)
                    setErrores((prev) => ({ ...prev, nombre: undefined }))
                  }}
                  aria-invalid={!!errores.nombre}
                  aria-describedby={errores.nombre ? 'error-nombre' : undefined}
                  className={campo}
                />
                {errores.nombre && (
                  <span
                    id="error-nombre"
                    role="alert"
                    className="mt-1 block text-xs text-[#9d3029]"
                  >
                    {errores.nombre}
                  </span>
                )}
              </label>
              {recuperar && solicitud && (
                <label className="block text-sm">
                  Solicitud de recuperación
                  <textarea
                    readOnly
                    value={solicitud}
                    className={campo}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    className="block rounded-lg border px-3 py-2 text-sm"
                    onClick={async () => {
                      setError('')
                      const copiadaNativa = await window.api.copiarTexto(solicitud)
                      if (copiadaNativa) {
                        setCopiada(true)
                        return
                      }
                      setCopiada(false)
                      setError('No se pudo copiar la solicitud. Selecciona el texto y usa Ctrl+C.')
                    }}
                  >
                    {copiada ? 'Solicitud copiada' : 'Copiar solicitud'}
                  </button>
                  <span className="text-xs">
                    Copia esta solicitud y entrégala a soporte. Una solicitud nueva invalida la
                    anterior.
                  </span>
                </label>
              )}
              {recuperar && (
                <label className="block text-sm">
                  Autorización firmada
                  <input
                    required
                    autoComplete="off"
                    value={codigo}
                    onChange={(e) => {
                      setCodigo(e.target.value)
                      setErrores((prev) => ({ ...prev, codigo: undefined }))
                    }}
                    aria-invalid={!!errores.codigo}
                    aria-describedby={errores.codigo ? 'error-codigo' : undefined}
                    className={campo}
                  />
                  {errores.codigo && (
                    <span
                      id="error-codigo"
                      role="alert"
                      className="mt-1 block text-xs text-[#9d3029]"
                    >
                      {errores.codigo}
                    </span>
                  )}
                </label>
              )}
              <label className="block text-sm">
                {crear || recuperar ? 'Nueva contraseña (mínimo 12 caracteres)' : 'Contraseña'}
                <div className="relative mt-1">
                  <input
                    required
                    type={mostrarPassword ? 'text' : 'password'}
                    autoComplete={crear || recuperar ? 'new-password' : 'current-password'}
                    minLength={crear || recuperar ? 12 : undefined}
                    maxLength={128}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setErrores((prev) => ({ ...prev, password: undefined }))
                    }}
                    aria-invalid={!!errores.password}
                    aria-describedby={errores.password ? 'error-password' : undefined}
                    className={campoPassword}
                  />
                  <button
                    type="button"
                    aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={mostrarPassword}
                    onClick={() => setMostrarPassword((visible) => !visible)}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#657069]"
                  >
                    {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errores.password && (
                  <span
                    id="error-password"
                    role="alert"
                    className="mt-1 block text-xs text-[#9d3029]"
                  >
                    {errores.password}
                  </span>
                )}
              </label>
              {(crear || recuperar) && (
                <label className="block text-sm">
                  Confirmar contraseña
                  <div className="relative mt-1">
                    <input
                      required
                      type={mostrarConfirmar ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmar}
                      onChange={(e) => {
                        setConfirmar(e.target.value)
                        setErrores((prev) => ({ ...prev, confirmar: undefined }))
                      }}
                      aria-invalid={!!errores.confirmar}
                      aria-describedby={errores.confirmar ? 'error-confirmar' : undefined}
                      className={campoPassword}
                    />
                    <button
                      type="button"
                      aria-label={
                        mostrarConfirmar
                          ? 'Ocultar confirmación de contraseña'
                          : 'Mostrar confirmación de contraseña'
                      }
                      aria-pressed={mostrarConfirmar}
                      onClick={() => setMostrarConfirmar((visible) => !visible)}
                      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#657069]"
                    >
                      {mostrarConfirmar ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errores.confirmar && (
                    <span
                      id="error-confirmar"
                      role="alert"
                      className="mt-1 block text-xs text-[#9d3029]"
                    >
                      {errores.confirmar}
                    </span>
                  )}
                </label>
              )}

              {mensaje && (
                <p role="status" className="text-sm text-[#16834b]">
                  {mensaje}
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-[#9d3029]">
                  {error}
                </p>
              )}
              <button
                disabled={ocupado}
                type="submit"
                className="w-full rounded-xl bg-[#16834b] p-3 font-semibold text-white disabled:opacity-40"
              >
                {ocupado
                  ? 'Procesando…'
                  : crear
                    ? 'Crear usuario'
                    : recuperar
                      ? 'Restablecer contraseña'
                      : 'Ingresar'}
              </button>
              {acceso.administradorExiste && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!recuperar) {
                      if (!nombre.trim()) {
                        setErrores({ nombre: 'Escribe tu usuario para recuperar el acceso.' })
                        return
                      }
                      try {
                        const r = desenvolver(await window.api.datos.solicitarRecuperacion(nombre))
                        setSolicitud(r.solicitud)
                        setCopiada(false)
                      } catch (e) {
                        setError(
                          e instanceof ErrorNegocio ? e.message : 'No se pudo generar la solicitud.'
                        )
                        return
                      }
                    }
                    setRecuperar(!recuperar)
                    setError('')
                    setMensaje('')
                    setPassword('')
                    setConfirmar('')
                    setMostrarPassword(false)
                    setMostrarConfirmar(false)
                    setCodigo('')
                  }}
                  className="text-sm text-[#16834b]"
                >
                  {recuperar ? 'Volver a iniciar sesión' : '¿Olvidaste tu contraseña?'}
                </button>
              )}
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
