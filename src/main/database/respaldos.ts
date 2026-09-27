import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises'
import { join, basename } from 'node:path'
import type { Pool } from 'pg'
import type { ConexionLocal } from '../../shared/persistencia'
import { ErrorNegocio } from '../../shared/errorNegocio'
const ejecutar = promisify(execFile)
export const RETENCION_AUTOMATICOS = 14
export type TipoRespaldo = 'automatico' | 'manual' | 'pre_migracion' | 'pre_restauracion'
export interface Manifiesto {
  id: string
  fecha: string
  tipo: TipoRespaldo
  fecha_jornada: string | null
  revision: string
  esquema_version: number
  postgres_major: number
  base: string
  archivo: string
  tamano: number
  sha256: string
}
export async function verificarRespaldo(archivo: string): Promise<Manifiesto> {
  const m = JSON.parse(await readFile(archivo + '.json', 'utf8')) as Manifiesto
  const datos = await readFile(archivo)
  if (
    m.archivo !== basename(archivo) ||
    !datos.length ||
    datos.length !== m.tamano ||
    createHash('sha256').update(datos).digest('hex') !== m.sha256 ||
    !Number.isInteger(m.esquema_version) ||
    !Number.isInteger(m.postgres_major)
  )
    throw new ErrorNegocio(
      'El respaldo no supera la verificación de integridad. No se restauró ningún dato.'
    )
  return m
}
export class Respaldos {
  constructor(
    private readonly config: ConexionLocal,
    readonly binarios: string,
    readonly carpeta: string
  ) {}
  async herramienta(nombre: 'pg_dump' | 'pg_restore', args: string[]): Promise<string> {
    // Contraseña solo en el entorno del proceso hijo; nunca argv, logs ni archivos temporales.
    const { stdout } = await ejecutar(join(this.binarios, nombre + '.exe'), args, {
      windowsHide: true,
      env: { ...process.env, PGPASSWORD: this.config.password },
      timeout: 300000,
      maxBuffer: 8 * 1024 * 1024
    })
    return stdout
  }
  argumentosConexion(base = this.config.database): string[] {
    return [
      '--host',
      this.config.host,
      '--port',
      String(this.config.port),
      '--username',
      this.config.user,
      '--dbname',
      base,
      '--no-password'
    ]
  }
  async crear(
    pool: Pool,
    tipo: TipoRespaldo,
    fechaJornada: string | null = null
  ): Promise<Manifiesto> {
    const db = await pool.connect()
    try {
      await db.query('SELECT pg_advisory_lock(7302026)')
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
      await db.query("SET LOCAL idle_in_transaction_session_timeout='10min'")
      const version = Number(
        (await db.query('SELECT max(version) AS v FROM ruizcacao.migraciones')).rows[0].v
      )
      const major = Math.floor(
        Number((await db.query('SHOW server_version_num')).rows[0].server_version_num) / 10000
      )
      const tool = Number(
        (await this.herramienta('pg_dump', ['--version'])).match(/PostgreSQL\) (\d+)/)?.[1]
      )
      if (tool !== major)
        throw new ErrorNegocio(
          'La herramienta de respaldo no coincide con la versión del almacenamiento. Contacta con soporte.'
        )
      const revision = (
        await db.query(
          "SELECT coalesce(max(id),0)::text AS revision FROM ruizcacao.auditoria WHERE accion NOT IN ('login','logout','autenticacion_fallida','recuperacion_fallida','respaldo_fallido')"
        )
      ).rows[0].revision
      await mkdir(this.carpeta, { recursive: true })
      if (tipo === 'automatico')
        for (const file of await readdir(this.carpeta)) {
          if (!file.endsWith('.dump.json')) continue
          const m = await verificarRespaldo(join(this.carpeta, file.slice(0, -5))).catch(() => null)
          if (
            m?.tipo === tipo &&
            m.fecha_jornada === fechaJornada &&
            m.revision === revision &&
            m.base === this.config.database &&
            m.esquema_version === version
          ) {
            await db.query('COMMIT')
            return m
          }
        }
      const id = randomUUID(),
        archivo = `${tipo}_${new Date().toISOString().replace(/[:.]/g, '-')}_${id}.dump`,
        ruta = join(this.carpeta, archivo)
      const snapshot = (await db.query('SELECT pg_export_snapshot() AS id')).rows[0].id
      try {
        await this.herramienta('pg_dump', [
          ...this.argumentosConexion(),
          '-Fc',
          '--snapshot',
          snapshot,
          '--file',
          ruta + '.tmp'
        ])
        await this.herramienta('pg_restore', ['--list', ruta + '.tmp'])
        const datos = await readFile(ruta + '.tmp')
        if (!datos.length) throw new ErrorNegocio('El respaldo quedó vacío. Intenta nuevamente.')
        const m: Manifiesto = {
          id,
          fecha: new Date().toISOString(),
          tipo,
          fecha_jornada: fechaJornada,
          revision,
          esquema_version: version,
          postgres_major: major,
          base: this.config.database,
          archivo,
          tamano: datos.length,
          sha256: createHash('sha256').update(datos).digest('hex')
        }
        await writeFile(ruta + '.json.tmp', JSON.stringify(m, null, 2), { mode: 0o600 })
        await rename(ruta + '.tmp', ruta)
        await rename(ruta + '.json.tmp', ruta + '.json')
        await db.query('COMMIT')
        if (version >= 3)
          await db.query(
            'INSERT INTO ruizcacao.respaldos(id,fecha,archivo,tipo,fecha_jornada,revision,esquema_version,postgres_major,tamano,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [id, m.fecha, archivo, tipo, fechaJornada, revision, version, major, m.tamano, m.sha256]
          )
        await this.retencion(pool)
        return m
      } catch (error) {
        await unlink(ruta + '.tmp').catch(() => {})
        await unlink(ruta + '.json.tmp').catch(() => {})
        throw error
      }
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      await db.query('SELECT pg_advisory_unlock(7302026)').catch(() => {})
      db.release()
    }
  }
  async retencion(pool?: Pool): Promise<void> {
    const validos: Manifiesto[] = []
    for (const file of await readdir(this.carpeta)) {
      if (!file.endsWith('.dump.json')) continue
      const m = await verificarRespaldo(join(this.carpeta, file.slice(0, -5))).catch(() => null)
      if (m?.tipo === 'automatico') validos.push(m)
    }
    validos.sort((a, b) => b.fecha.localeCompare(a.fecha))
    // Solo archivos comprobados y automáticos. Los manuales y de seguridad no se eliminan.
    for (const m of validos.slice(Math.max(1, RETENCION_AUTOMATICOS))) {
      const ruta = join(this.carpeta, m.archivo)
      await verificarRespaldo(ruta)
      await unlink(ruta)
      await unlink(ruta + '.json')
      if (pool)
        await pool
          .query("UPDATE ruizcacao.respaldos SET estado='retirado' WHERE id=$1", [m.id])
          .catch(() => {})
    }
  }
  async validarRestauracion(archivo: string): Promise<Manifiesto> {
    const m = await verificarRespaldo(archivo)
    await this.herramienta('pg_restore', ['--list', archivo])
    return m
  }
}
