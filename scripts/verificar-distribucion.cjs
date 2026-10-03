const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const { execFileSync } = require('node:child_process')
if (process.platform === 'win32') require('./preparar-vcredist.cjs').verificar()
function revisar(carpeta) {
  for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
    if (['node_modules', '.git', 'vendor', 'dist'].includes(entrada.name)) continue
    const ruta = path.join(carpeta, entrada.name)
    if (entrada.isSymbolicLink()) continue
    if (entrada.isDirectory()) {
      revisar(ruta)
      continue
    }
    if (fs.statSync(ruta).size > 10000000) continue
    const texto = fs.readFileSync(ruta, 'utf8')
    if (/(?:^|\n)-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/.test(texto))
      throw Error('Se encontró una clave privada. Retírala del proyecto antes de distribuir.')
  }
}
revisar(root)
const publica = path.join(root, 'resources/security/recovery-public.pem')
if (fs.existsSync(publica)) {
  if (crypto.createPublicKey(fs.readFileSync(publica)).asymmetricKeyType !== 'ed25519')
    throw Error('La clave pública debe ser Ed25519.')
} else
  console.log('Recuperación deshabilitada: aún no se incorporó una clave pública de producción.')
const motor = path.join(root, 'vendor/postgresql')
revisar(motor)
if (fs.existsSync(path.join(motor, 'data')))
  throw Error('No se puede distribuir un directorio data.')
for (const dir of ['bin', 'lib', 'share'])
  if (!fs.statSync(path.join(motor, dir)).isDirectory())
    throw Error('Falta parte del motor: ' + dir)
for (const exe of ['postgres', 'initdb', 'pg_ctl', 'psql', 'pg_dump', 'pg_restore'])
  if (!fs.existsSync(path.join(motor, 'bin', exe + '.exe')))
    throw Error('Falta un binario del motor: ' + exe)
  else {
    const version = execFileSync(path.join(motor, 'bin', exe + '.exe'), ['--version'], {
      windowsHide: true,
      timeout: 10000,
      encoding: 'utf8'
    }).trim()
    if (!/PostgreSQL\) \d+/.test(version)) throw Error('El motor no respondió --version: ' + exe)
    console.log(version)
  }
console.log(
  'Distribución preparada: bin/lib/share presentes, sin data ni claves privadas detectadas en código/recursos.'
)
