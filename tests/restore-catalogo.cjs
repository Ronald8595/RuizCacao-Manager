// Regresión aislada de catálogo, referencia histórica y promoción real.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto')
const { Pool } = require('pg')
const { load, root } = require('./loader.cjs')
const L = (n) => load(path.join(root, 'src/main/database', n + '.ts'))
const { PostgresLocal, localizarPostgres } = L('postgres-local')
const { BaseLocal, hoy } = L('base')
const { MigracionesPostgres } = L('migration-runner')
const { ValidadorRestorePostgres, firmaEstructura } = L('restore-validacion')
const { seleccionarReferenciaRestore, vistaFlujoHistorica } = L('restore-compatibilidad')
const { WorkspaceRestorePostgres } = L('restore-workspace')
const { DestinoRestorePostgres } = L('restore-destino')
const { PromocionPostgres } = L('restore-promocion')
const { RestaurarRespaldoSeguro } = L('restore-caso')
const { Respaldos } = L('respaldos')
const { GenerarRespaldoPortable } = L('respaldo-portable')
const { ExportadorRespaldoPostgres } = L('respaldo-postgres')
const { PaqueteRespaldoZip } = L('respaldo-paquete')
const { AlmacenRespaldoLocal } = L('respaldo-storage')
const { integridadArchivo } = L('respaldo-integridad')
const { procesosPostgresActivos } = L('proceso-postgres')
const { crearDataset } = require('../scripts/dataset-qa.cjs')

function cripto() {
  const key = randomBytes(32)
  return {
    cifrar: (s) => {
      const iv = randomBytes(12),
        c = createCipheriv('aes-256-gcm', key, iv)
      const data = Buffer.concat([c.update(s, 'utf8'), c.final()])
      return Buffer.concat([iv, c.getAuthTag(), data])
    },
    descifrar: (b) => {
      const c = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12))
      c.setAuthTag(b.subarray(12, 28))
      return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString('utf8')
    }
  }
}
// Las huellas de usuarios/datos quedan solo en memoria. Evidencia: booleanos.
async function contenido(pool) {
  const tablas = (
    await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='ruizcacao' AND tablename NOT IN ('instalacion','solicitudes_recuperacion','control_recuperacion','sesiones') ORDER BY tablename"
    )
  ).rows.map((r) => r.tablename)
  const result = {}
  for (const tabla of [...tablas, 'v_flujo_caja', 'v_saldos']) {
    assert.match(tabla, /^[a-z_]+$/)
    result[tabla] = (
      await pool.query(
        `SELECT count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) firma FROM ruizcacao.${tabla} t`
      )
    ).rows[0]
  }
  return result
}

