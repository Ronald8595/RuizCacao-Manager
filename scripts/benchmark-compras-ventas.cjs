// Clúster NUEVO aislado; no acepta conexiones ni perfiles externos.
const fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict')
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto'),
  { Client } = require('pg')
const { load, root } = require('../tests/loader.cjs')
const { PostgresLocal, localizarPostgres } = load(root + '/src/main/database/postgres-local.ts')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
const { insertarRendimiento } = require('./seed-rendimiento-core.cjs')
const { medirOperaciones } = require('./benchmark-operaciones-core.cjs')
async function main() {
  if (process.argv.slice(2).some((a) => a !== '--small'))
    throw Error('Solo --small, sin conexión externa.')
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'ruizcacao-benchmark-test-')),
    key = randomBytes(32)
  const cifrar = (s) => {
    const iv = randomBytes(12),
      c = createCipheriv('aes-256-gcm', key, iv),
      d = Buffer.concat([c.update(s, 'utf8'), c.final()])
    return Buffer.concat([iv, c.getAuthTag(), d])
  }
  const descifrar = (b) => {
    const c = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12))
    c.setAuthTag(b.subarray(12, 28))
    return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString('utf8')
  }
  const local = new PostgresLocal({
    carpeta: path.join(carpeta, 'motor'),
    binarios: await localizarPostgres(path.join(root, 'vendor')),
    cifrar,
    descifrar
  })
  const informe = { fecha: new Date().toISOString(), carpeta, estado: 'preparando', rondas: [] }
  let base, db
  console.log('Benchmark aislado Compras/Ventas: ' + carpeta)
  try {
    const config = await local.iniciar(),
      cred = JSON.parse(descifrar(await fs.readFile(path.join(carpeta, 'motor', 'conexion.enc'))))
    const admin = new Client({
      ...config,
      database: 'postgres',
      user: 'ruizcacao_bootstrap',
      password: cred.passwordAdministrador
    })
    try {
      await admin.connect()
      const real = (await admin.query('SHOW data_directory')).rows[0].data_directory
      assert.equal(
        (await fs.realpath(real)).toLowerCase(),
        (await fs.realpath(path.join(carpeta, 'motor', 'data'))).toLowerCase()
      )
      informe.directorioVerificado = real
    } finally {
      await admin.end()
    }
    base = new BaseLocal(config)
    await base.iniciar()
    await base.crearAdministrador(
      'Benchmark operaciones',
      randomBytes(20).toString('base64url') + 'Aa1!'
    )
    await base.cerrar()
    base = null
    db = new Client({ ...config, statement_timeout: 120000 })
    await db.connect()
    await db.query("SET TIME ZONE 'America/Guayaquil'")
    informe.seed = await insertarRendimiento(
      db,
      process.argv.includes('--small')
        ? { clientes: 30, proveedores: 20, compras: 200, ventas: 300, gastos: 50 }
        : undefined
    )
    for (const t of ['compras', 'ventas', 'clientes', 'proveedores'])
      await db.query('ANALYZE ruizcacao.' + t)
    informe.indicesAntes = (
      await db.query(
        "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='ruizcacao' AND tablename IN ('compras','ventas') ORDER BY indexname"
      )
    ).rows
    const originales = informe.indicesAntes.filter((r) =>
      ['compras_orden_id', 'ventas_orden_id'].includes(r.indexname)
    )
    try {
      for (const conIndice of [false, true, true, false]) {
        for (const modulo of ['compras', 'ventas']) {
          await db.query(`DROP INDEX IF EXISTS ruizcacao.${modulo}_orden_id`)
          if (conIndice)
            await db.query(
              `CREATE INDEX ${modulo}_orden_id ON ruizcacao.${modulo} (orden DESC,id DESC)`
            )
        }
        const resultados = await medirOperaciones(db)
        if (informe.rondas.length)
          assert.deepEqual(
            resultados.map((r) => [r.sql, r.params, r.huella]),
            informe.rondas[0].resultados.map((r) => [r.sql, r.params, r.huella])
          )
        const indices = conIndice
          ? (
              await db.query(
                "SELECT indexname,indexdef,pg_relation_size(('ruizcacao.'||indexname)::regclass)::text bytes FROM pg_indexes WHERE schemaname='ruizcacao' AND indexname IN ('compras_orden_id','ventas_orden_id')"
              )
            ).rows
          : []
        informe.rondas.push({ conIndice, resultados, indices })
        console.log('Ronda ABBA ' + informe.rondas.length + ' índice ' + conIndice)
      }
    } finally {
      for (const modulo of ['compras', 'ventas'])
        await db.query(`DROP INDEX IF EXISTS ruizcacao.${modulo}_orden_id`)
      for (const r of originales) await db.query(r.indexdef)
    }
    informe.estado = 'comparacion_ABBA_equivalente'
  } catch (e) {
    informe.estado = 'fallido'
    informe.error = e.message
    process.exitCode = 1
  } finally {
    if (base) await base.desconectar()
    if (db) await db.end()
    await local.detener()
    const file = path.join(
      root,
      'docs/evidencias-escalabilidad/benchmark-compras-ventas-' +
        (process.argv.includes('--small') ? 'small' : 'completo') +
        '-2026-10-01.json'
    )
    await fs.writeFile(file, JSON.stringify(informe, null, 2))
    console.log('Resultado ' + informe.estado + ': ' + file)
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
