import { ErrorNegocio } from '../../../shared/errorNegocio'
/* eslint-disable react-refresh/only-export-components -- El contexto mantiene su API pública de hooks y catálogos; HMR puede recargar sus consumidores. */
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { crearDominio, type AppDataContextValue } from '../../../shared/dominio'
import {
  comandos,
  type Comando,
  type EstadoAplicacion,
  type Respuesta,
  type StockInicialInput
} from '../../../shared/persistencia'
export {
  PRODUCTOS,
  FACTORES_CONVERSION,
  CATEGORIAS_GASTO,
  CATEGORIAS_GASTO_MANUAL,
  saldoDeCuenta,
  tipoSaldoDeCuenta
} from '../../../shared/dominio'
type Acciones = {
  [K in Comando]: (
    ...args: Parameters<AppDataContextValue[K]>
  ) => Promise<ReturnType<AppDataContextValue[K]>>
}
type Contexto = Omit<AppDataContextValue, Comando | 'iniciarJornada' | 'finalizarJornada'> &
  Acciones & {
    anularOperacion: (
      solicitud: string,
      tipo: 'compra' | 'venta',
      id: string,
      motivo: string,
      password: string
    ) => Promise<void>
    avisos: EstadoAplicacion['avisos']
    administrador: string
    usuarioActual: EstadoAplicacion['usuarioActual']
    usuarios: EstadoAplicacion['usuarios']
    umbralesStock: EstadoAplicacion['umbralesStock']
    stockInicialRegistrado: boolean
    stockInicialRegistradoEn: string | null
    configurarUmbralStock: (producto: string, valor: number | null) => Promise<void>
    registrarStockInicial: (input: StockInicialInput) => Promise<void>
    gestionarJornada: (accion: 'abrir' | 'cerrar' | 'reabrir', password?: string) => Promise<void>
    leerAviso: (id: string) => Promise<void>
    cambiarPassword: (actual: string, nueva: string) => Promise<void>
    crearUsuario: (nombre: string, password: string) => Promise<void>
    cambiarEstadoUsuario: (id: string, activo: boolean) => Promise<void>
    restablecerPasswordUsuario: (id: string, nueva: string) => Promise<void>
    cerrarSesion: () => Promise<void>
  }
const AppDataContext = createContext<Contexto | null>(null)
export function desenvolver<T>(respuesta: Respuesta<T>): T {
  if (!respuesta.ok) throw new ErrorNegocio(respuesta.error)
  return respuesta.valor
}
export function AppDataProvider({
  children,
  inicial,
  onSalir
}: {
  children: ReactNode
  inicial: EstadoAplicacion
  onSalir: () => void
}): React.JSX.Element {
  const [estado, setEstado] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const ocupado = useRef(false)
  const pendiente = useRef<{ firma: string; id: string } | null>(null)
  const dominio = useMemo(() => crearDominio(estado.datos).value, [estado])
  async function proteger<T>(fn: () => Promise<T>): Promise<T> {
    if (ocupado.current) throw new ErrorNegocio('Espera a que termine la operación anterior.')
    ocupado.current = true
    setGuardando(true)
    setError('')
    try {
      return await fn()
    } catch (cause) {
      setError(cause instanceof ErrorNegocio ? cause.message : 'No se pudo guardar.')
      throw cause
    } finally {
      ocupado.current = false
      setGuardando(false)
    }
  }
  async function ejecutar(comando: Comando, args: unknown[]): Promise<unknown> {
    return proteger(async () => {
      const firma = JSON.stringify({ comando, args })
      const id = pendiente.current?.firma === firma ? pendiente.current.id : crypto.randomUUID()
      pendiente.current = { firma, id }
      const respuesta = desenvolver(await window.api.datos.ejecutar(id, comando, args))
      setEstado(respuesta.estado)
      pendiente.current = null
      return respuesta.resultado
    })
  }
  const acciones = Object.fromEntries(
    comandos.map((comando) => [comando, (...args: unknown[]) => ejecutar(comando, args)])
  ) as Acciones
  const value: Contexto = {
    ...dominio,
    ...acciones,
    anularOperacion: (...args) =>
      proteger(async () => {
        setEstado(desenvolver(await window.api.datos.anularOperacion(...args)))
      }),
    avisos: estado.avisos,
    administrador: estado.administrador,
    usuarioActual: estado.usuarioActual,
    usuarios: estado.usuarios,
    umbralesStock: estado.umbralesStock,
    stockInicialRegistrado: estado.stockInicialRegistrado,
    stockInicialRegistradoEn: estado.stockInicialRegistradoEn,
    configurarUmbralStock: (producto, valor) =>
      proteger(async () =>
        setEstado(desenvolver(await window.api.datos.configurarUmbralStock(producto, valor)))
      ),
    registrarStockInicial: (input) =>
      proteger(async () =>
        setEstado(desenvolver(await window.api.datos.registrarStockInicial(input)))
      ),
    gestionarJornada: (accion, password = '') =>
      proteger(async () =>
        setEstado(desenvolver(await window.api.datos.jornada(accion, password)))
      ),
    leerAviso: async (id) => {
      try {
        setEstado(desenvolver(await window.api.datos.leerAviso(id)))
      } catch (cause) {
        setError(cause instanceof ErrorNegocio ? cause.message : 'No se pudo actualizar el aviso.')
      }
    },
    cambiarPassword: (actual, nueva) =>
      proteger(async () => {
        desenvolver(await window.api.datos.cambiarPassword(actual, nueva))
      }),
    crearUsuario: (nombre, password) =>
      proteger(async () => {
        setEstado(desenvolver(await window.api.datos.crearUsuario(nombre, password)))
      }),
    cambiarEstadoUsuario: (id, activo) =>
      proteger(async () => {
        setEstado(desenvolver(await window.api.datos.cambiarEstadoUsuario(id, activo)))
      }),
    restablecerPasswordUsuario: (id, nueva) =>
      proteger(async () => {
        desenvolver(await window.api.datos.restablecerPasswordUsuario(id, nueva))
      }),
    cerrarSesion: () =>
      proteger(async () => {
        desenvolver(await window.api.datos.salir())
        onSalir()
      })
  }
  return (
    <AppDataContext.Provider value={value}>
      {children}
      {error && (
        <div
          role="alert"
          className="fixed bottom-5 left-1/2 z-[200] max-w-xl -translate-x-1/2 rounded-xl bg-[#9d3029] p-4 text-sm text-white shadow-lg"
        >
          {error}
          <button
            type="button"
            aria-label="Cerrar error"
            onClick={() => setError('')}
            className="ml-4"
          >
            ✕
          </button>
        </div>
      )}
      {guardando && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/20"
        >
          <p className="rounded-xl bg-white px-6 py-4 text-sm shadow-xl">Guardando…</p>
        </div>
      )}
    </AppDataContext.Provider>
  )
}
export function useAppData(): Contexto {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData requiere AppDataProvider')
  return ctx
}
