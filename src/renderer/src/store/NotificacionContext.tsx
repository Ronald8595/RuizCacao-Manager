import { createContext, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

// ============================================================
// Reemplazo de window.alert() por un modal propio de la app.
//
// Por qué: window.alert() es un diálogo NATIVO del sistema operativo. En
// Electron, su título no es el <title> de index.html ni algo que se pueda
// personalizar desde el renderer — toma el nombre interno de la app
// (por eso aparecía "electron-app" en vez de "RuizCacao Manager"). Tampoco
// se le puede agregar un ícono de éxito/advertencia distinto al genérico
// del sistema.
//
// Con este modal propio, controlamos el título, el color y el ícono según
// el tipo de mensaje, y queda consistente con el resto de la identidad
// visual (verde/cacao/dorado) en vez de verse como una ventana de Windows.
// ============================================================

export type TipoNotificacion = 'exito' | 'advertencia' | 'error'

interface NotificacionState {
  tipo: TipoNotificacion
  mensaje: string
}

interface NotificacionContextValue {
  notificar: (tipo: TipoNotificacion, mensaje: string) => void
}

const NotificacionContext = createContext<NotificacionContextValue | null>(null)

const ESTILO_POR_TIPO: Record<
  TipoNotificacion,
  { icon: typeof CheckCircle2; iconoClase: string; fondoIcono: string; titulo: string }
> = {
  exito: {
    icon: CheckCircle2,
    iconoClase: 'text-[#16834b]',
    fondoIcono: 'bg-[#edf6ef]',
    titulo: 'RuizCacao Manager'
  },
  advertencia: {
    icon: AlertTriangle,
    iconoClase: 'text-[#9c7a1f]',
    fondoIcono: 'bg-[#fff0c9]',
    titulo: 'RuizCacao Manager'
  },
  error: {
    icon: XCircle,
    iconoClase: 'text-[#d64545]',
    fondoIcono: 'bg-[#fdeeee]',
    titulo: 'RuizCacao Manager'
  }
}

export function NotificacionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [notificacion, setNotificacion] = useState<NotificacionState | null>(null)

  function notificar(tipo: TipoNotificacion, mensaje: string): void {
    setNotificacion({ tipo, mensaje })
  }

  const estilo = notificacion ? ESTILO_POR_TIPO[notificacion.tipo] : null
  const Icon = estilo?.icon

  return (
    <NotificacionContext.Provider value={{ notificar }}>
      {children}

      {notificacion && estilo && Icon && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${estilo.fondoIcono} ${estilo.iconoClase}`}>
                <Icon size={20} />
              </div>
              <p className="text-[13px] font-bold text-[#272c29]">{estilo.titulo}</p>
            </div>
            <p className="mb-5 text-[13px] leading-relaxed text-[#4c534e]">{notificacion.mensaje}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setNotificacion(null)}
                autoFocus
                className="rounded-xl bg-[#16834b] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#146b3e]"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificacionContext.Provider>
  )
}

export function useNotificacion(): NotificacionContextValue {
  const ctx = useContext(NotificacionContext)
  if (!ctx) throw new Error('useNotificacion debe usarse dentro de <NotificacionProvider>')
  return ctx
}
