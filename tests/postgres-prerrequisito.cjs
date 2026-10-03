// Fallos de ejecutables simulados; ningún clúster real se modifica aquí.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const { join, basename } = require('node:path')
const childProcess = require('node:child_process')
const { promisify } = require('node:util')
const original = childProcess.execFile
const ejecutarReal = promisify(original)
let escenario = {},
  llamadas = []
const simulado = function () {
  throw Error('Usar la interfaz promisificada del doble de prueba.')
}
simulado[promisify.custom] = async (file, args, options) => {
  const nombre = basename(file)
  if (!['postgres.exe', 'initdb.exe', 'pg_ctl.exe', 'psql.exe'].includes(nombre))
    return ejecutarReal(file, args, options)
  llamadas.push({ nombre, args, options })
  if (escenario.binario === nombre)
    throw Object.assign(new Error('SECRETO contraseña DLL C:\\privado'), {
      code: escenario.code,
      stderr: 'SECRETO VCRUNTIME140.dll',
      stdout: 'SECRETO'
    })
  if (args[0] === '--version')
    return { stdout: `${nombre} (PostgreSQL) ${escenario.version || '18.6'}\n` }
  if (nombre === 'initdb.exe') {
    const provisional = args[args.indexOf('-D') + 1]
    await fs.mkdir(provisional)
    await fs.writeFile(join(provisional, 'intento-incompleto'), 'conservar')
    throw Object.assign(new Error('SECRETO inicio.pw'), { code: 1, stderr: 'SECRETO' })
  }
  throw Error('La prueba no debe llegar al arranque de una base.')
}
childProcess.execFile = simulado
const { load, root } = require('./loader.cjs')
const { PostgresLocal, faltaRuntimeWindows } = load(
  join(root, 'src/main/database/postgres-local.ts')
)
childProcess.execFile = original
const { configurarLogs } = load(join(root, 'src/main/database/errores.ts'))
async function main() {
  const temporal = await fs.mkdtemp(join(os.tmpdir(), 'rcm-prerrequisito-'))
  configurarLogs(join(temporal, 'logs'))
  function motor(nombre) {
    return new PostgresLocal({
      carpeta: join(temporal, nombre),
      binarios: join(temporal, 'bin-simulado'),
      cifrar: (s) => Buffer.from(s),
      descifrar: (b) => b.toString('utf8')
    })
  }
  function seguro(error) {
    assert.doesNotMatch(error.message, /SECRETO|DLL|VCRUNTIME|0x|107374|privado|inicio\.pw/i)
    return true
  }
  assert.ok(faltaRuntimeWindows({ code: -1073741515 }))
  assert.ok(faltaRuntimeWindows({ code: 3221225781 }))
  assert.ok(!faltaRuntimeWindows({ code: 1 }))
  assert.ok(!faltaRuntimeWindows({ code: 'ENOENT' }))
  for (const binario of ['postgres.exe', 'initdb.exe', 'pg_ctl.exe', 'psql.exe']) {
    escenario = { binario, code: -1073741515 }
    llamadas = []
    await assert.rejects(motor(binario).iniciar(), (error) => {
      seguro(error)
      assert.match(error.message, /componente de Microsoft/)
      return true
    })
    await assert.rejects(fs.access(join(temporal, binario)), { code: 'ENOENT' })
    assert.ok(llamadas.every((l) => l.args[0] === '--version' && l.options.windowsHide))
  }
  escenario = { binario: 'postgres.exe', code: 'ENOENT' }
  await assert.rejects(motor('ausente').iniciar(), seguro)
  escenario = { version: 'sin version reconocible' }
  await assert.rejects(motor('version-invalida').iniciar(), seguro)
  escenario = {}
  llamadas = []
  await assert.rejects(motor('initdb-fallo').iniciar(), seguro)
  const parcial = join(temporal, 'initdb-fallo', 'data-inicializando', 'intento-incompleto')
  assert.equal(await fs.readFile(parcial, 'utf8'), 'conservar')
  await assert.rejects(fs.access(join(temporal, 'initdb-fallo', 'inicio.pw')), { code: 'ENOENT' })
  await assert.rejects(fs.access(join(temporal, 'initdb-fallo', 'data')), { code: 'ENOENT' })
  llamadas = []
  await assert.rejects(motor('initdb-fallo').iniciar(), /quedó interrumpida/)
  assert.equal(await fs.readFile(parcial, 'utf8'), 'conservar')
  assert.equal(llamadas.length, 4)
  for (const pgVersion of [null, '18']) {
    const nombre = pgVersion ? 'valido' : 'data-sin-version'
    await fs.mkdir(join(temporal, nombre, 'data'), { recursive: true })
    await fs.writeFile(join(temporal, nombre, 'data', 'sentinela'), 'original')
    if (pgVersion) await fs.writeFile(join(temporal, nombre, 'data', 'PG_VERSION'), pgVersion)
    await assert.rejects(motor(nombre).iniciar(), /No se sobrescribirá/)
    assert.equal(await fs.readFile(join(temporal, nombre, 'data', 'sentinela'), 'utf8'), 'original')
    if (pgVersion)
      assert.equal(
        await fs.readFile(join(temporal, nombre, 'data', 'PG_VERSION'), 'utf8'),
        pgVersion
      )
  }
  const clave = await fs.readFile(join(temporal, 'initdb-fallo', 'conexion.enc'))
  for (const pgVersion of [null, '17']) {
    const nombre = pgVersion ? 'mayor-incompatible' : 'data-incompleto-con-clave'
    await fs.mkdir(join(temporal, nombre, 'data'), { recursive: true })
    await fs.writeFile(join(temporal, nombre, 'conexion.enc'), clave)
    await fs.writeFile(join(temporal, nombre, 'data', 'sentinela'), 'original')
    if (pgVersion) await fs.writeFile(join(temporal, nombre, 'data', 'PG_VERSION'), pgVersion)
    await assert.rejects(motor(nombre).iniciar(), pgVersion ? /no coincide/ : /No se sobrescribirá/)
    assert.deepEqual(await fs.readFile(join(temporal, nombre, 'conexion.enc')), clave)
    assert.equal(await fs.readFile(join(temporal, nombre, 'data', 'sentinela'), 'utf8'), 'original')
    if (pgVersion)
      assert.equal(
        await fs.readFile(join(temporal, nombre, 'data', 'PG_VERSION'), 'utf8'),
        pgVersion
      )
  }
  const logs = await fs.readFile(join(temporal, 'logs', 'incidencias.jsonl'), 'utf8')
  assert.doesNotMatch(logs, /SECRETO|DLL|privado|inicio\.pw|bin-simulado/)
  const entradas = logs.trim().split('\n').map(JSON.parse)
  assert.equal(entradas.filter((e) => e.codigo === -1073741515).length, 4)
  assert.ok(entradas.some((e) => e.operacion === 'inicializar_cluster' && e.codigo === 1))
  console.log(
    'OK: runtime ausente en los cuatro binarios, versión inválida, logs sanitizados, PW retirado e intentos/data existentes conservados.'
  )
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
