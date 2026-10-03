// Prerrequisito offline del instalador Windows; nunca se ejecuta en la aplicación.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { createHash, randomUUID } = require('node:crypto')
const root = path.resolve(__dirname, '..')
const manifest = require('../build/vcredist-manifest.json')
const destino = path.join(root, 'vendor/vcredist/VC_redist.x64.exe')
function verificar(archivo = destino) {
  if (process.platform !== 'win32') throw Error('Verifica el prerrequisito desde Windows.')
  if (!fs.existsSync(archivo)) throw Error('Falta VC++ x64. Ejecuta npm run prepare:vcredist.')
  if (createHash('sha256').update(fs.readFileSync(archivo)).digest('hex') !== manifest.sha256)
    throw Error('VC++ x64 no coincide con el SHA-256 aprobado. No se empaquetará.')
  const metadata = JSON.parse(
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'RemoteSigned',
        '-File',
        path.join(__dirname, 'verificar-vcredist.ps1'),
        '-RuntimeFile',
        archivo
      ],
      { windowsHide: true, encoding: 'utf8', timeout: 120000 }
    )
  )
  if (
    metadata.version !== manifest.version ||
    metadata.publisher !== manifest.publisher ||
    metadata.sha256 !== manifest.sha256 ||
    manifest.architecture !== 'x64' ||
    manifest.source !== 'https://aka.ms/vc14/vc_redist.x64.exe'
  )
    throw Error('Los metadatos del redistribuible no coinciden con el manifiesto aprobado.')
  if (
    !fs
      .readFileSync(path.join(root, 'build/vcredist-version.nsh'), 'utf8')
      .includes(`!define RUIZCACAO_VC_VERSION "${manifest.version}"`)
  )
    throw Error('La versión mínima NSIS no coincide con el redistribuible aprobado.')
  console.log(`VC++ x64 ${manifest.version}: SHA-256 y firma Microsoft válidos.`)
}
function preparar() {
  if (process.platform !== 'win32') throw Error('Prepara el prerrequisito desde Windows.')
  if (!fs.existsSync(destino)) {
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    const provisional = path.join(path.dirname(destino), randomUUID() + '.descarga.exe')
    try {
      const origen = process.env.RUIZCACAO_VC_REDIST
      if (origen) fs.copyFileSync(origen, provisional)
      else
        execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'RemoteSigned',
            '-File',
            path.join(__dirname, 'verificar-vcredist.ps1'),
            '-RuntimeFile',
            provisional,
            '-Download'
          ],
          { windowsHide: true, timeout: 180000, stdio: 'inherit' }
        )
      verificar(provisional)
      fs.renameSync(provisional, destino)
    } finally {
      if (fs.existsSync(provisional)) fs.unlinkSync(provisional)
    }
  }
  verificar()
}
module.exports = { verificar, preparar }
if (require.main === module) {
  try {
    preparar()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
