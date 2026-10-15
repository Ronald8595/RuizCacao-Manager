import { Pool } from 'pg'
import type { PostgresLocal } from './postgres-local'
import { Respaldos, verificarRespaldo } from './respaldos'
import { exigirEspacio, type RestorePreparado } from './restore-workspace'
import { identidadCluster, nombreInterno } from './restore-promocion'
import type { RestoreTarget } from './restore-caso'
import type { EstadoJournal } from './restore-journal'
import { faseOperacion, type ContextoOperacion } from './operacion-respaldo'
import { ErrorNegocio } from '../../shared/errorNegocio'
export class DestinoRestorePostgres implements RestoreTarget {
  constructor(
    private readonly local: PostgresLocal,
    private readonly binarios: string,
    private readonly backups: string,
    private readonly poolActivo: () => Pool
  ) {}
  async comprobarSoporte(): Promise<void> {
    const c = this.local.configuracionRestauracion()
    if (c.database !== 'ruizcacao_manager' || c.user !== 'ruizcacao_app' || c.host !== '127.0.0.1')
      throw new ErrorNegocio('La conexión no corresponde al modo privado certificado.')
    await this.local.conAdministracionRestauracion(async (db) => {
      const rol = (
        await db.query(
          "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname='ruizcacao_app'"
        )
      ).rows[0]
      if (!rol || Object.values(rol).some(Boolean))
        throw new ErrorNegocio(
          'El rol de datos no tiene los permisos limitados requeridos para cargar respaldos.'
        )
    })
  }
  async candidata(p: RestorePreparado, ctx: ContextoOperacion): Promise<EstadoJournal> {
    const nombre = 'rcm_c_' + p.id,
      config = { ...this.local.configuracionRestauracion(), database: nombre }
    let oid = 0
    try {
      const j = await this.local.conAdministracionRestauracion(async (db) => {
        const data = (await db.query('SHOW data_directory')).rows[0].data_directory
        const bytesActiva = Number(
          (await db.query("SELECT pg_database_size('ruizcacao_manager')::text n")).rows[0].n
        )
        await exigirEspacio(
          data,
          p.bytesBase * 2 + bytesActiva * 2 + p.manifest.database_dump_size * 3 + 128 * 1024 ** 2
        )
        await db.query('CREATE DATABASE ' + nombreInterno(nombre) + ' OWNER ruizcacao_app')
        const filas = (
          await db.query(
            'SELECT datname,oid::int oid FROM pg_database WHERE datname=ANY($1::text[])',
            [['ruizcacao_manager', nombre]]
          )
        ).rows
        oid = filas.find((r) => r.datname === nombre).oid
        const fecha = new Date().toISOString()
        return {
          operation_id: p.id,
          phase: 'preparada' as const,
          intent: 'ninguna',
          cluster_identity: await identidadCluster(db),
          active_database: 'ruizcacao_manager' as const,
          candidate_database: nombre,
          reserve_database: 'rcm_r_' + p.id,
          active_oid: filas.find((r) => r.datname === 'ruizcacao_manager').oid,
          candidate_oid: oid,
          backup_sha256: p.hash,
          created_at: fecha,
          updated_at: fecha
        }
      })
      faseOperacion(ctx, 'restaurando_candidata')
      const tool = new Respaldos(config, this.binarios, this.backups)
      await tool.herramienta(
        'pg_restore',
        [
          ...tool.argumentosConexion(),
          '--single-transaction',
          '--exit-on-error',
          '--no-owner',
          '--no-privileges',
          p.dump
        ],
        ctx.signal
      )
      const pool = new Pool({ ...config, max: 2, statement_timeout: 60000 })
      try {
        await p.validar(pool)
      } finally {
        await pool.end()
      }
      faseOperacion(ctx, 'candidata_validada')
      return j
    } catch (e) {
      if (oid)
        await this.local.conAdministracionRestauracion(async (db) => {
          const actual = (
            await db.query('SELECT oid::int oid FROM pg_database WHERE datname=$1', [nombre])
          ).rows[0]?.oid
          if (actual === oid) await db.query('DROP DATABASE ' + nombreInterno(nombre))
        })
      throw e
    }
  }
  async respaldoSeguridad(ctx: ContextoOperacion): Promise<void> {
    const config = this.local.configuracionRestauracion(),
      b = new Respaldos(config, this.binarios, this.backups)
    const m = await b.crear(this.poolActivo(), 'pre_restauracion', null, ctx)
    await verificarRespaldo((await import('node:path')).join(this.backups, m.archivo))
  }
  async validarFinal(p: RestorePreparado): Promise<void> {
    const pool = new Pool({
      ...this.local.configuracionRestauracion(),
      max: 2,
      statement_timeout: 60000
    })
    try {
      await p.validar(pool)
    } finally {
      await pool.end()
    }
  }
  async limpiarCandidata(j: EstadoJournal): Promise<void> {
    await this.local.conAdministracionRestauracion(async (db) => {
      const actual = (
        await db.query('SELECT oid::int oid FROM pg_database WHERE datname=$1', [
          j.candidate_database
        ])
      ).rows[0]?.oid
      if (actual === j.candidate_oid)
        await db.query('DROP DATABASE ' + nombreInterno(j.candidate_database))
      else if (actual)
        throw new ErrorNegocio('No se puede identificar la candidata para limpiarla.')
    })
  }
}
