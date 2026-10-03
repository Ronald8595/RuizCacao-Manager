import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import CompraVenta from '../src/renderer/src/pages/CompraVenta'
import Gastos from '../src/renderer/src/pages/Gastos'
import Consultas from '../src/renderer/src/pages/Consultas'
import Clientes from '../src/renderer/src/pages/Clientes'
import { AppDataProvider } from '../src/renderer/src/store/AppDataContext'
import { NotificacionProvider } from '../src/renderer/src/store/NotificacionContext'
import type { EstadoAplicacion } from '../src/shared/persistencia'
declare const perfil: {
  estado: () => Promise<EstadoAplicacion>
  historial: (m: string, f: unknown) => Promise<unknown>
  resultado: (r: unknown) => void
}
let retrasarReporte = false
;(window as unknown as { api: unknown }).api = {
  datos: Object.fromEntries(
    [
      'historialCompras',
      'historialVentas',
      'historialCombinado',
      'listadoGastos',
      'resumenGastos',
      'reportePeriodo'
    ].map((m) => [
      m,
      (f: unknown) => {
        const respuesta = perfil.historial(
          m === 'historialCompras' ? 'compras' : m === 'historialVentas' ? 'ventas' : m,
          f
        )
        if (retrasarReporte && m === 'reportePeriodo') {
          retrasarReporte = false
          return respuesta.then((v) => new Promise((resolve) => setTimeout(() => resolve(v), 1500)))
        }
        return respuesta
      }
    ])
  )
}
const esperar = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms))
function click(texto: string): void {
  const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === texto
  )
  if (!b) throw Error('Falta botón ' + texto)
  flushSync(() => b.click())
}
function fecha(i: number, v: string): void {
  const e = document.querySelectorAll<HTMLInputElement>('input[type=date]')[i]
  if (!e) throw Error('Falta fecha')
  flushSync(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(e, v)
    e.dispatchEvent(new Event('input', { bubbles: true }))
    e.dispatchEvent(new Event('change', { bubbles: true }))
  })
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
          {p === 'historial' ? (
            <CompraVenta />
          ) : p === 'gastos' ? (
            <Gastos />
          ) : p === 'reportes' ? (
            <Consultas />
          ) : p === 'clientes' ? (
            <Clientes />
          ) : null}
        </AppDataProvider>
      </NotificacionProvider>
    )
  }
  const root = createRoot(document.getElementById('root')!)
  flushSync(() => root.render(<Pantallas />))
  const mediciones: unknown[] = []
  const validaciones: unknown[] = []
  async function listo(): Promise<void> {
    await esperar(180)
    for (let i = 0; i < 500 && document.body.textContent?.includes('Cargando'); i++) await esperar()
    await esperar(30)
    if (document.querySelector('[role="alert"]')) throw Error('Error de consulta en el arnés')
    if (document.querySelectorAll('section tbody tr').length > 50)
      throw Error('Más de 50 filas visibles')
  }
  function seleccionar(e: HTMLSelectElement, valor: string): void {
    flushSync(() => {
      e.value = valor
      e.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  for (const pantalla of ['historial', 'gastos', 'reportes', 'clientes', 'proveedores']) {
    flushSync(() => cambiar(''))
    await esperar()
    const t = performance.now()
    flushSync(() => cambiar(pantalla === 'proveedores' ? 'clientes' : pantalla))
    if (pantalla === 'historial') click('Historial de compra/venta')
    if (pantalla === 'proveedores') click('Proveedores')
    if (pantalla === 'gastos' || pantalla === 'reportes') {
      fecha(0, '2026-01-01')
      fecha(1, '2026-09-30')
    }
    const renderSincronoMs = performance.now() - t
    document.body.getBoundingClientRect()
    const renderLayoutMs = performance.now() - t
    // Espera solo las respuestas; no usa rAF de ventana oculta para atribuir latencia.
    for (let i = 0; i < 500 && document.body.textContent?.includes('Cargando'); i++) await esperar()
    await esperar(250)
    mediciones.push({
      pantalla,
      renderSincronoMs,
      renderLayoutMs,
      datosListosMs: performance.now() - t,
      filas: document.querySelectorAll('tbody tr').length
    })
    if (document.querySelector('[aria-label="Paginación"]')) {
      const importes = (): string =>
        [...document.querySelectorAll('article strong')].map((e) => e.textContent).join('|')
      const inicial = importes()
      for (const cantidad of [10, 15, 25, 50]) {
        seleccionar(
          document.querySelector<HTMLSelectElement>('[aria-label="Registros por página"]')!,
          String(cantidad)
        )
        await listo()
        if (document.querySelectorAll('tbody tr').length !== cantidad)
          throw Error('Límite visible incorrecto ' + pantalla)
        if (
          !document.querySelector('[aria-label="Paginación"]')?.textContent?.includes('Página 1 de')
        )
          throw Error('Tamaño no reinicia página')
        click('Siguiente')
        await listo()
        click('Siguiente')
        await listo()
        if (
          !document.querySelector('[aria-label="Paginación"]')?.textContent?.includes('Página 3 de')
        )
          throw Error('Navegación falla')
        if (importes() !== inicial) throw Error('Resumen financiero cambió con página')
        click('Anterior')
        await listo()
        validaciones.push({ pantalla, cantidad, paginas: true, resumenInvariante: true })
      }
      if (pantalla === 'reportes' || pantalla === 'gastos') {
        fecha(1, '2026-08-31')
        await listo()
        if (
          !document.querySelector('[aria-label="Paginación"]')?.textContent?.includes('Página 1 de')
        )
          throw Error('Rango no reinicia página')
        fecha(1, '2026-09-30')
        await listo()
      }
      if (pantalla === 'historial') {
        click('Ver detalle')
        await esperar(50)
        if (!document.querySelector('dialog[open] #detalle-cuenta'))
          throw Error('Detalle de cuenta no abrió')
        const dialogo = document.querySelector('dialog')!
        flushSync(() =>
          dialogo.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }))
        )
        await esperar(30)
        if (document.querySelector('dialog[open]')) throw Error('Detalle de cuenta no cerró')
        seleccionar(
          document.querySelector<HTMLSelectElement>('[aria-label="Tipo de operación"]')!,
          'compra'
        )
        await listo()
        if (
          !document.querySelector('[aria-label="Paginación"]')?.textContent?.includes('Página 1 de')
        )
          throw Error('Tipo no reinicia página')
        validaciones.push({ pantalla, detalleYAbonos: true, filtroDesdePaginaProfunda: true })
      }
      if (pantalla === 'gastos') {
        click('Resumen')
        await listo()
        const resumen = document.querySelector('section')!.textContent
        click('Lista de gastos')
        await listo()
        click('Siguiente')
        await listo()
        click('Resumen')
        await listo()
        if (document.querySelector('section')!.textContent !== resumen)
          throw Error('Resumen de Gastos depende de página')
        validaciones.push({ pantalla, resumenRangoCompletoInvariante: true })
      }
      if (pantalla === 'reportes') {
        retrasarReporte = true
        fecha(1, '2026-08-31')
        await esperar(220)
        fecha(1, '2026-07-31')
        await listo()
        const vigente =
          document.querySelector('[aria-label="Paginación"]')!.textContent + '|' + importes()
        await esperar(1600)
        if (
          document.querySelector('[aria-label="Paginación"]')!.textContent + '|' + importes() !==
          vigente
        )
          throw Error('Respuesta anterior sobrescribió el filtro vigente')
        click('Mensual')
        await listo()
        if (
          !document.querySelector('[aria-label="Paginación"]')?.textContent?.includes('Página 1 de')
        )
          throw Error('Modo no reinicia página')
        validaciones.push({ pantalla, modoYRangoReinician: true, respuestaAnteriorIgnorada: true })
      }
    }
  }
  root.unmount()
  perfil.resultado({ mediciones, validaciones })
}
main().catch((e) => perfil.resultado({ error: String(e) }))
