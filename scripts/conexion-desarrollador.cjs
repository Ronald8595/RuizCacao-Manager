// Solo para herramientas locales explícitas; nunca se importa desde Renderer.
const { app, safeStorage } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
async function conexionDesarrollador() {
  app.setName('RuizCacao Manager')
  await app.whenReady()
  if (!safeStorage.isEncryptionAvailable()) throw Error('Windows no permite descifrar la conexión.')
  const carpeta = app.getPath('userData')
  let config, fuente
  try {
    fuente = path.join(carpeta, 'postgres.enc')
    config = JSON.parse(safeStorage.decryptString(await fs.readFile(fuente)))
  } catch (e) {
    if (e.code !== 'ENOENT') throw Error('No se pudo leer la conexión local protegida.')
    fuente = path.join(carpeta, 'postgres', 'conexion.enc')
    const cred = JSON.parse(safeStorage.decryptString(await fs.readFile(fuente)))
    config = cred.conexion
  }
  if (
    config.database !== 'ruizcacao_manager' ||
    !['localhost', '127.0.0.1', '::1'].includes(config.host)
  )
    throw Error('Solo se admite la base configurada ruizcacao_manager en loopback.')
  return { config, carpeta, fuente }
}
module.exports = { conexionDesarrollador }
