// Arnés opt-in: fixtures en memoria, nunca se importa desde la aplicación.
import '../src/renderer/src/assets/main.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import Respaldos from '../src/renderer/src/pages/Respaldos'
import type { ApiRespaldos, ProgresoRespaldo } from '../src/shared/respaldos'
const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const listeners = new Set<(p: ProgresoRespaldo) => void>()
let llamadas = 0,
  datos = 0,
  maxListeners = 0,
  terminar: ((r: unknown) => void) | undefined
let dialogoCancelado = false,
  fallo = false,
  passwordMala = false,
  reinicios = 0
const ok = <T,>(valor: T): { ok: true; valor: T } => ({ ok: true, valor })
const api: ApiRespaldos = {
  seleccionarDestinoRespaldo: async () => {
    llamadas++
    return ok(
      dialogoCancelado ? null : { operacionId: id, nombre: 'RuizCacao_2026-10-16_12-00.back' }
    )
  },
  seleccionarRespaldo: async () => {
    llamadas++
    return ok(
      dialogoCancelado ? null : { operacionId: id, nombre: 'RuizCacao_2026-10-16_12-00.back' }
    )
  },
  generarRespaldo: async () => {
    llamadas++
    return await new Promise((r) => {
      terminar = r as (r: unknown) => void
    })
  },
  validarRespaldoSeleccionado: async () => {
    llamadas++
    return await new Promise((r) => {
      terminar = r as (r: unknown) => void
    })
  },
  cargarRespaldo: async () => {
    llamadas++
    if (passwordMala)
      return {
        ok: false,
        codigo: 'password',
        error: 'La contraseña no es correcta. Revisa e intenta nuevamente.'
      }
    return await new Promise((r) => {
      terminar = r as (r: unknown) => void
    })
  },
  cancelarOperacionRespaldo: async () => {
    llamadas++
    terminar?.(ok({ estado: 'cancelado' }))
    return ok(true)
  },
  reiniciarDespuesDeRestauracion: async () => {
    llamadas++
    reinicios++
    return ok(undefined)
  },
  alProgreso: (_, fn) => {
    listeners.add(fn)
    maxListeners = Math.max(maxListeners, listeners.size)
    return () => {
      listeners.delete(fn)
    }
  }
}
;(window as unknown as { api: unknown }).api = {
  respaldos: api,
  datos: new Proxy(
    {},
    {
      get: () => () => {
        datos++
        throw Error('Datos comerciales prohibidos en UI')
      }
    }
  )
}
const root = createRoot(document.getElementById('root')!)
function montar(admin = true): void {
  flushSync(() =>
    root.render(
      <StrictMode>
        <div className="flex min-h-screen bg-[#f5f7f4]">
          <Respaldos administrador={admin} />
        </div>
      </StrictMode>
    )
  )
}
function click(texto: string): void {
  const b = [
    ...document.querySelectorAll<HTMLButtonElement>('dialog[open] button'),
    ...document.querySelectorAll<HTMLButtonElement>('button')
  ].find((b) => b.textContent?.trim() === texto)
  if (!b) throw Error('Falta botón: ' + texto)
  flushSync(() => b.click())
}
function clave(): void {
  const input = document.querySelector<HTMLInputElement>('input[type=password]')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
    input,
    'Clave-prueba-2026'
  )
  flushSync(() => input.dispatchEvent(new Event('input', { bubbles: true })))
}
Object.assign(window, {
  pruebaRespaldos: {
    montar,
    click,
    clave,
    desmontar: () => flushSync(() => root.render(null)),
    dialogo: (cancelado: boolean) => {
      dialogoCancelado = cancelado
    },
    passwordMala: (mala: boolean) => {
      passwordMala = mala
    },
    progreso: (fase: ProgresoRespaldo['fase'], cancelable = true) => {
      flushSync(() => {
        for (const fn of listeners) fn({ operacionId: id, fase, cancelable })
      })
    },
    resolver: (tipo: string) => {
      fallo = tipo === 'error'
      terminar?.(
        fallo
          ? {
              ok: false,
              codigo: 'danado',
              error: 'El respaldo está dañado o incompleto y no puede cargarse.'
            }
          : ok(
              tipo === 'resumen'
                ? {
                    operacionId: id,
                    preparacionId: id,
                    nombre: 'RuizCacao_2026-10-16_12-00.back',
                    fecha: '2026-10-16T12:00:00.000Z',
                    version: '1.2.1',
                    bytes: 3065309
                  }
                : {
                    estado: tipo === 'cancelado' ? 'cancelado' : 'completado',
                    reiniciar: tipo === 'restore',
                    nombre: 'RuizCacao_2026-10-16_12-00.back'
                  }
            )
      )
    },
    estado: () => ({
      llamadas,
      datos,
      listeners: listeners.size,
      maxListeners,
      reinicios,
      dom: document.querySelectorAll('*').length,
      foco: (document.activeElement as HTMLElement)?.textContent,
      dialogos: document.querySelectorAll('dialog[open]').length
    })
  }
})
