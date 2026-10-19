import {
  ErrorDiagnosticoRespaldo,
  diagnosticarRespaldo,
  registrarCopiaRespaldo,
  registrarFalloRespaldo,
  type CodigoDiagnosticoRespaldo
} from './respaldo-diagnostico'
import { mkdtemp, mkdir, rm, stat, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { PostgresLocal } from './postgres-local'
import { PaqueteRespaldoZip } from './respaldo-paquete'
import { Respaldos } from './respaldos'
import { copiarStreaming } from './archivo-stream'
import { integridadArchivo } from './respaldo-integridad'
import { MigracionesPostgres } from './migration-runner'
import { ValidadorRestorePostgres, validarInventario } from './restore-validacion'
import { seleccionarReferenciaRestore } from './restore-compatibilidad'
import { faseOperacion, type ContextoOperacion } from './operacion-respaldo'
import type { ManifestPortable } from './respaldo-portable'
export interface RestorePreparado {
  id: string
  manifest: ManifestPortable
  hash: string
  dump: string
  bytesBase: number
  validar(pool: Pool): Promise<void>
  limpiar(): Promise<void>
}
export interface RestoreWorkspace {
  preparar(archivo: string, ctx: ContextoOperacion): Promise<RestorePreparado>
}
export async function exigirEspacio(ruta: string, bytes: number): Promise<void> {
  const s = await statfs(ruta, { bigint: true })
  if (s.bavail * s.bsize < BigInt(Math.ceil(bytes)))
    throw new ErrorDiagnosticoRespaldo('BACKUP_INSUFFICIENT_SPACE', 'espacio_workspace')
}
export class WorkspaceRestorePostgres implements RestoreWorkspace {
  constructor(
    private readonly opciones: {
      raiz: string
      binarios: string
      cifrar: (s: string) => Buffer
      descifrar: (b: Buffer) => string
    }
  ) {}
  async preparar(archivo: string, ctx: ContextoOperacion): Promise<RestorePreparado> {
    try {
      return await this.prepararInterno(archivo, ctx)
    } catch (e) {
      throw diagnosticarRespaldo(e, 'BACKUP_PRIVATE_PREPARATION_FAILED', 'crear_workspace')
    }
  }
  private async prepararInterno(
    archivo: string,
    ctx: ContextoOperacion
  ): Promise<RestorePreparado> {
    faseOperacion(ctx, 'preparando_restore')
    await mkdir(this.opciones.raiz, { recursive: true })
    const bytes = (await stat(archivo)).size
    await exigirEspacio(this.opciones.raiz, Math.max(128 * 1024 ** 2, bytes * 12))
    const carpeta = await mkdtemp(join(this.opciones.raiz, 'restore-'))
    const motor = new PostgresLocal({
      carpeta: join(carpeta, 'motor'),
      binarios: this.opciones.binarios,
      cifrar: this.opciones.cifrar,
      descifrar: this.opciones.descifrar
    })
    let staging: Pool | undefined, ref: Pool | undefined
    const limpiar = async (): Promise<void> => {
      if (ref) {
        await ref.end()
        ref = undefined
      }
      if (staging) {
        await staging.end()
        staging = undefined
      }
      await motor.detener()
      // carpeta proviene exclusivamente de mkdtemp, jamás del archivo ni manifiesto.
      await rm(carpeta, { recursive: true, force: true })
    }
    let codigo: CodigoDiagnosticoRespaldo = 'BACKUP_PRIVATE_PREPARATION_FAILED'
    let etapa = 'copiar_seleccion'
    try {
      const entrada = join(carpeta, 'entrada.back'),
        dump = join(carpeta, 'entrada.dump')
      const original = await integridadArchivo(archivo, ctx.signal)
      await copiarStreaming(archivo, entrada, ctx.signal)
      const copia = await integridadArchivo(entrada, ctx.signal)
      registrarCopiaRespaldo(original, copia)
      if (original.tamano !== copia.tamano || original.sha256 !== copia.sha256)
        throw new ErrorDiagnosticoRespaldo('BACKUP_COPY_MISMATCH', 'copiar_seleccion')
      const paquete = new PaqueteRespaldoZip()
      faseOperacion(ctx, 'validando_contenedor')
      const manifest = await paquete.verificar(entrada, ctx.signal)
      if (manifest.schema_version > 10)
        throw new ErrorDiagnosticoRespaldo('BACKUP_FORMAT_UNSUPPORTED', 'version_esquema')
      await paquete.extraerDump(entrada, dump, ctx.signal)
      faseOperacion(ctx, 'iniciando_aislamiento')
      codigo = 'BACKUP_STAGING_START_FAILED'
      etapa = 'iniciar_staging'
      const config = await motor.iniciar()
      faseOperacion(ctx, 'inspeccionando')
      codigo = 'BACKUP_REFERENCE_FAILED'
      etapa = 'crear_referencia'
      const id = randomUUID().replaceAll('-', ''),
        refName = 'rcm_ref_' + id
      await motor.conAdministracionRestauracion((db) =>
        db.query('CREATE DATABASE "' + refName + '" OWNER ruizcacao_app').then(() => {})
      )
      ref = new Pool({ ...config, database: refName, max: 2, statement_timeout: 60000 })
      etapa = 'migrar_referencia'
      const runner = new MigracionesPostgres(),
        validador = new ValidadorRestorePostgres()
      const r = await ref.connect()
      try {
        await r.query('BEGIN')
        await runner.aplicarEnTransaccion(r, manifest.schema_version)
        await r.query('COMMIT')
      } catch (e) {
        await r.query('ROLLBACK')
        throw e
      } finally {
        r.release()
      }
      const referencia = new Respaldos(
        { ...config, database: refName },
        this.opciones.binarios,
        carpeta
      )
      const dumpRef = join(carpeta, 'referencia.dump')
      etapa = 'exportar_referencia'
      await referencia.exportar(ref, dumpRef, ctx)
      const tool = new Respaldos(config, this.opciones.binarios, carpeta)
      codigo = 'BACKUP_DUMP_INVALID'
      etapa = 'inventario_dump'
      const toc = await tool.herramienta('pg_restore', ['--list', dump], ctx.signal)
      const major = Number(
        (await tool.herramienta('pg_dump', ['--version'], ctx.signal)).match(
          /PostgreSQL\) (\d+)/
        )?.[1]
      )
      if (
        major !== manifest.postgres_server_major ||
        major !== manifest.pg_dump_major ||
        Number(toc.match(/Dumped from database version: (\d+)/)?.[1]) !==
          manifest.postgres_server_major ||
        Number(toc.match(/Dumped by pg_dump version: (\d+)/)?.[1]) !== manifest.pg_dump_major
      )
        throw new ErrorDiagnosticoRespaldo('BACKUP_TOOL_VERSION_MISMATCH', 'version_herramientas')
      validarInventario(toc, await tool.herramienta('pg_restore', ['--list', dumpRef], ctx.signal))
      faseOperacion(ctx, 'restaurando_staging')
      codigo = 'BACKUP_STAGING_RESTORE_FAILED'
      etapa = 'restaurar_staging'
      await tool.herramienta(
        'pg_restore',
        [
          ...tool.argumentosConexion(),
          '--single-transaction',
          '--exit-on-error',
          '--no-owner',
          '--no-privileges',
          dump
        ],
        ctx.signal
      )
      codigo = 'BACKUP_SCHEMA_MISMATCH'
      etapa = 'comparar_catalogo'
      staging = new Pool({ ...config, max: 2, statement_timeout: 60000 })
      await seleccionarReferenciaRestore(staging, ref, manifest.schema_version)
      await validador.comparar(staging, ref, manifest.schema_version)
      faseOperacion(ctx, 'migrando_staging')
      codigo = 'BACKUP_MIGRATION_FAILED'
      etapa = 'migrar_staging'
      await runner.migrar(staging, ctx.signal)
      await runner.migrar(ref, ctx.signal)
      await validador.comparar(staging, ref, 10)
      faseOperacion(ctx, 'normalizando')
      codigo = 'BACKUP_NORMALIZATION_FAILED'
      etapa = 'normalizar_staging'
      await validador.normalizar(staging)
      await validador.comparar(staging, ref, 10)
      codigo = 'BACKUP_EXPORT_FAILED'
      etapa = 'exportar_normalizado'
      const normalizado = join(carpeta, 'normalizado.dump')
      await tool.exportar(staging, normalizado, ctx)
      const bytesBase = Number(
        (await staging.query('SELECT pg_database_size(current_database())::text n')).rows[0].n
      )
      const final = await integridadArchivo(entrada, ctx.signal)
      if (final.tamano !== copia.tamano || final.sha256 !== copia.sha256)
        throw new ErrorDiagnosticoRespaldo('BACKUP_COPY_MISMATCH', 'copia_preparada')
      const hash = final.sha256
      const referenciaPool = ref
      return {
        id,
        manifest,
        hash,
        dump: normalizado,
        bytesBase,
        validar: (pool) => validador.comparar(pool, referenciaPool, 10),
        limpiar
      }
    } catch (e) {
      try {
        await limpiar()
      } catch (limpieza) {
        registrarFalloRespaldo(
          diagnosticarRespaldo(limpieza, 'BACKUP_CLEANUP_FAILED', 'limpiar_workspace'),
          'limpiar_workspace'
        )
      }
      throw diagnosticarRespaldo(e, codigo, etapa)
    }
  }
}
