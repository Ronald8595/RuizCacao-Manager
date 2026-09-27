// Copia una distribución oficial YA instalada al contenido del instalador offline.
const fs = require('node:fs'),
  path = require('node:path')
const root = path.resolve(__dirname, '..')
const base = path.join(process.env.ProgramFiles || 'C:/Program Files', 'PostgreSQL')
const version = fs
  .readdirSync(base)
  .filter((v) => /^\d+$/.test(v) && Number(v) >= 14)
  .sort((a, b) => Number(b) - Number(a))[0]
const origen = process.env.RUIZCACAO_POSTGRES_DIST || path.join(base, version || 'NO_INSTALADO')
if (!fs.existsSync(path.join(origen, 'bin', 'postgres.exe')))
  throw Error(
    'Indica RUIZCACAO_POSTGRES_DIST con una distribución oficial completa de PostgreSQL 14 o posterior.'
  )
for (const nombre of [
  'postgres.exe',
  'initdb.exe',
  'pg_ctl.exe',
  'psql.exe',
  'pg_dump.exe',
  'pg_restore.exe'
])
  if (!fs.existsSync(path.join(origen, 'bin', nombre)))
    throw Error('Distribución incompleta: falta ' + nombre)
for (const dir of ['lib', 'share'])
  if (!fs.statSync(path.join(origen, dir)).isDirectory())
    throw Error('Distribución incompleta: falta ' + dir)
const destino = path.join(root, 'vendor', 'postgresql')
if (fs.existsSync(path.join(destino, 'data')))
  throw Error('El destino contiene data. No se empaquetará un cluster de desarrollo.')
fs.mkdirSync(destino, { recursive: true })
for (const dir of ['bin', 'lib', 'share'])
  fs.cpSync(path.join(origen, dir), path.join(destino, dir), { recursive: true })
for (const nombre of [
  'COPYRIGHT',
  'LICENSE',
  'license.txt',
  'licenses',
  'server_license.txt',
  'commandlinetools_3rd_party_licenses.txt'
])
  if (fs.existsSync(path.join(origen, nombre)))
    fs.cpSync(path.join(origen, nombre), path.join(destino, nombre), { recursive: true })
console.log('Motor PostgreSQL preparado para el instalador offline en ' + destino)

require('./verificar-distribucion.cjs')
