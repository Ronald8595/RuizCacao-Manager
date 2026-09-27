import ModalAccesible from './ModalAccesible'
import { useAppData, saldoDeCuenta } from '../store/AppDataContext'
import { formatoMoneda, formatoFecha } from '../utils/reportes'
import type { Cuenta } from '../types'

export default function DetalleCuenta({
  cuenta,
  onCerrar
}: {
  cuenta: Cuenta
  onCerrar: () => void
}): React.JSX.Element {
  const { movimientosCuenta, clientes, compras, ventas } = useAppData()
  const compra = cuenta.categoria === 'compra'
  const operacion = compra
    ? compras.find((c) => c.id === cuenta.compraId)
    : ventas.find((v) => v.id === cuenta.ventaId)
  const nombre = compra
    ? cuenta.proveedorNombre
    : clientes.find((c) => c.id === cuenta.clienteId)?.nombreRazonSocial
  const movimientos = movimientosCuenta
    .filter((m) => m.cuentaId === cuenta.id)
    .sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) || a.fechaHoraRegistro.localeCompare(b.fechaHoraRegistro)
    )
  return (
    <ModalAccesible tituloId="detalle-cuenta" onCerrar={onCerrar} ancho="max-w-[850px]">
      <h2 id="detalle-cuenta" className="text-lg font-bold">
        {compra ? 'Compra' : 'Venta'} N.º {cuenta.numeroCompra ?? cuenta.numeroFactura ?? 'Manual'}{' '}
        · {nombre}
      </h2>
      <p className="my-3 text-sm">
        Fecha: {formatoFecha(cuenta.fecha)} · {operacion?.producto} · Estado: {cuenta.estado}
      </p>
      {operacion && (
        <div className="mb-3 rounded-xl bg-[#f5f7f4] p-3 text-sm">
          <p>
            Cantidad: {'cantidadQq' in operacion ? operacion.cantidadQq : operacion.pesoBruto} qq ·
            Precio/qq: $
            {formatoMoneda(
              'precioCompraQq' in operacion ? operacion.precioCompraQq : operacion.precioUnitario
            )}
          </p>
          <p>
            Subtotal: ${formatoMoneda(operacion.subtotal)} · Impuesto (
            {operacion.impuestoPorcentaje}%): ${formatoMoneda(operacion.montoImpuesto)}
          </p>
          <p>
            Observación:{' '}
            {('observacion' in operacion
              ? operacion.observacion
              : 'observaciones' in operacion
                ? operacion.observaciones
                : undefined) || '—'}
          </p>
          <p>Referencia: {cuenta.comprobante || '—'}</p>
        </div>
      )}
      <p className="mb-2 text-sm text-[#5b635e]">
        Registrado por: {cuenta.usuarioNombre ?? 'Sistema anterior'}
      </p>
      <p className="mb-3 text-sm">
        Total: ${formatoMoneda(cuenta.montoTotal)} · Aplicado a la cuenta: $
        {formatoMoneda(cuenta.montoPagado)} · Saldo: ${formatoMoneda(saldoDeCuenta(cuenta))}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr>
              {['Fecha', 'Movimiento', 'Monto', 'Método', 'Usuario', 'Observación / comprobante'].map((h) => (
                <th key={h} className="p-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id} className="border-t border-[#eef1ee]">
                <td className="p-2">{formatoFecha(m.fecha)}</td>
                <td className="p-2">{m.tipo}</td>
                <td className="p-2">${formatoMoneda(m.monto)}</td>
                <td className="p-2">
                  {m.metodoPago}
                  {m.metodoPago === 'Pago Mixto' && (
                    <div>
                      Efectivo: {formatoMoneda(m.montoEfectivo ?? 0)} · Transferencia:{' '}
                      {formatoMoneda(m.montoTransferencia ?? 0)}
                    </div>
                  )}
                </td>
                <td className="p-2">{m.usuarioNombre ?? 'Sistema anterior'}</td>
                <td className="p-2">
                  {m.observacion}
                  {m.comprobante && ' · ' + m.comprobante}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!movimientos.length && <p className="my-4 text-sm">Todavía no hay pagos registrados.</p>}
      <button type="button" onClick={onCerrar} className="mt-5 rounded-xl border px-4 py-2">
        Cerrar
      </button>
    </ModalAccesible>
  )
}
