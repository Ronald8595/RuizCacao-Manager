// Diagnóstico/regresión en motor efímero con ruta Unicode; no lee perfiles de la app.
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { load, root } = require('./loader.cjs')
const { PostgresLocal, localizarPostgres } = load(
  path.join(root, 'src/main/database/postgres-local.ts')
)
const { decodificarRutaACP, rutaDirectorioPostgres } = load(
  path.join(root, 'src/main/database/postgres-ruta.ts')
)
async function main() {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-ruta-Ñ espacio-'))
  const motor = new PostgresLocal({
    carpeta,
    binarios: await localizarPostgres(path.join(root, 'vendor')),
    cifrar: (s) => Buffer.from(s),
    descifrar: (b) => b.toString()
  })
  const evidencia = {}
  try {
    assert.equal(await rutaDirectorioPostgres(Buffer.from('C:/prueba/Ñ/中文')), 'C:/prueba/Ñ/中文')
    assert.equal(decodificarRutaACP(Buffer.from([0xd1]), 1252), 'Ñ')
    assert.throws(() => decodificarRutaACP(Buffer.from([0xd1]), 99999))
    await motor.iniciar()
    await motor.administrador(async (db) => {
      const row = (
        await db.query(
          "SELECT current_setting('data_directory') ruta, pg_catalog.textsend(current_setting('data_directory')) bytes, current_setting('server_encoding') servidor, current_setting('client_encoding') cliente"
        )
      ).rows[0]
      evidencia.encoding = [row.servidor, row.cliente]
      evidencia.longitud = row.ruta.length
      evidencia.caracteresNoAscii = [...row.ruta]
        .filter((c) => c.charCodeAt(0) > 127)
        .map((c) => c.codePointAt(0))
      evidencia.bytesNoAscii = [...row.bytes].filter((c) => c > 127)
      evidencia.rutaExiste = await fs.access(row.ruta).then(
        () => true,
        () => false
      )
      evidencia.rutaLatin1Existe = await fs.access(row.bytes.toString('latin1')).then(
        () => true,
        () => false
      )
    })
    await motor.conAdministracionRestauracion(async (db) =>
      assert.equal((await db.query('SELECT 1 AS n')).rows[0].n, 1)
    )
    const otra = path.join(carpeta, 'otra')
    await fs.mkdir(path.join(otra, 'data'), { recursive: true })
    motor.opciones.carpeta = otra
    try {
      await assert.rejects(
        motor.conAdministracionRestauracion(async () => {}),
        /no pertenece/
      )
      evidencia.directorioAjenoRechazado = true
    } finally {
      motor.opciones.carpeta = carpeta
    }
    evidencia.exito = true
  } finally {
    await motor.detener()
    console.log(JSON.stringify(evidencia))
    if (process.env.RCM_RUTA_EVIDENCIA)
      await fs.writeFile(process.env.RCM_RUTA_EVIDENCIA, JSON.stringify(evidencia, null, 2) + '\n')
  }
}
main().catch((e) => {
  console.error({ code: e.code, syscall: e.syscall })
  process.exitCode = 1
})
