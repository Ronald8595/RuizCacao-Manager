import type { PoolClient } from 'pg'
import { createHash } from 'node:crypto'
import { entidades } from './relacional'
import { validarFiltroStock } from './historial-stock'
import { ErrorNegocio } from '../../shared/errorNegocio'
import type { FiltroListado, Listados, TotalesFinancieros } from '../../shared/listados'
import { documentoReporte } from '../../renderer/src/utils/reportePdf'
import type { FilaFinanciera } from '../../renderer/src/utils/reportes'

type DB = Pick<PoolClient, 'query'>
type Modulo = keyof Listados
interface Cursor {
  version: 1
  firma: string
  cortes: string[]
  clave: (string | number)[]
}
const fallo = (): never => {
  throw new ErrorNegocio('Revisa los filtros y vuelve a la primera página.')
}
interface Filtro {
  desde: string
  hasta: string
  limite: number
  busqueda: string
  tipo: string
  estado: string
  categoria: string
  firma: string
  cursor?: Cursor
}
function validar(modulo: Modulo, input: FiltroListado): Filtro {
  const extras =
    modulo === 'historialCombinado'
      ? ['busqueda', 'tipo', 'estado']
      : modulo === 'listadoGastos'
        ? ['categoria', 'tipo']
        : []
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !['desde', 'hasta', 'limite', 'cursor', ...extras].includes(k))
  )
    return fallo()
  const base = validarFiltroStock({ desde: input.desde, hasta: input.hasta, limite: input.limite })
  const busqueda = input.busqueda ?? '',
    tipo = input.tipo ?? (modulo === 'historialCombinado' ? 'todos' : 'Todos'),
    estado = input.estado ?? 'todos',
    categoria = input.categoria ?? 'Todas'
  if (typeof busqueda !== 'string' || busqueda.length > 500 || busqueda.includes('\0'))
    return fallo()
  if (!['todos', 'compra', 'venta'].includes(tipo) && modulo === 'historialCombinado')
    return fallo()
  if (!['Todos', 'manual', 'automatico'].includes(tipo) && modulo === 'listadoGastos')
    return fallo()
  if (!['todos', 'pendiente', 'parcial', 'cerrado', 'anulado'].includes(estado)) return fallo()
  if (typeof categoria !== 'string' || categoria.length > 100 || categoria.includes('\0'))
    return fallo()
  const f = {
    desde: base.desde,
    hasta: base.hasta,
    limite: base.limite,
    busqueda: busqueda.toLowerCase(),
    tipo,
    estado,
    categoria
  }
  const firma = createHash('sha256')
    .update(JSON.stringify([modulo, f]))
    .digest('hex')
  let cursor: Cursor | undefined
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
      cursor.firma !== firma ||
      !Array.isArray(cursor.cortes) ||
      cursor.cortes.length !== 2 ||
      !cursor.cortes.every(
        (v) => typeof v === 'string' && /^\d{1,19}$/.test(v) && BigInt(v) <= 9223372036854775807n
      ) ||
      !Array.isArray(cursor.clave)
    )
      return fallo()
    if (modulo === 'reportePeriodo') {
      if (
        cursor.clave.length !== 5 ||
        typeof cursor.clave[0] !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(cursor.clave[0]) ||
        typeof cursor.clave[1] !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.clave[1]) ||
        ![0, 1].includes(Number(cursor.clave[2]))
      )
        return fallo()
    } else if (cursor.clave.length !== 2) return fallo()
    const orden = cursor.clave.at(-2),
      id = cursor.clave.at(-1)
    if (
      typeof orden !== 'string' ||
      !/^\d{1,19}$/.test(orden) ||
      BigInt(orden) > 9223372036854775807n ||
      typeof id !== 'string' ||
      !id ||
      id.length > 1000 ||
      id.includes('\0')
    )
      return fallo()
  }
  return { ...f, firma, cursor }
}
export function convertirEntidad(
  key: 'cuentas' | 'gastos',
  row: Record<string, unknown>
): Record<string, unknown> {
  const dto: Record<string, unknown> = { id: row.id }
  for (const c of entidades[key].campos) {
    let v = row[c.columna]
    if (v === null) continue
    if (c.tipo.startsWith('numeric') || c.tipo === 'integer' || c.propiedad === 'empleado_id')
      v = Number(v)
    if (c.tipo === 'timestamptz') v = (v as Date).toISOString()
    dto[c.propiedad] = v
  }
  if (key === 'cuentas') {
    dto.clienteId ??= ''
    dto.ventaId ??= null
    dto.numeroFactura ??= null
  } else dto.referenciaStockId ??= null
  return dto
}
const titular =
  "CASE WHEN o.categoria='compra' THEN coalesce(o.proveedor_nombre,'Proveedor') ELSE coalesce(c.nombre_razon_social,'Cliente') END"
