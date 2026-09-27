import { useState } from 'react'
import { Eye, EyeOff, KeyRound, UserPlus } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import ModalAccesible from '../components/ModalAccesible'
import { useAppData } from '../store/AppDataContext'
import { useNotificacion } from '../store/NotificacionContext'

const inputClass =
  'w-full rounded-xl border border-[#e1e5e1] px-3 py-2.5 text-[13px] outline-none focus:border-[#16834b]'

export default function Usuarios(): React.JSX.Element {
  const {
    usuarios,
    usuarioActual,
    crearUsuario,
    cambiarEstadoUsuario,
    restablecerPasswordUsuario
  } = useAppData()
  const { notificar } = useNotificacion()
  const [crearAbierto, setCrearAbierto] = useState(false)
  const [resetId, setResetId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [error, setError] = useState('')

  if (usuarioActual?.rol !== 'administrador')
    return (
      <section className="min-h-0 flex-1 overflow-y-auto p-6">
        <PageHeader
          greeting="Usuarios"
          subtitle="Solo el administrador puede gestionar las cuentas de acceso."
        />
      </section>
    )

  const resetearFormulario = (): void => {
    setNombre('')
    setPassword('')
    setConfirmar('')
    setMostrar(false)
    setError('')
  }

  const validarPassword = (): boolean => {
    if (password.length < 12 || password.length > 128) {
      setError('La contraseña debe tener entre 12 y 128 caracteres.')
      return false
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return false
    }
    return true
  }

  async function guardarNuevo(): Promise<void> {
    setError('')
    if (nombre.trim().length < 3 || nombre.trim().length > 80) {
      setError('El usuario debe tener entre 3 y 80 caracteres.')
      return
    }
    if (!validarPassword()) return
    try {
      await crearUsuario(nombre.trim(), password)
      setCrearAbierto(false)
      resetearFormulario()
      notificar('exito', 'Usuario creado correctamente.')
    } catch {
      // AppDataContext ya muestra el mensaje de negocio.
    }
  }

  async function restablecer(): Promise<void> {
    if (!resetId || !validarPassword()) return
    try {
      await restablecerPasswordUsuario(resetId, password)
      setResetId(null)
      resetearFormulario()
      notificar('exito', 'Contraseña del operador restablecida correctamente.')
    } catch {
      // AppDataContext ya muestra el mensaje de negocio.
    }
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">
      <PageHeader
        greeting="Usuarios"
        subtitle="Crea operadores y conserva la huella de quién registra cada operación."
        actions={
          <button
            type="button"
            onClick={() => {
              resetearFormulario()
              setCrearAbierto(true)
            }}
            className="flex items-center gap-2 rounded-xl bg-[#16834b] px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            <UserPlus size={17} />
            Nuevo usuario
          </button>
        }
      />

      <div className="overflow-x-auto rounded-2xl border border-[#e2e7e2] bg-white">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#e2e7e2] bg-[#fafbfa] text-[11px] font-bold uppercase tracking-wide text-[#8a938d]">
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Creado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id} className="border-b border-[#eef1ee] last:border-0">
                <td className="px-4 py-3 font-semibold text-[#2d332f]">
                  {usuario.nombre}
                  {usuario.principal && (
                    <span className="ml-2 rounded-full bg-[#edf6ef] px-2 py-1 text-[10px] text-[#16834b]">
                      Principal
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-[#5b635e]">
                  {usuario.rol === 'administrador' ? 'Administrador' : 'Operador'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={[
                      'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                      usuario.activo
                        ? 'bg-[#e7f2ea] text-[#176b3a]'
                        : 'bg-[#fdeeee] text-[#9d3029]'
                    ].join(' ')}
                  >
                    {usuario.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#5b635e]">
                  {new Date(usuario.creadoEn).toLocaleDateString('es-EC')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {!usuario.principal && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            resetearFormulario()
                            setResetId(usuario.id)
                          }}
                          className="rounded-lg border px-3 py-2 text-xs text-[#4f5852]"
                        >
                          Restablecer contraseña
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void cambiarEstadoUsuario(usuario.id, !usuario.activo)
                              .then(() =>
                                notificar(
                                  'exito',
                                  usuario.activo
                                    ? 'Usuario desactivado correctamente.'
                                    : 'Usuario activado correctamente.'
                                )
                              )
                              .catch(() => {})
                          }
                          className={[
                            'rounded-lg px-3 py-2 text-xs font-semibold',
                            usuario.activo
                              ? 'border border-[#e5b6b2] text-[#9d3029]'
                              : 'bg-[#16834b] text-white'
                          ].join(' ')}
                        >
                          {usuario.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {crearAbierto && (
        <ModalAccesible
          tituloId="crear-usuario-titulo"
          onCerrar={() => {
            setCrearAbierto(false)
            resetearFormulario()
          }}
        >
          <h2 id="crear-usuario-titulo" className="text-lg font-bold">
            Crear operador
          </h2>
          <p className="mt-1 text-sm text-[#707972]">
            El operador podrá usar los módulos comerciales y sus acciones quedarán registradas.
          </p>
          <label className="mt-5 block text-sm">
            Usuario
            <input
              value={nombre}
              maxLength={80}
              onChange={(e) => setNombre(e.target.value)}
              className={inputClass + ' mt-1'}
            />
          </label>
          <PasswordFields
            password={password}
            confirmar={confirmar}
            mostrar={mostrar}
            setPassword={setPassword}
            setConfirmar={setConfirmar}
            setMostrar={setMostrar}
          />
          {error && <p className="mt-3 text-sm text-[#9d3029]">{error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setCrearAbierto(false)
                resetearFormulario()
              }}
              className="rounded-xl border px-4 py-2.5"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void guardarNuevo()}
              className="rounded-xl bg-[#16834b] px-4 py-2.5 font-semibold text-white"
            >
              Crear usuario
            </button>
          </div>
        </ModalAccesible>
      )}

      {resetId && (
        <ModalAccesible
          tituloId="reset-usuario-titulo"
          onCerrar={() => {
            setResetId(null)
            resetearFormulario()
          }}
        >
          <h2 id="reset-usuario-titulo" className="flex items-center gap-2 text-lg font-bold">
            <KeyRound size={19} />
            Restablecer contraseña
          </h2>
          <p className="mt-2 text-sm text-[#707972]">
            Define una nueva contraseña para{' '}
            <strong>{usuarios.find((usuario) => usuario.id === resetId)?.nombre}</strong>.
          </p>
          <PasswordFields
            password={password}
            confirmar={confirmar}
            mostrar={mostrar}
            setPassword={setPassword}
            setConfirmar={setConfirmar}
            setMostrar={setMostrar}
          />
          {error && <p className="mt-3 text-sm text-[#9d3029]">{error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setResetId(null)
                resetearFormulario()
              }}
              className="rounded-xl border px-4 py-2.5"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void restablecer()}
              className="rounded-xl bg-[#16834b] px-4 py-2.5 font-semibold text-white"
            >
              Guardar contraseña
            </button>
          </div>
        </ModalAccesible>
      )}
    </section>
  )
}

function PasswordFields({
  password,
  confirmar,
  mostrar,
  setPassword,
  setConfirmar,
  setMostrar
}: {
  password: string
  confirmar: string
  mostrar: boolean
  setPassword: (value: string) => void
  setConfirmar: (value: string) => void
  setMostrar: (value: boolean) => void
}): React.JSX.Element {
  return (
    <>
      <label className="mt-4 block text-sm">
        Nueva contraseña
        <div className="relative mt-1">
          <input
            type={mostrar ? 'text' : 'password'}
            value={password}
            minLength={12}
            maxLength={128}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass + ' pr-12'}
          />
          <button
            type="button"
            aria-label={mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onClick={() => setMostrar(!mostrar)}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#657069]"
          >
            {mostrar ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>
      <label className="mt-4 block text-sm">
        Confirmar contraseña
        <input
          type={mostrar ? 'text' : 'password'}
          value={confirmar}
          maxLength={128}
          onChange={(e) => setConfirmar(e.target.value)}
          className={inputClass + ' mt-1'}
        />
      </label>
    </>
  )
}
