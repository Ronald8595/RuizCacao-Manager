// Interfaz real, fixture de volumen solo en memoria; sin IPC de negocio ni base.
import '../src/renderer/src/assets/main.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import Cuentas from '../src/renderer/src/pages/Cuentas'
import Paginacion from '../src/renderer/src/components/Paginacion'
import NovedadesVersion from '../src/renderer/src/components/NovedadesVersion'
import { AppDataProvider } from '../src/renderer/src/store/AppDataContext'
import { NotificacionProvider } from '../src/renderer/src/store/NotificacionContext'
import { estadoInicial, type EstadoAplicacion } from '../src/shared/persistencia'
import type { Cuenta } from '../src/renderer/src/types'
declare const perfil: { estado: () => Promise<void>; resultado: (r: unknown) => void }
declare const visual: { captura: (n: string) => Promise<void> }
let llamadasDatos = 0
;(window as unknown as { api: unknown }).api = {
  datos: new Proxy(
    {},
    {
      get: () => () => {
        llamadasDatos++
        throw Error('IPC de negocio prohibido en esta prueba')
      }
    }
  )
}
function exigir(v: unknown, mensaje: string): asserts v {
  if (!v) throw Error(mensaje)
}
const esperar = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms))
function valor(e: HTMLInputElement | HTMLSelectElement, v: string): void {
  exigir(e, 'Falta control')
  flushSync(() => {
    Object.getOwnPropertyDescriptor(
      e instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype,
      'value'
    )!.set!.call(e, v)
    e.dispatchEvent(new Event('input', { bubbles: true }))
    e.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
function boton(texto: string): HTMLButtonElement {
  const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (e) => e.textContent?.trim() === texto
  )
  exigir(b, 'Falta botón ' + texto)
  return b
}
function click(texto: string): void {
  flushSync(() => boton(texto).click())
}
function region(): HTMLDivElement {
  const e = document.querySelector<HTMLDivElement>('[aria-label="Listado de cuentas"]')
  exigir(e, 'Falta listado')
  return e
}
function pagina(): [number, number] {
  const texto = document.querySelector('nav[aria-label="Paginación"] [aria-live]')?.textContent
  const match = texto?.match(/Página (\d+) de (\d+)/)
  exigir(match, 'Falta número de página')
  return [Number(match[1]), Number(match[2])]
}
async function main(): Promise<void> {
  await perfil.estado()
  const cuentas: Cuenta[] = Array.from({ length: 16252 }, (_, i) => ({
    id: `ux-cuenta-${i}`,
    origen: i % 2 ? 'compra' : 'venta',
    categoria: i % 2 ? 'compra' : 'venta',
    clienteId: `ux-cliente-${i}`,
    ventaId: null,
    numeroFactura: i % 2 ? null : 300000 + i,
    numeroCompra: i % 2 ? 300000 + i : undefined,
    proveedorNombre: `Proveedor Peña ${i}`,
    montoTotal: 100,
    montoPagado: i % 7 === 2 ? 30 : i % 7 === 3 ? 100 : 0,
    estado:
      i % 7 === 2 ? 'parcial' : i % 7 === 3 ? 'cerrado' : i % 7 === 4 ? 'anulado' : 'pendiente',
    fecha: i % 3 ? '2026-09-15' : '2026-01-12',
    fechaHoraRegistro: '2026-09-15T12:00:00Z',
    fechaUltimoMovimiento: '2026-09-15T12:00:00Z'
  }))
  const estado: EstadoAplicacion = {
    datos: {
      ...estadoInicial(),
      cuentas,
      clientes: cuentas.map((c, i) => ({
        id: c.clienteId,
        nombreRazonSocial: `Cliente Muñoz ${i}`,
        identificacion: String(1000000000 + i),
        telefono: '',
        estado: true,
        fechaRegistro: '2026-01-01'
      }))
    },
    avisos: [],
    administrador: 'QA',
    usuarioActual: null,
    usuarios: [],
    umbralesStock: { 'Cacao en Baba': null, 'Cacao Seco': null, Maracuyá: null },
    stockInicialRegistrado: false,
    stockInicialRegistradoEn: null
  }
  const huella = JSON.stringify(estado)
  const root = createRoot(document.getElementById('root')!)
  flushSync(() =>
    root.render(
      <StrictMode>
        <NotificacionProvider>
          <AppDataProvider inicial={estado} onSalir={() => {}}>
            <main className="flex h-screen min-h-0 min-w-0 flex-col overflow-hidden">
              <Cuentas />
            </main>
          </AppDataProvider>
        </NotificacionProvider>
      </StrictMode>
    )
  )
  await esperar(200)
  const estadoSelect = document.querySelector<HTMLSelectElement>('section select')!
  const busqueda = document.querySelector<HTMLInputElement>('input[type="search"]')!
  const desde = document.querySelector<HTMLInputElement>('input[aria-label="Desde"]')!
  const hasta = document.querySelector<HTMLInputElement>('input[aria-label="Hasta"]')!
  valor(estadoSelect, 'todas')
  const resumen = (): string => document.querySelector('.grid')!.textContent!
  const resumenOriginal = resumen()
  const validaciones: unknown[] = []
  function comprobar(esperadas: Cuenta[], limite: number): void {
    const [n, total] = pagina()
    exigir(total === Math.max(1, Math.ceil(esperadas.length / limite)), 'Total páginas incorrecto')
    const filas = [...region().querySelectorAll<HTMLTableRowElement>('[data-cuenta-id]')]
    exigir(filas.length <= limite && filas.length < 40, 'Se perdió la virtualización')
    for (const fila of filas) {
      const posicion = Number(fila.getAttribute('aria-rowindex')) - 2
      exigir(
        fila.dataset.cuentaId === esperadas[(n - 1) * limite + posicion]?.id,
        'Fila de otra página o fuera de orden'
      )
    }
    exigir(boton('Anterior').getAttribute('aria-disabled') === String(n === 1), 'Extremo Anterior')
    exigir(
      boton('Siguiente').getAttribute('aria-disabled') === String(n === total),
      'Extremo Siguiente'
    )
    exigir(resumen() === resumenOriginal, 'Las tarjetas dependen de la página/filtro')
    exigir(!region().contains(document.querySelector('nav')), 'Paginación dentro del scroll')
    exigir(
      !document.body.textContent?.includes('Desplázate para verlas'),
      'Texto anterior presente'
    )
  }
  const selector = (): HTMLSelectElement => document.querySelector('nav select')!
  exigir(
    [...selector().options].map((o) => o.value).join(',') === '10,25,50,100',
    'Opciones Cuentas'
  )
  exigir(selector().value === '25', 'Límite inicial')
  for (const limite of [10, 25, 50, 100]) {
    valor(selector(), String(limite))
    await esperar()
    exigir(pagina()[0] === 1, 'Tamaño no reinicia')
    comprobar(cuentas, limite)
    click('Anterior')
    exigir(pagina()[0] === 1, 'Anterior navega fuera')
    click('Siguiente')
    await esperar()
    comprobar(cuentas, limite)
    exigir(region().scrollTop === 0, 'Cambio página no reinicia scroll')
    region().scrollTop = region().scrollHeight
    flushSync(() => region().dispatchEvent(new Event('scroll')))
    await esperar()
    comprobar(cuentas, limite)
    const ultimaVisible = [
      ...region().querySelectorAll<HTMLTableRowElement>('[data-cuenta-id]')
    ].at(-1)!
    exigir(
      ultimaVisible.dataset.cuentaId === cuentas[2 * limite - 1].id,
      'Última fila de página inaccesible'
    )
    click('Anterior')
    await esperar()
    exigir(region().scrollTop === 0, 'Anterior no reinicia')
    validaciones.push({
      limite,
      navegacion: true,
      orden: true,
      virtualizacion: true,
      scrollReiniciado: true,
      tarjetasInvariantes: true
    })
  }
  // Recorrer todas las páginas de 100: ninguna cuenta omitida/duplicada.
  valor(selector(), '100')
  const vistas = new Set<string>()
  while (true) {
    comprobar(cuentas, 100)
    const [n, total] = pagina()
    const primera = region().querySelector<HTMLElement>('[data-cuenta-id]')!
    exigir(primera.dataset.cuentaId === cuentas[(n - 1) * 100].id, 'Primera cuenta incorrecta')
    const vistasPagina = new Set<string>()
    const e = region()
    const posiciones = []
    for (let y = 0; y < e.scrollHeight; y += Math.max(e.clientHeight, 56 * 8)) posiciones.push(y)
    posiciones.push(e.scrollHeight)
    for (const y of posiciones) {
      flushSync(() => {
        e.scrollTop = y
        e.dispatchEvent(new Event('scroll'))
      })
      comprobar(cuentas, 100)
      for (const fila of e.querySelectorAll<HTMLElement>('[data-cuenta-id]'))
        vistasPagina.add(fila.dataset.cuentaId!)
    }
    exigir(
      vistasPagina.size === Math.min(100, cuentas.length - (n - 1) * 100),
      'Fila inaccesible en página'
    )
    for (const id of vistasPagina) {
      exigir(!vistas.has(id), 'Cuenta duplicada entre páginas')
      vistas.add(id)
    }
    if (n === total) break
    click('Siguiente')
  }
  exigir(vistas.size === cuentas.length, 'Omisión de página')
  click('Siguiente')
  exigir(pagina()[0] === 163, 'Siguiente navega fuera')
  region().scrollTop = region().scrollHeight
  flushSync(() => region().dispatchEvent(new Event('scroll')))
  await esperar()
  exigir(
    [...region().querySelectorAll<HTMLElement>('[data-cuenta-id]')].at(-1)?.dataset.cuentaId ===
      cuentas.at(-1)!.id,
    'Última cuenta inaccesible'
  )
  await visual.captura('ultima-pagina')
  // Cambios de filtros desde página profunda siempre vuelven a 1.
  function profunda(): void {
    for (let i = 0; i < 4; i++) click('Siguiente')
    exigir(pagina()[0] > 1, 'Falta página profunda')
  }
  click('Ventas · por cobrar')
  exigir(pagina()[0] === 1, 'Categoría no reinicia')
  comprobar(
    cuentas.filter((c) => c.categoria === 'venta'),
    100
  )
  profunda()
  valor(busqueda, 'Cliente Muñoz 100')
  exigir(pagina()[0] === 1, 'Búsqueda no reinicia')
  comprobar(
    cuentas.filter(
      (c) =>
        c.categoria === 'venta' &&
        `Cliente Muñoz ${c.id.split('-').at(-1)}`.toLowerCase().includes('cliente muñoz 100')
    ),
    100
  )
  valor(busqueda, '')
  profunda()
  click('Compras · por pagar')
  exigir(pagina()[0] === 1, 'Compras no reinicia')
  comprobar(
    cuentas.filter((c) => c.categoria === 'compra'),
    100
  )
  profunda()
  valor(busqueda, 'Proveedor Peña 101')
  exigir(pagina()[0] === 1, 'Proveedor no reinicia')
  comprobar(
    cuentas.filter(
      (c) => c.categoria === 'compra' && c.proveedorNombre!.includes('Proveedor Peña 101')
    ),
    100
  )
  valor(busqueda, '')
  profunda()
  valor(busqueda, '300101')
  comprobar(
    cuentas.filter((c) => c.numeroCompra === 300101),
    100
  )
  valor(busqueda, '')
  profunda()
  valor(estadoSelect, 'parcial')
  exigir(pagina()[0] === 1, 'Estado no reinicia')
  comprobar(
    cuentas.filter((c) => c.categoria === 'compra' && c.estado === 'parcial'),
    100
  )
  valor(estadoSelect, 'todas')
  profunda()
  valor(desde, '2026-09-01')
  exigir(pagina()[0] === 1, 'Desde no reinicia')
  comprobar(
    cuentas.filter((c) => c.categoria === 'compra' && c.fecha >= '2026-09-01'),
    100
  )
  valor(desde, '')
  profunda()
  valor(hasta, '2026-01-31')
  exigir(pagina()[0] === 1, 'Hasta no reinicia')
  comprobar(
    cuentas.filter((c) => c.categoria === 'compra' && c.fecha <= '2026-01-31'),
    100
  )
  valor(hasta, '')
  profunda()
  valor(selector(), '25')
  exigir(pagina()[0] === 1, 'Límite profundo no reinicia')
  click('Siguiente')
  await esperar()
  const accion = region().querySelector<HTMLButtonElement>('button[title="Registrar abono"]')!
  exigir(accion, 'Falta abono en página 2')
  const idCuenta = accion.closest<HTMLElement>('[data-cuenta-id]')!.dataset.cuentaId!
  flushSync(() => accion.click())
  await esperar()
  exigir(
    document.body.textContent?.includes('Registrar pago a proveedor'),
    'Modal abono incorrecto'
  )
  exigir(
    document.body.textContent?.includes(cuentas.find((c) => c.id === idCuenta)!.proveedorNombre!),
    'Modal de otra cuenta'
  )
  click('Cancelar')
  exigir(pagina()[0] === 2, 'Cerrar abono pierde página')
  await visual.captura('cuentas')
  valor(busqueda, 'ninguna coincidencia')
  comprobar([], 25)
  exigir(pagina()[0] === 1, 'Vacío sin página válida')
  exigir(
    llamadasDatos === 0 && JSON.stringify(estado) === huella,
    'Fixture modificada/IPC ejecutado'
  )
  // El paginador SQL conserva opciones y comportamiento predeterminado.
  flushSync(() =>
    root.render(
      <Paginacion
        total={150}
        limite={15}
        numero={1}
        hayAnterior={false}
        haySiguiente={true}
        anterior={() => {}}
        siguiente={() => {}}
        cambiarLimite={() => {}}
      />
    )
  )
  exigir(
    [...selector().options].map((o) => o.value).join(',') === '10,15,25,50',
    'Cambió paginador de otros módulos'
  )
  flushSync(() =>
    root.render(<NovedadesVersion usuarioId={`qa-cuentas-ux-${innerWidth}-${innerHeight}`} />)
  )
  exigir(document.querySelectorAll('li').length === 4, 'Novedades no tiene cuatro beneficios')
  exigir(
    !/PostgreSQL|migracion|keyset|infraestructura|\bSQL\b/i.test(document.body.textContent!),
    'Texto técnico en Novedades'
  )
  click('Entendido')
  exigir(!document.querySelector('[role="dialog"]'), 'Entendido no cierra')
  perfil.resultado({
    validaciones,
    cuentas: cuentas.length,
    paginas100: 163,
    filtrosDesdeProfunda: true,
    extremos: true,
    abonoPagina2: true,
    vacio: true,
    paginadorPredeterminadoIntacto: true,
    novedadesSinTextoTecnico: true,
    llamadasDatos,
    fixtureIntacta: true
  })
}
main().catch((error) => perfil.resultado({ error: error.stack }))
