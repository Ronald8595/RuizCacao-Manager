import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { esquema, migracionUno } from './schema'
import { sqlNormalizacion } from './relacional'
import { ErrorNegocio } from '../../shared/errorNegocio'
import { migracionTres } from './migracion-tres'
import { migracionCuatro } from './migracion-cuatro'
import { migracionCinco } from './migracion-cinco'
import { migracionSeis } from './migracion-seis'
import { migracionSiete } from './migracion-siete'
import { migracionOcho } from './migracion-ocho'
import { migracionNueve } from './migracion-nueve'
import { migracionDiez, VERSION_ACTUAL as VERSION_ESQUEMA } from './migracion-diez'

export { VERSION_ESQUEMA }
export type ConsultaMigracion = Pick<PoolClient, 'query'>
export async function versionHistorial(db: ConsultaMigracion, nuevo = false): Promise<number> {
  const existe = (await db.query("SELECT to_regclass('ruizcacao.migraciones') t")).rows[0].t
  if (!existe) {
    if (nuevo) return 0
    throw new ErrorNegocio('El respaldo no contiene historial de RuizCacao.')
  }
  const filas = (await db.query('SELECT version FROM ruizcacao.migraciones ORDER BY version')).rows
  if (!filas.length && !nuevo) throw new ErrorNegocio('El historial está vacío.')
  for (let i = 0; i < filas.length; i++)
    if (filas[i].version !== i + 1)
      throw new ErrorNegocio('El historial de migraciones es inconsistente.')
  const v = filas.length
  if (v > VERSION_ESQUEMA)
    throw new ErrorNegocio('Esta base requiere una versión más reciente de la aplicación.')
  return v
}
export interface MigrationRunner {
  migrar(pool: Pool, signal?: AbortSignal): Promise<void>
}
export class MigracionesPostgres implements MigrationRunner {
  async aplicarEnTransaccion(
    db: ConsultaMigracion,
    hasta = VERSION_ESQUEMA,
    verificarHistorial = true
  ): Promise<void> {
    if (!Number.isInteger(hasta) || hasta < 1 || hasta > VERSION_ESQUEMA)
      throw new ErrorNegocio('Migración requerida inexistente.')
    const inicial = verificarHistorial ? await versionHistorial(db, true) : 0
    if (inicial > hasta) throw new ErrorNegocio('No se admiten migraciones inversas.')
    await db.query(esquema)
    const version = await db.query(
      'SELECT version FROM ruizcacao.migraciones ORDER BY version DESC LIMIT 1'
    )
    if (version.rows[0]?.version > VERSION_ESQUEMA)
      throw new ErrorNegocio('Esta base requiere una versión más reciente de la aplicación.')
    if (!version.rowCount) {
      await db.query(migracionUno)
      await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(1)')
    }
    if ((version.rows[0]?.version ?? 0) < 2 && hasta >= 2) {
      await db.query(sqlNormalizacion())
      await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(2)')
    }
    if ((version.rows[0]?.version ?? 0) < 3 && hasta >= 3) {
      await db.query(migracionTres)
      await db.query('INSERT INTO ruizcacao.instalacion(id,installation_id) VALUES(1,$1)', [
        randomUUID()
      ])
      await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(3)')
    }
    if ((version.rows[0]?.version ?? 0) < 4 && hasta >= 4) {
      await db.query(migracionCuatro)
      await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(4)')
    }
    if ((version.rows[0]?.version ?? 0) < 5 && hasta >= 5) {
      await db.query(migracionCinco)
      const adminAnterior = (
        await db.query(
          'SELECT nombre,password_hash,fallos,bloqueado_hasta,actualizado_en FROM ruizcacao.administrador WHERE id=1'
        )
      ).rows[0]
      if (adminAnterior) {
        await db.query(
          "INSERT INTO ruizcacao.usuarios(id,nombre,password_hash,rol,activo,principal,fallos,bloqueado_hasta,actualizado_en) VALUES($1,$2,$3,'administrador',true,true,$4,$5,$6)",
          [
            randomUUID(),
            adminAnterior.nombre,
            adminAnterior.password_hash,
            adminAnterior.fallos,
            adminAnterior.bloqueado_hasta,
            adminAnterior.actualizado_en
          ]
        )
        await db.query(
          'UPDATE ruizcacao.auditoria a SET usuario_id=u.id FROM ruizcacao.usuarios u WHERE u.principal AND a.responsable=u.nombre'
        )
        await db.query(
          'UPDATE ruizcacao.eventos_jornada e SET usuario_id=u.id FROM ruizcacao.usuarios u WHERE u.principal AND e.responsable=u.nombre'
        )
      }
      await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(5)')
    }
    if ((version.rows[0]?.version ?? 0) < 6 && hasta >= 6) {
      await db.query(migracionSeis)
      await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(6)')
    }
    if ((version.rows[0]?.version ?? 0) < 7 && hasta >= 7) {
      await db.query(migracionSiete)
      await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(7)')
    }
    if ((version.rows[0]?.version ?? 0) < 8 && hasta >= 8) {
      await db.query(migracionOcho)
      await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(8)')
    }
    if ((version.rows[0]?.version ?? 0) < 9 && hasta >= 9) {
      await db.query(migracionNueve)
      await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(9)')
    }
    if ((version.rows[0]?.version ?? 0) < 10 && hasta >= 10) {
      await db.query(migracionDiez)
      await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(10)')
    }
  }
  async migrar(pool: Pool, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    const db = await pool.connect()
    try {
      await db.query('BEGIN')
      await db.query("SET LOCAL TIME ZONE 'America/Guayaquil'")
      await db.query('SELECT pg_advisory_xact_lock(7302026)')
      await this.aplicarEnTransaccion(db)
      signal?.throwIfAborted()
      await db.query('COMMIT')
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      db.release()
    }
  }
}
