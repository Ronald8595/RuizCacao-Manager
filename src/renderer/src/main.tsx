import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

/**
 * Corrección: scroll accidental sobre campos numéricos.
 *
 * Problema: en Chrome/Electron, cuando un <input type="number"> tiene el
 * foco, girar la rueda del mouse sobre el campo incrementa o decrementa su
 * valor. Esto generaba errores de captura en Ventas, Cuentas, Stock y
 * Gastos (peso del cacao, montos de dinero), produciendo saldos a favor o
 * deudas que no correspondían.
 *
 * Solución: en cuanto se detecta scroll (wheel) mientras el elemento con
 * foco es un input numérico, le quitamos el foco (blur). Al perder el
 * foco, el navegador ya no le aplica el cambio de valor por scroll. El
 * campo sigue siendo totalmente editable con el teclado; solo se anula el
 * scroll accidental del mouse.
 *
 * Se aplica acá, a nivel global de la app, en lugar de repetirlo en cada
 * <input type="number"> de cada página, para cubrir automáticamente todos
 * los campos numéricos actuales y los que se agreguen a futuro.
 */
document.addEventListener(
  'wheel',
  () => {
    const activo = document.activeElement as HTMLElement | null
    if (activo && activo.tagName === 'INPUT' && (activo as HTMLInputElement).type === 'number') {
      activo.blur()
    }
  },
  { passive: true }
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
