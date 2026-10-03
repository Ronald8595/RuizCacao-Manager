import { useState } from 'react'
import Paginacion from '../components/Paginacion'
import ContenedorTabla from '../components/ContenedorTabla'
import { useHistorialCombinado } from '../hooks/useListados'
import Compras from './Compras'
import Ventas from './Ventas'
import DetalleCuenta from '../components/DetalleCuenta'
import { useAppData, saldoDeCuenta } from '../store/AppDataContext'
import { formatoFecha, formatoMoneda } from '../utils/reportes'
export default function CompraVenta(): React.JSX.Element {
  const [vista, setVista] = useState('compras')
  const [tipo, setTipo] = useState('todos')
  const [estado, setEstado] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [detalle, setDetalle] = useState<string | null>(null)
  const { cuentas } = useAppData()
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const historial = useHistorialCombinado(
    { desde, hasta, tipo, estado, busqueda },
    cuentas,
    vista === 'historial'
  )
  const filas = historial.filas
  const seleccion = detalle ? cuentas.find((c) => c.id === detalle) : undefined
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <nav aria-label="Compra y venta" className="flex shrink-0 flex-wrap gap-2 px-6 pt-4">
        {[
          ['compras', 'Compras'],
          ['ventas', 'Ventas'],
          ['historial', 'Historial de compra/venta']
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            onClick={() => setVista(id)}
            aria-pressed={vista === id}
            className={
              'rounded-xl px-4 py-2 text-sm font-semibold ' +
              (vista === id ? 'bg-[#e7f4eb] text-[#16834b]' : 'text-[#707972]')
            }
          >
            {label}
          </button>
        ))}
      </nav>
      {vista === 'compras' ? (
        <Compras />
      ) : vista === 'ventas' ? (
        <Ventas />
      ) : (
        <section className="min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
          <h1 className="mb-2 text-xl font-bold">Historial de compra/venta</h1>
          <p className="mb-4 text-sm text-[#707972]">
            Las operaciones conservan sus datos y todos sus abonos, incluso después de quedar
            saldadas.
          </p>
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              aria-label="Buscar historial"
              placeholder="Nombre, fecha o número"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="rounded-xl border p-2"
            />
            <select
              aria-label="Tipo de operación"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="rounded-xl border p-2"
            >
              <option value="todos">Compras y ventas</option>
              <option value="compra">Compras</option>
              <option value="venta">Ventas</option>
            </select>
            <select
              aria-label="Estado del historial"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="rounded-xl border p-2"
            >
              <option value="todos">Todos los estados</option>
              <option value="pendiente">Pendientes</option>
              <option value="parcial">Parciales</option>
              <option value="cerrado">Saldadas</option>
              <option value="anulado">Anuladas</option>
            </select>
            <input
              type="date"
              aria-label="Desde"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-xl border p-2"
            />
            <input
              type="date"
              aria-label="Hasta"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-xl border p-2"
            />
          </div>
          {historial.cargando && <p role="status">Cargando historial…</p>}
          {historial.error && (
            <p role="alert">
              {historial.error} <button onClick={historial.reintentar}>Reintentar</button>
            </p>
          )}
          <ContenedorTabla
            etiqueta="Historial de compra y venta"
            reinicio={JSON.stringify([
              historial.numero,
              historial.limite,
              desde,
              hasta,
              tipo,
              estado,
              busqueda
            ])}
            className="rounded-2xl border bg-white"
          >
            <table className="w-full min-w-[1100px] text-left text-[13px]">
              <thead>
                <tr>
                  {[
                    'Fecha',
                    'Operación',
                    'Cliente / Proveedor',
                    'Total',
                    'Aplicado',
                    'Saldo',
                    'Estado',
                    'Usuario',
                    'Historial'
                  ].map((h) => (
                    <th key={h} className="p-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => (
                  <tr key={c.id} className="border-t border-[#eef1ee]">
                    <td className="p-3">{formatoFecha(c.fecha)}</td>
                    <td className="p-3">
                      {c.categoria === 'compra' ? 'Compra' : 'Venta'} N.º{' '}
                      {c.numeroCompra ?? c.numeroFactura} del día
                    </td>
                    <td className="p-3">{c.titular}</td>
                    <td className="p-3">
                      {'$'}
                      {formatoMoneda(c.montoTotal)}
                    </td>
                    <td className="p-3">
                      {'$'}
                      {formatoMoneda(c.montoPagado)}
                    </td>
                    <td className="p-3">
                      {'$'}
                      {formatoMoneda(saldoDeCuenta(c))}
                    </td>
                    <td className="p-3">{c.estado === 'cerrado' ? 'Saldada' : c.estado}</td>
                    <td className="p-3">{c.usuarioNombre ?? 'Sistema anterior'}</td>
                    <td className="p-3">
                      <button onClick={() => setDetalle(c.id)} className="text-[#16834b] underline">
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
                {!historial.cargando && !historial.error && !filas.length && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center">
                      No hay operaciones que coincidan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ContenedorTabla>
          <Paginacion {...historial} />
        </section>
      )}
      {seleccion && <DetalleCuenta cuenta={seleccion} onCerrar={() => setDetalle(null)} />}
    </div>
  )
}
