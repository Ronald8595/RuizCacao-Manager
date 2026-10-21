import { hoyOperacion } from '../../../shared/fechasOperaciones'
import { formatoFecha } from '../utils/reportes'

export default function ResumenFechasOperacion({
  operacion,
  movimiento,
  tipo
}: {
  operacion: string
  movimiento?: string
  tipo: 'compra' | 'venta'
}): React.JSX.Element {
  const retroactiva =
    operacion < hoyOperacion() || Boolean(movimiento && movimiento < hoyOperacion())
  return (
    <div
      className="my-3 rounded-xl border border-[#dce5de] p-3 text-[12px]"
      aria-label="Resumen de fechas"
    >
      <p>
        Fecha de {tipo}: <strong>{formatoFecha(operacion)}</strong>
      </p>
      <p>
        {movimiento
          ? `Fecha efectiva de ${tipo === 'compra' ? 'pago' : 'cobro'}: ${formatoFecha(movimiento)}`
          : 'Pendiente: no se registrará movimiento de caja.'}
      </p>
      {retroactiva && (
        <p className="mt-2 text-[#8a641b]">
          Fecha retroactiva. Al confirmar, autorizas registrar la operación y su movimiento en las
          fechas indicadas, sin cambiar la jornada activa.
        </p>
      )}
    </div>
  )
}