function consultaSimple(
  modulo: 'historialCombinado' | 'listadoGastos',
  f: Filtro,
  cortes: string[],
  conteo = false
): { sql: string; params: unknown[] } {
  const params: unknown[] = [],
    p = (v: unknown): string => {
      params.push(v)
      return '$' + params.length
    }
  const key = modulo === 'historialCombinado' ? 'cuentas' : 'gastos',
    e = entidades[key]
  const where = [`o.orden<=${p(cortes[0])}::bigint`]
  if (f.desde) where.push(`o.fecha>=${p(f.desde)}::date`)
  if (f.hasta) where.push(`o.fecha<=${p(f.hasta)}::date`)
  let join = ''
  const extra =
    modulo === 'historialCombinado'
      ? `${titular} AS titular`
      : "(o.tipo='automatico' AND EXISTS(SELECT 1 FROM ruizcacao.cuentas a WHERE a.compra_id IS NOT DISTINCT FROM o.compra_id AND a.estado='anulado')) AS anulada"
  if (modulo === 'historialCombinado') {
    join = ' LEFT JOIN ruizcacao.clientes c ON c.id=o.cliente_id'
    where.push("o.origen<>'manual'")
    if (f.tipo !== 'todos') where.push(`o.categoria=${p(f.tipo)}`)
    if (f.estado !== 'todos') where.push(`o.estado=${p(f.estado)}`)
    if (f.busqueda)
      where.push(
        `strpos(lower((${titular}||' '||o.fecha::text||' '||coalesce(o.numero_compra::text,o.numero_factura::text,'null')) COLLATE "und-x-icu"),${p(f.busqueda)})>0`
      )
  } else {
    if (f.tipo !== 'Todos') where.push(`o.tipo=${p(f.tipo)}`)
    if (f.categoria !== 'Todas') where.push(`o.categoria=${p(f.categoria)}`)
  }
  if (!conteo && f.cursor)
    where.push(`(o.orden,o.id)<(${p(f.cursor.clave[0])}::bigint,${p(f.cursor.clave[1])}::text)`)
  const columnas = [
    'o.id',
    'o.orden',
    ...e.campos.map((c) => 'o.' + c.columna + (c.tipo === 'date' ? '::text' : '')),
    extra
  ]
  return {
    sql: `SELECT ${conteo ? 'count(*)::text total' : columnas.join(',')} FROM ruizcacao.${e.tabla} o${join} WHERE ${where.join(' AND ')}${conteo ? '' : ` ORDER BY o.orden DESC,o.id DESC LIMIT ${p(f.limite + 1)}`}`,
    params
  }
}
const instante = (alias: string): string =>
  `to_char(${alias}.fecha_hora_registro AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
// La misma fuente alimenta agregado, COUNT, detalle y exportación completa.
export function fuenteFinanciera(
  f: { desde: string; hasta: string },
  cortes: string[]
): { sql: string; params: unknown[] } {
  const params: unknown[] = [],
    p = (v: unknown): string => {
      params.push(v)
      return '$' + params.length
    }
  const rango = (a: string): string =>
    [
      f.desde ? `${a}.fecha>=${p(f.desde)}::date` : 'true',
      f.hasta ? `${a}.fecha<=${p(f.hasta)}::date` : 'true'
    ].join(' AND ')
  const movimientos = `SELECT m.id,m.fecha::text fecha,${instante('m')} instante,0 fuente,m.orden registro,
    CASE WHEN c.categoria='compra' THEN 'Pago de compra' ELSE 'Cobro de venta' END tipo,
    (CASE WHEN c.categoria='compra' THEN 'Compra N.º '||coalesce(c.numero_compra::text,'undefined') WHEN c.numero_factura IS NOT NULL AND c.numero_factura<>0 THEN 'Venta N.º '||c.numero_factura::text ELSE 'Cuenta manual de cliente' END)||
    CASE WHEN c.categoria='compra' AND b.id IS NOT NULL THEN ' · '||b.producto WHEN c.categoria<>'compra' AND v.id IS NOT NULL THEN ' · '||v.producto ELSE '' END||' · '||m.observacion detalle,
    CASE WHEN c.categoria='compra' THEN -m.monto ELSE m.monto END monto
    FROM ruizcacao.movimientos_cuenta m JOIN ruizcacao.cuentas c ON c.id=m.cuenta_id
    LEFT JOIN ruizcacao.compras b ON c.categoria='compra' AND b.id=c.compra_id
    LEFT JOIN ruizcacao.ventas v ON c.categoria<>'compra' AND v.id=c.venta_id
    WHERE m.tipo='Abono' AND c.estado<>'anulado' AND m.orden<=${p(cortes[0])}::bigint AND ${rango('m')}`
  const gastos = `SELECT g.id,g.fecha::text fecha,${instante('g')} instante,1 fuente,g.orden registro,'Gasto operativo' tipo,
    g.categoria||' · '||CASE WHEN coalesce(g.empleado_nombre,'')<>'' THEN g.empleado_nombre||' · ' ELSE '' END||coalesce(nullif(g.observacion,''),'Sin observación') detalle,-g.monto monto
    FROM ruizcacao.gastos g WHERE g.tipo='manual' AND g.orden<=${p(cortes[1])}::bigint AND ${rango('g')}`
  return { sql: `WITH financiero AS (${movimientos} UNION ALL ${gastos})`, params }
}
const ordenFinanciero = 'fecha ASC,instante ASC,fuente ASC,registro DESC,id DESC'
function filaFinanciera(r: Record<string, unknown>): FilaFinanciera {
  return {
    id: String(r.id),
    fecha: String(r.fecha),
    orden: String(r.instante),
    tipo: r.tipo as FilaFinanciera['tipo'],
    detalle: String(r.detalle),
    monto: Number(r.monto)
  }
}
async function cortes(db: DB, modulo: Modulo, cursor?: Cursor): Promise<string[]> {
  if (cursor) return cursor.cortes
  const tablas =
    modulo === 'historialCombinado'
      ? ['cuentas', 'cuentas']
      : modulo === 'listadoGastos'
        ? ['gastos', 'gastos']
        : ['movimientos_cuenta', 'gastos']
  return (
    await db.query(
      `SELECT (SELECT coalesce(max(orden),0)::text FROM ruizcacao.${tablas[0]}) a,(SELECT coalesce(max(orden),0)::text FROM ruizcacao.${tablas[1]}) b`
    )
  ).rows.map((r) => [r.a, r.b])[0]
}
function siguiente(
  f: Filtro,
  limites: string[],
  rows: Record<string, unknown>[],
  financiero = false
): string | null {
  const last = rows[f.limite - 1]
  if (rows.length <= f.limite || !last) return null
  const clave = financiero
    ? [
        String(last.fecha),
        String(last.instante),
        Number(last.fuente),
        String(last.registro),
        String(last.id)
      ]
    : [String(last.orden), String(last.id)]
  return Buffer.from(
    JSON.stringify({ version: 1, firma: f.firma, cortes: limites, clave } satisfies Cursor)
  ).toString('base64url')
}
export async function consultarListado<M extends Modulo>(
  db: DB,
  modulo: M,
  input: FiltroListado
): Promise<Listados[M]> {
  const f = validar(modulo, input),
    limites = await cortes(db, modulo, f.cursor)
  if (modulo === 'historialCombinado' || modulo === 'listadoGastos') {
    const q = consultaSimple(modulo, f, limites),
      count = consultaSimple(modulo, f, limites, true)
    const rows = (await db.query(q.sql, q.params)).rows
    const total = Number((await db.query(count.sql, count.params)).rows[0].total)
    const filas = rows
      .slice(0, f.limite)
      .map((r) =>
        modulo === 'historialCombinado'
          ? { ...convertirEntidad('cuentas', r), titular: r.titular }
          : { ...convertirEntidad('gastos', r), anulada: r.anulada }
      )
    return { filas, total, siguiente: siguiente(f, limites, rows) } as Listados[M]
  }
  if (modulo === 'resumenGastos') {
    // Gastos usa la categoría del movimiento, como su resumen anterior.
    const params: unknown[] = [f.desde || '0001-01-01', f.hasta || '9999-12-31']
    const rows = (
      await db.query(
        `SELECT categoria,sum(monto)::text total FROM (
      SELECT categoria,monto FROM ruizcacao.gastos WHERE tipo='manual' AND fecha BETWEEN $1::date AND $2::date
      UNION ALL SELECT 'Inversión en materia prima',m.monto FROM ruizcacao.movimientos_cuenta m JOIN ruizcacao.cuentas c ON c.id=m.cuenta_id
      WHERE m.categoria='compra' AND m.tipo='Abono' AND c.estado<>'anulado' AND m.fecha BETWEEN $1::date AND $2::date
    ) g GROUP BY categoria`,
        params
      )
    ).rows
    const totalesPorCategoria = Object.fromEntries(rows.map((r) => [r.categoria, Number(r.total)]))
    const totalCompras = Number(
      (
        await db.query(
          `SELECT coalesce(sum(m.monto),0)::text total FROM ruizcacao.movimientos_cuenta m JOIN ruizcacao.cuentas c ON c.id=m.cuenta_id WHERE m.categoria='compra' AND m.tipo='Abono' AND c.estado<>'anulado' AND m.fecha BETWEEN $1::date AND $2::date`,
          params
        )
      ).rows[0].total
    )
    const totalOperativos = Number(
      (
        await db.query(
          `SELECT coalesce(sum(monto),0)::text total FROM ruizcacao.gastos WHERE tipo='manual' AND fecha BETWEEN $1::date AND $2::date`,
          params
        )
      ).rows[0].total
    )
    return {
      desde: f.desde,
      hasta: f.hasta,
      totalesPorCategoria,
      totalCompras,
      totalOperativos,
      totalEgresos: totalCompras + totalOperativos
    } as Listados[M]
  }
  const fuente = fuenteFinanciera(f, limites)
  const agregado = (
    await db.query(
      fuente.sql +
        ` SELECT count(*)::text total,
    coalesce(sum(monto) FILTER(WHERE monto>0),0)::text ingresos,
    coalesce(-sum(monto) FILTER(WHERE tipo='Pago de compra'),0)::text compras,
    coalesce(-sum(monto) FILTER(WHERE tipo='Gasto operativo'),0)::text manuales,
    coalesce(-sum(monto) FILTER(WHERE monto<0),0)::text egresos FROM financiero`,
      fuente.params
    )
  ).rows[0]
  const resumen: TotalesFinancieros = {
    desde: f.desde,
    hasta: f.hasta,
    totalIngresos: Number(agregado.ingresos),
    totalComprasPagadas: Number(agregado.compras),
    totalGastosManuales: Number(agregado.manuales),
    totalGastos: Number(agregado.egresos),
    saldoPeriodo: Math.round((Number(agregado.ingresos) - Number(agregado.egresos)) * 100) / 100
  }
  const params = [...fuente.params],
    p = (v: unknown): string => {
      params.push(v)
      return '$' + params.length
    }
  let where = ''
  if (f.cursor) {
    const [fecha, instante, origen, registro, id] = f.cursor.clave
    where = ` WHERE (fecha,instante,fuente,-registro)>(${p(fecha)}::text,${p(instante)}::text,${p(origen)}::integer,-${p(registro)}::bigint) OR (fecha,instante,fuente,registro)=(${p(fecha)}::text,${p(instante)}::text,${p(origen)}::integer,${p(registro)}::bigint) AND id<${p(id)}::text`
  }
  const rows = (
    await db.query(
      fuente.sql +
        ` SELECT id,fecha,instante,fuente,registro,tipo,detalle,monto FROM financiero${where} ORDER BY ${ordenFinanciero} LIMIT ${p(f.limite + 1)}`,
      params
    )
  ).rows
  return {
    resumen,
    total: Number(agregado.total),
    filas: rows.slice(0, f.limite).map(filaFinanciera),
    siguiente: siguiente(f, limites, rows, true)
  } as Listados[M]
}
export async function reporteCompleto(
  db: DB,
  input: FiltroListado,
  tipo: 'diario' | 'semanal' | 'mensual'
): Promise<ReturnType<typeof documentoReporte>> {
  if (!['diario', 'semanal', 'mensual'].includes(tipo) || input.cursor) return fallo()
  const f = validar('reportePeriodo', input)
  const pagina = await consultarListado(db, 'reportePeriodo', input)
  const fuente = fuenteFinanciera(f, await cortes(db, 'reportePeriodo'))
  const rows = (
    await db.query(
      fuente.sql +
        ` SELECT id,fecha,instante,tipo,detalle,monto FROM financiero ORDER BY ${ordenFinanciero}`,
      fuente.params
    )
  ).rows
  return documentoReporte(
    { ...pagina.resumen, filas: rows.map(filaFinanciera) } as Parameters<
      typeof documentoReporte
    >[0],
    tipo
  )
}
