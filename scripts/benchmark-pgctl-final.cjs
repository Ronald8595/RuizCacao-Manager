// Solo cuatro arranques de las copias existentes. Espera suite final aprobada.
const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const out = path.join(root, 'docs/evidencias-pgctl')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const fin = (child) =>
  new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(Error('Proceso terminó con ' + code))
    )
  })
async function main() {
  if (process.argv.includes('--verificar-procesos')) {
    const raices = []
    for (const f of fs
      .readdirSync(out)
      .filter((n) => /^(experimento|regresion)-.*\.json$/.test(n))) {
      const r = JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'))
      if (r.temp || r.carpeta) raices.push(r.temp || r.carpeta)
    }
    const p = JSON.parse(
      fs.readFileSync(path.join(root, 'docs/evidencias-arranque-real/preparacion.json'), 'utf8')
    )
    raices.push(p.carpeta)
    for (const f of ['db-test-final.txt', 'db-test-secuencial.txt']) {
      const t = fs.readFileSync(path.join(out, f), 'utf8')
      const m = t.match(/Artefactos de prueba: (.+)/)
      if (m) raices.push(m[1].trim())
    }
    const texto = cp.execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='postgres.exe' OR Name='pg_ctl.exe'\" | Select-Object Name,ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"
      ],
      { windowsHide: true, encoding: 'utf8' }
    )
    const todos = texto.trim() ? [].concat(JSON.parse(texto)) : []
    const canon = (s) => s.replaceAll('\\', '/').toLowerCase()
    const motores = todos.filter(
      (q) => q.CommandLine && raices.some((r) => canon(q.CommandLine).includes(canon(r)))
    )
    const ids = new Set(motores.map((q) => q.ProcessId))
    for (let i = 0; i < 10; i++)
      for (const q of todos) if (ids.has(q.ParentProcessId)) ids.add(q.ProcessId)
    const residuales = todos
      .filter((q) => ids.has(q.ProcessId))
      .map(({ Name, ProcessId, ParentProcessId }) => ({ Name, ProcessId, ParentProcessId }))
    fs.writeFileSync(
      path.join(out, 'motores-final.json'),
      JSON.stringify({ fecha: new Date().toISOString(), raices, residuales }, null, 2)
    )
    assert.equal(residuales.length, 0)
    console.log('Sin motores residuales en las raíces aisladas verificadas.')
    return
  }
  assert.equal(
    fs.readFileSync(path.join(out, 'db-test-secuencial-exit.txt'), 'utf8').trim(),
    '0',
    'Terminar la suite antes del benchmark'
  )
  for (const escenario of ['small', 'large'])
    for (const corrida of ['frio', 'segundo']) {
      const nombre = escenario + '-' + corrida + '-final'
      const prefix = path.join(out, nombre)
      assert.ok(!fs.existsSync(prefix + '.json'), 'No sobrescribir corrida ' + nombre)
      const ready = prefix + '.consolas-ready',
        stop = prefix + '.consolas-stop'
      const monitor = cp.spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-File',
          path.join(root, 'scripts/vigilar-consolas-pgctl.ps1'),
          '-ReadyFile',
          ready,
          '-StopFile',
          stop,
          '-OutputFile',
          prefix + '-consolas.json'
        ],
        { windowsHide: true, stdio: 'pipe' }
      )
      let errorMonitor = ''
      monitor.stderr.on('data', (b) => {
        errorMonitor += b.toString()
      })
      const monitorFin = fin(monitor)
      monitorFin.catch(() => {})
      const limite = Date.now() + 30000
      while (!fs.existsSync(ready) && Date.now() < limite && monitor.exitCode === null)
        await delay(50)
      assert.ok(fs.existsSync(ready), 'Monitor de consolas: ' + errorMonitor)
      const fd = fs.openSync(prefix + '-terminal.txt', 'wx')
      try {
        const child = cp.spawn(
          process.execPath,
          [
            path.join(root, 'node_modules/electron-vite/bin/electron-vite.js'),
            'dev',
            '--entry',
            'scripts/perfil-aplicacion-real.cjs'
          ],
          {
            cwd: root,
            windowsHide: true,
            stdio: ['ignore', fd, fd],
            env: {
              ...process.env,
              RCM_PERFIL_ESCENARIO: escenario,
              RCM_PERFIL_CORRIDA: corrida,
              RCM_PERFIL_CONEXION: 'local',
              RCM_PERFIL_ETAPA: 'pgctl-despues',
              RCM_PERFIL_SERIE: 'final'
            }
          }
        )
        await fin(child)
        const r = JSON.parse(fs.readFileSync(prefix + '.json', 'utf8'))
        assert.ok(!r.error, r.error)
        const cierre = JSON.parse(fs.readFileSync(prefix + '-cierre.json', 'utf8'))
        assert.ok(cierre.cierreNormal && cierre.motorDetenido)
        const muestras = JSON.parse(
          fs.readFileSync(prefix + '-postgres.json', 'utf8').replace(/^\uFEFF/, '')
        )
        const ids = [...new Set(muestras.flatMap((m) => m.procesos.map((p) => p.pid)))]
        const residuales = ids.filter((id) => {
          try {
            process.kill(id, 0)
            return true
          } catch (e) {
            if (e.code !== 'ESRCH') throw e
            return false
          }
        })
        fs.writeFileSync(
          prefix + '-procesos-final.json',
          JSON.stringify({ pidsObservados: ids, residuales }, null, 2)
        )
        assert.equal(residuales.length, 0)
        console.log('OK benchmark ' + nombre)
      } finally {
        fs.closeSync(fd)
        fs.writeFileSync(stop, 'fin')
        await monitorFin
      }
    }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
