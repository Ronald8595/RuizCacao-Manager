const { load, root } = require('./loader.cjs'),
  assert = require('node:assert/strict'),
  { join } = require('node:path')
const { DestinoRestorePostgres } = load(join(root, 'src/main/database/restore-destino.ts'))
const { validarJournal } = load(join(root, 'src/main/database/restore-journal.ts'))
const { nombreInterno } = load(join(root, 'src/main/database/restore-promocion.ts'))
async function main() {
  const config = { database: 'ruizcacao_manager', user: 'ruizcacao_app', host: '127.0.0.1' },
    rol = { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false }
  let consultas = 0
  const destino = (c, r) =>
    new DestinoRestorePostgres(
      {
        configuracionRestauracion: () => c,
        conAdministracionRestauracion: async (fn) =>
          fn({
            query: async () => {
              consultas++
              return { rows: [r] }
            }
          })
      },
      '',
      '',
      () => null
    )
  await destino(config, rol).comprobarSoporte()
  assert.equal(consultas, 1)
  for (const propiedad of Object.keys(rol))
    await assert.rejects(
      destino(config, { ...rol, [propiedad]: true }).comprobarSoporte(),
      /permisos limitados/
    )
  const antes = consultas
  for (const cambio of [
    { database: 'otra_base' },
    { user: 'ruizcacao_bootstrap' },
    { host: 'localhost' }
  ])
    await assert.rejects(
      destino({ ...config, ...cambio }, rol).comprobarSoporte(),
      /modo privado certificado/
    )
  assert.equal(consultas, antes)
  const id = 'a'.repeat(32),
    fecha = new Date().toISOString(),
    j = {
      operation_id: id,
      phase: 'preparada',
      intent: 'ninguna',
      cluster_identity: '123',
      active_database: 'ruizcacao_manager',
      candidate_database: 'rcm_c_' + id,
      reserve_database: 'rcm_r_' + id,
      active_oid: 1,
      candidate_oid: 2,
      backup_sha256: '0'.repeat(64),
      created_at: fecha,
      updated_at: fecha
    }
  assert.deepEqual(validarJournal(j), j)
  for (const cambio of [
    { phase: 'futura' },
    { candidate_database: 'ruizcacao_manager' },
    { candidate_oid: 1 },
    { cluster_identity: 'otro' },
    { password: 'prohibida' }
  ])
    assert.throws(() => validarJournal({ ...j, ...cambio }))
  assert.throws(() => nombreInterno('ruizcacao_manager; DROP DATABASE postgres'))
  if (process.argv[2]) {
    const fs = require('node:fs/promises'),
      path = require('node:path'),
      { Pool } = require('pg')
    const archivo = path.resolve(process.argv[2]),
      carpeta = path.dirname(archivo)
    assert.match(path.basename(carpeta), /^ruizcacao-tests-/)
    const pool = new Pool(JSON.parse(await fs.readFile(archivo, 'utf8')))
    try {
      assert.equal(
        (
          await fs.realpath((await pool.query('SHOW data_directory')).rows[0].data_directory)
        ).toLowerCase(),
        (await fs.realpath(path.join(carpeta, 'motor', 'data'))).toLowerCase()
      )
      const real = new DestinoRestorePostgres(
        {
          configuracionRestauracion: () => config,
          conAdministracionRestauracion: (fn) => fn(pool)
        },
        '',
        '',
        () => null
      )
      await real.comprobarSoporte()
      console.log(
        'OK guard de privilegios contra pg_roles real del clúster temporal verificado; solo lectura'
      )
    } finally {
      await pool.end()
    }
  }
  console.log(
    'OK contratos restore: rol sin privilegios elevados, modo privado, nombres y journal estricto; cero SQL en rechazo de modo'
  )
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
