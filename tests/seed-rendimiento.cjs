const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path')
const { Client } = require('pg'),
  { randomUUID } = require('node:crypto')
const { load, root } = require('./loader.cjs')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
const { insertarRendimiento } = require('../scripts/seed-rendimiento-core.cjs')
async function main() {
  const archivo = path.resolve(process.argv[2]),
    carpeta = path.dirname(archivo)
  assert.match(path.basename(carpeta), /^ruizcacao-tests-/)
  const config = JSON.parse(await fs.readFile(archivo, 'utf8')),
    admin = new Client(config)
  await admin.connect()
  let base,
    creada = false
  const nombre = 'rcm_seed_' + randomUUID().replaceAll('-', '')
  try {
    const real = (await admin.query('SHOW data_directory')).rows[0].data_directory
    assert.equal(
      (await fs.realpath(real)).toLowerCase(),
      (await fs.realpath(path.join(carpeta, 'motor', 'data'))).toLowerCase()
    )
    await admin.query('CREATE DATABASE "' + nombre + '"')
    creada = true
    base = new BaseLocal({ ...config, database: nombre })
    await base.iniciar()
    await base.crearAdministrador('Prueba Seed', 'Prueba-seed-2026!')
    const db = await base.pool.connect()
    try {
      const v = { clientes: 10, proveedores: 5, compras: 60, ventas: 90, gastos: 12 }
      const a = await insertarRendimiento(db, v),
        b = await insertarRendimiento(db, v)
      assert.notEqual(a.prefijo, b.prefijo)
      assert.equal(a.agregados.compras, 60)
      assert.equal(a.agregados.ventas, 90)
      assert.equal(a.agregados.gastos, 72)
      assert.equal(a.anuladas.compras, 1)
      assert.equal(a.anuladas.ventas, 2)
      assert.equal((await db.query('SELECT count(*)::int n FROM ruizcacao.compras')).rows[0].n, 120)
      const cuentas = (await db.query('SELECT count(*)::int n FROM ruizcacao.cuentas')).rows[0].n
      assert.equal(cuentas, 300)
      const stock = (await db.query('SELECT * FROM ruizcacao.existencias ORDER BY producto')).rows
      await db.query(
        `CREATE FUNCTION ruizcacao.fallar_seed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo seed simulado'; END $$; CREATE TRIGGER fallo_seed BEFORE INSERT ON ruizcacao.gastos FOR EACH ROW EXECUTE FUNCTION ruizcacao.fallar_seed()`
      )
      await assert.rejects(insertarRendimiento(db, v), /Fallo seed simulado/)
      assert.equal(
        (await db.query('SELECT count(*)::int n FROM ruizcacao.cuentas')).rows[0].n,
        cuentas
      )
      assert.deepEqual(
        (await db.query('SELECT * FROM ruizcacao.existencias ORDER BY producto')).rows,
        stock
      )
      console.log(
        'OK seed aditivo: repetición, volúmenes, pagos, anulaciones sin pago, stock y rollback íntegro.'
      )
    } finally {
      db.release()
    }
  } finally {
    if (base) await base.desconectar()
    if (creada) await admin.query('DROP DATABASE "' + nombre + '"')
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
