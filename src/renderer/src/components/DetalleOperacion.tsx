import ModalAccesible from './ModalAccesible'
import type { Compra, Venta } from '../types'
export default function DetalleOperacion({
  operacion,
  onCerrar
}: {
  operacion: Compra | Venta
  onCerrar: () => void
}): React.JSX.Element {
  const compra = 'numeroCompra' in operacion
  const filas: [string, string | number][] = [
    ['Fecha', compra ? operacion.fecha : operacion.fechaVenta],
    ['Producto', operacion.producto],
    ['Cantidad (qq)', compra ? operacion.cantidadQq : operacion.pesoBruto],
    ['Total', `$${(compra ? operacion.totalCompra : operacion.totalVenta).toFixed(2)}`],
    [
      'Pago inicial',
      `$${(compra ? operacion.montoPagadoInicial : operacion.montoRecibido).toFixed(2)}`
    ],
    ['Registrada por', operacion.usuarioNombre ?? 'Sistema anterior'],
    ['Comprobante', compra ? (operacion.comprobante ?? '—') : operacion.numeroComprobante],
    ['Observación', (compra ? operacion.observacion : operacion.observaciones) ?? '—'],
    ['Estado', operacion.estado === 'anulada' ? 'Anulada' : 'Vigente']
  ]
  if (operacion.estado === 'anulada')
    filas.push(
      [
        'Anulada el',
        operacion.anuladaEn
          ? new Date(operacion.anuladaEn).toLocaleString('es-EC')
          : 'No registrado'
      ],
      ['Anulada por', operacion.anuladaPorNombre ?? 'No registrado'],
      ['Motivo', operacion.motivoAnulacion ?? 'No registrado']
    )
  return (
    <ModalAccesible tituloId="detalle-operacion" onCerrar={onCerrar}>
      <h2 id="detalle-operacion" className="font-bold">
        {compra ? 'Compra' : 'Venta'} N.º{' '}
        {compra ? operacion.numeroCompra : operacion.numeroFactura}
      </h2>
      <dl className="my-4 space-y-2">
        {filas.map(([label, valor]) => (
          <div key={label}>
            <dt className="text-xs text-[#69716b]">{label}</dt>
            <dd className="break-words text-sm">{valor}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={onCerrar} className="rounded-xl border px-4 py-2">
        Cerrar
      </button>
    </ModalAccesible>
  )
}
