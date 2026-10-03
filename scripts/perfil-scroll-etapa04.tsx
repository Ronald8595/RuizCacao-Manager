import '../src/renderer/src/assets/main.css'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import CompraVenta from '../src/renderer/src/pages/CompraVenta'
import Gastos from '../src/renderer/src/pages/Gastos'
import Consultas from '../src/renderer/src/pages/Consultas'
import Stock from '../src/renderer/src/pages/Stock'
import Clientes from '../src/renderer/src/pages/Clientes'
import Sidebar from '../src/renderer/src/components/Sidebar'
import Header from '../src/renderer/src/components/Header'
import { AppDataProvider } from '../src/renderer/src/store/AppDataContext'
import { NotificacionProvider } from '../src/renderer/src/store/NotificacionContext'
import type { EstadoAplicacion } from '../src/shared/persistencia'
declare const perfil: {
  estado: () => Promise<EstadoAplicacion>
  historial: (m: string, f: unknown) => Promise<unknown>
  resultado: (r: unknown) => void
}
declare const visual: {
  captura: (nombre: string) => Promise<void>
  entrada: (tipo: string) => Promise<void>
}
;(window as unknown as { api: unknown }).api = {
  datos: Object.fromEntries(
    [
      'historialStock',
      'historialCompras',
      'historialVentas',
      'historialCombinado',
      'listadoGastos',
      'resumenGastos',
      'reportePeriodo'
    ].map((m) => [m, (f: unknown) => perfil.historial(m, f)])
  )
}
const esperar = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms))
function exigir(ok: unknown, mensaje: string): asserts ok {
  if (!ok) throw Error(mensaje)
}
function click(texto: string): void {
  const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === texto
  )
  exigir(b, 'Falta botón ' + texto)
  flushSync(() => {
    b.focus()
    b.click()
  })
}
function valor(e: HTMLInputElement | HTMLSelectElement, v: string): void {
  flushSync(() => {
    Object.getOwnPropertyDescriptor(
      e instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype,
      'value'
    )!.set!.call(e, v)
    e.dispatchEvent(new Event('input', { bubbles: true }))
    e.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function listo(): Promise<void> {
  await esperar(200)
  for (
    let i = 0;
    i < 400 &&
    [...document.querySelectorAll('[role="status"]')].some((e) =>
      e.textContent?.includes('Cargando')
    );
    i++
  )
    await esperar()
  await esperar(120)
  exigir(!document.querySelector('[role="alert"]'), 'Error de listado')
}
function tabla(): HTMLDivElement {
  const e = document.querySelector<HTMLDivElement>('.contenedor-tabla')
  exigir(e, 'Falta contenedor')
  return e
}
async function main(): Promise<void> {
  const estado = await perfil.estado()
  let cambiar!: (p: string) => void
  function Pantallas(): React.JSX.Element {
    const [p, set] = useState('')
    cambiar = set
    return (
      <NotificacionProvider>
        <AppDataProvider inicial={estado} onSalir={() => {}}>
          <div className="flex h-screen min-w-0 bg-[#f5f7f4] text-[#292d2a]">
            <Sidebar
              activePage="ventas"
              onNavigate={() => {}}
              collapsed={window.innerWidth <= 1100}
              onToggle={() => {}}
            />
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <Header />
              {['historial', 'compras', 'ventas'].includes(p) ? (
                <CompraVenta />
              ) : p === 'gastos' ? (
                <Gastos />
              ) : p === 'reportes' ? (
                <Consultas />
              ) : p === 'stock' ? (
                <Stock />
              ) : p === 'proveedores' ? (
                <Clientes />
              ) : null}
            </main>
          </div>
        </AppDataProvider>
      </NotificacionProvider>
    )
  }
  const root = createRoot(document.getElementById('root')!)
  flushSync(() => root.render(<Pantallas />))
  const validaciones: unknown[] = []
  for (const pantalla of [
    'historial',
    'gastos',
    'reportes',
    'stock',
    'compras',
    'ventas',
    'proveedores'
  ]) {
    flushSync(() => cambiar(''))
    await esperar()
    flushSync(() => cambiar(pantalla))
    if (pantalla === 'historial') click('Historial de compra/venta')
    if (pantalla === 'ventas') click('Ventas')
    if (pantalla === 'proveedores') click('Proveedores')
    if (pantalla !== 'proveedores') {
      const fechas = document.querySelectorAll<HTMLInputElement>('section input[type=date]')
      exigir(fechas.length >= 2, 'Faltan fechas ' + pantalla)
      valor(fechas[0], '2026-01-01')
      valor(fechas[1], '2026-09-30')
    }
    await listo()
    const selector = document.querySelector<HTMLSelectElement>(
      '[aria-label="Registros por página"]'
    )!
    valor(selector, '50')
    await listo()
    let contenedor = tabla()
    exigir(contenedor.querySelectorAll('tbody tr').length === 50, 'No hay 50 filas ' + pantalla)
    const pie = document.querySelector<HTMLElement>('nav[aria-label="Paginación"]')!
    exigir(!contenedor.contains(pie), 'Pie dentro de scroll')
    exigir(contenedor.scrollHeight > contenedor.clientHeight, 'No hay scroll vertical ' + pantalla)
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      await visual.captura(pantalla + '-diagnostico')
      throw Error(
        'Scroll horizontal global ' +
          pantalla +
          ' ' +
          JSON.stringify({
            viewport: window.innerWidth,
            documento: document.documentElement.scrollWidth,
            ancho: contenedor.clientWidth,
            css: getComputedStyle(contenedor).maxHeight,
            fuera: [...document.querySelectorAll('main,section,nav,.contenedor-tabla')].map(
              (e) => ({
                nombre: e.tagName,
                clase: e.className,
                ancho: e.getBoundingClientRect().width
              })
            )
          })
      )
    }
    const pagina = contenedor.closest('section')!
    const scrollExteriorMaximo = pagina.scrollHeight - pagina.clientHeight
    pagina.scrollTop = scrollExteriorMaximo
    await esperar()
    exigir(
      pie.getBoundingClientRect().bottom <= window.innerHeight + 1,
      'Pie inaccesible ' + pantalla
    )
    const inicio = contenedor.getBoundingClientRect().top
    contenedor.scrollTop = 250
    await esperar()
    const th = contenedor.querySelector('th')!
    exigir(Math.abs(th.getBoundingClientRect().top - inicio) <= 2, 'Header no sticky ' + pantalla)
    exigir(getComputedStyle(th).backgroundColor !== 'rgba(0, 0, 0, 0)', 'Header transparente')
    const horizontal = contenedor.scrollWidth > contenedor.clientWidth
    if (horizontal) {
      contenedor.scrollLeft = contenedor.scrollWidth
      exigir(contenedor.scrollLeft > 0, 'Horizontal bloqueado')
      const ultima = contenedor.querySelector('tbody tr')!.lastElementChild!
      exigir(
        ultima.getBoundingClientRect().right <= contenedor.getBoundingClientRect().right + 1,
        'Última columna cortada'
      )
    }
    await visual.captura(pantalla + '-50-scroll')
    const importes = (): string =>
      [...document.querySelectorAll('article strong')].map((e) => e.textContent).join('|')
    const resumenInicial = importes()
    click('Siguiente')
    await listo()
    exigir(tabla().scrollTop === 0, 'Página siguiente conserva scroll ' + pantalla)
    exigir(
      document.activeElement?.textContent?.trim() === 'Siguiente',
      'Foco perdido al avanzar ' + pantalla
    )
    exigir(importes() === resumenInicial, 'Cards cambiaron con página')
    tabla().scrollTop = 200
    click('Anterior')
    await listo()
    exigir(tabla().scrollTop === 0, 'Página anterior conserva scroll')
    click('Siguiente')
    await listo()
    click('Siguiente')
    await listo()
    tabla().scrollTop = 200
    valor(document.querySelector<HTMLSelectElement>('[aria-label="Registros por página"]')!, '10')
    await listo()
    exigir(
      tabla().scrollTop === 0 && tabla().querySelectorAll('tbody tr').length === 10,
      '50 → 10 falla'
    )
    exigir(
      pie.textContent?.includes('Página 1 de') ||
        document
          .querySelector('nav[aria-label="Paginación"]')
          ?.textContent?.includes('Página 1 de'),
      'Tamaño no reinicia página'
    )
    valor(document.querySelector<HTMLSelectElement>('[aria-label="Registros por página"]')!, '50')
    await listo()
    click('Siguiente')
    await listo()
    click('Siguiente')
    await listo()
    tabla().scrollTop = 200
    const fecha = document.querySelectorAll<HTMLInputElement>('section input[type=date]')[1]
    if (fecha) valor(fecha, '2026-08-31')
    else valor(document.querySelector<HTMLInputElement>('section input')!, 'PERF')
    await listo()
    exigir(tabla().scrollTop === 0, 'Filtro conserva scroll')
    exigir(
      document.querySelector('nav[aria-label="Paginación"]')?.textContent?.includes('Página 1 de'),
      'Filtro no reinicia página'
    )
    contenedor = tabla()
    pagina.scrollTop = pagina.scrollHeight - pagina.clientHeight
    contenedor.scrollLeft = 0
    contenedor.scrollTop = 0
    await visual.entrada('rueda')
    await esperar(180)
    const rueda = contenedor.scrollTop > 0
    exigir(rueda, 'Rueda bloqueada ' + pantalla)
    contenedor.focus()
    contenedor.scrollTop = 0
    await visual.entrada('PageDown')
    await esperar(180)
    const teclado = contenedor.scrollTop > 0
    exigir(teclado, 'PageDown bloqueado ' + pantalla)
    await visual.entrada('Tab')
    await esperar()
    const foco = document.activeElement
    const tabAccion = !!foco && contenedor.contains(foco) && foco.tagName === 'BUTTON'
    if (pantalla === 'historial') {
      click('Ver detalle')
      await esperar(60)
      exigir(document.querySelector('dialog[open] #detalle-cuenta'), 'Detalle no abre')
      flushSync(() =>
        document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }))
      )
      await esperar(50)
      exigir(!document.querySelector('dialog[open]'), 'Detalle no cierra')
    }
    console.info('Scroll verificado: ' + pantalla)
    validaciones.push({
      pantalla,
      filas: 50,
      vertical: true,
      horizontal,
      sticky: true,
      pieFuera: true,
      scrollExteriorMaximo,
      cambioPagina: true,
      cambioLimite: true,
      filtroProfundo: true,
      focoNavegacion: true,
      rueda,
      teclado,
      tabAccion,
      alto: contenedor.clientHeight,
      ancho: contenedor.clientWidth,
      viewport: [window.innerWidth, window.innerHeight]
    })
  }
  perfil.resultado({ validaciones })
}
main().catch((e) => perfil.resultado({ error: e.stack }))
