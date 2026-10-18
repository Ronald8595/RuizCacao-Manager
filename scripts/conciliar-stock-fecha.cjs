// Lectura explícita de desarrollo. No inicia motor, sesión, migración ni comandos de negocio.
const { app } = require('electron')
const { Client } = require('pg')
const fs = require('node:fs/promises')
const path = require('node:path')
const { conexionDesarrollador } = require('./conexion-desarrollador.cjs')
async function main() {
  const { config } = await conexionDesarrollador()
  const db = new Client({
    ...config,
    options: '-c default_transaction_read_only=on',
    statement_timeout: 30000
  })
  await db.connect()
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await db.query("SET LOCAL TIME ZONE 'America/Guayaquil'")
    const informe = {
      fecha: new Date().toISOString(),
      modo: 'READ ONLY REPEATABLE READ',
      origen: 'desarrollo configurado; sin iniciar/login/comandos'
    }
    informe.version = (await db.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v
    informe.tipos = (
      await db.query(`SELECT tipo,producto,count(*)::int cantidad,
      count(*) FILTER(WHERE conversion_id IS NOT NULL)::int vinculados_conversion,
      count(*) FILTER(WHERE compra_id IS NOT NULL)::int vinculados_compra,
      count(*) FILTER(WHERE venta_id IS NOT NULL)::int vinculados_venta,
      min(fecha)::text primera_fecha,max(fecha)::text ultima_fecha
      FROM ruizcacao.movimientos_stock GROUP BY tipo,producto ORDER BY tipo,producto`)
    ).rows
    informe.patronesLegacy = (
      await db.query(`SELECT m.tipo,m.producto,origen.tipo tipo_origen,
      count(*)::int cantidad FROM ruizcacao.movimientos_stock m
      LEFT JOIN ruizcacao.movimientos_stock origen ON origen.id=m.conversion_id
      WHERE m.conversion_id IS NOT NULL OR m.tipo='Salida - Procesamiento'
      GROUP BY m.tipo,m.producto,origen.tipo ORDER BY m.tipo,m.producto,origen.tipo`)
    ).rows
    informe.conciliacion = (
      await db.query(`WITH efectos AS (
      SELECT e.producto,e.entrada,e.salida FROM ruizcacao.movimientos_stock m
      CROSS JOIN LATERAL (
        SELECT m.producto,m.entrada_qq,m.salida_qq WHERE m.tipo<>'Conversión'
        UNION ALL SELECT 'Cacao Seco',m.entrada_qq,0::numeric WHERE m.tipo='Conversión'
        UNION ALL SELECT 'Cacao en Baba',0::numeric,m.salida_qq WHERE m.tipo='Conversión'
      ) e(producto,entrada,salida)
    ) SELECT x.producto,x.cantidad_qq::text existencias,
      coalesce(sum(e.entrada-e.salida),0)::text historia,
      (x.cantidad_qq-coalesce(sum(e.entrada-e.salida),0))::text diferencia
      FROM ruizcacao.existencias x LEFT JOIN efectos e USING(producto)
      GROUP BY x.producto,x.cantidad_qq ORDER BY x.producto`)
    ).rows
    informe.temporal = (
      await db.query(`SELECT count(*)::int movimientos,
      count(*) FILTER(WHERE fecha>current_date)::int futuros,
      count(*) FILTER(WHERE tipo='Conversión' AND producto<>'Cacao Seco')::int conversiones_atipicas,
      count(*) FILTER(WHERE fecha<>(fecha_hora_registro AT TIME ZONE 'America/Guayaquil')::date)::int fechas_distintas
      FROM ruizcacao.movimientos_stock`)
    ).rows[0]
    informe.huella = (
      await db.query(`SELECT md5(coalesce(string_agg(md5(row_to_json(m)::text),'' ORDER BY id),'')) valor
      FROM ruizcacao.movimientos_stock m`)
    ).rows[0].valor
    informe.resultado = informe.conciliacion.every((r) => Number(r.diferencia) === 0)
      ? 'OK'
      : 'DIFERENCIA'
    await db.query('ROLLBACK')
    const dir = path.join(__dirname, '../docs/evidencias-stock-fecha')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'conciliacion.json'), JSON.stringify(informe, null, 2) + '\n')
    console.log(JSON.stringify(informe, null, 2))
  } finally {
    await db.end()
  }
}
main()
  .then(() => app.exit(0))
  .catch((e) => {
    console.error(e.message)
    app.exit(1)
  })
