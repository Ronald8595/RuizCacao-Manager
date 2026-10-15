const { load, root } = require('./loader.cjs')
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict'),
  { randomUUID, randomBytes } = require('node:crypto'),
  { Pool } = require('pg')
const { PostgresLocal, localizarPostgres } = load(
  path.join(root, 'src/main/database/postgres-local.ts')
)
async function main() {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'ruizcacao-startup-')),
    binarios = process.env.RCM_TEST_BIN || (await localizarPostgres(path.join(root, 'vendor'))),
    clave = randomBytes(32)
  const opciones = {
    carpeta,
    binarios,
    cifrar: (s) => Buffer.from(s).map((v, i) => v ^ clave[i % 32]),
    descifrar: (b) =>
      Buffer.from(b)
        .map((v, i) => v ^ clave[i % 32])
        .toString('utf8')
  }
  let motor = new PostgresLocal(opciones),
    config = await motor.iniciar(),
    pool
  const casos = []
  try {
    pool = new Pool(config)
    await pool.query('CREATE TABLE marcador(valor integer)')
    await pool.query('INSERT INTO marcador VALUES(7)')
    await pool.end()
    pool = undefined
    for (const corte of [
      'preparada',
      'intencion_antes_rename',
      'original_renombrada',
      'candidata_promovida',
      'validada',
      'confirmada'
    ]) {
      const id = randomUUID().replaceAll('-', ''),
        candidate = 'rcm_c_' + id,
        reserve = 'rcm_r_' + id
      const j = await motor.conAdministracionRestauracion(async (db) => {
        await db.query('CREATE DATABASE "' + candidate + '" OWNER ruizcacao_app')
        const ids = (
          await db.query(
            'SELECT datname,oid::int oid FROM pg_database WHERE datname=ANY($1::text[])',
            [['ruizcacao_manager', candidate]]
          )
        ).rows
        const fecha = new Date().toISOString()
        return {
          operation_id: id,
          phase: 'preparada',
          intent: 'ninguna',
          cluster_identity: (
            await db.query('SELECT system_identifier::text id FROM pg_control_system()')
          ).rows[0].id,
          active_database: 'ruizcacao_manager',
          candidate_database: candidate,
          reserve_database: reserve,
          active_oid: ids.find((r) => r.datname === 'ruizcacao_manager').oid,
          candidate_oid: ids.find((r) => r.datname === candidate).oid,
          backup_sha256: '0'.repeat(64),
          created_at: fecha,
          updated_at: fecha
        }
      })
      pool = new Pool({ ...config, database: candidate })
      await pool.query('CREATE TABLE marcador(valor integer)')
      await pool.query('INSERT INTO marcador VALUES(42)')
      await pool.end()
      pool = undefined
      await motor.journalRestauracion().guardar(j)
      if (corte !== 'preparada')
        await motor.conAdministracionRestauracion(async (db) => {
          j.phase = 'seguridad_creada'
          j.intent = 'renombrar_original'
          await motor.journalRestauracion().guardar(j)
          await db.query('ALTER DATABASE ruizcacao_manager ALLOW_CONNECTIONS false')
          if (corte === 'intencion_antes_rename') return
          await db.query('ALTER DATABASE ruizcacao_manager RENAME TO "' + reserve + '"')
          j.phase = 'original_renombrada'
          j.intent = 'promover_candidata'
          await motor.journalRestauracion().guardar(j)
          if (corte === 'original_renombrada') return
          await db.query('ALTER DATABASE "' + candidate + '" RENAME TO ruizcacao_manager')
          if (corte === 'validada') j.phase = 'validada'
          else if (corte === 'confirmada') j.phase = 'confirmada'
          // candidata_promovida conserva intención previa: corte entre mutación y persistencia.
          await motor.journalRestauracion().guardar(j)
        })
      await motor.detener()
      motor = new PostgresLocal(opciones)
      config = await motor.iniciar()
      pool = new Pool(config)
      const valor = (await pool.query('SELECT valor FROM marcador')).rows[0].valor
      assert.equal(valor, corte === 'confirmada' ? 42 : 7)
      const estado = await motor.journalRestauracion().leer()
      assert.equal(estado.phase, corte === 'confirmada' ? 'confirmada' : 'revertida')
      await pool.query('UPDATE marcador SET valor=7')
      await pool.end()
      pool = undefined
      casos.push(corte)
      console.log('OK startup corte ' + corte + ' conserva base identificada; no crea vacía')
    }
    const ambiguo = await motor.journalRestauracion().leer(),
      oidSeguro = ambiguo.candidate_oid
    ambiguo.candidate_oid += 100000
    await motor.journalRestauracion().guardar(ambiguo)
    await motor.detener()
    motor = new PostgresLocal(opciones)
    await assert.rejects(motor.iniciar(), /identificada|ambigua/)
    ambiguo.candidate_oid = oidSeguro
    await motor.journalRestauracion().guardar(ambiguo)
    await motor.detener()
    motor = new PostgresLocal(opciones)
    await motor.iniciar()
    console.log('OK startup OID ambiguo bloquea acceso y conserva bases')
    const j = await motor.journalRestauracion().leer(),
      identity = j.cluster_identity
    j.cluster_identity = String(BigInt(identity) + 1n)
    await motor.journalRestauracion().guardar(j)
    await motor.detener()
    motor = new PostgresLocal(opciones)
    await assert.rejects(motor.iniciar(), /otro almacenamiento/)
    j.cluster_identity = identity
    await motor.journalRestauracion().guardar(j)
    await motor.detener()
    motor = new PostgresLocal(opciones)
    await motor.iniciar()
    console.log('OK startup identidad de clúster incorrecta bloqueada sin borrar datos')
    const original = await fs.readFile(path.join(carpeta, 'restauracion-journal.json'), 'utf8')
    await fs.writeFile(path.join(carpeta, 'restauracion-journal.json'), '{invalid')
    await motor.detener()
    motor = new PostgresLocal(opciones)
    await assert.rejects(motor.iniciar())
    await fs.writeFile(path.join(carpeta, 'restauracion-journal.json'), original)
    await motor.detener()
    motor = new PostgresLocal(opciones)
    await motor.iniciar()
    console.log('OK startup journal corrupto bloqueado y recuperación conservadora')
    await fs.writeFile(
      path.join(process.env.RCM_TEST_ARTIFACTS || carpeta, 'restore-startup.json'),
      JSON.stringify(
        {
          casos,
          clusterIncorrecto: 'rechazado',
          journalCorrupto: 'rechazado',
          sinCreacionVacia: true
        },
        null,
        2
      )
    )
  } finally {
    if (pool) await pool.end()
    await motor.detener()
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
