// Dump de solo lectura y comandos reales exclusivamente en un clúster nuevo comprobado.
const { app } = require('electron'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict')
const {
    randomUUID,
    randomBytes,
    createCipheriv,
    createDecipheriv,
    createHash
  } = require('node:crypto'),
  { Client } = require('pg'),
  { performance } = require('node:perf_hooks')
const { conexionDesarrollador } = require('./conexion-desarrollador.cjs'),
  { load, root } = require('../tests/loader.cjs')
const { PostgresLocal, localizarPostgres } = load(root + '/src/main/database/postgres-local.ts'),
  { Respaldos } = load(root + '/src/main/database/respaldos.ts'),
  { BaseLocal, hoy } = load(root + '/src/main/database/base.ts'),
  { hashSecreto } = load(root + '/src/main/database/seguridad.ts')
async function main() {
  const etiqueta = process.argv[2]
  assert.ok(['antes', 'despues'].includes(etiqueta))
  const { config } = await conexionDesarrollador(),
    carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'ruizcacao-comandos-snapshot-')),
    key = randomBytes(32),
    binarios = await localizarPostgres(path.join(root, 'vendor'))
  const encode = (s) => {
    const iv = randomBytes(12),
      c = createCipheriv('aes-256-gcm', key, iv),
      d = Buffer.concat([c.update(s, 'utf8'), c.final()])
    return Buffer.concat([iv, c.getAuthTag(), d])
  }
  const decode = (b) => {
    const c = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12))
    c.setAuthTag(b.subarray(12, 28))
    return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString('utf8')
  }
  const local = new PostgresLocal({
    carpeta: path.join(carpeta, 'motor'),
    binarios,
    cifrar: encode,
    descifrar: decode
  })
  let base
  const informe = { fecha: new Date().toISOString(), etiqueta, carpeta, muestras: [] }
  try {
    const dump = path.join(carpeta, 'copia-desarrollador.dump'),
      origen = new Respaldos(config, binarios, carpeta)
    await origen.herramienta('pg_dump', [...origen.argumentosConexion(), '-Fc', '--file', dump])
    informe.sha256Dump = createHash('sha256')
      .update(await fs.readFile(dump))
      .digest('hex')
    const espejo = await local.iniciar(),
      cred = JSON.parse(decode(await fs.readFile(path.join(carpeta, 'motor', 'conexion.enc')))),
      admin = new Client({
        ...espejo,
        database: 'postgres',
        user: 'ruizcacao_bootstrap',
        password: cred.passwordAdministrador
      })
    await admin.connect()
    try {
      const real = (await admin.query('SHOW data_directory')).rows[0].data_directory
      assert.equal(
        (await fs.realpath(real)).toLowerCase(),
        (await fs.realpath(path.join(carpeta, 'motor', 'data'))).toLowerCase()
      )
      informe.directorioVerificado = real
    } finally {
      await admin.end()
    }
    const destino = new Respaldos(espejo, binarios, carpeta)
    await destino.herramienta('pg_restore', [
      ...destino.argumentosConexion(),
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      dump
    ])
    base = new BaseLocal(espejo)
    await base.iniciar()
    const clave = randomBytes(20).toString('hex') + 'Aa1!',
      usuario = randomUUID()
    await base.pool.query(
      "INSERT INTO ruizcacao.usuarios(id,nombre,password_hash,rol,activo,principal) VALUES($1,'PERF Benchmark snapshot',$2,'administrador',true,false)",
      [usuario, await hashSecreto(clave)]
    )
    await base.login('PERF Benchmark snapshot', clave)
    // Preparación solo de la copia; ninguna jornada de la base original se altera.
    await base.pool.query(
      "UPDATE ruizcacao.jornadas SET estado='finalizada',cierre=now() WHERE estado IN ('activa','interrumpida')"
    )
    await base.jornada('abrir')
    const provider = (
        await base.pool.query(
          'SELECT id FROM ruizcacao.proveedores WHERE estado ORDER BY orden DESC LIMIT 1'
        )
      ).rows[0].id,
      cliente = (
        await base.pool.query(
          'SELECT id FROM ruizcacao.clientes WHERE estado ORDER BY orden DESC LIMIT 1'
        )
      ).rows[0].id
    const casos = [
      [
        'registrarCompra',
        [
          {
            fecha: hoy(),
            proveedorId: provider,
            producto: 'Cacao en Baba',
            cantidadQq: 1,
            precioCompraQq: 70,
            impuestoPorcentaje: 1,
            montoPagado: 0,
            metodoPago: 'Efectivo'
          }
        ]
      ],
      [
        'registrarVenta',
        [
          {
            fechaVenta: hoy(),
            clienteId: cliente,
            producto: 'Cacao Seco',
            pesoBruto: 1,
            precioUnitario: 200,
            impuestoPorcentaje: 1,
            metodoPago: 'Efectivo',
            montoRecibido: 0
          }
        ]
      ],
      [
        'crearCliente',
        [
          {
            nombreRazonSocial: 'PERF medición temporal',
            identificacion: '',
            telefono: '',
            estado: true
          }
        ]
      ]
    ]
    const normal = base.transaccion.bind(base)
    // Se ejecutan guardar/estado reales; el COMMIT se sustituye por ROLLBACK solo en el arnés.
    base.transaccion = async (fn) => {
      const db = await base.pool.connect()
      try {
        await db.query('BEGIN')
        await db.query("SET LOCAL TIME ZONE 'America/Guayaquil'")
        await db.query('SELECT pg_advisory_xact_lock(7302026)')
        return await fn(db)
      } finally {
        await db.query('ROLLBACK')
        db.release()
      }
    }
    const tiempos = {}
    for (const metodo of ['datos', 'estado', 'guardar']) {
      const fn = base[metodo].bind(base)
      base[metodo] = async (...a) => {
        const t = performance.now()
        try {
          return await fn(...a)
        } finally {
          ;(tiempos[metodo] ??= []).push(performance.now() - t)
        }
      }
    }
    for (const [comando, args] of casos)
      for (let n = 0; n < 3; n++) {
        for (const k of Object.keys(tiempos)) tiempos[k] = []
        const t = performance.now(),
          r = await base.ejecutar(randomUUID(), comando, args),
          totalMs = performance.now() - t
        informe.muestras.push({
          comando,
          totalMs,
          etapas: structuredClone(tiempos),
          bytesRespuesta: Buffer.byteLength(JSON.stringify(r)),
          conteos: Object.fromEntries(
            Object.entries(r.estado.datos)
              .filter(([, v]) => Array.isArray(v))
              .map(([k, v]) => [k, v.length])
          )
        })
        console.log(
          comando +
            ' ' +
            (n + 1) +
            ': ' +
            totalMs.toFixed(1) +
            ' ms; guardar ' +
            (tiempos.guardar?.[0] ?? 0).toFixed(1)
        )
      }
    base.transaccion = normal
    informe.nota =
      'Copia efímera del volumen actual, sin seed. Comandos reales revertidos en la copia; incluye leer datos previo y estado posterior, dominio y guardar; estado incluye su datos. No sumar etapas anidadas. Dump/usuario/jornada de preparación fuera de tiempos. Base original solo pg_dump.'
    await fs.writeFile(
      path.join(
        root,
        'docs/evidencias-escalabilidad/comandos-snapshot-' + etiqueta + '-2026-10-01.json'
      ),
      JSON.stringify(informe, null, 2)
    )
  } finally {
    if (base) await base.desconectar()
    await local.detener()
  }
}
main()
  .then(() => app.exit(0))
  .catch((e) => {
    console.error(e.message)
    app.exit(1)
  })
