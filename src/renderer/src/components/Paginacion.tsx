import { LIMITES_PAGINA, type LimitePagina } from '../../../shared/listados'
interface Props<T extends number = LimitePagina> {
  total: number
  limite: T
  limites?: readonly T[]
  numero: number
  hayAnterior: boolean
  haySiguiente: boolean
  cargando?: boolean
  anterior: () => void
  siguiente: () => void
  cambiarLimite: (limite: T) => void
}
export default function Paginacion<T extends number = LimitePagina>(
  p: Props<T>
): React.JSX.Element {
  const paginas = Math.max(1, Math.ceil(p.total / p.limite))
  // aria-disabled conserva el foco durante la consulta; las guardas de los
  // callbacks impiden navegar mientras carga o fuera de los extremos.
  return (
    <nav
      aria-label="Paginación"
      className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 text-[12px] text-[#8a938d]"
    >
      <label className="flex items-center gap-2">
        Mostrar
        <select
          aria-label="Registros por página"
          value={p.limite}
          onChange={(e) => p.cambiarLimite(Number(e.target.value) as T)}
          className="rounded-lg border border-[#e1e5e1] bg-white px-2 py-1"
        >
          {(p.limites ?? LIMITES_PAGINA).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span>de {p.cargando ? '…' : p.total} registros</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-disabled={Boolean(p.cargando || !p.hayAnterior)}
          onClick={() => {
            if (!p.cargando && p.hayAnterior) p.anterior()
          }}
          className="rounded-lg border border-[#e1e5e1] bg-white px-3 py-1.5 font-semibold aria-disabled:opacity-40"
        >
          Anterior
        </button>
        <span aria-live="polite">
          Página {p.numero} de {p.cargando ? '…' : paginas}
        </span>
        <button
          type="button"
          aria-disabled={Boolean(p.cargando || !p.haySiguiente)}
          onClick={() => {
            if (!p.cargando && p.haySiguiente) p.siguiente()
          }}
          className="rounded-lg border border-[#e1e5e1] bg-white px-3 py-1.5 font-semibold aria-disabled:opacity-40"
        >
          Siguiente
        </button>
      </div>
    </nav>
  )
}
