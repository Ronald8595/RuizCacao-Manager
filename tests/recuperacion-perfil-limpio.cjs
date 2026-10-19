// Cuatro procesos secuenciales, userData A/B independientes; nunca usa AppData comercial.
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
async function main() {
  const continuar = process.argv[2]
  const raiz =
    continuar || (await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-perfil-limpio-Ñ espacio-')))
  assert.match(path.basename(raiz), /^rcm-perfil-limpio-/)
  const evidencia = { fases: [], perfilesWindowsReales: false }
  if (continuar) {
    const a = await fs.readFile(path.join(raiz, 'A.back'))
    assert.deepEqual(a, await fs.readFile(path.join(raiz, 'transferencia', 'A.back')))
    evidencia.sha256 = createHash('sha256').update(a).digest('hex')
    evidencia.bytesIdenticos = true
    evidencia.reutilizaArchivoA = true
  }
  try {
    for (const fase of continuar ? ['B', 'login', 'reabrir'] : ['A', 'B', 'login', 'reabrir']) {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      const code = await new Promise((resolve, reject) => {
        const p = spawn(
          require('electron'),
          [path.join(__dirname, 'recuperacion-perfil-limpio-electron.cjs'), raiz, fase],
          {
            windowsHide: true,
            stdio: ['ignore', 'inherit', 'inherit'],
            env
          }
        )
        p.once('error', reject)
        p.once('exit', resolve)
      })
      evidencia.fases.push({ fase, code })
      assert.equal(code, 0, `Fase ${fase}`)
      if (fase === 'A') {
        // B recibe únicamente este archivo; no copia ni usa la configuración de A.
        await fs.mkdir(path.join(raiz, 'transferencia'))
        await fs.copyFile(path.join(raiz, 'A.back'), path.join(raiz, 'transferencia', 'A.back'))
        const a = await fs.readFile(path.join(raiz, 'A.back'))
        const b = await fs.readFile(path.join(raiz, 'transferencia', 'A.back'))
        assert.deepEqual(a, b)
        evidencia.sha256 = createHash('sha256').update(a).digest('hex')
        evidencia.bytesIdenticos = true
        await fs.rename(path.join(raiz, 'A'), path.join(raiz, 'A-retirado'))
      }
    }
    evidencia.exito = true
  } finally {
    const destino =
      process.env.RCM_EVIDENCIA_DIR ||
      path.join(__dirname, '../docs/evidencias-recuperacion-perfil-limpio')
    await fs.mkdir(destino, { recursive: true })
    await fs.writeFile(path.join(destino, 'resultado.json'), JSON.stringify(evidencia, null, 2))
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
