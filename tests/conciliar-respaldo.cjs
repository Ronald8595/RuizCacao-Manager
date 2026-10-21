// Diagnóstico explícito: solo lee el .back original. Restaura en un motor nuevo,
// sin BaseLocal/migraciones/normalizaciones. Consultas en transacción READ ONLY.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto')
const { Pool } = require('pg')
const { load, root } = require('./loader.cjs')
const L = (n) => load(path.join(root, 'src/main/database', n + '.ts'))
async function main() {
  const archivo = path.resolve(process.argv[2])
  const destino = path.resolve(process.argv[3])
  const fecha = process.argv[4] || '2026-10-19'
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-conciliacion-'))
  const { PostgresLocal, localizarPostgres } = L('postgres-local')
  const { integridadArchivo } = L('respaldo-integridad')
  const { PaqueteRespaldoZip } = L('respaldo-paquete')
  const { Respaldos } = L('respaldos')
  const { consultarListado, reporteCompleto, fuenteFinanciera } = L('listados')
  const key = randomBytes(32)
  const motor = new PostgresLocal({
    carpeta: path.join(carpeta, 'motor'),
    binarios: await localizarPostgres(path.join(root, 'vendor')),
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
  })
  const evidencia = { archivo, fecha, carpeta, consultas: {} }
  let pool, db
  const query = async (nombre, sql, params = []) => {
    const rows = (await db.query(sql, params)).rows
    evidencia.consultas[nombre] = { sql, params, rows }
    return rows
  }
  try {
    evidencia.antes = await integridadArchivo(archivo)
    const copia = path.join(carpeta, 'copia.back')
    await fs.copyFile(archivo, copia, fs.constants.COPYFILE_EXCL)
    assert.deepEqual(await integridadArchivo(copia), evidencia.antes)
    const paquete = new PaqueteRespaldoZip()
    evidencia.manifest = await paquete.verificar(copia)
    const dump = path.join(carpeta, 'database.dump')
    await paquete.extraerDump(copia, dump)
    const config = await motor.iniciar()
    const r = new Respaldos(config, await localizarPostgres(path.join(root, 'vendor')), carpeta)
    await r.herramienta('pg_restore', [
      ...r.argumentosConexion(),
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      '--single-transaction',
      dump
    ])
    pool = new Pool(config)
    db = await pool.connect()
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    evidencia.readOnly = (
      await db.query('SHOW transaction_read_only')
    ).rows[0].transaction_read_only
    await query(
      'cobertura',
      `SELECT 'compras' tabla,count(*)::int n,min(fecha)::text desde,max(fecha)::text hasta FROM ruizcacao.compras
      UNION ALL SELECT 'movimientos',count(*)::int,min(fecha)::text,max(fecha)::text FROM ruizcacao.movimientos_cuenta
      UNION ALL SELECT 'gastos',count(*)::int,min(fecha)::text,max(fecha)::text FROM ruizcacao.gastos`
    )
    await query(
      'comprasDia',
      `SELECT b.id,b.numero_compra,b.fecha::text,b.producto,b.total,b.monto_pagado_inicial,b.estado,
      c.id cuenta_id,c.monto_total,c.monto_aplicado,c.monto_total-c.monto_aplicado saldo_actual
      FROM ruizcacao.compras b LEFT JOIN ruizcacao.cuentas c ON c.compra_id=b.id WHERE b.fecha=$1::date ORDER BY b.numero_compra,b.id`,
      [fecha]
    )
    await query(
      'movimientosDia',
      `WITH historial AS (
      SELECT m.*,sum(CASE WHEN tipo IN ('Abono','Ajuste por devolución') THEN monto ELSE 0 END)
      OVER(PARTITION BY cuenta_id ORDER BY fecha,fecha_hora_registro,orden,id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) acumulado
      FROM ruizcacao.movimientos_cuenta m)
      SELECT m.id movimiento_id,m.cuenta_id,b.id compra_id,b.numero_compra,b.fecha::text fecha_compra,b.producto,b.total,
      b.monto_pagado_inicial,b.estado estado_compra,c.estado estado_cuenta,m.tipo,m.fecha::text fecha_pago,
      m.fecha_hora_registro,m.monto,m.observacion,
      c.monto_total-(m.acumulado-CASE WHEN m.tipo IN ('Abono','Ajuste por devolución') THEN m.monto ELSE 0 END) saldo_antes,
      c.monto_total-m.acumulado saldo_despues,
      (m.tipo='Abono' AND c.estado<>'anulado') incluido_reporte
      FROM historial m JOIN ruizcacao.cuentas c ON c.id=m.cuenta_id LEFT JOIN ruizcacao.compras b ON b.id=c.compra_id
      WHERE m.fecha=$1::date AND c.categoria='compra' ORDER BY m.fecha_hora_registro,m.orden,m.id`,
      [fecha]
    )
    await query(
      'gastosDia',
      `SELECT id,fecha::text,fecha_hora_registro,categoria,concepto,monto,observacion,tipo FROM ruizcacao.gastos WHERE fecha=$1::date ORDER BY orden,id`,
      [fecha]
    )
    await query(
      'vista',
      "SELECT pg_get_viewdef('ruizcacao.v_flujo_caja'::regclass,true) definicion"
    )
    await query(
      'vistaDia',
      'SELECT id,fecha::text,categoria,monto FROM ruizcacao.v_flujo_caja WHERE fecha=$1::date ORDER BY id',
      [fecha]
    )
    const cortes = (
      await db.query(
        `SELECT coalesce(max(orden),0)::text valor FROM ruizcacao.movimientos_cuenta UNION ALL SELECT coalesce(max(orden),0)::text FROM ruizcacao.gastos`
      )
    ).rows.map((r) => r.valor)
    const filtro = { desde: fecha, hasta: fecha, limite: 100 }
    const fuente = fuenteFinanciera(filtro, cortes)
    await query(
      'duplicadosJoin',
      fuente.sql + ' SELECT id,count(*)::int n FROM financiero GROUP BY id HAVING count(*)>1',
      fuente.params
    )
    evidencia.reporte = await consultarListado(db, 'reportePeriodo', filtro)
    evidencia.pdf = {}
    for (const tipo of ['diario', 'semanal', 'mensual']) {
      const pdf = await reporteCompleto(db, filtro, tipo)
      evidencia.pdf[tipo] = {
        nombre: pdf.nombreArchivo,
        filas:
          ((pdf.html.split('aria-label="Detalle financiero"')[1] || '').match(/<tr>/g) || [])
            .length - 1
      }
    }
    await db.query('ROLLBACK')
    evidencia.resultado = 'PASS'
  } catch (e) {
    evidencia.resultado = 'FAIL'
    evidencia.error = String(e.message)
    throw e
  } finally {
    db?.release()
    await pool?.end()
    await motor.detener()
    evidencia.motorDetenido = true
    evidencia.despues = await integridadArchivo(archivo)
    assert.deepEqual(evidencia.despues, evidencia.antes)
    await fs.mkdir(path.dirname(destino), { recursive: true })
    await fs.writeFile(destino, JSON.stringify(evidencia, null, 2) + '\n')
    console.log(
      JSON.stringify({
        resultado: evidencia.resultado,
        destino,
        resumen: evidencia.reporte?.resumen,
        cobertura: evidencia.consultas.cobertura?.rows
      })
    )
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
