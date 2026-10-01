// Arnés de medición: componentes reales, sin comandos comerciales ni datos en disco.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import CompraVenta from '../src/renderer/src/pages/CompraVenta'
import Cuentas from '../src/renderer/src/pages/Cuentas'
import { AppDataProvider } from '../src/renderer/src/store/AppDataContext'
import { NotificacionProvider } from '../src/renderer/src/store/NotificacionContext'
import { crearDominio, crearLecturaDominio } from '../src/shared/dominio'
import type { EstadoAplicacion } from '../src/shared/persistencia'
declare const perfil: {
  estado: () => Promise<EstadoAplicacion>
  historial: (modulo: string, filtro: unknown) => Promise<unknown>
  resultado: (r: unknown) => void
}
const api = window as unknown as { api: unknown }
api.api = {
  datos: {
    historialCompras: (f: unknown) => perfil.historial('compras', f),
    historialVentas: (f: unknown) => perfil.historial('ventas', f)
  }
}
const frame = (): Promise<void> =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
async function main(): Promise<void> {
  const ipc: number[] = [],
    dominio: number[] = []
  let estado!: EstadoAplicacion
  for (let n = 0; n < 3; n++) {
    const t = performance.now()
    estado = await perfil.estado()
    ipc.push(performance.now() - t)
  }
  for (let n = 0; n < 3; n++) {
    const t = performance.now()
    crearDominio(estado.datos)
    dominio.push(performance.now() - t)
  }
  const lectura: number[] = []
  for (let n = 0; n < 3; n++) {
    const t = performance.now()
    crearLecturaDominio(estado.datos)
    lectura.push(performance.now() - t)
  }
  let cambiar!: (p: string) => void
  function Pantallas(): React.JSX.Element {
    const [pantalla, setPantalla] = useState('vacia')
    cambiar = setPantalla
    return (
      <NotificacionProvider>
        <AppDataProvider inicial={estado} onSalir={() => {}}>
          {pantalla === 'compras' ? <CompraVenta /> : pantalla === 'cuentas' ? <Cuentas /> : null}
        </AppDataProvider>
      </NotificacionProvider>
    )
  }
  const root = createRoot(document.getElementById('root')!)
  let t = performance.now()
  flushSync(() => root.render(<Pantallas />))
  const proveedorMs = performance.now() - t
  const pantallas: unknown[] = []
  for (const pantalla of ['compras', 'cuentas'])
    for (let n = 0; n < 3; n++) {
      flushSync(() => cambiar('vacia'))
      await frame()
      t = performance.now()
      flushSync(() => cambiar(pantalla))
      const renderCommitMs = performance.now() - t
      const filas = document.querySelectorAll('tbody tr').length
      const c = performance.now()
      document.body.getBoundingClientRect()
      const layoutMs = performance.now() - c
      await frame()
      const hastaFrameMs = performance.now() - t
      pantallas.push({ pantalla, renderCommitMs, layoutMs, hastaFrameMs, filas })
    }
  const validaciones: unknown[] = []
  const region = document.querySelector<HTMLDivElement>('[aria-label="Listado de cuentas"]')
  if (region) {
    const esperadas = estado.datos.cuentas.filter(
      (c) => c.estado !== 'cerrado' && c.estado !== 'anulado'
    )
    for (const scroll of [0, Math.floor(esperadas.length / 2) * 56, region.scrollHeight]) {
      flushSync(() => {
        region.scrollTop = scroll
        region.dispatchEvent(new Event('scroll'))
      })
      await frame()
      const filas = [...region.querySelectorAll<HTMLTableRowElement>('[data-cuenta-id]')]
      for (const fila of filas) {
        const i = Number(fila.getAttribute('aria-rowindex')) - 2
        if (
          fila.dataset.cuentaId !== esperadas[i]?.id ||
          Math.abs(fila.getBoundingClientRect().height - 56) > 1
        )
          throw Error('Fila virtual fuera de orden o altura variable')
      }
      validaciones.push({
        scroll: region.scrollTop,
        filas: filas.length,
        primera: Number(filas[0]?.getAttribute('aria-rowindex')) - 2,
        ultima: Number(filas.at(-1)?.getAttribute('aria-rowindex')) - 2
      })
    }
    const ultima = validaciones.at(-1) as { ultima: number }
    if (ultima.ultima !== esperadas.length - 1) throw Error('No se puede alcanzar la última cuenta')
    // Al abrir/cerrar detalle de cliente debe reconstruirse el contenedor y sus listeners.
    flushSync(() => {
      region.scrollTop = 0
      region.dispatchEvent(new Event('scroll'))
    })
    await frame()
    const cliente = [...region.querySelectorAll<HTMLTableRowElement>('[data-cuenta-id]')].find(
      (f) => estado.datos.cuentas.find((c) => c.id === f.dataset.cuentaId)?.categoria !== 'compra'
    )
    if (cliente) {
      flushSync(() => cliente.querySelector<HTMLButtonElement>('td:nth-child(2) button')?.click())
      const volver = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes('Volver')
      )
      if (!volver) throw Error('Detalle de cliente no abrió')
      flushSync(() => volver.click())
      await frame()
      const nuevo = document.querySelector<HTMLDivElement>('[aria-label="Listado de cuentas"]')!
      flushSync(() => {
        nuevo.scrollTop = nuevo.scrollHeight
        nuevo.dispatchEvent(new Event('scroll'))
      })
      await frame()
      const fin = [...nuevo.querySelectorAll('[data-cuenta-id]')].at(-1)
      if (fin?.getAttribute('data-cuenta-id') !== esperadas.at(-1)?.id)
        throw Error('Scroll falla al volver del detalle')
      validaciones.push({ detalleClienteYRetorno: true })
    }
    const lista = document.querySelector<HTMLDivElement>('[aria-label="Listado de cuentas"]')!
    const boton = lista.querySelector<HTMLButtonElement>('[data-cuenta-id] button')!
    boton.focus()
    flushSync(() => {
      lista.scrollTop = 0
      lista.dispatchEvent(new Event('scroll'))
    })
    await frame()
    if (document.activeElement !== lista) throw Error('Foco se pierde al retirar la fila del DOM')
    const filtro = [...document.querySelectorAll<HTMLSelectElement>('select')].find((s) =>
      s.querySelector('option[value="abiertas"]')
    )!
    flushSync(() => {
      lista.scrollTop = lista.scrollHeight
      lista.dispatchEvent(new Event('scroll'))
    })
    await frame()
    flushSync(() => {
      filtro.value = 'todas'
      filtro.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await frame()
    const todas = document.querySelector<HTMLDivElement>('[aria-label="Listado de cuentas"]')!
    if (
      todas.scrollTop !== 0 ||
      todas.querySelector('[data-cuenta-id]')?.getAttribute('data-cuenta-id') !==
        estado.datos.cuentas[0].id
    )
      throw Error('Cambiar filtro desde scroll profundo no reinicia correctamente')
    if (
      Number(todas.querySelector('table')?.getAttribute('aria-rowcount')) !==
      estado.datos.cuentas.length + 1
    )
      throw Error('Filtro Todas omite cuentas')
    validaciones.push({
      focoConservado: true,
      filtroDesdeProfundidad: true,
      todasLasCuentas: estado.datos.cuentas.length
    })
  }
  flushSync(() => cambiar('vacia'))
  root.unmount()
  perfil.resultado({
    ipcRoundtripMs: ipc,
    crearDominioMs: dominio,
    crearLecturaMs: lectura,
    proveedorMs,
    pantallas,
    validaciones
  })
}
main().catch((e) => perfil.resultado({ error: String(e) }))
