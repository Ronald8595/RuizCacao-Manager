import { createReadStream, createWriteStream } from 'node:fs'
import { addAbortSignal } from 'node:stream'
import { open, unlink, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'
import { pipeline, finished } from 'node:stream/promises'
import { ZipFile as ZipWriter } from 'yazl'
import { openPromise, type Entry } from 'yauzl'
import {
  ErrorDiagnosticoRespaldo,
  diagnosticarRespaldo,
  type CodigoDiagnosticoRespaldo
} from './respaldo-diagnostico'
import { PRODUCT_ID, type BackupPackage, type ManifestPortable } from './respaldo-portable'

const MAX_MANIFEST = 16384
export const MAX_DUMP_PORTABLE = 64 * 1024 ** 3
const campos = [
  'product_id',
  'format_version',
  'backup_id',
  'created_at_utc',
  'app_version',
  'schema_version',
  'postgres_server_major',
  'pg_dump_major',
  'backup_type',
  'database_dump_filename',
  'database_dump_size',
  'database_dump_sha256'
]
function invalido(
  codigo: CodigoDiagnosticoRespaldo = 'BACKUP_INVALID_CONTAINER',
  fase = 'contenedor'
): never {
  throw new ErrorDiagnosticoRespaldo(codigo, fase)
}
function validarManifest(valor: unknown, maxDump: number): ManifestPortable {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor))
    invalido('BACKUP_INVALID_MANIFEST', 'manifiesto')
  const m = valor as ManifestPortable
  if (m.product_id !== PRODUCT_ID) invalido('BACKUP_PRODUCT_MISMATCH', 'producto')
  if (m.format_version !== 1)
    invalido(
      Number.isSafeInteger(m.format_version) && Number(m.format_version) > 1
        ? 'BACKUP_FORMAT_UNSUPPORTED'
        : 'BACKUP_INVALID_MANIFEST',
      'formato'
    )
  const entero = (n: number): boolean => Number.isSafeInteger(n) && n > 0
  const camposValidos: [string, boolean][] = [
    [
      'campos_manifiesto',
      Object.keys(m).length === campos.length && campos.every((c) => Object.hasOwn(m, c))
    ],
    ['tipo_respaldo', m.backup_type === 'manual'],
    ['nombre_dump', m.database_dump_filename === 'database.dump'],
    [
      'id_respaldo',
      typeof m.backup_id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(m.backup_id)
    ],
    [
      'fecha_manifiesto',
      typeof m.created_at_utc === 'string' &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(m.created_at_utc) &&
        Number.isFinite(Date.parse(m.created_at_utc)) &&
        new Date(m.created_at_utc).toISOString() === m.created_at_utc
    ],
    [
      'version_app',
      typeof m.app_version === 'string' && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(m.app_version)
    ],
    ['esquema_manifiesto', entero(m.schema_version)],
    [
      'version_pg',
      entero(m.postgres_server_major) &&
        entero(m.pg_dump_major) &&
        m.pg_dump_major === m.postgres_server_major
    ],
    ['tamano_manifiesto', entero(m.database_dump_size) && m.database_dump_size <= maxDump],
    [
      'sha_manifiesto',
      typeof m.database_dump_sha256 === 'string' && /^[a-f0-9]{64}$/.test(m.database_dump_sha256)
    ]
  ]
  for (const [fase, valido] of camposValidos) if (!valido) invalido('BACKUP_INVALID_MANIFEST', fase)
  return m
}
function validarEntrada(e: Entry, maxDump: number): void {
  const mode = e.externalFileAttributes >>> 16
  const tipo = mode & 0o170000
  if (
    !['manifest.json', 'database.dump'].includes(e.fileName) ||
    e.fileNameRaw.toString('utf8') !== e.fileName ||
    e.isEncrypted() ||
    e.compressionMethod !== 0 ||
    (tipo !== 0 && tipo !== 0o100000) ||
    (mode & 0o111) !== 0 ||
    (e.externalFileAttributes & 0x10) !== 0 ||
    !Number.isSafeInteger(e.uncompressedSize) ||
    e.uncompressedSize <= 0 ||
    e.uncompressedSize > (e.fileName === 'manifest.json' ? MAX_MANIFEST : maxDump)
  )
    invalido()
}

