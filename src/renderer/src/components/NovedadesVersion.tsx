import { useState } from 'react'
import { VERSION_APP } from '../../../shared/version'
import { confirmarNovedades, debeMostrarNovedades } from '../utils/novedades'
import ModalAccesible from './ModalAccesible'
const almacenamiento = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value)
}
export default function NovedadesVersion({
  usuarioId
}: {
  usuarioId: string
}): React.JSX.Element | null {
  const [visible, setVisible] = useState(() => debeMostrarNovedades(usuarioId, almacenamiento))
  if (!visible) return null
  return (
    <ModalAccesible tituloId="novedades-version" onCerrar={() => {}} ancho="max-w-[520px]">
      <h2 id="novedades-version" className="text-lg font-bold">
        Novedades de RuizCacao Manager {VERSION_APP}
      </h2>
      <p className="mt-3 text-sm">
        Esta actualización corrije un bug de inicio de la aplicación y facilita la consulta de cuentas pendientes.
      </p>
      <ul className="my-4 list-disc space-y-2 pl-5 text-sm">
        <li>Inicio de la aplicación mucho más rápido.</li>
        <li>Mejoras en el arranque y cierre de la aplicación.</li>
        <li>Las cuentas ahora muestran la fecha de la operación que las originó.</li>
      </ul>
      <button
        data-autofocus
        type="button"
        onClick={() => {
          confirmarNovedades(usuarioId, almacenamiento)
          setVisible(false)
        }}
        className="rounded-xl bg-[#16834b] px-5 py-2 text-white"
      >
        Entendido
      </button>
    </ModalAccesible>
  )
}
