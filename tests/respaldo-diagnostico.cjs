const { load, root } = require('./loader.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { createWriteStream } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { createHash, randomUUID } = require('node:crypto')
const { pipeline } = require('node:stream/promises')
const { ZipFile } = require('yazl')
const mod = (name) => load(join(root, 'src/main/database', name + '.ts'))
const { PaqueteRespaldoZip } = mod('respaldo-paquete')
const { PRODUCT_ID } = mod('respaldo-portable')
const { configurarLogs } = mod('errores')
const { registrarFalloRespaldo, diagnosticarRespaldo } = mod('respaldo-diagnostico')
const { errorRespaldo, ServicioRespaldos } = load(join(root, 'src/main/respaldos-servicio.ts'))
const { WorkspaceRestorePostgres } = mod('restore-workspace')
const { ValidadorRestorePostgres } = mod('restore-validacion')
const { categoriaErrorHerramienta } = mod('proceso-postgres')
const streaming = mod('archivo-stream')
async function main() {
  const carpeta = await fs.mkdtemp(join(tmpdir(), 'rcm-diagnostico-'))
  configurarLogs(join(carpeta, 'logs'))
  const paquete = new PaqueteRespaldoZip()
  const dump = Buffer.from('PGDMP-fixture-sin-datos-reales')
  const manifest = {
    product_id: PRODUCT_ID,
    format_version: 1,
    backup_id: randomUUID(),
    created_at_utc: '2026-10-18T12:00:00.000Z',
    app_version: '1.3.0',
    schema_version: 10,
    postgres_server_major: 18,
    pg_dump_major: 18,
    backup_type: 'manual',
    database_dump_filename: 'database.dump',
    database_dump_size: dump.length,
    database_dump_sha256: createHash('sha256').update(dump).digest('hex')
  }
  const zip = async (m, contenido = dump) => {
    const archivo = join(carpeta, randomUUID() + '.back')
    const z = new ZipFile()
    const fin = pipeline(z.outputStream, createWriteStream(archivo))
    z.addBuffer(Buffer.from(typeof m === 'string' ? m : JSON.stringify(m)), 'manifest.json', {
      compress: false
    })
    z.addBuffer(contenido, 'database.dump', { compress: false })
    z.end()
    await fin
    return archivo
  }
  const rechaza = async (promesa, codigo, fase) => {
    await assert.rejects(promesa, (e) => {
      assert.equal(e.codigoTecnico, codigo)
      if (fase) assert.equal(e.fase, fase)
      registrarFalloRespaldo(e, 'prueba')
      assert.deepEqual(Object.keys(errorRespaldo(e)).sort(), ['codigo', 'error'])
      return true
    })
  }
  try {
    for (const [cambio, codigo, fase] of [
      [{ product_id: 'otro' }, 'BACKUP_PRODUCT_MISMATCH', 'producto'],
      [{ format_version: 2 }, 'BACKUP_FORMAT_UNSUPPORTED', 'formato'],
      [{ app_version: 'secreto' }, 'BACKUP_INVALID_MANIFEST', 'version_app'],
      [{ schema_version: -1 }, 'BACKUP_INVALID_MANIFEST', 'esquema_manifiesto'],
      [{ password: 'NO_REGISTRAR_SECRETO' }, 'BACKUP_INVALID_MANIFEST', 'campos_manifiesto'],
      [{ database_dump_sha256: '0'.repeat(64) }, 'BACKUP_HASH_MISMATCH', 'hash_dump'],
      [{ database_dump_size: 2 }, 'BACKUP_DUMP_INVALID', 'tamano_dump']
    ])
      await rechaza(paquete.verificar(await zip({ ...manifest, ...cambio })), codigo, fase)
    await rechaza(paquete.verificar(await zip('{')), 'BACKUP_INVALID_MANIFEST', 'json_manifiesto')
    await rechaza(
      paquete.verificar(await zip(manifest, Buffer.from('XXXXX-fixture-sin-datos-reales'))),
      'BACKUP_DUMP_INVALID',
      'cabecera_dump'
    )
    const valido = await zip(manifest)
    const corrupto = await fs.readFile(valido)
    corrupto[corrupto.indexOf('1.3.0')] = 50
    const crc = join(carpeta, 'crc.back')
    await fs.writeFile(crc, corrupto)
    await rechaza(paquete.verificar(crc), 'BACKUP_CRC_MISMATCH', 'crc_manifiesto')
    await fs.writeFile(crc, 'no-zip')
    await rechaza(paquete.verificar(crc), 'BACKUP_INVALID_CONTAINER')
    await rechaza(
      paquete.verificar(join(carpeta, 'ausente.back')),
      'BACKUP_PRIVATE_PREPARATION_FAILED'
    )
    const servicio = new ServicioRespaldos({
      autorizar: () => 'admin',
      seleccionar: async () => 'privado.txt'
    })
    await rechaza(servicio.seleccionar('cargar'), 'BACKUP_INVALID_EXTENSION', 'seleccion')
    // Ruta de otro userData, espacios y Unicode; solo falla al intentar iniciar un motor deliberadamente ausente.
    const destino = join(carpeta, 'Perfil B Ñ 中文', 'restore-workspaces')
    const workspace = new WorkspaceRestorePostgres({
      raiz: destino,
      binarios: join(carpeta, 'sin-binarios'),
      cifrar: Buffer.from,
      descifrar: (b) => b.toString()
    })
    await rechaza(workspace.preparar(valido, {}), 'BACKUP_STAGING_START_FAILED', 'iniciar_staging')
    assert.deepEqual(await fs.readdir(destino), [])
    const copiar = streaming.copiarStreaming
    try {
      streaming.copiarStreaming = async (...args) => {
        await copiar(...args)
        await fs.appendFile(args[1], 'alterado')
      }
      await rechaza(workspace.preparar(valido, {}), 'BACKUP_COPY_MISMATCH', 'copiar_seleccion')
    } finally {
      streaming.copiarStreaming = copiar
    }
    assert.deepEqual(await fs.readdir(destino), [])
    const fakePool = (firma) => ({
      query: async (sql) => {
        if (sql.includes('to_regclass')) return { rows: [{ t: 'ruizcacao.migraciones' }] }
        if (sql.includes('SELECT version'))
          return { rows: Array.from({ length: 10 }, (_, i) => ({ version: i + 1 })) }
        if (sql.includes('WITH objetos')) return { rows: [{ firma }] }
        throw Error('Consulta no prevista')
      }
    })
    await rechaza(
      new ValidadorRestorePostgres().comparar(fakePool('A'), fakePool('B'), 10),
      'BACKUP_SCHEMA_MISMATCH',
      'firma_catalogo'
    )
    const errorSecreto = Object.assign(Error('NO_REGISTRAR_SECRETO password_hash SQL C:/privado'), {
      code: 'EACCES',
      stderr: 'NO_REGISTRAR_SECRETO',
      categoriaHerramienta: 'access_denied'
    })
    registrarFalloRespaldo(
      diagnosticarRespaldo(errorSecreto, 'BACKUP_STAGING_RESTORE_FAILED', 'restaurar_staging'),
      'prueba'
    )
    const cancelado = Object.assign(Error('cancelado'), { name: 'AbortError' })
    assert.equal(
      diagnosticarRespaldo(cancelado, 'BACKUP_PRIVATE_PREPARATION_FAILED', 'prueba'),
      cancelado
    )
    assert.equal(
      categoriaErrorHerramienta(
        'pg_restore: error: could not execute query: ERROR: NO_REGISTRAR_SECRETO'
      ),
      'sql'
    )
    const log = await fs.readFile(join(carpeta, 'logs/respaldos.jsonl'), 'utf8')
    assert.doesNotMatch(log, /NO_REGISTRAR_SECRETO|password_hash|C:\/privado|SELECT|PGPASSWORD/)
    const eventos = log.trim().split('\n').map(JSON.parse)
    assert.ok(eventos.some((e) => e.sistema === 'EACCES' && e.herramienta === 'access_denied'))
    const copias = eventos.filter((e) => e.evento === 'copia_privada')
    assert.equal(copias.length, 2)
    assert.equal(copias[0].iguales, true)
    assert.equal(copias[1].iguales, false)
    assert.equal(
      copias[0].sha256Origen,
      createHash('sha256')
        .update(await fs.readFile(valido))
        .digest('hex')
    )
    console.log(
      'PASS diagnóstico: códigos/fases, ZIP/manifiesto/CRC/hash/PGDMP, copia idéntica y alterada, Unicode/userData, catálogo, cancelación y log sin secretos; sin motor iniciado'
    )
  } finally {
    configurarLogs(undefined)
    await fs.rm(carpeta, { recursive: true, force: true })
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
