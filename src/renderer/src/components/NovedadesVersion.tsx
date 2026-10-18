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
        Esta actualización trae ahora la capacidad de generar respaldos.
      </p>
      <ul className="my-4 list-disc space-y-2 pl-5 text-sm">
        <li>Ahora puedes generar tus respaldos manuales de tu información.</li>
        <li>El modulo de consultas y reportes ha sido rediseñado para mejorar la experiencia del usuario.</li>
        <li>El modulo de stock ahora consta con un submodulo para visualizar los movimientos de inventario.</li>
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
