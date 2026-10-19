import { ErrorDiagnosticoRespaldo, diagnosticarRespaldo } from './respaldo-diagnostico'
import type { Pool } from 'pg'
import { randomUUID } from 'node:crypto'
import { versionHistorial, VERSION_ESQUEMA } from './migration-runner'
export interface RestoreValidator {
  comparar(pool: Pool, referencia: Pool, version: number): Promise<void>
  normalizar(pool: Pool): Promise<string>
}
export function clavesInventario(toc: string): Set<string> {
  const claves = new Set<string>()
  for (const linea of toc.split(/\r?\n/)) {
    if (!linea || linea.startsWith(';')) continue
    const m = linea.match(/^\d+; \d+ \d+ (.+) \S+$/)
    if (!m) throw new ErrorDiagnosticoRespaldo('BACKUP_INVENTORY_INVALID', 'leer_inventario')
    claves.add(m[1])
  }
  return claves
}
export function validarInventario(toc: string, esperado: string): void {
  const permitidos = clavesInventario(esperado)
  for (const clave of clavesInventario(toc))
    if (!permitidos.has(clave))
      throw new ErrorDiagnosticoRespaldo('BACKUP_INVENTORY_INVALID', 'comparar_inventario')
}
// Solo metadata del catálogo (cientos de filas), nunca filas comerciales en Node.
export async function firmaEstructura(pool: Pick<Pool, 'query'>): Promise<string> {
  const r = await pool.query(`WITH objetos AS (
    SELECT 'rel' tipo,c.relname::text nombre,jsonb_build_array(c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity)::text definicion
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ruizcacao'
    UNION ALL SELECT 'col',c.relname||'.'||a.attname,jsonb_build_array(format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))::text
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='ruizcacao' AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN('r','v')
    UNION ALL SELECT 'constraint',c.relname||'.'||k.conname,pg_get_constraintdef(k.oid,true)||':'||k.convalidated::text FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ruizcacao'
    UNION ALL SELECT 'index',indexname,indexdef FROM pg_indexes WHERE schemaname='ruizcacao'
    UNION ALL SELECT 'view',c.relname,pg_get_viewdef(c.oid,true) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ruizcacao' AND c.relkind='v'
    UNION ALL SELECT 'function',p.proname||pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='ruizcacao'
    UNION ALL SELECT 'trigger',c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid,true)||':'||t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ruizcacao' AND NOT t.tgisinternal
    UNION ALL SELECT 'sequence',c.relname,jsonb_build_array(format_type(s.seqtypid,NULL),s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle)::text FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ruizcacao'
  ) SELECT md5(string_agg(tipo||':'||nombre||':'||definicion,E'\n' ORDER BY tipo,nombre,definicion)) firma FROM objetos`)
  return r.rows[0].firma
}
export class ValidadorRestorePostgres implements RestoreValidator {
  async comparar(pool: Pool, referencia: Pool, version: number): Promise<void> {
    let historial: number
    try {
      historial = await versionHistorial(pool)
    } catch (e) {
      throw diagnosticarRespaldo(e, 'BACKUP_SCHEMA_HISTORY_MISMATCH', 'historial_esquema')
    }
    if (historial !== version)
      throw new ErrorDiagnosticoRespaldo('BACKUP_SCHEMA_HISTORY_MISMATCH', 'historial_esquema')
    if ((await firmaEstructura(pool)) !== (await firmaEstructura(referencia)))
      throw new ErrorDiagnosticoRespaldo('BACKUP_SCHEMA_MISMATCH', 'firma_catalogo')
    const ajenos = (
      await pool.query(
        "SELECT count(*)::int n FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema','public','ruizcacao')"
      )
    ).rows[0].n
    const publicos = (
      await pool.query(
        "SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'"
      )
    ).rows[0].n
    if (ajenos || publicos)
      throw new ErrorDiagnosticoRespaldo('BACKUP_DATA_INVALID', 'objetos_ajenos')
    if (version !== VERSION_ESQUEMA) return
    const tablas = (
      await pool.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='ruizcacao'")
    ).rows[0].n
    if (tablas !== 25) throw new ErrorDiagnosticoRespaldo('BACKUP_DATA_INVALID', 'cantidad_tablas')
    const usuarios = (
      await pool.query(`SELECT count(*) FILTER (WHERE principal AND activo)::int principales,
      count(*) FILTER (WHERE password_hash !~ '^[a-f0-9]{32}:[a-f0-9]{128}$')::int invalidos FROM ruizcacao.usuarios`)
    ).rows[0]
    if (usuarios.principales !== 1 || usuarios.invalidos)
      throw new ErrorDiagnosticoRespaldo('BACKUP_DATA_INVALID', 'usuarios')
    if (
      (await pool.query('SELECT count(*)::int n FROM ruizcacao.administrador WHERE id=1')).rows[0]
        .n !== 1 ||
      (await pool.query('SELECT count(*)::int n FROM ruizcacao.instalacion WHERE id=1')).rows[0]
        .n !== 1
    )
      throw new ErrorDiagnosticoRespaldo('BACKUP_DATA_INVALID', 'identidad')
    if (
      Number(
        (
          await pool.query(
            `SELECT count(*) n FROM ruizcacao.usuarios u JOIN ruizcacao.administrador a ON a.id=1 WHERE u.principal AND (a.nombre<>u.nombre OR a.password_hash<>u.password_hash)`
          )
        ).rows[0].n
      )
    )
      throw new ErrorDiagnosticoRespaldo('BACKUP_DATA_INVALID', 'administrador')
    // Consultas comerciales acotadas; no reconstruir ni recalcular estados/saldos.
    await pool.query('SELECT id,saldo FROM ruizcacao.v_saldos LIMIT 1')
    await pool.query('SELECT id,monto FROM ruizcacao.v_flujo_caja LIMIT 1')
    await pool.query(
      'SELECT producto,cantidad_qq,costo_unitario_promedio FROM ruizcacao.existencias LIMIT 3'
    )
    const secuencias = (
      await pool.query(
        `SELECT c.relname tabla,a.attname columna,s.relname secuencia FROM pg_depend d JOIN pg_class s ON s.oid=d.objid AND s.relkind='S' JOIN pg_class c ON c.oid=d.refobjid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.refobjsubid WHERE n.nspname='ruizcacao' AND d.deptype IN('a','i')`
      )
    ).rows
    for (const s of secuencias) {
      for (const v of Object.values(s))
        if (typeof v !== 'string' || !/^[a-z_]+$/.test(v))
          throw new ErrorDiagnosticoRespaldo('BACKUP_DATA_INVALID', 'nombre_secuencia')
      const valor = BigInt(
        (await pool.query('SELECT last_value::text v FROM ruizcacao.' + s.secuencia)).rows[0].v
      )
      const max = BigInt(
        (
          await pool.query(
            'SELECT coalesce(max(' + s.columna + '),0)::text v FROM ruizcacao.' + s.tabla
          )
        ).rows[0].v
      )
      if (valor < max) throw new ErrorDiagnosticoRespaldo('BACKUP_DATA_INVALID', 'valor_secuencia')
    }
  }
  async normalizar(pool: Pool): Promise<string> {
    const db = await pool.connect(),
      id = randomUUID()
    try {
      await db.query('BEGIN')
      await db.query('DELETE FROM ruizcacao.solicitudes_recuperacion')
      await db.query('UPDATE ruizcacao.instalacion SET installation_id=$1 WHERE id=1', [id])
      await db.query(
        'UPDATE ruizcacao.control_recuperacion SET fallos=0,bloqueado_hasta=NULL WHERE id=1'
      )
      await db.query(
        "UPDATE ruizcacao.sesiones SET cerrada_en=now(),cierre='restauracion' WHERE cerrada_en IS NULL"
      )
      await db.query('COMMIT')
      return id
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    } finally {
      db.release()
    }
  }
}
