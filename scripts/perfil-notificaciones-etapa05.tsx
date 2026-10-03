import '../src/renderer/src/assets/main.css'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { StrictMode } from 'react'
import Header from '../src/renderer/src/components/Header'
import { AppDataProvider, useAppData } from '../src/renderer/src/store/AppDataContext'
import { estadoInicial, type Aviso, type EstadoAplicacion } from '../src/shared/persistencia'
declare const perfil: { estado: () => Promise<void>; resultado: (r: unknown) => void }
declare const visual: {
  captura: (n: string) => Promise<void>
  entrada: (t: string) => Promise<void>
}
const esperar = (ms = 70): Promise<void> => new Promise((r) => setTimeout(r, ms))
function exigir(v: unknown, m: string): asserts v {
  if (!v) throw Error(m)
}
const botones = (): HTMLButtonElement[] => [
  ...document.querySelectorAll<HTMLButtonElement>('button')
]
function buscar(texto: string): HTMLButtonElement {
  const b = botones().find((e) => e.textContent?.trim() === texto)
  exigir(b, 'Falta botón ' + texto)
  return b
}
function campana(): HTMLButtonElement {
  const b = document.querySelector<HTMLButtonElement>('button[aria-controls="avisos-panel"]')
  exigir(b, 'Falta campana')
  return b
}
async function click(b: HTMLButtonElement): Promise<void> {
  flushSync(() => b.click())
  await esperar()
}
function filas(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-aviso]')]
}
async function main(): Promise<void> {
  await perfil.estado()
  const originales: Aviso[] = Array.from({ length: 12 }, (_, i) => ({
    id: crypto.randomUUID(),
    titulo: `Aviso ${i + 1} Muñoz`,
    mensaje:
      'Prueba de lectura, eliminación, accesibilidad y contención de contenido con una palabra extensa ' +
      'a'.repeat(90),
    fecha: new Date(Date.now() - i * 60000).toISOString(),
    leida: i % 2 === 1,
    destino: 'stock'
  }))
  let guardados = structuredClone(originales),
    lecturaPendiente: ((v: unknown) => void) | undefined
  const llamadas: string[] = [],
    orden: string[] = []
  const respuesta = (): unknown => ({
    ok: true,
    valor: {
      avisos: structuredClone(guardados),
      noLeidas: guardados.filter((n) => !n.leida).length
    }
  })
  const datos = {
    listarNotificaciones: async (): Promise<unknown> => {
      llamadas.push('listar')
      if (lecturaPendiente)
        return new Promise((r) => {
          lecturaPendiente = r
        })
      return respuesta()
    },
    marcarNotificacionLeida: async (id: string): Promise<unknown> => {
      llamadas.push('marcar')
      guardados = guardados.map((n) => (n.id === id ? { ...n, leida: true } : n))
      return respuesta()
    },
    marcarTodasNotificacionesLeidas: async (): Promise<unknown> => {
      llamadas.push('marcarTodas')
      guardados = guardados.map((n) => ({ ...n, leida: true }))
      return respuesta()
    },
    eliminarNotificacion: async (id: string): Promise<unknown> => {
      llamadas.push('eliminar')
      orden.push('eliminar')
      guardados = guardados.filter((n) => n.id !== id)
      return respuesta()
    },
    eliminarTodasNotificaciones: async (): Promise<unknown> => {
      llamadas.push('eliminarTodas')
      guardados = []
      return respuesta()
    },
    limpiarNotificacionesAntiguas: async (): Promise<unknown> => respuesta(),
    crearUsuario: async (): Promise<unknown> => ({
      ok: true,
      valor: { ...estado, avisos: structuredClone(originales) }
    })
  }
  ;(window as unknown as { api: unknown }).api = {
    datos: new Proxy(datos, {
      get: (target, key) =>
        key in target
          ? target[key as keyof typeof target]
          : () => {
              throw Error('Snapshot/contrato inesperado ' + String(key))
            }
    })
  }
  const estado: EstadoAplicacion = {
    datos: estadoInicial(),
    avisos: structuredClone(originales),
    administrador: 'Prueba UX',
    usuarioActual: {
      id: crypto.randomUUID(),
      nombre: 'Prueba UX',
      rol: 'administrador',
      principal: true
    },
    usuarios: [],
    umbralesStock: { 'Cacao en Baba': null, 'Cacao Seco': null, Maracuyá: null },
    stockInicialRegistrado: false,
    stockInicialRegistradoEn: null
  }
  let contexto!: ReturnType<typeof useAppData>
  function Prueba(): React.JSX.Element {
    contexto = useAppData()
    return (
      <div className="flex h-screen min-w-0 flex-col">
        <Header onNavigate={() => {}} />
        <main id="fuera" className="min-h-0 flex-1 bg-[#f6f7f5] p-6">
          Fixture de notificaciones — sin acceso a la base local
        </main>
      </div>
    )
  }
  const root = createRoot(document.getElementById('root')!)
  flushSync(() =>
    root.render(
      <StrictMode>
        <AppDataProvider inicial={estado} onSalir={() => {}}>
          <Prueba />
        </AppDataProvider>
      </StrictMode>
    )
  )
  await esperar(150)
  exigir(campana().getAttribute('aria-label')?.includes('6 sin leer'), 'Badge inicial')
  await click(campana())
  exigir(filas().length === 12, 'Abrir listado')
  exigir(guardados.filter((n) => !n.leida).length === 6, 'Abrir no debe leer')
  const caja = document.getElementById('avisos-panel')!.getBoundingClientRect()
  exigir(
    caja.left >= 0 && caja.right <= window.innerWidth + 1 && caja.bottom <= window.innerHeight,
    'Contención del panel'
  )
  exigir(
    document.documentElement.scrollWidth <= window.innerWidth,
    'Sin overflow horizontal global'
  )
  await visual.captura('panel')
  const primerBoton = filas()[0].querySelector<HTMLButtonElement>('[data-menu-aviso]')!
  await click(primerBoton)
  exigir(document.querySelectorAll('[role="menuitem"]').length === 2, 'Menú no leído')
  exigir(document.activeElement === buscar('Marcar como leída'), 'Foco inicial menú')
  await visual.entrada('ArrowDown')
  await esperar()
  exigir(document.activeElement === buscar('Eliminar'), 'Flecha abajo')
  await visual.entrada('Escape')
  await esperar()
  exigir(
    !document.querySelector('[role="menu"]') && document.getElementById('avisos-panel'),
    'Escape solo cierra menú'
  )
  exigir(document.activeElement === primerBoton, 'Escape devuelve foco')
  await click(primerBoton)
  await click(buscar('Marcar como leída'))
  exigir(
    campana().getAttribute('aria-label')?.includes('5 sin leer'),
    'Badge después de marcar uno'
  )
  await click(primerBoton)
  exigir(
    document.querySelectorAll('[role="menuitem"]').length === 1,
    'Menú leído sin acción redundante'
  )
  await click(primerBoton)
  exigir(!document.querySelector('[role="menu"]'), 'Tres puntos alterna cierre')
  flushSync(() =>
    filas()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
  )
  await esperar()
  exigir(
    document.querySelectorAll('[role="menuitem"]').length === 1,
    'Clic derecho reutiliza menú leído'
  )
  await click(buscar('Eliminar'))
  await esperar(100)
  exigir(
    filas().length === 11 && document.getElementById('avisos-panel'),
    'Eliminar uno mantiene panel'
  )
  exigir(
    document.activeElement === filas()[0].querySelector('[data-menu-aviso]'),
    'Foco después de eliminar'
  )
  await click(filas()[0].querySelector<HTMLButtonElement>('[data-menu-aviso]')!)
  flushSync(() =>
    document
      .getElementById('avisos-titulo')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  )
  await esperar()
  exigir(
    !document.querySelector('[role="menu"]') && document.getElementById('avisos-panel'),
    'Clic fuera del menú lo cierra'
  )
  await click(buscar('Marcar todas como leídas'))
  exigir(
    campana().getAttribute('aria-label')?.includes('0 sin leer') &&
      !campana().querySelector('span'),
    'Marcar todas limpia badge'
  )
  await click(buscar('Eliminar todas'))
  exigir(document.querySelector('dialog[open]'), 'Confirmación nativa')
  exigir(document.activeElement === buscar('Cancelar'), 'Foco seguro en cancelar')
  await visual.captura('confirmacion')
  flushSync(() =>
    buscar('Cancelar').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  )
  await click(buscar('Cancelar'))
  exigir(
    filas().length === 11 && document.getElementById('avisos-panel'),
    'Cancelar conserva avisos y panel'
  )
  await click(buscar('Eliminar todas'))
  await visual.entrada('Escape')
  await esperar()
  exigir(
    !document.querySelector('dialog[open]') && document.getElementById('avisos-panel'),
    'Escape modal no cierra campana'
  )
  // Lectura previa pendiente y eliminación solicitada posteriormente: respuestas serializadas.
  const borrada = guardados[0].id
  lecturaPendiente = () => {}
  const leer = contexto.listarNotificaciones()
  await esperar()
  const vieja = respuesta(),
    borrar = contexto.eliminarNotificacion(borrada)
  exigir(lecturaPendiente, 'Falta lectura diferida')
  lecturaPendiente(vieja)
  lecturaPendiente = undefined
  await Promise.all([leer, borrar])
  await esperar()
  exigir(
    !filas().some((f) => f.dataset.aviso === borrada),
    'Respuesta previa no restaura eliminado'
  )
  // Snapshot atrasado de otra acción: el provider solo solicita avisos compactos actuales.
  await contexto.crearUsuario('Fixture', 'No se guarda')
  await esperar()
  exigir(!filas().some((f) => f.dataset.aviso === borrada), 'Snapshot anterior no restaura avisos')
  await click(buscar('Eliminar todas'))
  const confirmar = document
    .querySelector('dialog')!
    .querySelectorAll<HTMLButtonElement>('button')[1]
  await click(confirmar)
  exigir(
    filas().length === 0 && document.getElementById('avisos-panel'),
    'Eliminar todas deja vacío sin cerrar'
  )
  exigir(
    document.getElementById('avisos-panel')?.textContent?.includes('No hay notificaciones.'),
    'Estado vacío'
  )
  await click(campana())
  await click(campana())
  exigir(filas().length === 0, 'Cerrar/reabrir no resucita')
  await visual.captura('vacio')
  await visual.entrada('Escape')
  await esperar()
  exigir(
    !document.getElementById('avisos-panel') && document.activeElement === campana(),
    'Escape panel devuelve foco campana'
  )
  const informe = {
    viewport: { ancho: window.innerWidth, alto: window.innerHeight },
    pruebas:
      'badge, apertura, menú leído/no leído, flechas, Escape, foco, clic derecho, uno/todos, cancelación/confirmación, vacío, reapertura, async y Snapshot atrasado',
    llamadas,
    orden,
    snapshotConsultado: false
  }
  root.unmount()
  perfil.resultado(informe)
}
main().catch((e) => perfil.resultado({ error: e instanceof Error ? e.stack : String(e) }))
