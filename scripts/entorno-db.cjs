const { app, safeStorage } = require('electron')
const fs = require('node:fs/promises'),
  { join } = require('node:path')
const { load, root } = require('../tests/loader.cjs')
const { ErrorNegocio } = load(join(root, 'src/shared/errorNegocio.ts'))
app.setName('RuizCacao Manager')
async function entorno() {
  if (!safeStorage.isEncryptionAvailable())
    throw new ErrorNegocio('Ejecuta la herramienta desde tu sesión normal de Windows.')
  const { PostgresLocal, localizarPostgres } = load(
    join(root, 'src/main/database/postgres-local.ts')
  )
  const { Respaldos } = load(join(root, 'src/main/database/respaldos.ts'))
  const { configurarLogs } = load(join(root, 'src/main/database/errores.ts'))
  configurarLogs(join(app.getPath('userData'), 'logs'))
  const binarios = await localizarPostgres(process.resourcesPath)
  let config, local
  try {
    config = JSON.parse(
      safeStorage.decryptString(await fs.readFile(join(app.getPath('userData'), 'postgres.enc')))
    )
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
    local = new PostgresLocal({
      carpeta: join(app.getPath('userData'), 'postgres'),
      binarios,
      cifrar: (s) => safeStorage.encryptString(s),
      descifrar: (b) => safeStorage.decryptString(b)
    })
    config = await local.iniciar()
  }
  let publica
  try {
    publica = await fs.readFile(join(root, 'resources/security/recovery-public.pem'), 'utf8')
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  return {
    config,
    local,
    opciones: {
      publica,
      respaldos: new Respaldos(config, binarios, join(app.getPath('userData'), 'backups'))
    }
  }
}
module.exports = { entorno, app, load, root }
