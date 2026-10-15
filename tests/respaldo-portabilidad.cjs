// Dos clústeres nuevos. Nunca lee AppData ni conexiones comerciales del usuario.
const { load, root } = require('./loader.cjs')
const fs = require('node:fs/promises')
const { join } = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto')
const { Client, Pool } = require('pg')
const { PostgresLocal, localizarPostgres } = load(join(root, 'src/main/database/postgres-local.ts'))
const { BaseLocal, hoy } = load(join(root, 'src/main/database/base.ts'))
const { Respaldos } = load(join(root, 'src/main/database/respaldos.ts'))
const { GenerarRespaldoPortable } = load(join(root, 'src/main/database/respaldo-portable.ts'))
const { ExportadorRespaldoPostgres } = load(join(root, 'src/main/database/respaldo-postgres.ts'))
const { PaqueteRespaldoZip } = load(join(root, 'src/main/database/respaldo-paquete.ts'))
const { AlmacenRespaldoLocal } = load(join(root, 'src/main/database/respaldo-storage.ts'))
const { detalleSeguro } = load(join(root, 'src/main/database/errores.ts'))
const { crearDataset } = require('../scripts/dataset-qa.cjs')
const { insertarRendimiento } = require('../scripts/seed-rendimiento-core.cjs')

function cifradoPrueba() {
  const key = randomBytes(32)
  return {
    cifrar: (texto) => {
      const iv = randomBytes(12),
        c = createCipheriv('aes-256-gcm', key, iv)
      const bytes = Buffer.concat([c.update(texto, 'utf8'), c.final()])
      return Buffer.concat([iv, c.getAuthTag(), bytes])
    },
    descifrar: (bytes) => {
      const c = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
      c.setAuthTag(bytes.subarray(12, 28))
      return Buffer.concat([c.update(bytes.subarray(28)), c.final()]).toString('utf8')
    }
  }
}
async function huellas(db) {
  const nombres = (
    await db.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='ruizcacao' ORDER BY tablename"
    )
  ).rows
  const tablas = {}
  for (const { tablename } of nombres) {
    assert.match(tablename, /^[a-z_]+$/)
    const r = await db.query(
      `SELECT count(*)::int n, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) hash FROM ruizcacao.${tablename} t`
    )
    tablas[tablename] = r.rows[0]
  }
  return tablas
}
async function main() {
  const carpeta = await fs.mkdtemp(join(os.tmpdir(), 'ruizcacao-portable-'))
  const binarios = process.env.RCM_TEST_BIN || (await localizarPostgres(join(root, 'vendor')))
  const criptoA = cifradoPrueba(),
    criptoB = cifradoPrueba()
  const motorA = new PostgresLocal({ carpeta: join(carpeta, 'A'), binarios, ...criptoA })
  const motorB = new PostgresLocal({ carpeta: join(carpeta, 'B'), binarios, ...criptoB })
  const paquete = new PaqueteRespaldoZip()
  const evidencia = {
    fecha: new Date().toISOString(),
    casos: [],
    soloArchivo: true,
    nuevasCredencialesB: false
  }
  let baseA, poolB, adminB
  try {
    const configA = await motorA.iniciar()
    baseA = new BaseLocal(configA)
    await baseA.iniciar()
    const clave = 'Fixture-portable-usuario-2026!'
    await baseA.crearAdministrador('Principal portable', clave)
    await baseA.login('Principal portable', clave)
    await baseA.crearUsuario('Operador portable', 'Fixture-operador-portable-2026!')
    await baseA.jornada('abrir')
    await crearDataset(baseA, hoy())
    const exportador = new Respaldos(configA, binarios, join(carpeta, 'legacy'))
    const copias = []
    for (const escala of ['pequeno', 'grande']) {
      if (escala === 'grande') {
        // Fixture sintético explícito, SOLO en el clúster recién creado arriba.
        // Reutiliza el generador de tests; nunca ejecuta db:seed:performance.
        const sql = await baseA.pool.connect()
        try {
          await insertarRendimiento(sql, {
            clientes: 1000,
            proveedores: 500,
            compras: 10000,
            ventas: 15000,
            gastos: 3000
          })
        } finally {
          sql.release()
        }
      }
      const antes = await huellas(baseA.pool)
      const resultado = await new GenerarRespaldoPortable(
        new ExportadorRespaldoPostgres(exportador, baseA.pool),
        paquete,
        new AlmacenRespaldoLocal(
          join(carpeta, 'solo back Ñ con espacios', escala),
          join(carpeta, 'privado-A')
        ),
        async () => {},
        '1.2.1'
      ).ejecutar()
      assert.deepEqual(
        await huellas(baseA.pool),
        antes,
        'La generación portable no modifica tablas de A'
      )
      const soloArchivo = join(carpeta, 'transferencia-B', escala + '.back')
      await fs.mkdir(join(carpeta, 'transferencia-B'), { recursive: true })
      await fs.copyFile(resultado.archivo, soloArchivo)
      const manifest = await paquete.verificar(soloArchivo)
      assert.ok(!JSON.stringify(manifest).includes(configA.password))
      assert.ok(!exportador.argumentosConexion().includes(configA.password))
      copias.push({
        escala,
        archivo: soloArchivo,
        tablas: antes,
        dumpBytes: manifest.database_dump_size,
        dumpSha256: manifest.database_dump_sha256
      })
      console.log(
        'OK portable A genera fixture ' + escala + ': ' + manifest.database_dump_size + ' bytes'
      )
    }
    await baseA.desconectar()
    baseA = undefined
    await motorA.detener()
    // Retirar el clúster A y sus credenciales: B solo recibe los dos .back.
    const origenA = await fs.realpath(join(carpeta, 'A'))
    assert.ok(origenA.toLowerCase().startsWith((await fs.realpath(carpeta)).toLowerCase() + '\\'))
    await fs.rm(origenA, { recursive: true })
    await fs.rm(join(carpeta, 'solo back Ñ con espacios'), { recursive: true })
    const configB = await motorB.iniciar()
    assert.notEqual(configB.password, configA.password)
    evidencia.nuevasCredencialesB = true
    const credB = JSON.parse(
      criptoB.descifrar(await fs.readFile(join(carpeta, 'B', 'conexion.enc')))
    )
    adminB = new Client({
      ...configB,
      user: 'ruizcacao_bootstrap',
      password: credB.passwordAdministrador,
      database: 'postgres'
    })
    await adminB.connect()
    for (const c of copias) {
      const database = c.escala === 'pequeno' ? configB.database : 'fixture_grande_b'
      if (c.escala === 'grande')
        await adminB.query('CREATE DATABASE fixture_grande_b OWNER ruizcacao_app')
      const destinoB = { ...configB, database }
      const dumpB = join(carpeta, 'transferencia-B', c.escala + '.dump')
      await paquete.extraerDump(c.archivo, dumpB)
      const restaurador = new Respaldos(destinoB, binarios, join(carpeta, 'no-usado'))
      assert.ok(
        (await restaurador.herramienta('pg_restore', ['--list', dumpB])).includes('ruizcacao')
      )
      await restaurador.herramienta('pg_restore', [
        ...restaurador.argumentosConexion(),
        '--single-transaction',
        '--exit-on-error',
        '--no-owner',
        '--no-privileges',
        dumpB
      ])
      poolB = new Pool(destinoB)
      const b = await huellas(poolB)
      assert.deepEqual(b, c.tablas, 'Todas las tablas coinciden en conteo y hash A→B')
      for (const tabla of [
        'usuarios',
        'clientes',
        'proveedores',
        'empleados',
        'compras',
        'ventas',
        'cuentas',
        'movimientos_cuenta',
        'movimientos_stock',
        'gastos',
        'jornadas',
        'migraciones'
      ])
        assert.ok(b[tabla].n > 0, tabla)
      const permisos = (
        await poolB.query('SELECT rolsuper,rolcreatedb FROM pg_roles WHERE rolname=current_user')
      ).rows[0]
      assert.deepEqual(permisos, { rolsuper: false, rolcreatedb: false })
      assert.ok(
        !JSON.stringify(
          detalleSeguro(
            Error('password=' + configA.password),
            { modulo: 'test', operacion: 'portable' },
            'PRUEBA'
          )
        ).includes(configA.password)
      )
      await poolB.end()
      poolB = undefined
      // El hash completo se compara antes de login (login escribe sesiones/auditoría).
      const loginB = new BaseLocal(destinoB)
      try {
        await loginB.iniciar()
        await loginB.login('Principal portable', clave)
        await loginB.logout()
        await loginB.login('Operador portable', 'Fixture-operador-portable-2026!')
      } finally {
        await loginB.desconectar()
      }
      evidencia.casos.push({
        escala: c.escala,
        dumpBytes: c.dumpBytes,
        dumpSha256: c.dumpSha256,
        pgRestoreList: 'OK',
        restore: 'OK',
        loginOriginal: 'OK',
        tablas: b
      })
      console.log(
        'OK portable A → B ' +
          c.escala +
          ': ' +
          Object.keys(b).length +
          ' tablas idénticas; login original y rol limitado'
      )
      await fs.unlink(dumpB)
    }
    const evidenciaDestino = process.env.RCM_TEST_ARTIFACTS || carpeta
    await fs.writeFile(
      join(evidenciaDestino, 'respaldo-portabilidad.json'),
      JSON.stringify(evidencia, null, 2)
    )
    console.log('Evidencia portable: ' + join(evidenciaDestino, 'respaldo-portabilidad.json'))
  } finally {
    if (poolB) await poolB.end()
    if (adminB) await adminB.end()
    if (baseA) await baseA.desconectar()
    await motorB.detener()
    await motorA.detener()
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
