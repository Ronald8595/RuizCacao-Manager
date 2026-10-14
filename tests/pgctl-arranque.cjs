// Integración con binarios empaquetados y clúster temporal; nunca usa el origen.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const cp = require('node:child_process')
const crypto = require('node:crypto')
const { Client } = require('pg')
const { load, root } = require('./loader.cjs')
const { PostgresLocal } = load(path.join(root, 'src/main/database/postgres-local.ts'))
const { configurarLogs } = load(path.join(root, 'src/main/database/errores.ts'))
const spawnReal = cp.spawn
let modo = 'real'
const lanzamientos = []
cp.spawn = function (file, args, options) {
  if (path.basename(file) !== 'pg_ctl.exe' || !args.includes('start'))
    return spawnReal(file, args, options)
  assert.equal(options.windowsHide, true)
  assert.equal(options.detached, false)
  assert.equal(options.shell, false)
  assert.equal(options.timeout, 35000)
  assert.equal(options.stdio[0], 'ignore')
  assert.equal(typeof options.stdio[1], 'number')
  assert.equal(options.stdio[1], options.stdio[2])
  const r = { modo, eventos: [] }
  lanzamientos.push(r)
  const t = performance.now()
  let child
  if (modo === 'exit-cero-sin-servidor')
    child = spawnReal(process.execPath, ['-e', 'process.exit(0)'], options)
  else if (modo === 'timeout-proceso')
    child = spawnReal(process.execPath, ['-e', 'setInterval(()=>{},1000)'], options)
  else
    child = spawnReal(
      file,
      modo === 'error-pgctl' ? args.concat('--opcion-inexistente-rcm') : args,
      options
    )
  for (const evento of ['spawn', 'exit', 'close', 'error'])
    child.on(evento, (code, signal) =>
      r.eventos.push({
        evento,
        ms: performance.now() - t,
        code: typeof code === 'number' ? code : code?.code,
        signal
      })
    )
  return child
}
async function main() {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-pgctl-regresion-'))
  const motorPath = path.join(carpeta, 'motor')
  const data = path.join(motorPath, 'data')
  const key = crypto.randomBytes(32)
  const cifrar = (s) => {
    const iv = crypto.randomBytes(12),
      c = crypto.createCipheriv('aes-256-gcm', key, iv)
    const b = Buffer.concat([c.update(s, 'utf8'), c.final()])
    return Buffer.concat([iv, c.getAuthTag(), b])
  }
  const descifrar = (b) => {
    const c = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12))
    c.setAuthTag(b.subarray(12, 28))
    return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString('utf8')
  }
  const opciones = {
    carpeta: motorPath,
    binarios: path.join(root, 'vendor/postgresql/bin'),
    cifrar,
    descifrar
  }
  configurarLogs(path.join(carpeta, 'logs'))
  const evidencia = { carpeta, casos: [], lanzamientos }
  const destino = path.join(root, 'docs/evidencias-pgctl', 'regresion-' + Date.now() + '.json')
  await fs.mkdir(path.dirname(destino), { recursive: true })
  const guardar = () => fs.writeFile(destino, JSON.stringify(evidencia, null, 2))
  let motor = new PostgresLocal(opciones),
    config
  const parado = async () =>
    assert.equal(
      await fs.access(path.join(data, 'postmaster.pid')).then(
        () => true,
        () => false
      ),
      false
    )
  async function caso(nombre, fn) {
    const t = performance.now()
    try {
      await fn()
      evidencia.casos.push({ nombre, ok: true, ms: performance.now() - t })
      console.log('OK pgctl: ' + nombre)
    } catch (e) {
      evidencia.casos.push({ nombre, ok: false, error: e.message })
      throw e
    } finally {
      await guardar()
    }
  }
  const conectar = async (fn) => {
    const db = new Client(config)
    await db.connect()
    try {
      return await fn(db)
    } finally {
      await db.end()
    }
  }
  try {
    await caso('motor detenido, disponibilidad SQL y datos persistentes', async () => {
      config = await motor.iniciar()
      await conectar(async (db) => {
        await db.query('CREATE TABLE test_pgctl(valor integer)')
        await db.query('INSERT INTO test_pgctl VALUES(42)')
      })
    })
    const cifrado = await fs.readFile(path.join(motorPath, 'conexion.enc'))
    await caso('motor ya iniciado: conexión verificada sin lanzar pg_ctl', async () => {
      const n = lanzamientos.length
      const otro = new PostgresLocal(opciones)
      assert.deepEqual(await otro.iniciar(), config)
      assert.equal(lanzamientos.length, n)
    })
    await caso('cierre normal y reapertura: datos y credenciales conservados', async () => {
      await motor.detener()
      await parado()
      motor = new PostgresLocal(opciones)
      assert.deepEqual(await motor.iniciar(), config)
      assert.equal(
        await conectar(
          async (db) => (await db.query('SELECT valor FROM test_pgctl')).rows[0].valor
        ),
        42
      )
      assert.deepEqual(await fs.readFile(path.join(motorPath, 'conexion.enc')), cifrado)
      await motor.detener()
      await parado()
    })
    await caso('puerto ocupado: rechazo, sin cambiar puerto ni credenciales', async () => {
      const sockets = new Set()
      const servidor = net.createServer((s) => {
        sockets.add(s)
        s.on('close', () => sockets.delete(s))
      })
      await new Promise((r, j) => servidor.once('error', j).listen(config.port, '127.0.0.1', r))
      try {
        await assert.rejects(new PostgresLocal(opciones).iniciar(), /no pudo iniciarse/)
        await parado()
        assert.deepEqual(await fs.readFile(path.join(motorPath, 'conexion.enc')), cifrado)
      } finally {
        for (const s of sockets) s.destroy()
        await new Promise((r) => servidor.close(r))
      }
    })
    const conf = path.join(data, 'postgresql.auto.conf'),
      original = await fs.readFile(conf)
    await caso('postgres no puede iniciar: biblioteca inexistente', async () => {
      await fs.appendFile(conf, "\nshared_preload_libraries='rcm_biblioteca_inexistente'\n")
      try {
        await assert.rejects(new PostgresLocal(opciones).iniciar(), /no pudo iniciarse/)
        await parado()
      } finally {
        await fs.writeFile(conf, original)
      }
    })
    await caso('error real de pg_ctl y stderr conservado', async () => {
      modo = 'error-pgctl'
      try {
        await assert.rejects(new PostgresLocal(opciones).iniciar(), /no pudo iniciarse/)
        await parado()
      } finally {
        modo = 'real'
      }
      assert.match(
        await fs.readFile(path.join(motorPath, 'pg_ctl.log'), 'utf8'),
        /opcion-inexistente-rcm/
      )
    })
    await caso('exit 0 sin servidor no es aceptado', async () => {
      modo = 'exit-cero-sin-servidor'
      try {
        await assert.rejects(new PostgresLocal(opciones).iniciar(), /no pudo iniciarse/)
        await parado()
      } finally {
        modo = 'real'
      }
    })
    await caso('timeout real de proceso a 35000 ms, hijo terminado', async () => {
      modo = 'timeout-proceso'
      const t = performance.now()
      try {
        await assert.rejects(new PostgresLocal(opciones).iniciar(), /no pudo iniciarse/)
        await parado()
        assert.ok(performance.now() - t >= 35000)
      } finally {
        modo = 'real'
      }
      assert.ok(lanzamientos.at(-1).eventos.some((e) => e.evento === 'close' && e.signal))
    })
    await caso('timeout legítimo pg_ctl -t30 durante recuperación bloqueada', async () => {
      await fs.appendFile(
        conf,
        `\nrestore_command = 'powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 32; exit 1"'\n`
      )
      await fs.writeFile(path.join(data, 'recovery.signal'), '')
      const t = performance.now()
      try {
        await assert.rejects(new PostgresLocal(opciones).iniciar(), /no pudo iniciarse/)
        assert.ok(performance.now() - t >= 30000)
        await parado()
        assert.ok(lanzamientos.at(-1).eventos.some((e) => e.evento === 'exit' && e.code === 1))
      } finally {
        await fs.writeFile(conf, original)
        await fs.unlink(path.join(data, 'recovery.signal')).catch((e) => {
          if (e.code !== 'ENOENT') throw e
        })
      }
    })
    await caso('reapertura después de fallos y logs conservados', async () => {
      motor = new PostgresLocal(opciones)
      assert.deepEqual(await motor.iniciar(), config)
      assert.equal(
        await conectar(
          async (db) => (await db.query('SELECT valor FROM test_pgctl')).rows[0].valor
        ),
        42
      )
      const log = await fs.readFile(path.join(motorPath, 'postgresql.log'), 'utf8')
      assert.match(log, /ready to accept connections/)
      assert.match(log, /rcm_biblioteca_inexistente/)
      assert.match(log, /Address already in use|could not bind|Only one usage|Solo se permite/i)
      evidencia.postgresqlLogBytes = Buffer.byteLength(log)
      evidencia.pgctlLogBytes = (await fs.stat(path.join(motorPath, 'pg_ctl.log'))).size
      await motor.detener()
      await parado()
    })
    evidencia.completo = true
  } finally {
    modo = 'real'
    await motor.detener()
    await guardar()
    cp.spawn = spawnReal
    console.log('Evidencia pgctl: ' + destino)
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
