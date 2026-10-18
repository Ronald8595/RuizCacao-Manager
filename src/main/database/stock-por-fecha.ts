import type { PoolClient } from 'pg'
import { ErrorNegocio } from '../../shared/errorNegocio'
import {
  LIMITES_STOCK_FECHA,
  type FiltroStockFecha,
  type PaginaStockFecha,
  type MovimientoStockFecha,
  type ResumenStockFecha
} from '../../shared/stockPorFecha'

interface Posicion {
  orden: string
  id: string
}
interface PosicionTemporal extends Posicion {
  instante: string
}
interface Cursor {
  version: 1
  fecha: string
  limite: number
  techo: Posicion
  despues: PosicionTemporal
}
const fallo = (): never => {
  throw new ErrorNegocio('No se pudo consultar esta página. Revisa la fecha y vuelve a intentarlo.')
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
export function validarStockFecha(input: FiltroStockFecha): {
  fecha: string
  limite: number
  cursor: Cursor | null
} {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !['fecha', 'limite', 'cursor'].includes(k))
  )
    return fallo()
  const { fecha } = input
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < '0001-01-01')
    return fallo()
  const d = new Date(fecha + 'T00:00:00Z')
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) return fallo()
  const limite = input.limite ?? 25
  if (!LIMITES_STOCK_FECHA.includes(limite)) return fallo()
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
      cursor.fecha !== fecha ||
      cursor.limite !== limite ||
      !posicion(cursor.techo) ||
      !posicion(cursor.despues)
    )
      return fallo()
    const instante = cursor.despues.instante
    if (
      typeof instante !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(instante)
    )
      return fallo()
    const parsed = new Date(instante)
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString() !== instante.slice(0, 23) + 'Z' ||
      BigInt(cursor.despues.orden) > BigInt(cursor.techo.orden)
    )
      return fallo()
  }
  return { fecha, limite, cursor }
}

// Efectos virtuales: la conversión no resta Baba del producto Seco.
// NUMERIC conserva la precisión durante toda la agregación; nunca usa stock_resultante.
export const SQL_RESUMEN_STOCK_FECHA = `WITH efectos AS (
  SELECT m.fecha,CASE WHEN m.tipo='Conversión' THEN 'Cacao Seco' ELSE m.producto END producto,
    m.entrada_qq entrada,CASE WHEN m.tipo='Conversión' THEN 0::numeric ELSE m.salida_qq END salida
  FROM ruizcacao.movimientos_stock m
  WHERE m.fecha <= $1::date AND (m.orden,m.id)<=($2::bigint,$3::text)
  UNION ALL
  SELECT m.fecha,'Cacao en Baba',0::numeric,m.salida_qq FROM ruizcacao.movimientos_stock m
  WHERE m.fecha <= $1::date AND (m.orden,m.id)<=($2::bigint,$3::text)
    AND m.tipo='Conversión'
), resumen AS (
  SELECT producto,
    coalesce(sum(entrada-salida) FILTER(WHERE fecha<$1::date),0) inicial,
    coalesce(sum(entrada) FILTER(WHERE fecha=$1::date),0) entradas,
    coalesce(sum(salida) FILTER(WHERE fecha=$1::date),0) salidas
  FROM efectos GROUP BY producto
)
SELECT p.nombre producto,coalesce(r.inicial,0) inicial,coalesce(r.entradas,0) entradas,
  coalesce(r.salidas,0) salidas,
  coalesce(r.inicial,0)+coalesce(r.entradas,0)-coalesce(r.salidas,0) final
FROM ruizcacao.productos p LEFT JOIN resumen r ON r.producto=p.nombre
WHERE p.nombre IN ('Cacao en Baba','Cacao Seco','Maracuyá')
ORDER BY CASE p.nombre WHEN 'Cacao en Baba' THEN 1 WHEN 'Cacao Seco' THEN 2 ELSE 3 END`

export function consultaDetalleStockFecha(
  fecha: string,
  limite: number,
  techo: Posicion,
  despues?: PosicionTemporal
): { sql: string; params: unknown[] } {
  const params: unknown[] = [fecha, techo.orden, techo.id]
  let avance = ''
  if (despues) {
    params.push(despues.instante, despues.orden, despues.id)
    avance = ' AND (fecha_hora_registro,orden,id)<($4::timestamptz,$5::bigint,$6::text)'
  }
  params.push(limite + 1)
  return {
    sql: `SELECT id,orden,
      to_char(fecha_hora_registro AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') instante,
      to_char(fecha_hora_registro AT TIME ZONE 'America/Guayaquil','HH24:MI:SS') hora,
      producto,tipo,entrada_qq,salida_qq,detalle
      FROM ruizcacao.movimientos_stock WHERE fecha=$1::date AND (orden,id)<=($2::bigint,$3::text)
      ${avance} ORDER BY fecha_hora_registro DESC,orden DESC,id DESC LIMIT $${params.length}`,
    params
  }
}

// El llamador abre una única transacción READ ONLY REPEATABLE READ para las cuatro lecturas.
export async function consultarStockFecha(
  db: Pick<PoolClient, 'query'>,
  input: FiltroStockFecha
): Promise<PaginaStockFecha> {
  const f = validarStockFecha(input)
  const techo: Posicion = f.cursor?.techo ??
    (
      await db.query(
        'SELECT orden,id FROM ruizcacao.movimientos_stock ORDER BY orden DESC,id DESC LIMIT 1'
      )
    ).rows[0] ?? { orden: '0', id: '' }
  const params = [f.fecha, techo.orden, techo.id]
  const resumen = (await db.query(SQL_RESUMEN_STOCK_FECHA, params)).rows.map(
    (r): ResumenStockFecha => ({
      producto: r.producto,
      inicial: Number(r.inicial),
      entradas: Number(r.entradas),
      salidas: Number(r.salidas),
      final: Number(r.final)
    })
  )
  const total = Number(
    (
      await db.query(
        `SELECT count(*)::text total FROM ruizcacao.movimientos_stock
    WHERE fecha=$1::date AND (orden,id)<=($2::bigint,$3::text)`,
        params
      )
    ).rows[0].total
  )
  const q = consultaDetalleStockFecha(f.fecha, f.limite, techo, f.cursor?.despues)
  const rows = (await db.query(q.sql, q.params)).rows
  const visibles = rows.slice(0, f.limite),
    ultima = visibles[visibles.length - 1]
  const siguiente =
    rows.length > f.limite
      ? Buffer.from(
          JSON.stringify({
            version: 1,
            fecha: f.fecha,
            limite: f.limite,
            techo,
            despues: { orden: ultima.orden, id: ultima.id, instante: ultima.instante }
          } satisfies Cursor)
        ).toString('base64url')
      : null
  return {
    resumen,
    total,
    siguiente,
    filas: visibles.map((r): MovimientoStockFecha => ({
      id: r.id,
      horaRegistrada: r.hora,
      producto: r.producto,
      tipo: r.tipo,
      entrada: Number(r.entrada_qq),
      salida: Number(r.salida_qq),
      detalle: r.detalle
    }))
  }
}
