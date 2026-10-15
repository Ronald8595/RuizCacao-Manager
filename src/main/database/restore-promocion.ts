import type { Client } from 'pg'
import { setTimeout as pausaDrenaje } from 'node:timers/promises'
import { ErrorNegocio } from '../../shared/errorNegocio'
import type { EstadoJournal, RestoreJournal, FaseRestore } from './restore-journal'
export type AdministrarRestore = <T>(trabajo: (db: Client) => Promise<T>) => Promise<T>
export interface DatabasePromotion {
  promover(j: EstadoJournal, validar: () => Promise<void>): Promise<void>
  recuperar(): Promise<void>
  confirmar(j: EstadoJournal): Promise<void>
}
export function nombreInterno(nombre: string): string {
  if (!/^(ruizcacao_manager|rcm_[cr]_[a-f0-9]{32}|rcm_ref_[a-f0-9]{32})$/.test(nombre))
    throw new ErrorNegocio('Destino interno inválido.')
  return '"' + nombre + '"'
}
export async function identidadCluster(db: Client): Promise<string> {
  return String(
    (await db.query('SELECT system_identifier::text id FROM pg_control_system()')).rows[0].id
  )
}
async function inventario(db: Client): Promise<Map<string, number>> {
  return new Map(
    (await db.query('SELECT datname,oid::int oid FROM pg_database')).rows.map((r) => [
      r.datname,
      r.oid
    ])
  )
}
async function comprobar(db: Client, j: EstadoJournal): Promise<Map<string, number>> {
  if ((await identidadCluster(db)) !== j.cluster_identity)
    throw new ErrorNegocio('El registro pertenece a otro almacenamiento. Acceso bloqueado.')
  const bases = await inventario(db)
  if (
    (bases.has(j.reserve_database) && bases.get(j.reserve_database) !== j.active_oid) ||
    (bases.has(j.candidate_database) && bases.get(j.candidate_database) !== j.candidate_oid)
  )
    throw new ErrorNegocio(
      'Los nombres internos no corresponden a sus identidades. Acceso bloqueado.'
    )
  for (const [nombre, oid] of bases) {
    if (
      [j.active_oid, j.candidate_oid].includes(oid) &&
      ![j.active_database, j.candidate_database, j.reserve_database].includes(nombre)
    )
      throw new ErrorNegocio('Identidad de base ambigua. Acceso bloqueado.')
    if (
      [j.active_database, j.candidate_database, j.reserve_database].includes(nombre) &&
      ![j.active_oid, j.candidate_oid].includes(oid)
    )
      throw new ErrorNegocio('Se encontró una base no identificada. Acceso bloqueado.')
  }
  return bases
}
async function sinClientes(db: Client, nombre: string): Promise<void> {
  // Pool.end cierra sockets antes de que desaparezcan todos sus backends.
  // Drenaje acotado SOLO durante esta operación, con conexiones nuevas bloqueadas.
  // Autovacuum no es un cliente; PostgreSQL gestiona sus locks en ALTER DATABASE.
  for (let i = 0; i < 20; i++) {
    const n = Number(
      (
        await db.query(
          "SELECT count(*) n FROM pg_stat_activity WHERE datname=$1 AND backend_type='client backend'",
          [nombre]
        )
      ).rows[0].n
    )
    if (!n) return
    await pausaDrenaje(50)
  }
  throw new ErrorNegocio(
    'Hay conexiones pendientes. Cierra otras herramientas antes de cargar el respaldo.'
  )
}
export class PromocionPostgres implements DatabasePromotion {
  constructor(
    private readonly administrar: AdministrarRestore,
    private readonly journal: RestoreJournal,
    private readonly punto: (fase: string) => Promise<void> = async () => {}
  ) {}
  private async guardar(j: EstadoJournal, phase: FaseRestore, intent = 'ninguna'): Promise<void> {
    j.phase = phase
    j.intent = intent
    j.updated_at = new Date().toISOString()
    await this.journal.guardar(j)
  }
  async promover(j: EstadoJournal, validar: () => Promise<void>): Promise<void> {
    if (j.phase !== 'seguridad_creada')
      throw new ErrorNegocio('Falta completar el respaldo técnico previo a la carga.')
    try {
      await this.administrar(async (db) => {
        if (!(await db.query('SELECT pg_try_advisory_lock(7302030) ok')).rows[0].ok)
          throw new ErrorNegocio('Otra carga está en curso.')
        try {
          const bases = await comprobar(db, j)
          if (
            bases.get(j.active_database) !== j.active_oid ||
            bases.get(j.candidate_database) !== j.candidate_oid ||
            bases.has(j.reserve_database)
          )
            throw new ErrorNegocio('El destino cambió antes de cargar.')
          await this.guardar(j, 'seguridad_creada', 'bloquear_original')
          await this.punto('antes_renombrar_original')
          await db.query(
            'ALTER DATABASE ' + nombreInterno(j.active_database) + ' ALLOW_CONNECTIONS false'
          )
          await sinClientes(db, j.active_database)
          await db.query(
            'ALTER DATABASE ' + nombreInterno(j.candidate_database) + ' ALLOW_CONNECTIONS false'
          )
          await sinClientes(db, j.candidate_database)
          await this.guardar(j, 'seguridad_creada', 'renombrar_original')
          await db.query(
            'ALTER DATABASE ' +
              nombreInterno(j.active_database) +
              ' RENAME TO ' +
              nombreInterno(j.reserve_database)
          )
          await this.guardar(j, 'original_renombrada', 'promover_candidata')
          await this.punto('original_renombrada')
          await db.query(
            'ALTER DATABASE ' +
              nombreInterno(j.candidate_database) +
              ' RENAME TO ' +
              nombreInterno(j.active_database)
          )
          await this.guardar(j, 'candidata_promovida', 'validar')
          await this.punto('candidata_promovida')
          await db.query(
            'ALTER DATABASE ' + nombreInterno(j.active_database) + ' ALLOW_CONNECTIONS true'
          )
          await validar()
          await this.guardar(j, 'validada', 'confirmar')
          await this.punto('validada')
        } finally {
          await db.query('SELECT pg_advisory_unlock(7302030)').catch(() => {})
        }
      })
    } catch (e) {
      await this.recuperar()
      throw e
    }
  }
  async recuperar(): Promise<void> {
    const j = await this.journal.leer()
    if (!j) return
    await this.administrar((db) => recuperarPromocion(db, this.journal, j))
  }
  async confirmar(j: EstadoJournal): Promise<void> {
    await this.guardar(j, 'confirmada')
  }
}
/** Usado ANTES del CREATE DATABASE del arranque normal. Nunca crea una base vacía. */
export async function recuperarPromocion(
  db: Client,
  journal: RestoreJournal,
  j: EstadoJournal
): Promise<void> {
  if (!(await db.query('SELECT pg_try_advisory_lock(7302030) ok')).rows[0].ok)
    throw new ErrorNegocio('Hay una carga en curso. Reintenta después.')
  const bases = await comprobar(db, j)
  if (j.phase === 'confirmada') {
    if (bases.get(j.active_database) !== j.candidate_oid)
      throw new ErrorNegocio('Carga confirmada con identidad ambigua. Acceso bloqueado.')
    return
  }
  if (j.phase === 'revertida') {
    if (bases.get(j.active_database) !== j.active_oid)
      throw new ErrorNegocio('Recuperación de carga ambigua. Acceso bloqueado.')
    return
  }
  const original = bases.get(j.active_database) === j.active_oid
  if (!original && bases.get(j.reserve_database) !== j.active_oid)
    throw new ErrorNegocio('No se identifica la base original. Acceso bloqueado.')
  j.intent = 'revertir'
  j.updated_at = new Date().toISOString()
  await journal.guardar(j)
  if (!original) {
    if (bases.get(j.active_database) === j.candidate_oid && !bases.has(j.candidate_database)) {
      await db.query(
        'ALTER DATABASE ' + nombreInterno(j.active_database) + ' ALLOW_CONNECTIONS false'
      )
      await sinClientes(db, j.active_database)
      await db.query(
        'ALTER DATABASE ' +
          nombreInterno(j.active_database) +
          ' RENAME TO ' +
          nombreInterno(j.candidate_database)
      )
    } else if (bases.has(j.active_database))
      throw new ErrorNegocio('Estado de recuperación ambiguo.')
    await db.query(
      'ALTER DATABASE ' +
        nombreInterno(j.reserve_database) +
        ' RENAME TO ' +
        nombreInterno(j.active_database)
    )
  }
  await db.query('ALTER DATABASE ' + nombreInterno(j.active_database) + ' ALLOW_CONNECTIONS true')
  j.phase = 'revertida'
  j.intent = 'ninguna'
  j.updated_at = new Date().toISOString()
  await journal.guardar(j)
}