/** ZIP v1 STORE: dos entradas fijas. Nunca se extrae usando nombres del archivo. */
export class PaqueteRespaldoZip implements BackupPackage {
  constructor(private readonly maxDump = MAX_DUMP_PORTABLE) {}
  async escribir(
    dump: string,
    manifest: ManifestPortable,
    destino: string,
    signal?: AbortSignal
  ): Promise<void> {
    signal?.throwIfAborted()
    validarManifest(manifest, this.maxDump)
    const zip = new ZipWriter()
    const salida = createWriteStream(destino, { flags: 'wx', mode: 0o600 })
    const completado = pipeline(zip.outputStream, salida, { signal })
    zip.on('error', (error) => salida.destroy(error))
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), 'manifest.json', {
      compress: false,
      mode: 0o100600
    })
    const entrada = createReadStream(dump, { signal })
    entrada.on('error', (e) => salida.destroy(e))
    zip.addReadStream(entrada, 'database.dump', {
      compress: false,
      mode: 0o100600,
      size: manifest.database_dump_size
    })
    zip.end()
    try {
      await completado
    } finally {
      entrada.destroy()
      await finished(entrada).catch(() => {})
    }
  }
  async verificar(archivo: string, signal?: AbortSignal): Promise<ManifestPortable> {
    return this.procesarDiagnosticado(archivo, undefined, signal)
  }
  // Infraestructura para inspección/pruebas; no restaura SQL ni está expuesta en IPC.
  async extraerDump(
    archivo: string,
    destino: string,
    signal?: AbortSignal
  ): Promise<ManifestPortable> {
    return this.procesarDiagnosticado(archivo, destino, signal)
  }
  private async procesarDiagnosticado(
    archivo: string,
    destino?: string,
    signal?: AbortSignal
  ): Promise<ManifestPortable> {
    try {
      return await this.procesar(archivo, destino, signal)
    } catch (e) {
      const io = /^(EACCES|EPERM|ENOENT|ENOSPC|EIO|EBUSY|ENAMETOOLONG)$/.test(
        String((e as { code?: unknown })?.code)
      )
      throw diagnosticarRespaldo(
        e,
        io ? 'BACKUP_PRIVATE_PREPARATION_FAILED' : 'BACKUP_INVALID_CONTAINER',
        destino ? 'extraccion' : 'contenedor'
      )
    }
  }
  private async procesar(
    archivo: string,
    destino?: string,
    signal?: AbortSignal
  ): Promise<ManifestPortable> {
    signal?.throwIfAborted()
    const meta = await stat(archivo)
    if (!meta.isFile() || meta.size > this.maxDump + 1024 * 1024) invalido()
    const zip = await openPromise(archivo, {
      lazyEntries: true,
      autoClose: false,
      strictFileNames: true,
      validateEntrySizes: true
    })
    let salida: Awaited<ReturnType<typeof open>> | undefined
    let correcto = false
    try {
      if (zip.entryCount !== 2) invalido('BACKUP_INVALID_CONTAINER', 'cantidad_entradas')
      const entradas = new Map<string, Entry>()
      for await (const e of zip.eachEntry()) {
        signal?.throwIfAborted()
        validarEntrada(e, this.maxDump)
        if (entradas.has(e.fileName)) invalido('BACKUP_INVALID_CONTAINER', 'entrada_duplicada')
        // Rechazar también discrepancias en encabezados locales.
        const local = await zip.readLocalFileHeaderPromise(e)
        if (
          !local.fileName.equals(e.fileNameRaw) ||
          local.compressionMethod !== 0 ||
          local.generalPurposeBitFlag !== e.generalPurposeBitFlag
        )
          invalido('BACKUP_INVALID_CONTAINER', 'encabezado_local')
        entradas.set(e.fileName, e)
      }
      const entradaManifest = entradas.get('manifest.json'),
        entradaDump = entradas.get('database.dump')
      if (!entradaManifest || !entradaDump)
        invalido('BACKUP_INVALID_CONTAINER', 'entradas_requeridas')
      const partes: Buffer[] = []
      let leidos = 0
      let crcManifest = 0
      const streamManifest = await zip.openReadStreamPromise(entradaManifest)
      if (signal) addAbortSignal(signal, streamManifest)
      for await (const fragmento of streamManifest) {
        leidos += fragmento.length
        if (leidos > MAX_MANIFEST) invalido('BACKUP_INVALID_MANIFEST', 'limite_manifiesto')
        crcManifest = crc32(fragmento, crcManifest)
        partes.push(fragmento)
      }
      if (crcManifest !== entradaManifest.crc32) invalido('BACKUP_CRC_MISMATCH', 'crc_manifiesto')
      let json: unknown
      try {
        json = JSON.parse(Buffer.concat(partes).toString('utf8'))
      } catch {
        invalido('BACKUP_INVALID_MANIFEST', 'json_manifiesto')
      }
      const manifest = validarManifest(json, this.maxDump)
      if (manifest.database_dump_size !== entradaDump.uncompressedSize)
        invalido('BACKUP_DUMP_INVALID', 'tamano_dump')
      const hash = createHash('sha256')
      let bytes = 0
      let crcDump = 0
      let cabecera = Buffer.alloc(0)
      if (destino) salida = await open(destino, 'wx', 0o600)
      const streamDump = await zip.openReadStreamPromise(entradaDump)
      if (signal) addAbortSignal(signal, streamDump)
      for await (const fragmento of streamDump) {
        bytes += fragmento.length
        if (bytes > manifest.database_dump_size) invalido('BACKUP_DUMP_INVALID', 'tamano_dump')
        if (cabecera.length < 5)
          cabecera = Buffer.concat([cabecera, fragmento.subarray(0, 5 - cabecera.length)])
        hash.update(fragmento)
        crcDump = crc32(fragmento, crcDump)
        if (salida) await salida.writeFile(fragmento)
      }
      if (bytes !== manifest.database_dump_size) invalido('BACKUP_DUMP_INVALID', 'tamano_dump')
      if (crcDump !== entradaDump.crc32) invalido('BACKUP_CRC_MISMATCH', 'crc_dump')
      if (cabecera.toString('ascii') !== 'PGDMP') invalido('BACKUP_DUMP_INVALID', 'cabecera_dump')
      if (hash.digest('hex') !== manifest.database_dump_sha256)
        invalido('BACKUP_HASH_MISMATCH', 'hash_dump')
      correcto = true
      return manifest
    } finally {
      if (zip.isOpen)
        await new Promise<void>((resolve) => {
          zip.once('close', resolve)
          zip.close()
        })
      if (salida) {
        await salida.close()
        if (!correcto && destino) await unlink(destino).catch(() => {})
      }
    }
  }
}