async function main() {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-catalogo-'))
  const binarios = process.env.RCM_TEST_BIN || (await localizarPostgres(path.join(root, 'vendor')))
  const motor = new PostgresLocal({ carpeta: path.join(carpeta, 'motor'), binarios, ...cripto() })
  const destinoEvidencia = process.env.RCM_EVIDENCIA_DIR || carpeta
  await fs.mkdir(destinoEvidencia, { recursive: true })
  const evidencia = { casos: [], archivoReal: false }
  const check = async (nombre, fn) => {
    await fn()
    evidencia.casos.push({ nombre, ok: true })
    console.log('OK catálogo: ' + nombre)
  }
  let b, ref, refConfig, config
  const validador = new ValidadorRestorePostgres()
  const clave = 'Catalogo-original-2026!'
  try {
    config = await motor.iniciar()
    b = new BaseLocal(config)
    await b.iniciar()
    await b.crearAdministrador('Principal catálogo', clave)
    await b.login('Principal catálogo', clave)
    await b.jornada('abrir')
    await crearDataset(b, hoy())
    await motor.conAdministracionRestauracion((db) =>
      db.query('CREATE DATABASE rcm_ref_catalogo OWNER ruizcacao_app')
    )
    refConfig = { ...config, database: 'rcm_ref_catalogo' }
    ref = new Pool(refConfig)
    await new MigracionesPostgres().migrar(ref)
    await check('referencia actual mantiene validación estricta', async () => {
      assert.equal(await seleccionarReferenciaRestore(b.pool, ref, 10), 'actual')
      await validador.comparar(b.pool, ref, 10)
    })
    const vistaActual = (
      await ref.query("SELECT pg_get_viewdef('ruizcacao.v_flujo_caja'::regclass,true) d")
    ).rows[0].d
    const restaurarRef = () =>
      ref.query('CREATE OR REPLACE VIEW ruizcacao.v_flujo_caja AS ' + vistaActual)
    await b.pool.query(vistaFlujoHistorica)
    await check('fixture histórico reproduce el rechazo anterior', async () => {
      await assert.rejects(
        validador.comparar(b.pool, ref, 10),
        (e) => e.codigoTecnico === 'BACKUP_SCHEMA_MISMATCH'
      )
    })
    await check('firma conserva nombres largos completos y únicos', async () => {
      let sql
      await firmaEstructura({
        query: async (s) => {
          sql = s
          return { rows: [{ firma: '' }] }
        }
      })
      const filas = (
        await b.pool.query(
          sql.replace(/\) SELECT md5[\s\S]+$/, ') SELECT tipo,nombre FROM objetos')
        )
      ).rows
      assert.equal(new Set(filas.map((r) => r.tipo + ':' + r.nombre)).size, filas.length)
      assert.ok(
        filas.some(
          (r) =>
            r.nombre === 'solicitudes_recuperacion.solicitudes_recuperacion_administrador_id_fkey'
        )
      )
    })
    await check('histórico admitido con catálogo completo, vista intacta', async () => {
      const antes = await firmaEstructura(b.pool)
      assert.equal(await seleccionarReferenciaRestore(b.pool, ref, 10), 'historica_devoluciones')
      await validador.comparar(b.pool, ref, 10)
      assert.equal(await firmaEstructura(b.pool), antes)
    })
    for (const [nombre, sql] of [
      [
        'FK ausente',
        'ALTER TABLE ruizcacao.solicitudes_recuperacion DROP CONSTRAINT solicitudes_recuperacion_administrador_id_fkey'
      ],
      [
        'NOT NULL ausente',
        'ALTER TABLE ruizcacao.solicitudes_recuperacion ALTER COLUMN administrador_id DROP NOT NULL'
      ],
      ['tabla extra', 'CREATE TABLE ruizcacao.objeto_inesperado(id integer)'],
      ['índice ausente', 'DROP INDEX ruizcacao.recuperacion_activa_unica'],
      ['trigger ausente', 'DROP TRIGGER compra_confirmada_inmutable ON ruizcacao.compras'],
      [
        'vista incompatible',
        "CREATE OR REPLACE VIEW ruizcacao.v_flujo_caja AS SELECT id,fecha,'venta'::text categoria,monto * 1::numeric AS monto FROM ruizcacao.gastos"
      ]
    ]) {
      await restaurarRef()
      const firmaRef = await firmaEstructura(ref)
      const db = await b.pool.connect()
      try {
        await db.query('BEGIN')
        await db.query(sql)
        await check('rechaza ' + nombre + ' y revierte referencia', async () => {
          await assert.rejects(
            seleccionarReferenciaRestore(db, ref, 10),
            (e) => e.codigoTecnico === 'BACKUP_SCHEMA_MISMATCH'
          )
          assert.equal(await firmaEstructura(ref), firmaRef)
        })
      } finally {
        await db.query('ROLLBACK')
        db.release()
      }
    }
    await check('histórico no se acepta para otra versión', async () => {
      await assert.rejects(
        seleccionarReferenciaRestore(b.pool, ref, 9),
        (e) => e.codigoTecnico === 'BACKUP_SCHEMA_MISMATCH'
      )
    })
    // Ejemplo financiero histórico: compra anulada -200, devolución +200.
    // INSERT/UPDATE exclusivamente en fixture sintético del clúster creado arriba.
    const compra = (
      await b.pool.query(
        "SELECT id FROM ruizcacao.cuentas WHERE categoria='compra' AND monto_aplicado=200"
      )
    ).rows[0].id
    await b.pool.query("UPDATE ruizcacao.cuentas SET estado='anulado' WHERE id=$1", [compra])
    await b.pool.query(
      `INSERT INTO ruizcacao.movimientos_cuenta(id,cuenta_id,fecha,tipo,monto,metodo_pago,categoria,fecha_hora_registro,observacion,proveedor_id)
      SELECT '99999999-0000-4000-8000-000000000001',cuenta_id,fecha,'Ajuste por devolución',monto,metodo_pago,categoria,fecha_hora_registro,'Fixture histórico',proveedor_id
      FROM ruizcacao.movimientos_cuenta WHERE cuenta_id=$1 AND tipo='Abono'`,
      [compra]
    )
    await check('vista histórica conserva pago y devolución opuestos', async () => {
      const movimientos = (
        await b.pool.query(
          'SELECT f.monto::text monto FROM ruizcacao.v_flujo_caja f JOIN ruizcacao.movimientos_cuenta m ON m.id=f.id WHERE m.cuenta_id=$1 ORDER BY f.monto',
          [compra]
        )
      ).rows
      assert.deepEqual(
        movimientos.map((m) => Number(m.monto)),
        [-200, 200]
      )
    })
    const backup = await new GenerarRespaldoPortable(
      new ExportadorRespaldoPostgres(
        new Respaldos(config, binarios, path.join(carpeta, 'legacy')),
        b.pool
      ),
      new PaqueteRespaldoZip(),
      new AlmacenRespaldoLocal(path.join(carpeta, 'backup'), path.join(carpeta, 'trabajo')),
      async () => {},
      '1.3.1'
    ).ejecutar()
    const compararOriginal = ValidadorRestorePostgres.prototype.comparar
    for (const [nombre, archivo, real] of [
      ['fixture histórico', backup.archivo, false],
      ...(process.argv.includes('--archivo-real')
        ? [
            [
              'archivo real',
              path.resolve(process.argv[process.argv.indexOf('--archivo-real') + 1]),
              true
            ]
          ]
        : [])
    ]) {
      let baseline
      ValidadorRestorePostgres.prototype.comparar = async function (pool, referencia, version) {
        await compararOriginal.call(this, pool, referencia, version)
        const actual = await contenido(pool)
        if (!baseline) baseline = actual
        else
          assert.deepEqual(
            actual,
            baseline,
            'Datos/vistas intactos durante staging, candidata y promoción'
          )
      }
      try {
        const antes = await integridadArchivo(archivo)
        const journal = motor.journalRestauracion()
        const servicio = new RestaurarRespaldoSeguro(
          new WorkspaceRestorePostgres({
            raiz: path.join(carpeta, 'workspaces'),
            binarios,
            ...cripto()
          }),
          new DestinoRestorePostgres(
            motor,
            binarios,
            path.join(carpeta, 'seguridad'),
            () => b.pool
          ),
          journal,
          new PromocionPostgres((fn) => motor.conAdministracionRestauracion(fn), journal),
          {
            entrar: async () => {},
            cerrarPool: async () => {
              if (b) {
                await b.desconectarParaRestauracion()
                b = undefined
              }
            },
            reconectar: async () => {
              b = new BaseLocal(config)
              await b.iniciar()
            },
            salir: () => {}
          }
        )
        await check(
          nombre + ': restore y promoción conservan tablas, usuarios y vistas',
          async () => {
            await servicio.ejecutar(archivo, async () => true)
            assert.deepEqual(await contenido(b.pool), baseline)
            assert.equal((await journal.leer()).phase, 'confirmada')
            assert.deepEqual(await integridadArchivo(archivo), antes)
            assert.equal(procesosPostgresActivos.size, 0)
          }
        )
        if (real) {
          evidencia.archivoReal = true
          evidencia.sha256Real = antes.sha256
        } else
          await check('login con contraseña original tras restore', async () => {
            await b.login('Principal catálogo', clave)
            await b.logout()
          })
      } finally {
        ValidadorRestorePostgres.prototype.comparar = compararOriginal
      }
    }
    evidencia.exito = true
  } finally {
    await ref?.end()
    await b?.desconectarParaRestauracion()
    await motor.detener()
    evidencia.hijosHerramientas = procesosPostgresActivos.size
    await fs.writeFile(
      path.join(destinoEvidencia, 'restore-catalogo.json'),
      JSON.stringify(evidencia, null, 2) + '\n'
    )
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
