import { useEffect, useRef, useState } from 'react'
import { Archive, Download, Upload, ShieldCheck, LoaderCircle } from 'lucide-react'
import ModalAccesible from '../components/ModalAccesible'
import PageHeader from '../components/PageHeader'
import type { PageProps } from '../types'
import {
  fasesRespaldo,
  type ProgresoRespaldo,
  type ResumenRespaldo,
  type RespuestaRespaldo,
  type ResultadoRespaldo,
  type TipoRespaldo
} from '../../../shared/respaldos'

const boton =
  'rounded-xl px-4 py-2.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16834b] disabled:cursor-not-allowed disabled:opacity-50'
const primario = boton + ' bg-[#16834b] text-white'
const secundario = boton + ' border border-[#dce4dd] bg-white text-[#39493d]'
type Vista = 'ninguna' | 'progreso' | 'confirmar' | 'password' | 'resultado'
class Fallo extends Error {
  constructor(
    m: string,
    readonly codigo: string
  ) {
    super(m)
  }
}
function valor<T>(r: RespuestaRespaldo<T>): T {
  if (!r.ok) throw new Fallo(r.error, r.codigo)
  return r.valor
}

export default function Respaldos({ administrador = false }: PageProps): React.JSX.Element {
  const [vista, setVista] = useState<Vista>('ninguna')
  const [tipo, setTipo] = useState<TipoRespaldo>('generar')
  const [ocupado, setOcupado] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [fase, setFase] = useState<ProgresoRespaldo | null>(null)
  const [resumen, setResumen] = useState<ResumenRespaldo | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<{
    titulo: string
    texto: string
    reiniciar?: boolean
  } | null>(null)
  const actual = useRef<string | null>(null)
  const bloqueo = useRef(false)
  const enviando = useRef(false)
  const cancelarEnviado = useRef(false)
  const quitarListener = useRef<(() => void) | null>(null)
  const montado = useRef(false)
  const alerta = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
      quitarListener.current?.()
      quitarListener.current = null
      const id = actual.current
      if (id) void window.api.respaldos.cancelarOperacionRespaldo(id)
    }
  }, [])
  useEffect(() => {
    if (error) alerta.current?.focus()
  }, [error])

  async function conProgreso<T>(
    id: string,
    trabajo: () => Promise<RespuestaRespaldo<T>>
  ): Promise<T> {
    quitarListener.current?.()
    const quitar = window.api.respaldos.alProgreso(id, (p) => {
      if (montado.current) setFase(p)
    })
    quitarListener.current = quitar
    try {
      return valor(await trabajo())
    } finally {
      quitar()
      if (quitarListener.current === quitar) quitarListener.current = null
    }
  }
  function finalizar(r: ResultadoRespaldo, t: TipoRespaldo): void {
    if (!montado.current) return
    setCancelando(false)
    cancelarEnviado.current = false
    const cancelado = r.estado === 'cancelado'
    const reiniciar = r.estado === 'completado' && r.reiniciar
    if (!reiniciar) actual.current = null
    setResultado({
      titulo: cancelado
        ? t === 'generar'
          ? 'Generación cancelada'
          : 'Carga cancelada'
        : t === 'generar'
          ? 'Respaldo generado correctamente'
          : 'Respaldo cargado correctamente',
      texto: cancelado
        ? t === 'generar'
          ? 'No se creó ningún respaldo incompleto.'
          : 'La información actual se conserva.'
        : t === 'generar'
          ? `La copia de seguridad fue guardada correctamente.${r.estado === 'completado' && r.nombre ? ' Archivo: ' + r.nombre : ''}`
          : 'La información de RuizCacao Manager fue recuperada correctamente. La aplicación se reiniciará para aplicar los cambios.',
      reiniciar
    })
    setVista('resultado')
  }
  function fallar(e: unknown, t: TipoRespaldo): void {
    if (!montado.current) return
    actual.current = null
    setCancelando(false)
    const mensaje = e instanceof Error ? e.message : 'Intenta nuevamente o contacta con soporte.'
    setResultado({
      titulo: t === 'generar' ? 'No se pudo generar el respaldo' : 'No se pudo cargar el respaldo',
      texto:
        (e instanceof Fallo && e.codigo === 'bloqueado'
          ? ''
          : t === 'generar'
            ? 'La información de RuizCacao Manager no fue modificada. '
            : 'La información actual se conserva. ') + mensaje
    })
    setVista('resultado')
  }
  async function iniciar(t: TipoRespaldo): Promise<void> {
    if (bloqueo.current) return
    bloqueo.current = true
    setOcupado(true)
    setTipo(t)
    setError('')
    setFase(null)
    setResumen(null)
    try {
      const seleccion = valor(
        await (t === 'generar'
          ? window.api.respaldos.seleccionarDestinoRespaldo()
          : window.api.respaldos.seleccionarRespaldo())
      )
      if (!seleccion) {
        bloqueo.current = false
        if (montado.current) setOcupado(false)
        return
      }
      actual.current = seleccion.operacionId
      if (!montado.current) {
        await window.api.respaldos.cancelarOperacionRespaldo(seleccion.operacionId)
        return
      }
      setVista('progreso')
      if (t === 'generar')
        finalizar(
          await conProgreso(seleccion.operacionId, () =>
            window.api.respaldos.generarRespaldo(seleccion.operacionId)
          ),
          t
        )
      else {
        const r = await conProgreso(seleccion.operacionId, () =>
          window.api.respaldos.validarRespaldoSeleccionado(seleccion.operacionId)
        )
        if ('estado' in r) finalizar(r, t)
        else if (montado.current) {
          setResumen(r)
          setVista('confirmar')
        }
      }
    } catch (e) {
      fallar(e, t)
    }
  }
  async function cancelar(): Promise<void> {
    if (
      !actual.current ||
      cancelarEnviado.current ||
      (vista === 'progreso' && fase?.cancelable === false)
    )
      return
    cancelarEnviado.current = true
    setCancelando(true)
    try {
      const aceptado = valor(await window.api.respaldos.cancelarOperacionRespaldo(actual.current))
      if (aceptado && (vista === 'confirmar' || vista === 'password'))
        finalizar({ estado: 'cancelado' }, tipo)
      if (!aceptado && montado.current) {
        setCancelando(false)
        cancelarEnviado.current = false
      }
    } catch (e) {
      if (montado.current) {
        setError(e instanceof Error ? e.message : 'No se pudo cancelar.')
        setCancelando(false)
        cancelarEnviado.current = false
      }
    }
  }
  async function cargar(): Promise<void> {
    if (enviando.current || !resumen || !actual.current || !password) return
    enviando.current = true
    setError('')
    const clave = password
    setPassword('')
    setFase(null)
    setVista('progreso')
    try {
      finalizar(
        await conProgreso(actual.current, () =>
          window.api.respaldos.cargarRespaldo(
            resumen.operacionId,
            resumen.preparacionId,
            true,
            clave
          )
        ),
        'cargar'
      )
    } catch (e) {
      if (
        montado.current &&
        e instanceof Fallo &&
        ['password', 'autenticacion'].includes(e.codigo)
      ) {
        setVista('password')
        setError(e.message)
      } else fallar(e, 'cargar')
    } finally {
      enviando.current = false
    }
  }
  async function aceptar(): Promise<void> {
    if (enviando.current) return
    if (resultado?.reiniciar && actual.current) {
      enviando.current = true
      try {
        valor(await window.api.respaldos.reiniciarDespuesDeRestauracion(actual.current))
      } catch (e) {
        setError(
          e instanceof Error ? e.message : 'No se pudo reiniciar. Cierra y abre la aplicación.'
        )
        enviando.current = false
      }
      return
    }
    setVista('ninguna')
    setResultado(null)
    setError('')
    setOcupado(false)
    bloqueo.current = false
  }
  const titulo =
    vista === 'confirmar'
      ? 'Cargar respaldo'
      : vista === 'password'
        ? 'Confirma tu contraseña'
        : vista === 'resultado'
          ? resultado?.titulo
          : tipo === 'generar'
            ? 'Generando respaldo'
            : resumen
              ? 'Cargando respaldo'
              : 'Verificando respaldo'
  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">
      <PageHeader
        greeting="Respaldos"
        subtitle="Protege la información de RuizCacao Manager guardando una copia en un lugar seguro."
      />
      {!administrador ? (
        <p className="mt-6 text-sm">Solo el administrador puede gestionar respaldos.</p>
      ) : (
        <>
          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            {(
              [
                {
                  tipo: 'generar',
                  titulo: 'Generar respaldo',
                  texto:
                    'Crea una copia de la información actual de RuizCacao Manager para conservarla en otro dispositivo o ubicación segura.',
                  Icono: Download
                },
                {
                  tipo: 'cargar',
                  titulo: 'Cargar respaldo',
                  texto:
                    'Recupera información guardada previamente en un archivo de respaldo de RuizCacao Manager.',
                  Icono: Upload
                }
              ] as const
            ).map(({ tipo: t, titulo: h, texto, Icono }) => (
              <article key={t} className="rounded-2xl border border-[#e2e7e2] bg-white p-5 sm:p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#eef6ef] text-[#16834b]">
                  <Icono size={22} aria-hidden="true" />
                </div>
                <h2 className="text-lg font-semibold">{h}</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[#68746b]">{texto}</p>
                <button
                  type="button"
                  className={'mt-5 ' + (t === 'generar' ? primario : secundario)}
                  disabled={ocupado}
                  onClick={() => void iniciar(t)}
                >
                  {h}
                </button>
              </article>
            ))}
          </div>
          <p className="mt-5 flex items-start gap-2 text-[13px] leading-5 text-[#68746b]">
            <ShieldCheck size={18} className="shrink-0" aria-hidden="true" />
            El archivo de respaldo contiene información del negocio. Guárdalo en un lugar seguro.
          </p>
        </>
      )}
      {vista !== 'ninguna' && (
        <ModalAccesible
          key={vista}
          tituloId="respaldo-titulo"
          ancho="max-w-[520px]"
          onCerrar={() => {
            if (vista === 'confirmar' || vista === 'password') void cancelar()
            else if (vista === 'resultado' && !resultado?.reiniciar) void aceptar()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Tab') {
              const controles = [
                ...event.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not(:disabled), input:not(:disabled), [tabindex="0"]'
                )
              ]
              const primero = controles[0],
                ultimo = controles.at(-1)
              if (!primero) event.preventDefault()
              else if (
                event.shiftKey &&
                (document.activeElement === primero ||
                  !controles.includes(document.activeElement as HTMLElement))
              ) {
                event.preventDefault()
                ultimo?.focus()
              } else if (
                !event.shiftKey &&
                (document.activeElement === ultimo ||
                  !controles.includes(document.activeElement as HTMLElement))
              ) {
                event.preventDefault()
                primero.focus()
              }
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              if (vista === 'confirmar' || vista === 'password') void cancelar()
              else if (vista === 'resultado' && !resultado?.reiniciar) void aceptar()
            }
            if (
              vista === 'confirmar' &&
              event.key === 'Enter' &&
              !(event.target instanceof HTMLButtonElement)
            )
              event.preventDefault()
          }}
        >
          <h2
            id="respaldo-titulo"
            className="text-lg font-semibold"
            tabIndex={-1}
            data-autofocus={vista === 'progreso' || vista === 'resultado' ? true : undefined}
          >
            {titulo}
          </h2>
          {vista === 'progreso' && (
            <>
              <div className="my-6 flex items-center gap-3" role="status" aria-live="polite">
                <LoaderCircle className="shrink-0 animate-spin text-[#16834b]" aria-hidden="true" />
                <p>
                  {cancelando
                    ? 'Cancelando. Espera un momento.'
                    : fase?.cancelable === false
                      ? 'Finalizando. No cierres RuizCacao Manager.'
                      : fase
                        ? fasesRespaldo[fase.fase]
                        : 'Preparando respaldo'}
                </p>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className={secundario}
                  disabled={cancelando || fase?.cancelable === false}
                  onClick={() => void cancelar()}
                >
                  Cancelar
                </button>
              </div>
            </>
          )}
          {vista === 'confirmar' && resumen && (
            <>
              <div className="my-4 rounded-xl bg-[#f5f7f4] p-4">
                <Archive size={20} className="mb-2 text-[#16834b]" aria-hidden="true" />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt>Archivo</dt>
                  <dd className="break-all">{resumen.nombre}</dd>
                  <dt>Fecha</dt>
                  <dd>{new Date(resumen.fecha).toLocaleString('es-EC')}</dd>
                  <dt>Versión</dt>
                  <dd>{resumen.version}</dd>
                  <dt>Tamaño</dt>
                  <dd>
                    {(resumen.bytes / 1024 ** 2).toLocaleString('es-EC', {
                      maximumFractionDigits: 2
                    })}{' '}
                    MB
                  </dd>
                </dl>
              </div>
              <p className="text-sm leading-6">
                Al cargar este respaldo, la información actual será reemplazada por la información
                guardada en el archivo seleccionado. Antes de realizar el cambio, RuizCacao Manager
                creará una copia de seguridad de la información actual.
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  data-autofocus
                  className={secundario}
                  disabled={cancelando}
                  onClick={() => void cancelar()}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={primario}
                  disabled={cancelando}
                  onClick={() => {
                    setPassword('')
                    setVista('password')
                  }}
                >
                  Cargar respaldo
                </button>
              </div>
            </>
          )}
          {vista === 'password' && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void cargar()
              }}
            >
              <p className="my-4 text-sm leading-6">
                Ingresa la contraseña del administrador que ha iniciado sesión para autorizar la
                carga.
              </p>
              <label className="block text-sm" htmlFor="respaldo-password">
                Contraseña
              </label>
              <input
                data-autofocus
                id="respaldo-password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-xl border border-[#dce4dd] px-3 py-2.5 outline-none focus:border-[#16834b]"
              />
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className={secundario}
                  disabled={cancelando}
                  onClick={() => void cancelar()}
                >
                  Cancelar
                </button>
                <button type="submit" className={primario} disabled={!password || cancelando}>
                  Autorizar carga
                </button>
              </div>
            </form>
          )}
          {vista === 'resultado' && (
            <>
              <p className="my-5 break-words text-sm leading-6">{resultado?.texto}</p>
              <div className="flex justify-end">
                <button type="button" className={primario} onClick={() => void aceptar()}>
                  {resultado?.reiniciar ? 'Continuar' : 'Aceptar'}
                </button>
              </div>
            </>
          )}
          {error && (
            <p ref={alerta} tabIndex={-1} role="alert" className="mt-4 text-sm text-red-700">
              {error}
            </p>
          )}
        </ModalAccesible>
      )}
    </section>
  )
}
