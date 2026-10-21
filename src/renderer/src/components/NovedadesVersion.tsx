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
        <li>Bug de carga de respaldos resuelto, ahora puedes generar tus respaldos y cargarlos.</li>
        <li>Ahora puedes registrar operaciones de días anteriores y establecer por separado la fecha en que se realizó cada pago o cobro.</li>
        <li>Cada movimiento se refleja en su fecha efectiva, manteniendo la fecha original de la compra o venta.</li>
        <li>Reportes más claros. Consulta la fecha de origen de los pagos y cobros, con la misma información en los reportes y archivos PDF.</li>
        <li>Nueva sección «Pagos efectuados». Desde Gastos puedes consultar los pagos a proveedores y gastos operativos según la fecha en que se realizaron, sin duplicar importes.</li>
        <li>Descripciones más precisas. Se distinguen pagos totales, cobros totales, abonos iniciales y liquidaciones.</li>
        <li> Ahora Puedes registrar gastos operativos con su fecha correspondiente, aunque los ingreses posteriormente.</li>
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
