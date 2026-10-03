import type { PoolClient } from 'pg'
import { createHash } from 'node:crypto'
import { ErrorNegocio } from '../../shared/errorNegocio'
import {
  TAMANO_PAGINA_STOCK,
  type FiltroHistorialStock,
  type PaginaHistorialStock,
  type FilaHistorialStock
} from '../../shared/historialStock'

interface Posicion {
  orden: string
  id: string
}
interface Cursor {
  version: 1
  filtro: string
  techo: Posicion
  despues: Posicion
}
interface Filtro {
  limite: number
  desde: string
  hasta: string
  producto: string
  busqueda: string
  firma: string
  cursor: Cursor | null
}
const columnas =
  'id,orden,fecha::text,producto,tipo,entrada_qq,salida_qq,factor_conversion,cantidad_obtenida_qq,diferencia_qq,observacion,usuario_nombre'
const fallo = (): never => {
  throw new ErrorNegocio(
    'No se pudo consultar esta página. Revisa los filtros y vuelve a intentarlo.'
  )
}
function fecha(value: unknown): string {
  if (value === undefined || value === '') return ''
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallo()
  const date = new Date(value + 'T00:00:00Z')
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value < '0001-01-01'
  )
    return fallo()
  return value
}
function posicion(value: unknown): value is Posicion {
  if (!value || typeof value !== 'object') return false
  const p = value as Posicion
  return (
    typeof p.id === 'string' &&
    p.id.length > 0 &&
    p.id.length <= 1000 &&
    !p.id.includes('\0') &&
    typeof p.orden === 'string' &&
    /^[1-9]\d{0,18}$/.test(p.orden) &&
    BigInt(p.orden) <= 9223372036854775807n
  )
}
export function validarFiltroStock(input: FiltroHistorialStock): Filtro {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fallo()
  if (
    Object.keys(input).some(
      (k) => !['desde', 'hasta', 'producto', 'busqueda', 'cursor', 'limite'].includes(k)
    )
  )
    return fallo()
  const limite = input.limite ?? TAMANO_PAGINA_STOCK
  if (![10, 15, 25, 50].includes(limite)) return fallo()
  const desde = fecha(input.desde),
    hasta = fecha(input.hasta)
  if (desde && hasta && desde > hasta) return fallo()
  const producto = input.producto ?? 'Todos'
  if (!['Todos', 'Cacao en Baba', 'Cacao Seco', 'Maracuyá'].includes(producto)) return fallo()
  if (
    input.busqueda !== undefined &&
    (typeof input.busqueda !== 'string' ||
      input.busqueda.length > 500 ||
      input.busqueda.includes('\0'))
  )
    return fallo()
  const busqueda = (input.busqueda ?? '').trim().toLowerCase()
  const firma = createHash('sha256')
    .update(JSON.stringify([desde, hasta, producto, busqueda, limite]))
    .digest('hex')
  let cursor: Cursor | null = null
  if (input.cursor !== undefined && input.cursor !== null) {
    if (
      typeof input.cursor !== 'string' ||
      input.cursor.length > 4096 ||
      !/^[A-Za-z0-9_-]+$/.test(input.cursor)
    )
      return fallo()
    try {
      cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'))
    } catch {
      return fallo()
    }
    if (
      !cursor ||
      cursor.version !== 1 ||
      cursor.filtro !== firma ||
      !posicion(cursor.techo) ||
      !posicion(cursor.despues)
    )
      return fallo()
    if (BigInt(cursor.despues.orden) > BigInt(cursor.techo.orden)) return fallo()
  }
  return { desde, hasta, producto, busqueda, limite, firma, cursor }
}
// Constructor compartido por servicio y benchmark. Solo identificadores constantes.
export function consultaLoteStock(
  f: Filtro,
  despues = f.cursor?.despues,
  techo = f.cursor?.techo,
  conteo = false
): { sql: string; params: unknown[] } {
  const where: string[] = [],
    params: unknown[] = []
  const parametro = (value: unknown): string => {
    params.push(value)
    return '$' + params.length
  }
  if (f.desde) where.push('fecha >= ' + parametro(f.desde) + '::date')
  if (f.hasta) where.push('fecha <= ' + parametro(f.hasta) + '::date')
  if (f.producto !== 'Todos') where.push('producto = ' + parametro(f.producto))
  if (techo)
    where.push(`(orden,id) <= (${parametro(techo.orden)}::bigint,${parametro(techo.id)}::text)`)
  if (despues && !conteo)
    where.push(`(orden,id) < (${parametro(despues.orden)}::bigint,${parametro(despues.id)}::text)`)
  if (f.busqueda) {
    const texto = parametro(f.busqueda)
    where.push(
      '(' +
        ['fecha::text', 'producto', 'proveedor_nombre', 'observacion']
          .map(
            (columna) => `strpos(lower(coalesce(${columna},'') COLLATE "und-x-icu"),${texto}) > 0`
          )
          .join(' OR ') +
        ')'
    )
  }
  const limite = f.limite + 1
  return {
    sql: `SELECT ${conteo ? 'count(*)::text total' : columnas} FROM ruizcacao.movimientos_stock${where.length ? ' WHERE ' + where.join(' AND ') : ''} ${conteo ? '' : 'ORDER BY orden DESC,id DESC LIMIT ' + parametro(limite)}`,
    params
  }
}
type FilaSQL = Record<string, unknown> & {
  id: string
  orden: string
  fecha: string
  producto: FilaHistorialStock['producto']
  tipo: FilaHistorialStock['tipo']
}
function dto(r: FilaSQL): FilaHistorialStock {
  const fila: FilaHistorialStock = {
    id: r.id,
    fecha: r.fecha,
    producto: r.producto,
    tipo: r.tipo,
    entradaQq: Number(r.entrada_qq),
    salidaQq: Number(r.salida_qq)
  }
  if (r.factor_conversion !== null) fila.factorConversion = Number(r.factor_conversion)
  if (r.cantidad_obtenida_qq !== null) fila.cantidadObtenidaQq = Number(r.cantidad_obtenida_qq)
  if (r.diferencia_qq !== null) fila.diferenciaQq = Number(r.diferencia_qq)
  if (r.observacion !== null) fila.observacion = String(r.observacion)
  if (r.usuario_nombre !== null) fila.usuarioNombre = String(r.usuario_nombre)
  return fila
}
export async function consultarHistorialStock(
  db: Pick<PoolClient, 'query'>,
  input: FiltroHistorialStock
): Promise<PaginaHistorialStock> {
  const f = validarFiltroStock(input),
    encontradas: FilaSQL[] = []
  const q = consultaLoteStock(f)
  const rows = (await db.query(q.sql, q.params)).rows as FilaSQL[]
  const techo =
    f.cursor?.techo ?? (rows.length ? { orden: String(rows[0].orden), id: rows[0].id } : undefined)
  encontradas.push(...rows)
  const visibles = encontradas.slice(0, f.limite),
    last = visibles[visibles.length - 1]
  const siguiente =
    encontradas.length > f.limite && techo
      ? Buffer.from(
          JSON.stringify({
            version: 1,
            filtro: f.firma,
            techo,
            despues: { orden: String(last.orden), id: last.id }
          } satisfies Cursor)
        ).toString('base64url')
      : null
  const count = consultaLoteStock(f, undefined, techo, true)
  const total = Number((await db.query(count.sql, count.params)).rows[0].total)
  return { filas: visibles.map(dto), siguiente, total }
}
