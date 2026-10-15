import { createWriteStream } from 'node:fs'
import { open, unlink, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { ZipFile as ZipWriter } from 'yazl'
import { openPromise, type Entry } from 'yauzl'
import { ErrorNegocio } from '../../shared/errorNegocio'
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
function invalido(): never {
  throw new ErrorNegocio('El archivo no es un respaldo portable v1 válido de RuizCacao Manager.')
}
function validarManifest(valor: unknown, maxDump: number): ManifestPortable {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) invalido()
  const m = valor as ManifestPortable
  const entero = (n: number): boolean => Number.isSafeInteger(n) && n > 0
  if (
    Object.keys(m).length !== campos.length ||
    campos.some((c) => !Object.hasOwn(m, c)) ||
    m.product_id !== PRODUCT_ID ||
    m.format_version !== 1 ||
    m.backup_type !== 'manual' ||
    m.database_dump_filename !== 'database.dump' ||
    typeof m.backup_id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(m.backup_id) ||
    typeof m.created_at_utc !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(m.created_at_utc) ||
    !Number.isFinite(Date.parse(m.created_at_utc)) ||
    new Date(m.created_at_utc).toISOString() !== m.created_at_utc ||
    typeof m.app_version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(m.app_version) ||
    !entero(m.schema_version) ||
    !entero(m.postgres_server_major) ||
    !entero(m.pg_dump_major) ||
    m.pg_dump_major !== m.postgres_server_major ||
    !entero(m.database_dump_size) ||
    m.database_dump_size > maxDump ||
    typeof m.database_dump_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(m.database_dump_sha256)
  )
    invalido()
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
  async escribir(dump: string, manifest: ManifestPortable, destino: string): Promise<void> {
    validarManifest(manifest, this.maxDump)
    const zip = new ZipWriter()
    const salida = createWriteStream(destino, { flags: 'wx', mode: 0o600 })
    const completado = pipeline(zip.outputStream, salida)
    zip.on('error', (error) => salida.destroy(error))
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), 'manifest.json', {
      compress: false,
      mode: 0o100600
    })
    zip.addFile(dump, 'database.dump', { compress: false, mode: 0o100600 })
    zip.end()
    await completado
  }
  async verificar(archivo: string): Promise<ManifestPortable> {
    return this.procesar(archivo)
  }
  // Infraestructura para inspección/pruebas; no restaura SQL ni está expuesta en IPC.
  async extraerDump(archivo: string, destino: string): Promise<ManifestPortable> {
    return this.procesar(archivo, destino)
  }
  private async procesar(archivo: string, destino?: string): Promise<ManifestPortable> {
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
      if (zip.entryCount !== 2) invalido()
      const entradas = new Map<string, Entry>()
      for await (const e of zip.eachEntry()) {
        validarEntrada(e, this.maxDump)
        if (entradas.has(e.fileName)) invalido()
        // Rechazar también discrepancias en encabezados locales.
        const local = await zip.readLocalFileHeaderPromise(e)
        if (
          !local.fileName.equals(e.fileNameRaw) ||
          local.compressionMethod !== 0 ||
          local.generalPurposeBitFlag !== e.generalPurposeBitFlag
        )
          invalido()
        entradas.set(e.fileName, e)
      }
      const entradaManifest = entradas.get('manifest.json'),
        entradaDump = entradas.get('database.dump')
      if (!entradaManifest || !entradaDump) invalido()
      const partes: Buffer[] = []
      let leidos = 0
      let crcManifest = 0
      for await (const fragmento of await zip.openReadStreamPromise(entradaManifest)) {
        leidos += fragmento.length
        if (leidos > MAX_MANIFEST) invalido()
        crcManifest = crc32(fragmento, crcManifest)
        partes.push(fragmento)
      }
      if (crcManifest !== entradaManifest.crc32) invalido()
      const manifest = validarManifest(
        JSON.parse(Buffer.concat(partes).toString('utf8')),
        this.maxDump
      )
      if (manifest.database_dump_size !== entradaDump.uncompressedSize) invalido()
      const hash = createHash('sha256')
      let bytes = 0
      let crcDump = 0
      let cabecera = Buffer.alloc(0)
      if (destino) salida = await open(destino, 'wx', 0o600)
      for await (const fragmento of await zip.openReadStreamPromise(entradaDump)) {
        bytes += fragmento.length
        if (bytes > manifest.database_dump_size) invalido()
        if (cabecera.length < 5)
          cabecera = Buffer.concat([cabecera, fragmento.subarray(0, 5 - cabecera.length)])
        hash.update(fragmento)
        crcDump = crc32(fragmento, crcDump)
        if (salida) await salida.writeFile(fragmento)
      }
      if (
        bytes !== manifest.database_dump_size ||
        crcDump !== entradaDump.crc32 ||
        cabecera.toString('ascii') !== 'PGDMP' ||
        hash.digest('hex') !== manifest.database_dump_sha256
      )
        invalido()
      correcto = true
      return manifest
    } finally {
      zip.close()
      if (salida) {
        await salida.close()
        if (!correcto && destino) await unlink(destino).catch(() => {})
      }
    }
  }
}
