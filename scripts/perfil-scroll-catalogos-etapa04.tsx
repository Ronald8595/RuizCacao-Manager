import '../src/renderer/src/assets/main.css'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import Clientes from '../src/renderer/src/pages/Clientes'
import Empleados from '../src/renderer/src/pages/Empleados'
import Sidebar from '../src/renderer/src/components/Sidebar'
import Header from '../src/renderer/src/components/Header'
import { AppDataProvider } from '../src/renderer/src/store/AppDataContext'
import { NotificacionProvider } from '../src/renderer/src/store/NotificacionContext'
import { estadoInicial, type EstadoAplicacion } from '../src/shared/persistencia'
declare const perfil: { estado: () => Promise<void>; resultado: (r: unknown) => void }
declare const visual: {
  captura: (n: string) => Promise<void>
  entrada: (t: string) => Promise<void>
}
let llamadasDatos = 0
;(window as unknown as { api: unknown }).api = {
  datos: new Proxy(
    {},
    {
      get: () => () => {
        llamadasDatos++
        throw Error('Esta prueba no permite comandos ni consultas de datos')
      }
    }
  )
}
const esperar = (ms = 100): Promise<void> => new Promise((r) => setTimeout(r, ms))
function exigir(v: unknown, m: string): asserts v {
  if (!v) throw Error(m)
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
function click(texto: string): void {
  const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (e) => e.textContent?.trim() === texto
  )
  exigir(b, 'Falta botón ' + texto)
  flushSync(() => b.click())
}
function tabla(): HTMLDivElement {
  const e = document.querySelector<HTMLDivElement>('.contenedor-tabla')
  exigir(e, 'Falta contenedor')
  return e
}
async function main(): Promise<void> {
  await perfil.estado() // Espera al zoom del arnés, sin conexión de datos.
  const estado: EstadoAplicacion = {
    datos: {
      ...estadoInicial(),
      clientes: Array.from({ length: 200 }, (_, i) => ({
        id: `ux-cliente-${i}`,
        fechaRegistro: '2026-01-01',
        estado: i % 7 !== 0,
        nombreRazonSocial: `UX Cliente ${String(i + 1).padStart(3, '0')} Muñoz`,
        identificacion: String(1000000000 + i),
        telefono: '0999999999'
      })),
      empleados: Array.from({ length: 90 }, (_, i) => ({
        id: i + 1,
        fechaRegistro: '2026-01-01',
        estado: i % 7 !== 0,
        nombre: `UX Empleado ${String(i + 1).padStart(3, '0')} Peña`,
        cedula: String(1000000000 + i),
        telefono: '0999999999'
      }))
    },
    avisos: [],
    administrador: 'Prueba UX',
    usuarioActual: null,
    usuarios: [],
    umbralesStock: { 'Cacao en Baba': null, 'Cacao Seco': null, Maracuyá: null },
    stockInicialRegistrado: false,
    stockInicialRegistradoEn: null
  }
  const huella = JSON.stringify(estado)
  let cambiar!: (p: string) => void
  function Pantallas(): React.JSX.Element {
    const [p, set] = useState('')
    cambiar = set
    return (
      <NotificacionProvider>
        <AppDataProvider inicial={estado} onSalir={() => {}}>
          <div className="flex h-screen min-w-0">
            <Sidebar
              activePage={p === 'empleados' ? 'empleados' : 'clientes'}
              onNavigate={() => {}}
              collapsed={window.innerWidth <= 1100}
              onToggle={() => {}}
            />
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <Header />
              {p === 'clientes' ? <Clientes /> : p === 'empleados' ? <Empleados /> : null}
            </main>
          </div>
        </AppDataProvider>
      </NotificacionProvider>
    )
  }
  const root = createRoot(document.getElementById('root')!)
  flushSync(() => root.render(<Pantallas />))
  const validaciones: unknown[] = []
  for (const p of ['clientes', 'empleados']) {
    flushSync(() => cambiar(''))
    flushSync(() => cambiar(p))
    await esperar(380)
    if (p === 'clientes')
      valor(document.querySelector<HTMLSelectElement>('nav[aria-label="Paginación"] select')!, '50')
    await esperar()
    const e = tabla(),
      pie = document.querySelector<HTMLElement>('nav[aria-label="Paginación"]')!
    const limite = p === 'clientes' ? 50 : 15
    exigir(e.querySelectorAll('tbody tr').length === limite, 'Paginación actual alterada')
    exigir(!e.contains(pie), 'Pie dentro del scroll')
    exigir(e.scrollHeight > e.clientHeight, 'No hay scroll vertical ' + p)
    exigir(document.documentElement.scrollWidth <= window.innerWidth + 1, 'Desbordamiento global')
    const pagina = e.closest('section')!
    pagina.scrollTop = pagina.scrollHeight - pagina.clientHeight
    await esperar()
    exigir(pie.getBoundingClientRect().bottom <= window.innerHeight + 1, 'Pie cortado')
    e.scrollTop = 200
    await esperar()
    const header = e.querySelector('th')!
    exigir(
      Math.abs(header.getBoundingClientRect().top - e.getBoundingClientRect().top) <= 2,
      'Sticky incorrecto'
    )
    exigir(getComputedStyle(header).backgroundColor !== 'rgba(0, 0, 0, 0)', 'Header transparente')
    const horizontal = e.scrollWidth > e.clientWidth
    e.scrollLeft = e.scrollWidth
    const accion = e.querySelector('tbody tr')!.lastElementChild!
    exigir(
      accion.getBoundingClientRect().right <= e.getBoundingClientRect().right + 1,
      'Acciones cortadas'
    )
    await visual.captura(p + '-scroll')
    e.scrollLeft = 0
    e.scrollTop = 0
    await visual.entrada('rueda')
    await esperar(180)
    exigir(e.scrollTop > 0, 'Rueda bloqueada')
    e.focus()
    e.scrollTop = 0
    await visual.entrada('PageDown')
    await esperar(180)
    exigir(e.scrollTop > 0, 'PageDown bloqueado')
    for (let i = 0; i < 12 && !document.activeElement?.closest('tbody'); i++) {
      await visual.entrada('Tab')
      await esperar(30)
    }
    exigir(
      document.activeElement?.closest('tbody') && document.activeElement?.tagName === 'BUTTON',
      'Tab no llega a acciones'
    )
    const foco = document.activeElement!.getBoundingClientRect()
    exigir(
      foco.bottom <= e.getBoundingClientRect().bottom &&
        foco.top >= header.getBoundingClientRect().bottom,
      'Acción enfocada oculta por header'
    )
    click('Siguiente')
    await esperar()
    exigir(
      e.scrollTop === 0 && pie.textContent?.includes('Página 2 de'),
      'Avance no reinicia scroll'
    )
    e.scrollTop = 200
    click('Anterior')
    await esperar()
    exigir(e.scrollTop === 0, 'Regreso no reinicia scroll')
    click('Siguiente')
    click('Siguiente')
    await esperar()
    e.scrollTop = 200
    valor(document.querySelector<HTMLInputElement>('section input:not([type=checkbox])')!, 'UX')
    await esperar(400)
    exigir(
      e.scrollTop === 0 && pie.textContent?.includes('Página 1 de'),
      'Búsqueda profunda no reinicia'
    )
    if (p === 'clientes') {
      e.scrollTop = 200
      valor(document.querySelector<HTMLSelectElement>('nav[aria-label="Paginación"] select')!, '10')
      await esperar()
      exigir(
        e.scrollTop === 0 && e.querySelectorAll('tbody tr').length === 10,
        'Límite no reinicia'
      )
      valor(document.querySelector<HTMLSelectElement>('nav[aria-label="Paginación"] select')!, '50')
      await esperar()
      e.scrollTop = 200
      flushSync(() =>
        document.querySelector<HTMLInputElement>('section input[type=checkbox]')!.click()
      )
    } else {
      e.scrollTop = 200
      click('Activos')
      await esperar()
      exigir(e.scrollTop === 0, 'Filtro de estado no reinicia')
      e.scrollTop = 200
      flushSync(() =>
        document.querySelector<HTMLButtonElement>('[aria-label="Ordenar por #"]')!.click()
      )
    }
    await esperar()
    exigir(e.scrollTop === 0, 'Filtro/orden conserva scroll')
    const editar = e.querySelector<HTMLButtonElement>(
      p === 'clientes' ? 'button[title="Editar"]' : 'button[title="Editar empleado"]'
    )!
    flushSync(() => editar.click())
    await esperar()
    exigir(
      document.body.textContent?.includes(p === 'clientes' ? 'Editar cliente' : 'Editar Empleado'),
      'Editar no abre'
    )
    click('Cancelar')
    await esperar()
    const desactivar = e.querySelector<HTMLButtonElement>(
      p === 'clientes'
        ? 'button[title="Eliminar"]'
        : 'button[title="Eliminar empleado"]:not(:disabled)'
    )!
    exigir(desactivar, 'Falta acción desactivar')
    flushSync(() => desactivar.click())
    await esperar()
    exigir(
      document.body.textContent?.includes(
        p === 'clientes' ? '¿Eliminar cliente?' : '¿Eliminar empleado?'
      ),
      'Confirmación no abre'
    )
    click('Cancelar')
    await esperar()
    validaciones.push({
      pantalla: p,
      filas: limite,
      vertical: true,
      horizontal,
      sticky: true,
      pieExterno: true,
      reinicios: true,
      rueda: true,
      pageDown: true,
      tabAcciones: true,
      editarCancelar: true,
      desactivarCancelar: true,
      alto: e.clientHeight,
      viewport: [innerWidth, innerHeight]
    })
  }
  exigir(
    llamadasDatos === 0 && JSON.stringify(estado) === huella,
    'Fixture modificada o comando ejecutado'
  )
  perfil.resultado({ validaciones, datosSoloMemoria: true, llamadasDatos, fixtureIntacta: true })
}
main().catch((e) => perfil.resultado({ error: e.stack }))
