import type { Cliente, Cuenta, MovimientoCuenta, Venta } from '../../types'
import { EMPRESA } from '../../constants/empresa'
import logoGrupoRuiz from '../../assets/brand/logo-grupo-ruiz.jpeg'
import { formatoFecha, formatoMoneda } from '../../utils/reportes'

interface Props {
  cuenta: Cuenta
  movimiento: MovimientoCuenta
  venta: Venta | null
  cliente: Cliente | null
}

/**
 * @description Plantilla React reutilizable del comprobante de pago.
 * @param cuenta Cuenta afectada.
 * @param movimiento Movimiento que originó el comprobante.
 * @param venta Venta de origen, si existe.
 * @param cliente Cliente del documento.
 * @businessLogic Mantiene la estructura visual del PDF dentro de React para
 * vista previa e impresión; el motor PDF vive aparte en comprobantePdf.ts.
 * @dbMigration Los props seguirán viniendo de relaciones de PostgreSQL.
 */
export default function ComprobantePago({ cuenta, movimiento, venta, cliente }: Props): React.JSX.Element {
  const saldo = Math.max(0, cuenta.montoTotal - cuenta.montoPagado)
  const detalle = venta
    ? `${venta.producto}${venta.numeroLote ? ` · Lote ${venta.numeroLote}` : ''}`
    : movimiento.tipo

  return (
    <article className="mx-auto w-full max-w-[820px] bg-white p-8 text-[#303430] shadow-sm print:max-w-none print:p-0 print:shadow-none">
      <header className="grid grid-cols-[1fr_auto] items-start gap-6 border-b-[3px] border-[#1d6427] pb-4">
        <div className="flex items-center gap-3">
          <img src={logoGrupoRuiz} alt={EMPRESA.nombre} className="h-[72px] w-[72px] object-contain" />
          <div>
            <h1 className="font-serif text-[21px] font-bold text-[#1d6427]">{EMPRESA.nombre}</h1>
            <p className="text-[12px] text-[#6a6f6b]">{EMPRESA.nombreComercial}</p>
            <p className="text-[12px] text-[#6a6f6b]">{EMPRESA.direccion}</p>
            {EMPRESA.ruc && <p className="text-[12px] text-[#6a6f6b]">RUC: {EMPRESA.ruc}</p>}
          </div>
        </div>
        <div className="text-right">
          <h2 className="font-serif text-[17px] font-bold">Comprobante de Pago</h2>
          <p className="text-[22px] font-extrabold text-[#1d6427]">N° {movimiento.numeroComprobante ?? '—'}</p>
          <p className="mt-1 text-[12px] text-[#626762]">Fecha: {formatoFecha(movimiento.fecha)}</p>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-[1.7fr_1fr] gap-4">
        <section className="min-h-[92px] rounded-r border-l-[5px] border-[#c9a24a] bg-[#f7f8f8] p-4">
          <h3 className="mb-2.5 text-[10px] font-extrabold uppercase text-[#1d6427]">Datos del cliente</h3>
          <p className="text-[12px]"><strong>Cliente:</strong> {cliente?.nombreRazonSocial ?? 'Cliente no especificado'}</p>
          <p className="mt-1 text-[12px]"><strong>RUC/CI:</strong> {cliente?.identificacion ?? '—'}</p>
          <p className="mt-1 text-[12px]"><strong>Teléfono:</strong> {cliente?.telefono ?? '—'}</p>
        </section>
        <section className="min-h-[92px] rounded-r border-l-[5px] border-[#c9a24a] bg-[#f7f8f8] p-4">
          <h3 className="mb-2.5 text-[10px] font-extrabold uppercase text-[#1d6427]">Detalles de venta</h3>
          <p className="text-[12px]"><strong>Forma de pago:</strong></p>
          <p className="mt-1 text-[12px]">{movimiento.metodoPago}</p>
          <p className="mt-1 text-[12px]"><strong>Estado:</strong> {saldo <= 0 ? 'Pagado' : 'Parcial'}</p>
        </section>
      </div>

      <table className="mt-6 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-[#176523] text-white">
            <th className="px-3 py-2 text-left text-[10px] uppercase">Descripción</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase">Peso neto</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase">P. Unit.</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border-b border-[#dfe2df] px-3 py-3">{detalle}</td>
            <td className="border-b border-[#dfe2df] px-3 py-3 text-right">{venta ? `${venta.pesoBruto.toLocaleString('es-EC', { maximumFractionDigits: 2 })} qq` : '—'}</td>
            <td className="border-b border-[#dfe2df] px-3 py-3 text-right">{venta ? `$${formatoMoneda(venta.precioUnitario)}` : '—'}</td>
            <td className="border-b border-[#dfe2df] px-3 py-3 text-right font-bold">${formatoMoneda(movimiento.monto)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-7 grid grid-cols-[1fr_340px] gap-7">
        <div className="text-[12px] leading-relaxed text-[#6d726e]">
          <strong className="mb-1 block text-[#666b67]">Observaciones:</strong>
          <p>{movimiento.observacion}</p>
          <p className="mt-2"><strong>Movimiento:</strong> {movimiento.tipo}</p>
          {saldo > 0 && <p className="mt-1"><strong>Saldo pendiente:</strong> ${formatoMoneda(saldo)}</p>}
        </div>
        <div>
          <div className="flex justify-between py-1.5 text-[13px]"><span>Valor de venta:</span><span>${formatoMoneda(venta?.totalVenta ?? cuenta.montoTotal)}</span></div>
          <div className="flex justify-between py-1.5 text-[13px]"><span>Pago registrado:</span><span>${formatoMoneda(movimiento.monto)}</span></div>
          <div className="mt-0.5 flex justify-between border-t-[3px] border-[#c9a24a] pt-2.5 text-[16px] font-extrabold text-[#1d6427]"><span>Saldo:</span><span>${formatoMoneda(saldo)}</span></div>
        </div>
      </div>

      <p className="mt-10 text-center font-serif text-[17px] italic text-[#1d6427]">¡Gracias por preferirnos!</p>
      <footer className="mt-10 border-t border-[#dfe2df] pt-2.5 text-center text-[9px] text-[#9a9f9b]">
        Comprobante oficial generado por el sistema interno {EMPRESA.nombreComercial} · {EMPRESA.nombre}
      </footer>
    </article>
  )
}
