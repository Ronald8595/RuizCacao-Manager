// Suite autónoma: motor y bases aislados; jamás lee la conexión real de la aplicación.
const { load, root } = require('./loader.cjs')
const { join } = require('node:path'),
  os = require('node:os'),
  fs = require('node:fs/promises')
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto')
const { spawn } = require('node:child_process')
const { PostgresLocal, localizarPostgres } = load(join(root, 'src/main/database/postgres-local.ts'))
async function main() {
  const carpeta = await fs.mkdtemp(join(os.tmpdir(), 'ruizcacao-tests-')),
    key = randomBytes(32)
  const cifrar = (s) => {
    const iv = randomBytes(12),
      c = createCipheriv('aes-256-gcm', key, iv),
      data = Buffer.concat([c.update(s, 'utf8'), c.final()])
    return Buffer.concat([iv, c.getAuthTag(), data])
  }
  const descifrar = (b) => {
    const c = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12))
    c.setAuthTag(b.subarray(12, 28))
    return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString('utf8')
  }
  const binarios = await localizarPostgres(join(root, 'vendor')),
    local = new PostgresLocal({ carpeta: join(carpeta, 'motor'), binarios, cifrar, descifrar })
  try {
    await local.iniciar()
    const cred = JSON.parse(descifrar(await fs.readFile(join(carpeta, 'motor', 'conexion.enc'))))
    const config = {
      ...cred.conexion,
      user: 'ruizcacao_bootstrap',
      password: cred.passwordAdministrador,
      database: 'postgres'
    }
    const archivo = join(carpeta, 'conexion-test.json')
    await fs.writeFile(archivo, JSON.stringify(config), { mode: 0o600 })
    const suites = [
      'novedades.cjs',
      'anulaciones-dominio.cjs',
      'anulaciones-v7.cjs',
      'integration.cjs',
      'migracion.cjs',
      'migracion-v2.cjs',
      'migracion-v3.cjs',
      'migracion-v5.cjs',
      'migracion-v6.cjs',
      'v3.cjs',
      'rc.cjs',
      'postgres-local.cjs'
    ]
    for (const suite of suites)
      await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [join(__dirname, suite), suite === 'postgres-local.cjs' ? carpeta : archivo],
          {
            windowsHide: true,
            stdio: 'inherit',
            env: { ...process.env, RCM_TEST_BIN: binarios, RCM_TEST_ARTIFACTS: carpeta }
          }
        )
        child.on('error', reject)
        child.on('exit', (code) => (code === 0 ? resolve() : reject(Error(suite + ' falló.'))))
      })
    await fs.unlink(archivo)
    console.log('Suite PostgreSQL completa. Artefactos de prueba: ' + carpeta)
  } finally {
    await fs.unlink(join(carpeta, 'conexion-test.json')).catch(() => {})
    await local.detener()
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
