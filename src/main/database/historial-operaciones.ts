import type { PoolClient } from 'pg'
import { entidades } from './relacional'
import { validarFiltroStock } from './historial-stock'
import { ErrorNegocio } from '../../shared/errorNegocio'
import {
  TAMANO_PAGINA_OPERACIONES,
  type FiltroHistorialOperaciones,
  type PaginaCompras,
  type PaginaVentas
} from '../../shared/historialOperaciones'
type Modulo = 'compras' | 'ventas'
export function consultaHistorialOperaciones(
  modulo: Modulo,
  input: FiltroHistorialOperaciones
): { sql: string; params: unknown[] } {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !['desde', 'hasta', 'busqueda', 'cursor'].includes(k))
  )
    throw new ErrorNegocio('Revisa los filtros del historial.')
  if (input.cursor && (typeof input.cursor !== 'string' || !input.cursor.startsWith(modulo + '.')))
    throw new ErrorNegocio('El cursor no corresponde a este historial.')
  const f = validarFiltroStock({
    ...input,
    cursor: input.cursor ? input.cursor.slice(modulo.length + 1) : input.cursor
  })
  const e = entidades[modulo],
    fecha = modulo === 'compras' ? 'fecha' : 'fecha_venta'
  const cols = [
    'o.id',
    'o.orden',
    ...e.campos.map((c) => 'o.' + c.columna + (c.tipo === 'date' ? '::text' : ''))
  ]
  const params: unknown[] = [],
    where: string[] = []
  const p = (v: unknown): string => {
    params.push(v)
    return '$' + params.length
  }
  if (f.desde) where.push(`o.${fecha}>=${p(f.desde)}::date`)
  if (f.hasta) where.push(`o.${fecha}<=${p(f.hasta)}::date`)
  if (f.cursor) {
    const { techo, despues } = f.cursor
    where.push(`(o.orden,o.id)<=(${p(techo.orden)}::bigint,${p(techo.id)}::text)`)
    where.push(`(o.orden,o.id)<(${p(despues.orden)}::bigint,${p(despues.id)}::text)`)
  }
  if (f.busqueda) {
    const texto = p(f.busqueda),
      campos =
        modulo === 'compras'
          ? ['o.proveedor_nombre']
          : ['o.fecha_venta::text', 'c.nombre_razon_social']
    where.push(
      '(' +
        campos
          .map((c) => `strpos(lower(coalesce(${c},'') COLLATE "und-x-icu"),${texto})>0`)
          .join(' OR ') +
        ')'
    )
  }
  return {
    sql: `SELECT ${cols.join(',')} FROM ruizcacao.${modulo} o${modulo === 'ventas' && f.busqueda ? ' LEFT JOIN ruizcacao.clientes c ON c.id=o.cliente_id' : ''}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY o.orden DESC,o.id DESC LIMIT ${p(TAMANO_PAGINA_OPERACIONES + 1)}`,
    params
  }
}
async function consultar(
  db: Pick<PoolClient, 'query'>,
  modulo: Modulo,
  input: FiltroHistorialOperaciones
): Promise<PaginaCompras | PaginaVentas> {
  const q = consultaHistorialOperaciones(modulo, input)
  const rows = (await db.query(q.sql, q.params)).rows as Record<string, unknown>[]
  const f = validarFiltroStock({
    ...input,
    cursor: input.cursor ? input.cursor.slice(modulo.length + 1) : input.cursor
  })
  const techo =
    f.cursor?.techo ??
    (rows[0] ? { orden: String(rows[0].orden), id: String(rows[0].id) } : undefined)
  const visibles = rows.slice(0, TAMANO_PAGINA_OPERACIONES),
    last = visibles.at(-1)
  const siguiente =
    rows.length > TAMANO_PAGINA_OPERACIONES && last && techo
      ? modulo +
        '.' +
        Buffer.from(
          JSON.stringify({
            version: 1,
            filtro: f.firma,
            techo,
            despues: { orden: String(last.orden), id: String(last.id) }
          })
        ).toString('base64url')
      : null
  const filas = visibles.map((row) => {
    const dto: Record<string, unknown> = { id: row.id }
    for (const c of entidades[modulo].campos) {
      let v = row[c.columna]
      if (v === null) continue
      if (c.tipo.startsWith('numeric') || c.tipo === 'integer') v = Number(v)
      if (c.tipo === 'timestamptz') v = (v as Date).toISOString()
      dto[c.propiedad] = v
    }
    return dto
  })
  return { filas, siguiente } as unknown as PaginaCompras | PaginaVentas
}
export async function consultarHistorialCompras(
  db: Pick<PoolClient, 'query'>,
  f: FiltroHistorialOperaciones
): Promise<PaginaCompras> {
  return consultar(db, 'compras', f) as Promise<PaginaCompras>
}
export async function consultarHistorialVentas(
  db: Pick<PoolClient, 'query'>,
  f: FiltroHistorialOperaciones
): Promise<PaginaVentas> {
  return consultar(db, 'ventas', f) as Promise<PaginaVentas>
}
