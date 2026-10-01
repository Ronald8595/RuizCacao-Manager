// Solo SELECT/EXPLAIN de la base local autorizada, sin DDL ni datos personales en resultados.
const { app } = require('electron'),
  { Client } = require('pg'),
  fs = require('node:fs/promises'),
  path = require('node:path')
const { conexionDesarrollador } = require('./conexion-desarrollador.cjs')
const { medirOperaciones } = require('./benchmark-operaciones-core.cjs')
const { root } = require('../tests/loader.cjs')
const { load } = require('../tests/loader.cjs')
const assert = require('node:assert/strict'),
  { createHash } = require('node:crypto')
const { consultarHistorialCompras, consultarHistorialVentas } = load(
  root + '/src/main/database/historial-operaciones.ts'
)
async function validarNavegacion(db) {
  const resultados = []
  for (const modulo of ['compras', 'ventas']) {
    const servicio = modulo === 'compras' ? consultarHistorialCompras : consultarHistorialVentas
    const fecha = modulo === 'compras' ? 'fecha' : 'fecha_venta'
    const refs = (
      await db.query(
        `SELECT o.id,o.${fecha}::text fecha,${modulo === 'compras' ? 'o.proveedor_nombre' : 'c.nombre_razon_social'} titular FROM ruizcacao.${modulo} o ${modulo === 'ventas' ? 'LEFT JOIN ruizcacao.clientes c ON c.id=o.cliente_id' : ''} ORDER BY o.orden DESC,o.id DESC`
      )
    ).rows
    for (const filtro of [
      {},
      { desde: '2026-06-01', hasta: '2026-06-30' },
      { busqueda: modulo === 'compras' ? 'peña ñandú 17' : 'muñoz álvarez 17' },
      { busqueda: '%_' },
      ...(modulo === 'ventas' ? [{ busqueda: '2026-01-02' }] : [])
    ]) {
      const texto = (filtro.busqueda ?? '').toLocaleLowerCase('es')
      const esperados = refs
        .filter(
          (r) =>
            (!filtro.desde || r.fecha >= filtro.desde) &&
            (!filtro.hasta || r.fecha <= filtro.hasta) &&
            (!texto ||
              (r.titular ?? '').toLocaleLowerCase('es').includes(texto) ||
              (modulo === 'ventas' && r.fecha.includes(texto)))
        )
        .map((r) => r.id)
      let cursor = null,
        paginas = 0
      const ids = []
      do {
        const pagina = await servicio(db, { ...filtro, cursor })
        assert.ok(pagina.filas.length <= 15)
        ids.push(...pagina.filas.map((r) => r.id))
        cursor = pagina.siguiente
        paginas++
        assert.ok(paginas <= Math.ceil(refs.length / 15) + 1, 'Cursor sin avance')
      } while (cursor)
      assert.deepEqual(ids, esperados)
      assert.equal(new Set(ids).size, ids.length)
      resultados.push({
        modulo,
        filtro,
        filas: ids.length,
        paginas,
        sinDuplicados: true,
        sinOmisiones: true,
        huellaIds: createHash('sha256').update(JSON.stringify(ids)).digest('hex')
      })
    }
  }
  return resultados
}
async function main() {
  const { config } = await conexionDesarrollador(),
    db = new Client({ ...config, statement_timeout: 120000 })
  await db.connect()
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await db.query("SET LOCAL TIME ZONE 'America/Guayaquil'")
    const estado = (
      await db.query(
        "SELECT current_database() base,(SELECT max(version) FROM ruizcacao.migraciones) version,(SELECT count(*)::int FROM information_schema.tables WHERE table_schema='ruizcacao' AND table_type='BASE TABLE') tablas"
      )
    ).rows[0]
    const resultados = await medirOperaciones(db)
    const navegacion = await validarNavegacion(db)
    await db.query('COMMIT')
    const file = path.join(
      root,
      `docs/evidencias-escalabilidad/benchmark-operaciones-desarrollador-v${estado.version}-2026-10-01.json`
    )
    await fs.writeFile(
      file,
      JSON.stringify(
        {
          fecha: new Date().toISOString(),
          estado,
          resultados,
          navegacion,
          nota: 'Lectura de base local del desarrollador autorizada. Cinco muestras calientes; tiempos no incluyen IPC/render.'
        },
        null,
        2
      )
    )
    console.log('Medición guardada: ' + file)
    console.log(
      JSON.stringify(
        resultados.map((r) => ({
          modulo: r.modulo,
          caso: r.caso,
          ms: r.medianaServicioMs,
          sql: r.plan['Execution Time'],
          nodos: r.nodos
        })),
        null,
        2
      )
    )
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
