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
        Esta actualización incorpora anulaciones seguras de compras y ventas y mejoras para proteger
        la información de tus operaciones.
      </p>
      <ul className="my-4 list-disc space-y-2 pl-5 text-sm">
        <li>Las compras y ventas confirmadas ya no se editan.</li>
        <li>Ahora puedes anular operaciones anteriores de forma segura.</li>
        <li>Las anulaciones solicitan motivo y contraseña.</li>
        <li>Stock, cuentas y reportes se ajustan automáticamente.</li>
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
