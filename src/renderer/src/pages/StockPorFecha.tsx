import { useState } from 'react'
import { LIMITES_STOCK_FECHA } from '../../../shared/stockPorFecha'
import Paginacion from '../components/Paginacion'
import { useStockPorFecha } from '../hooks/useStockPorFecha'

const cantidad = (n: number): string =>
  n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const hoy = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())

export default function StockPorFecha(): React.JSX.Element {
  const [fecha, setFecha] = useState(hoy)
  const control = useStockPorFecha(fecha)
  const { pagina, cargando, error } = control
  return (
    <section
      aria-label="Stock por fecha"
      className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#272c29]">Stock por fecha</h1>
          <p className="mt-1 text-xs text-[#5b635e]">
            Existencias por fecha operativa · Cantidades en qq
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#3f4942]">
          Fecha
          <input
            aria-label="Fecha del stock"
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-lg border border-[#dce4dc] bg-white px-3 py-2"
          />
        </label>
      </header>
      <details className="mb-4 text-xs text-[#5b635e]">
        <summary className="cursor-pointer font-semibold">Cómo leer este reporte</summary>
        <dl className="mt-2 grid gap-1 sm:grid-cols-2">
          <div>
            <dt className="inline font-semibold">Stock inicial: </dt>
            <dd className="inline">existencias acumuladas antes de comenzar el día.</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Entradas: </dt>
            <dd className="inline">producto incorporado durante el día.</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Salidas: </dt>
            <dd className="inline">producto retirado durante el día.</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Stock final: </dt>
            <dd className="inline">existencias resultantes al finalizar el día.</dd>
          </div>
        </dl>
        <p className="mt-2">
          El inventario inicial cuenta desde su fecha de carga. Los días anteriores reflejan solo
          los movimientos registrados. La hora registrada puede corresponder a una operación
          ingresada con otra fecha.
        </p>
      </details>
      {!fecha ? (
        <p className="py-8 text-sm text-[#5b635e]">Selecciona una fecha para consultar.</p>
      ) : cargando ? (
        <p role="status" className="py-8 text-sm text-[#5b635e]">
          Consultando stock por fecha…
        </p>
      ) : error ? (
        <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
          {error}
          <button type="button" onClick={control.reintentar} className="ml-3 underline">
            Reintentar
          </button>
        </div>
      ) : (
        pagina && (
          <>
            <div className="overflow-x-auto rounded-xl border border-[#e1e5e1] bg-white">
              <table className="w-full text-sm" aria-label="Resumen del stock por producto">
                <thead className="bg-[#f0f5f0] text-[#3f4942]">
                  <tr>
                    {['Producto', 'Stock inicial', 'Entradas', 'Salidas', 'Stock final'].map(
                      (t, i) => (
                        <th
                          key={t}
                          scope="col"
                          className={
                            'whitespace-nowrap px-4 py-3 ' + (i ? 'text-right' : 'text-left')
                          }
                        >
                          {t}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pagina.resumen.map((r) => (
                    <tr key={r.producto} className="border-t border-[#eef1ee]">
                      <th
                        scope="row"
                        className="whitespace-nowrap px-4 py-4 text-left font-semibold"
                      >
                        {r.producto}
                      </th>
                      <td className="px-4 py-4 text-right tabular-nums">{cantidad(r.inicial)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{cantidad(r.entradas)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{cantidad(r.salidas)}</td>
                      <td className="px-4 py-4 text-right font-bold text-[#176b3a] tabular-nums">
                        {cantidad(r.final)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h2 className="mb-3 mt-6 text-base font-bold text-[#272c29]">Movimientos del día</h2>
            {pagina.filas.length === 0 ? (
              <p className="rounded-xl bg-white p-5 text-sm text-[#5b635e]">
                No hay movimientos registrados en esta fecha.
              </p>
            ) : (
              <div
                key={`${fecha}:${control.limite}:${control.numero}`}
                role="region"
                aria-label="Movimientos del día"
                tabIndex={0}
                className="max-h-[45vh] overflow-auto rounded-xl border border-[#e1e5e1] bg-white"
              >
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#f0f5f0] text-[#3f4942]">
                    <tr>
                      {[
                        'Hora registrada',
                        'Producto',
                        'Movimiento',
                        'Entrada (qq)',
                        'Salida (qq)',
                        'Detalle'
                      ].map((t) => (
                        <th key={t} scope="col" className="whitespace-nowrap px-3 py-3 text-left">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagina.filas.map((m) => (
                      <tr key={m.id} className="border-b border-[#eef1ee]">
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                          {m.horaRegistrada}
                        </td>
                        <td className="px-3 py-3">
                          {m.tipo === 'Conversión' ? 'Cacao en Baba → Cacao Seco' : m.producto}
                        </td>
                        <td className="px-3 py-3">{m.tipo}</td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                          {cantidad(m.entrada)}
                          {m.tipo === 'Conversión' && (
                            <span className="block text-xs text-[#5b635e]">Cacao Seco</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                          {cantidad(m.salida)}
                          {m.tipo === 'Conversión' && (
                            <span className="block text-xs text-[#5b635e]">Cacao en Baba</span>
                          )}
                        </td>
                        <td className="min-w-48 max-w-md px-3 py-3 break-words">{m.detalle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      )}
      {fecha && <Paginacion {...control} limites={LIMITES_STOCK_FECHA} />}
    </section>
  )
}
