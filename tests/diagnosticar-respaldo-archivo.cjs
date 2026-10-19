// Solo staging efímero; el archivo original nunca se modifica.
if (!process.versions.electron) require('./electron-node-bridge.cjs')
const { app, safeStorage } = require('electron')
const fs = require('node:fs/promises')
const fss = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { load, root } = require('./loader.cjs')
const archivo = path.resolve(process.argv[2])
const carpeta = fss.mkdtempSync(path.join(os.tmpdir(), 'rcm-diagnostico-real-'))
app.setPath('userData', carpeta)
const L = (n) => load(root + '/src/main/database/' + n + '.ts')
const { WorkspaceRestorePostgres } = L('restore-workspace')
const { localizarPostgres } = L('postgres-local')
const { ValidadorRestorePostgres, firmaEstructura } = L('restore-validacion')
const { integridadArchivo } = L('respaldo-integridad')
const comparar = ValidadorRestorePostgres.prototype.comparar
const evidencia = { fases: [], comparaciones: [] }
const huella = (valor) =>
  valor === undefined ? null : createHash('sha256').update(valor).digest('hex')
ValidadorRestorePostgres.prototype.comparar = async function (pool, referencia, version) {
  let sql
  await firmaEstructura({
    query: async (texto) => {
      sql = texto
      return { rows: [{ firma: '' }] }
    }
  })
  // El UNION heredaba el tipo name (63 bytes) de la primera rama.
  const normalizada = sql.replace('c.relname nombre', 'c.relname::text nombre')
  const objetos = normalizada.replace(
    /\) SELECT md5[\s\S]+$/,
    ') SELECT tipo,nombre,definicion FROM objetos ORDER BY tipo,nombre,definicion'
  )
  const actual = (await pool.query(objetos)).rows
  const esperado = (await referencia.query(objetos)).rows
  const clave = (r) => r.tipo + ':' + r.nombre
  assert.equal(new Set(actual.map(clave)).size, actual.length, 'Identidades actual únicas')
  assert.equal(new Set(esperado.map(clave)).size, esperado.length, 'Identidades referencia únicas')
  const a = new Map(actual.map((r) => [clave(r), r]))
  const b = new Map(esperado.map((r) => [clave(r), r]))
  const diferencias = [...new Set([...a.keys(), ...b.keys()])].sort().flatMap((k) => {
    const x = a.get(k),
      y = b.get(k)
    if (x?.definicion === y?.definicion) return []
    return [
      {
        schema: 'ruizcacao',
        tipo: (x || y).tipo,
        nombre: (x || y).nombre,
        estado: !x ? 'missing' : !y ? 'extra' : 'different',
        huellaActual: huella(x?.definicion),
        huellaEsperada: huella(y?.definicion)
      }
    ]
  })
  evidencia.comparaciones.push({
    version,
    objetosActual: actual.length,
    objetosReferencia: esperado.length,
    firmaActual: (await pool.query(normalizada)).rows[0].firma,
    firmaReferencia: (await referencia.query(normalizada)).rows[0].firma,
    diferencias
  })
  return comparar.call(this, pool, referencia, version)
}
app
  .whenReady()
  .then(async () => {
    let preparado
    L('errores').configurarLogs(path.join(carpeta, 'logs'))
    try {
      evidencia.antes = await integridadArchivo(archivo)
      const workspace = new WorkspaceRestorePostgres({
        raiz: path.join(carpeta, 'workspaces'),
        binarios: await localizarPostgres(path.join(root, 'vendor')),
        cifrar: (s) => safeStorage.encryptString(s),
        descifrar: (b) => safeStorage.decryptString(b)
      })
      preparado = await workspace.preparar(archivo, {
        fase: (fase) => {
          evidencia.fases.push(fase)
          console.log('fase: ' + fase)
        }
      })
      evidencia.preparacion = 'PASS'
    } catch (e) {
      L('respaldo-diagnostico').registrarFalloRespaldo(e, 'diagnostico_archivo')
      evidencia.preparacion = 'FAIL'
      evidencia.codigo = e.codigoTecnico
      evidencia.fase = e.fase
    } finally {
      await preparado?.limpiar()
      evidencia.despues = await integridadArchivo(archivo)
      assert.deepEqual(evidencia.despues, evidencia.antes)
      const destino = path.resolve(
        process.argv[3] ||
          path.join(root, 'docs/evidencias-fix-restore-1.3.1/catalogo-corregido-antes.json')
      )
      await fs.writeFile(destino, JSON.stringify(evidencia, null, 2) + '\n')
      console.log(
        JSON.stringify({
          preparacion: evidencia.preparacion,
          codigo: evidencia.codigo,
          fase: evidencia.fase
        })
      )
    }
  })
  .then(() => app.exit(evidencia.preparacion === 'PASS' ? 0 : 1))
  .catch((e) => {
    console.error(e.name)
    app.exit(1)
  })
