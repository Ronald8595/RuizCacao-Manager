// Banco aislado: no acepta URL, credenciales, base existente ni perfil de la aplicación.
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { performance } = require('node:perf_hooks')
const { randomBytes, createCipheriv, createDecipheriv, createHash } = require('node:crypto')
const { Client } = require('pg')
const { load, root } = require('../tests/loader.cjs')
const { generarDataset } = require('./benchmark-dataset.cjs')
const { PostgresLocal, localizarPostgres } = load(
  path.join(root, 'src/main/database/postgres-local.ts')
)
const { BaseLocal } = load(path.join(root, 'src/main/database/base.ts'))
const { entidades, leerEntidades } = load(path.join(root, 'src/main/database/relacional.ts'))
const { estadoInicial } = load(path.join(root, 'src/shared/persistencia.ts'))
const mediana = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const bytes = (value) => Buffer.byteLength(JSON.stringify(value))
async function hashes() {
  const files = (await fs.readdir(path.join(root, 'database')))
    .filter((f) => /^00[1-7]-.*\.sql$/.test(f))
    .sort()
  assert.equal(files.length, 7)
  return Object.fromEntries(
    await Promise.all(
      files.map(async (f) => [
        f,
        createHash('sha256')
          .update(await fs.readFile(path.join(root, 'database', f)))
          .digest('hex')
      ])
    )
  )
}
async function sembrar(db, datos, avisos) {
  // Exclusivamente después de comprobar data_directory en el clúster recién creado.
  await db.query('BEGIN')
  try {
    for (const [key, e] of Object.entries(entidades)) {
      const cols = ['id', ...e.campos.map((c) => c.columna)]
      for (let start = 0; start < datos[key].length; start += 500) {
        const rows = datos[key]
          .slice(start, start + 500)
          .map((r) =>
            Object.fromEntries([
              ['id', String(r.id)],
              ...e.campos.map((c) => [
                c.columna,
                r[c.propiedad] === undefined || (c.opcional && r[c.propiedad] === '')
                  ? null
                  : r[c.propiedad]
              ])
            ])
          )
        await db.query(
          `INSERT INTO ruizcacao.${e.tabla} (${cols.join(',')}) SELECT ${cols.join(',')} FROM jsonb_populate_recordset(NULL::ruizcacao.${e.tabla}, $1::jsonb)`,
          [JSON.stringify(rows)]
        )
      }
    }
    for (const [producto, cantidad] of Object.entries(datos.stock))
      await db.query(
        'UPDATE ruizcacao.existencias SET cantidad_qq=$2,costo_unitario_promedio=10 WHERE producto=$1',
        [producto, cantidad]
      )
    await db.query(
      'INSERT INTO ruizcacao.notificaciones(id,titulo,mensaje,fecha,leida,destino) SELECT id,titulo,mensaje,fecha,leida,destino FROM jsonb_populate_recordset(NULL::ruizcacao.notificaciones,$1::jsonb)',
      [JSON.stringify(avisos)]
    )
    await db.query('COMMIT')
  } catch (e) {
    await db.query('ROLLBACK')
    throw e
  }
  for (const e of Object.values(entidades)) await db.query('ANALYZE ruizcacao.' + e.tabla)
  await db.query('ANALYZE ruizcacao.notificaciones')
}
async function medir(
  db,
  nombre,
  sql,
  params = [],
  tipo = 'consulta propuesta; no consumida por la UI'
) {
  const plan = (await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + sql, params)).rows[0][
    'QUERY PLAN'
  ][0]
  const muestras = []
  let result
  for (let i = 0; i < 5; i++) {
    const t = performance.now()
    result = await db.query(sql, params)
    muestras.push(performance.now() - t)
  }
  const nodos = []
  function recorrer(p) {
    if (p['Relation Name'])
      nodos.push({
        tabla: p['Relation Name'],
        nodo: p['Node Type'],
        indice: p['Index Name'],
        filasEmitidas: p['Actual Rows'],
        filasDescartadas: p['Rows Removed by Filter'] || 0,
        vueltas: p['Actual Loops']
      })
    for (const child of p.Plans || []) recorrer(child)
  }
  recorrer(plan.Plan)
  return {
    nombre,
    tipo,
    sql,
    params,
    muestrasMs: muestras,
    medianaMs: mediana(muestras),
    filasDevueltas: result.rowCount,
    bytesJson: bytes(result.rows),
    nodos,
    notaFilas: 'Filas por nodo y vuelta; no sumar padres e hijos porque duplicaría el trabajo.',
    plan
  }
}
async function main() {
  const args = process.argv.slice(2)
  if (args.some((a) => !['--dataset-only', '--small', '--evaluar-indice-stock'].includes(a)))
    throw Error(
      'Solo se admiten --dataset-only, --small y --evaluar-indice-stock. No se aceptan conexiones externas.'
    )
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'ruizcacao-benchmark-test-'))
  const salida = path.join(carpeta, 'resultado.json')
  console.log('Directorio NUEVO de benchmark: ' + carpeta)
  console.log(
    'Base: ruizcacao_manager | Usuario: ruizcacao_app | Solo loopback; puerto privado elegido por el motor.'
  )
  console.log('No se borra ni se reutiliza ningún entorno. Resultados: ' + salida)
  const informe = {
    fecha: new Date().toISOString(),
    version: require('../package.json').version,
    entorno: {
      carpeta,
      dataDirectory: path.join(carpeta, 'motor', 'data'),
      base: 'ruizcacao_manager',
      usuario: 'ruizcacao_app'
    },
    estado: 'preparando',
    hashesHistoricos: await hashes(),
    consultas: [],
    optimizacionesAplicadas: [
      'Proyección explícita y paginación Stock; índice movimientos_stock_orden_id (migración 008)'
    ]
  }
  let local, db, base
  try {
    const { datos, avisos } = generarDataset(args.includes('--small') ? 0.01 : 1)
    informe.dataset = Object.fromEntries(
      Object.keys(entidades).map((key) => [key, datos[key].length])
    )
    informe.dataset.notificaciones = avisos.length
    informe.bytesSnapshotSintetico = bytes(datos)
    informe.notaPayload =
      'JSON UTF-8 del Snapshot sintético; no es una medición del transporte IPC de Electron ni incluye metadatos de EstadoAplicacion.'
    const t = performance.now()
    JSON.stringify(datos)
    informe.serializacionSnapshotMs = performance.now() - t
    if (args.includes('--dataset-only')) {
      informe.estado = 'solo_dataset_sin_postgresql'
      return
    }
    const key = randomBytes(32)
    const cifrar = (s) => {
      const iv = randomBytes(12),
        c = createCipheriv('aes-256-gcm', key, iv)
      const data = Buffer.concat([c.update(s, 'utf8'), c.final()])
      return Buffer.concat([iv, c.getAuthTag(), data])
    }
    const descifrar = (b) => {
      const c = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12))
      c.setAuthTag(b.subarray(12, 28))
      return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString('utf8')
    }
    local = new PostgresLocal({
      carpeta: path.join(carpeta, 'motor'),
      binarios: await localizarPostgres(path.join(root, 'vendor')),
      cifrar,
      descifrar
    })
    const conexion = await local.iniciar()
    assert.equal(conexion.database, 'ruizcacao_manager')
    assert.equal(conexion.user, 'ruizcacao_app')
    assert.equal(conexion.host, '127.0.0.1')
    informe.entorno.puerto = conexion.port
    const cred = JSON.parse(
      descifrar(await fs.readFile(path.join(carpeta, 'motor', 'conexion.enc')))
    )
    const verificador = new Client({
      ...conexion,
      database: 'postgres',
      user: 'ruizcacao_bootstrap',
      password: cred.passwordAdministrador
    })
    try {
      await verificador.connect()
      const actual = (await verificador.query('SHOW data_directory')).rows[0].data_directory
      assert.equal(
        (await fs.realpath(actual)).toLowerCase(),
        (await fs.realpath(informe.entorno.dataDirectory)).toLowerCase()
      )
      informe.entorno.directorioVerificado = actual
    } finally {
      await verificador.end()
    }
    base = new BaseLocal(conexion)
    await base.iniciar()
    await base.cerrar()
    base = undefined
    db = new Client({
      ...conexion,
      statement_timeout: 120000,
      application_name: 'RuizCacao benchmark TEST'
    })
    await db.connect()
    await db.query("SET TIME ZONE 'America/Guayaquil'")
    informe.migraciones = (
      await db.query('SELECT version FROM ruizcacao.migraciones ORDER BY version')
    ).rows.map((r) => r.version)
    assert.deepEqual(informe.migraciones, [1, 2, 3, 4, 5, 6, 7, 8])
    informe.tablas = Number(
      (
        await db.query(
          "SELECT count(*) FROM information_schema.tables WHERE table_schema='ruizcacao' AND table_type='BASE TABLE'"
        )
      ).rows[0].count
    )
    assert.equal(informe.tablas, 25)
    await sembrar(db, datos, avisos)
    informe.conteosVerificados = {}
    for (const [key, e] of Object.entries(entidades)) {
      informe.conteosVerificados[key] = Number(
        (await db.query(`SELECT count(*) FROM ruizcacao.${e.tabla}`)).rows[0].count
      )
      assert.equal(informe.conteosVerificados[key], datos[key].length)
    }
    informe.indices = (
      await db.query(
        "SELECT tablename,indexname,indexdef,pg_relation_size((schemaname||'.'||indexname)::regclass) bytes FROM pg_indexes WHERE schemaname='ruizcacao' ORDER BY tablename,indexname"
      )
    ).rows
    informe.postgresql = (await db.query('SELECT version()')).rows[0].version
    const parametros = ['2025-06-01', '2025-06-30']
    for (const [key, e] of Object.entries(entidades)) {
      informe.consultas.push(
        await medir(
          db,
          key + ': referencia SELECT * de 1.1.2',
          `SELECT * FROM ruizcacao.${e.tabla} ORDER BY orden DESC`,
          [],
          'consulta de la versión base 1.1.2'
        )
      )
      const cols = ['id', ...e.campos.map((c) => c.columna)]
      informe.consultas.push(
        await medir(
          db,
          key + ': proyección explícita',
          `SELECT ${cols.join(',')} FROM ruizcacao.${e.tabla} ORDER BY orden DESC`,
          [],
          'consulta de leerEntidades optimizada; mismo resultado DTO'
        )
      )
      const old = (await db.query(`SELECT * FROM ruizcacao.${e.tabla} ORDER BY orden DESC`)).rows
      const projected = (
        await db.query(`SELECT ${cols.join(',')} FROM ruizcacao.${e.tabla} ORDER BY orden DESC`)
      ).rows
      assert.deepEqual(
        projected,
        old.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])))
      )
    }
    const casos = [
      ['compras recientes', 'SELECT * FROM ruizcacao.compras ORDER BY orden DESC LIMIT 50', []],
      [
        'compras por proveedor y fecha',
        'SELECT * FROM ruizcacao.compras WHERE proveedor_id=$1 AND fecha BETWEEN $2 AND $3 ORDER BY orden DESC LIMIT 50',
        ['prov_1', '2024-01-01', '2024-12-31']
      ],
      [
        'ventas por cliente y fecha',
        'SELECT * FROM ruizcacao.ventas WHERE cliente_id=$1 AND fecha_venta BETWEEN $2 AND $3 ORDER BY orden DESC LIMIT 50',
        ['cli_1', '2025-01-01', '2025-12-31']
      ],
      [
        'cuentas abiertas',
        "SELECT * FROM ruizcacao.cuentas WHERE estado IN ('pendiente','parcial') AND categoria='compra' ORDER BY orden DESC LIMIT 50",
        []
      ],
      [
        'cuentas anuladas',
        "SELECT * FROM ruizcacao.cuentas WHERE estado='anulado' ORDER BY orden DESC LIMIT 50",
        []
      ],
      [
        'movimientos de cuenta',
        'SELECT * FROM ruizcacao.movimientos_cuenta WHERE cuenta_id=$1 ORDER BY fecha,orden',
        ['cuenta_venta_1']
      ],
      [
        'stock producto fecha',
        'SELECT * FROM ruizcacao.movimientos_stock WHERE producto=$1 AND fecha BETWEEN $2 AND $3 ORDER BY orden DESC LIMIT 50',
        ['Cacao Seco', ...parametros]
      ],
      [
        'gastos rango',
        'SELECT * FROM ruizcacao.gastos WHERE fecha BETWEEN $1 AND $2 ORDER BY orden DESC LIMIT 50',
        parametros
      ],
      [
        'flujo caja SQL de referencia',
        'SELECT fecha,categoria,sum(monto) FROM ruizcacao.v_flujo_caja WHERE fecha BETWEEN $1 AND $2 GROUP BY fecha,categoria ORDER BY fecha,categoria',
        parametros
      ],
      [
        'avisos reales',
        'SELECT id,titulo,mensaje,fecha,leida,destino FROM ruizcacao.notificaciones WHERE NOT leida OR id IN (SELECT id FROM ruizcacao.notificaciones ORDER BY fecha DESC LIMIT 200) ORDER BY fecha DESC',
        [],
        'consulta real de BaseLocal.estado'
      ],
      [
        'avisos no leídos',
        'SELECT id,titulo,mensaje,fecha,leida,destino FROM ruizcacao.notificaciones WHERE NOT leida ORDER BY fecha DESC',
        []
      ],
      [
        'página profunda OFFSET',
        'SELECT * FROM ruizcacao.ventas ORDER BY orden DESC LIMIT 50 OFFSET $1',
        [Math.floor(datos.ventas.length / 2)]
      ],
      [
        'página profunda cursor',
        'SELECT * FROM ruizcacao.ventas WHERE orden < $1 ORDER BY orden DESC LIMIT 50',
        [datos.ventas.length - Math.floor(datos.ventas.length / 2) + 1]
      ]
    ]
    for (const args of casos) informe.consultas.push(await medir(db, ...args))
    const snapshot = estadoInicial(),
      inicio = performance.now()
    await leerEntidades(db, snapshot)
    informe.leerEntidadesMs = performance.now() - inicio
    informe.bytesEntidadesLeidas = bytes(snapshot)
    informe.paginacionStock =
      await require('./benchmark-paginacion-stock.cjs').medirPaginacionStock(db, medir)
    if (args.includes('--evaluar-indice-stock'))
      informe.evaluacionIndiceStock =
        await require('./benchmark-indice-stock.cjs').evaluarIndiceStock(
          db,
          medir,
          carpeta,
          informe.entorno.directorioVerificado
        )
    informe.estado = 'comparacion_medida_proyeccion_equivalente'
  } catch (e) {
    informe.estado = 'bloqueado_o_fallido'
    // Nunca serializar clientes pg, configuraciones, passwords ni objetos completos de error.
    informe.error = e.message
    process.exitCode = 1
    console.error(e.message)
  } finally {
    if (base) await base.desconectar().catch(() => {})
    if (db) await db.end().catch(() => {})
    if (local)
      await local.detener().catch((e) => {
        informe.errorCierre = e.message
        process.exitCode = 1
      })
    assert.deepEqual(await hashes(), informe.hashesHistoricos)
    await fs.writeFile(salida, JSON.stringify(informe, null, 2))
    console.log('Estado: ' + informe.estado + ' | Informe: ' + salida)
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
