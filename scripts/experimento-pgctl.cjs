// Reproducción mínima aislada: no lee configuración ni bases de RuizCacao.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const cp = require('node:child_process')
const { promisify } = require('node:util')
const { randomBytes } = require('node:crypto')
const net = require('node:net')
const assert = require('node:assert/strict')
const { Client } = require('pg')
const run = promisify(cp.execFile)
const root = path.resolve(__dirname, '..')
const out = path.join(root, 'docs/evidencias-pgctl')
fs.mkdirSync(out, { recursive: true })
const destino = path.join(out, 'experimento-' + Date.now() + '.json')
const bin = path.join(root, 'vendor/postgresql/bin')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcm-pgctl-experimento-'))
const data = path.join(temp, 'data')
const log = path.join(temp, 'postgresql.log')
const password = randomBytes(32).toString('hex')
const informe = { node: process.versions, temp, bin, variantes: [] }
const save = () => fs.writeFileSync(destino, JSON.stringify(informe, null, 2))
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
let port
async function stop() {
  if (!fs.existsSync(path.join(data, 'postmaster.pid'))) return
  await run(path.join(bin, 'pg_ctl.exe'), ['-D', data, '-m', 'fast', '-w', '-t', '20', 'stop'], {
    windowsHide: true,
    timeout: 25000
  })
  assert.ok(!fs.existsSync(path.join(data, 'postmaster.pid')))
}
async function disponible() {
  const db = new Client({
    host: '127.0.0.1',
    port,
    user: 'prueba_pgctl',
    database: 'postgres',
    password,
    connectionTimeoutMillis: 200
  })
  try {
    await db.connect()
    await db.query('SELECT 1')
    return true
  } catch {
    return false
  } finally {
    await db.end().catch(() => {})
  }
}
async function variante(nombre, stdio, opciones = {}) {
  await stop()
  const r = { nombre, stdio: stdio || 'execFile predeterminado: pipe/pipe/pipe', eventos: [] }
  informe.variantes.push(r)
  const t0 = performance.now()
  const mark = (nombre, detalle) => r.eventos.push({ nombre, ms: performance.now() - t0, detalle })
  mark('antes-child')
  const args = ['-D', data, '-l', log, '-w', '-t', '30', 'start']
  let child
  let complete
  const fin = new Promise((resolve) => {
    complete = resolve
  })
  let timer
  let fd
  if (stdio === 'archivo') {
    fd = fs.openSync(path.join(temp, 'pg_ctl.log'), 'a')
    stdio = ['ignore', fd, fd]
  }
  if (!stdio)
    child = cp.execFile(
      path.join(bin, 'pg_ctl.exe'),
      args,
      { windowsHide: true, timeout: 35000 },
      (e, stdout, stderr) => {
        mark('callback', {
          error: !!e,
          code: e?.code,
          killed: e?.killed,
          stdoutBytes: Buffer.byteLength(stdout),
          stderrBytes: Buffer.byteLength(stderr)
        })
        mark(e ? 'promise-reject' : 'promise-resolve')
        complete()
      }
    )
  else {
    child = cp.spawn(path.join(bin, 'pg_ctl.exe'), args, {
      windowsHide: true,
      stdio,
      shell: false,
      detached: false
    })
    timer = setTimeout(() => {
      mark('timeout-observacion')
      child.stdout?.destroy()
      child.stderr?.destroy()
      if (child.exitCode === null && child.signalCode === null) child.kill()
    }, 35000)
    child.once('close', (code) => {
      clearTimeout(timer)
      mark(code === 0 ? 'promise-resolve' : 'promise-reject')
      complete()
    })
  }
  r.pidPgCtl = child.pid
  child.once('spawn', () => mark('spawn'))
  child.once('error', (e) => {
    mark('error', { code: e.code })
    complete()
  })
  child.once('exit', (code, signal) => {
    mark('exit', { code, signal })
    if (opciones.cerrarPipes) {
      child.stdout?.destroy()
      child.stderr?.destroy()
      mark('destruir-pipes-solo-experimento')
    }
  })
  child.once('close', (code, signal) => mark('close', { code, signal }))
  for (const s of ['stdin', 'stdout', 'stderr'])
    if (child[s]) {
      mark(s + '-abierto')
      child[s].on('close', () => mark(s + '-close'))
      child[s].on('error', (e) => mark(s + '-error', { code: e.code }))
      if (s !== 'stdin') child[s].on('data', (b) => mark(s + '-data', { bytes: b.length }))
    }
  let listo = false
  const sondeo = (async () => {
    while (!listo && performance.now() - t0 < 36000) {
      if (await disponible()) {
        listo = true
        mark('postgres-disponible-sql')
        break
      }
      await delay(25)
    }
  })()
  await fin
  if (fd !== undefined) fs.closeSync(fd)
  await sondeo
  assert.ok(listo)
  r.pidPostgres = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0])
  const procs = await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='postgres.exe' OR Name='cmd.exe'\" | Select-Object Name,ProcessId,ParentProcessId | ConvertTo-Json -Compress"
    ],
    { windowsHide: true }
  )
  const todos = JSON.parse(procs.stdout || '[]')
  const ids = new Set([r.pidPostgres, r.pidPgCtl])
  for (let i = 0; i < 10; i++)
    for (const p of [].concat(todos)) if (ids.has(p.ParentProcessId)) ids.add(p.ProcessId)
  r.descendientes = [].concat(todos).filter((p) => ids.has(p.ProcessId))
  r.logBytes = fs.statSync(log).size
  await stop()
  mark('motor-detenido')
  save()
  console.log(
    nombre +
      ': ' +
      r.eventos
        .filter((e) => /^(exit|close|callback|promise|postgres-disponible)/.test(e.nombre))
        .map((e) => e.nombre + '=' + e.ms.toFixed(2))
        .join(', ')
  )
}
async function main() {
  informe.version = (
    await run(path.join(bin, 'pg_ctl.exe'), ['--version'], { windowsHide: true })
  ).stdout.trim()
  assert.match(informe.version, /18\.6/)
  for (let p = 55432; p <= 55442; p++) {
    const libre = await new Promise((r) => {
      const s = net.createServer()
      s.once('error', () => r(false))
      s.listen(p, '127.0.0.1', () => s.close(() => r(true)))
    })
    if (libre) {
      port = p
      break
    }
  }
  assert.ok(port)
  informe.port = port
  const pw = path.join(temp, 'init.pw')
  fs.writeFileSync(pw, password, { mode: 0o600 })
  try {
    await run(
      path.join(bin, 'initdb.exe'),
      [
        '-D',
        data,
        '-U',
        'prueba_pgctl',
        '--pwfile=' + pw,
        '--auth=scram-sha-256',
        '--encoding=UTF8',
        '--locale=C'
      ],
      { windowsHide: true, timeout: 60000 }
    )
  } finally {
    fs.unlinkSync(pw)
  }
  fs.writeFileSync(
    path.join(data, 'postgresql.auto.conf'),
    `listen_addresses='127.0.0.1'\nport=${port}\n`
  )
  save()
  if (process.argv.includes('--shutdown')) {
    // Aislar stop: mismo execFile con pipes; el servidor tarda realmente en
    // terminar una orden externa de recuperación, sin matar postgres.
    fs.appendFileSync(
      path.join(data, 'postgresql.auto.conf'),
      `restore_command = 'powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 32; exit 1"'\n`
    )
    fs.writeFileSync(path.join(data, 'recovery.signal'), '')
    const fd = fs.openSync(path.join(temp, 'pg_ctl.log'), 'a')
    const start = await new Promise((resolve, reject) => {
      const child = cp.spawn(
        path.join(bin, 'pg_ctl.exe'),
        ['-D', data, '-l', log, '-w', '-t', '30', 'start'],
        { windowsHide: true, stdio: ['ignore', fd, fd], timeout: 35000 }
      )
      child.once('error', reject)
      child.once('close', (code) => resolve(code))
    })
    fs.closeSync(fd)
    assert.equal(start, 1)
    const pidPostgres = Number(
      fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]
    )
    const r = {
      nombre: 'stop-fast-recuperacion-t60',
      pidPostgres,
      eventos: [],
      args: ['-D', data, '-m', 'fast', '-w', '-t', '60', 'stop'],
      options: { windowsHide: true, timeout: 65000 }
    }
    informe.variantes.push(r)
    const t = performance.now()
    const mark = (nombre, detalle) => r.eventos.push({ nombre, ms: performance.now() - t, detalle })
    let polling
    await new Promise((resolve, reject) => {
      const child = cp.execFile(path.join(bin, 'pg_ctl.exe'), r.args, r.options, (e) => {
        mark('callback', { error: !!e, code: e?.code })
        if (e) reject(e)
        else resolve()
      })
      r.pidPgCtl = child.pid
      child.once('spawn', () => mark('spawn'))
      child.once('exit', (code, signal) => mark('exit', { code, signal }))
      child.once('close', (code, signal) => mark('close', { code, signal }))
      child.once('error', (e) => mark('error', { code: e.code }))
      for (const canal of ['stdin', 'stdout', 'stderr'])
        child[canal]?.once('close', () => mark(canal + '-close'))
      polling = setInterval(() => {
        try {
          process.kill(pidPostgres, 0)
          mark('postgres-activo')
        } catch {
          mark('postgres-terminado')
          clearInterval(polling)
        }
      }, 1000)
    })
    clearInterval(polling)
    assert.ok(!fs.existsSync(path.join(data, 'postmaster.pid')))
    assert.throws(() => process.kill(pidPostgres, 0))
    r.postgresResidual = false
    r.logFinal = fs.readFileSync(log, 'utf8').split('\n').slice(-15)
    informe.completo = true
    save()
    return
  }
  if (process.argv.includes('--archivos')) {
    await variante('spawn-stdout-stderr-archivo-1', 'archivo')
    await variante('spawn-stdout-stderr-archivo-2', 'archivo')
    informe.completo = true
    return
  }
  await variante('execFile-actual-1')
  await variante('spawn-pipes-consumidos', ['pipe', 'pipe', 'pipe'])
  await variante('spawn-sin-stdout', ['pipe', 'ignore', 'pipe'])
  await variante('spawn-sin-stderr', ['pipe', 'pipe', 'ignore'])
  await variante('spawn-sin-stdin', ['ignore', 'pipe', 'pipe'])
  await variante('spawn-sin-pipes-1', ['ignore', 'ignore', 'ignore'])
  await variante('execFile-pipes-destruidos', null, { cerrarPipes: true })
  await variante('execFile-actual-2')
  await variante('spawn-sin-pipes-2', ['ignore', 'ignore', 'ignore'])
  informe.completo = true
}
main()
  .catch((e) => {
    informe.error = e.message
    process.exitCode = 1
  })
  .finally(async () => {
    await stop()
    save()
    console.log(destino)
  })
