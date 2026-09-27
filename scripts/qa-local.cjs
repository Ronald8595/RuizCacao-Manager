// Soporte local explícito. No se distribuye; nunca imprime credenciales PostgreSQL.
const { app, safeStorage } = require('electron'),
  fs = require('node:fs/promises'),
  path = require('node:path')
const { load, root } = require('../tests/loader.cjs'),
  { Client } = require('pg'),
  { randomBytes } = require('node:crypto')
const { BaseLocal, hoy } = load(path.join(root, 'src/main/database/base.ts'))
const { crearDataset, marca } = require('./dataset-qa.cjs')
app.setName('RuizCacao Manager')
function preguntar(texto, oculta = false) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw Error(
      'La entrada interactiva no está disponible en este proceso de Electron. Usa las variables temporales RUIZCACAO_QA_CONFIRM y RUIZCACAO_QA_PASSWORD desde PowerShell.'
    )
  }
  process.stdout.write(texto)
  if (!oculta) {
    const rl = require('node:readline').createInterface({
      input: process.stdin,
      output: process.stdout
    })
    return new Promise((resolve) =>
      rl.question('', (s) => {
        rl.close()
        resolve(s.trim())
      })
    )
  }
  return new Promise((resolve, reject) => {
    let valor = ''
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    const finalizar = () => {
      process.stdin.off('data', leer)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write('\n')
    }
    const leer = (s) => {
      for (const c of s) {
        if (c === '\r' || c === '\n') {
          finalizar()
          resolve(valor)
          return
        }
        if (c === '\u0003') {
          finalizar()
          reject(Error('Cancelado.'))
          return
        }
        if (c === '\u007f' || c === '\b') valor = valor.slice(0, -1)
        else if (c >= ' ') valor += c
      }
    }
    process.stdin.on('data', leer)
  })
}
app
  .whenReady()
  .then(async () => {
    const carpeta = app.getPath('userData')
    if (!safeStorage.isEncryptionAvailable())
      throw Error(
        'Windows no permite descifrar la conexión en este entorno. Usa tu terminal habitual.'
      )
    let config
    try {
      config = JSON.parse(
        safeStorage.decryptString(await fs.readFile(path.join(carpeta, 'postgres.enc')))
      )
    } catch {
      throw Error(
        'No se pudo leer la conexión protegida de Windows. No se creó ni modificó ninguna base.'
      )
    }
    if (
      config.database !== 'ruizcacao_manager' ||
      !['127.0.0.1', 'localhost', '::1'].includes(config.host)
    )
      throw Error('Esta herramienta solo admite ruizcacao_manager local.')
    const c = new Client({ ...config, connectionTimeoutMillis: 5000 })
    let usuario
    try {
      await c.connect()
      const version = (await c.query('SELECT max(version) version FROM ruizcacao.migraciones'))
        .rows[0].version
      if (version !== 7)
        throw Error('Se requiere el esquema 7 existente; esta herramienta no migra.')
      usuario = (await c.query('SELECT nombre FROM ruizcacao.administrador LIMIT 1')).rows[0]
        ?.nombre
      console.log('Esquema 4. Usuario: ' + (usuario || 'No existe; no se ha creado ninguno.'))
    } finally {
      await c.end()
    }
    if (!process.argv.includes('--crear')) return
    const confirmacion =
      (process.env.RUIZCACAO_QA_CONFIRM || '').trim() ||
      (await preguntar('Escribe CREAR QA para insertar datos de prueba en ruizcacao_manager: '))
    if (confirmacion !== 'CREAR QA') throw Error('Cancelado.')
    const { Respaldos } = load(path.join(root, 'src/main/database/respaldos.ts'))
    const { localizarPostgres } = load(path.join(root, 'src/main/database/postgres-local.ts'))
    const respaldos = new Respaldos(
      config,
      await localizarPostgres(process.resourcesPath),
      path.join(carpeta, 'backups')
    )
    const db = new BaseLocal(config, { respaldos })
    let iniciada = false
    try {
      // El candado de instancia impide usar QA con la aplicación abierta.
      await db.iniciar()
      iniciada = true
      let password
      if (usuario) {
        password =
          process.env.RUIZCACAO_QA_PASSWORD ||
          (await preguntar('Contraseña actual del usuario (oculta): ', true))
        if (!password) throw Error('No se recibió la contraseña del usuario.')
      } else {
        usuario = 'QA Administrador'
        password = randomBytes(24).toString('base64url')
        await db.crearAdministrador(usuario, password)
        console.log('Guarda esta contraseña temporal; se muestra una sola vez: ' + password)
      }
      await db.login(usuario, password)
      const manifiesto = path.join(carpeta, 'qa-final-v5.json')
      let registro
      try {
        registro = JSON.parse(await fs.readFile(manifiesto, 'utf8'))
      } catch (e) {
        if (e.code !== 'ENOENT') throw e
      }
      if (registro?.completo) {
        console.log(
          'El conjunto QA ya está registrado. No se agregan duplicados. Manifiesto: ' + manifiesto
        )
        return
      }
      if (!registro) {
        const respaldo = await respaldos.crear(db.pool, 'manual')
        registro = {
          marca,
          fecha: hoy(),
          completo: false,
          respaldoPrevio: path.join(respaldos.carpeta, respaldo.archivo),
          antes: (await db.cargar()).datos
        }
        await fs.writeFile(manifiesto, JSON.stringify(registro, null, 2), { flag: 'wx' })
      }
      if (registro.fecha !== hoy())
        throw Error(
          'QA quedó incompleto en otra fecha. Revisa el manifiesto antes de continuar; no se duplicaron operaciones.'
        )
      const estado = (await db.cargar()).datos.jornada.estado
      if (estado === 'interrumpida')
        throw Error('Resuelve primero la jornada interrumpida desde la aplicación.')
      if (estado === 'no_iniciada') await db.jornada('abrir')
      else if (estado === 'finalizada') await db.jornada('reabrir', password)
      registro.operaciones = await crearDataset(db, registro.fecha)
      const antesCerrar = await db.cargar()
      await db.jornada('cerrar')
      const despuesCerrar = await db.cargar()
      if (JSON.stringify(antesCerrar.datos.cuentas) !== JSON.stringify(despuesCerrar.datos.cuentas))
        throw Error('No coincidieron las cuentas después del cierre.')
      registro.completo = true
      registro.despues = despuesCerrar
      registro.validacion =
        'Cierre de jornada conserva cuentas. Pendiente comprobación visual al abrir la app.'
      await fs.writeFile(manifiesto, JSON.stringify(registro, null, 2))
      console.log(
        'QA creado mediante BaseLocal. Jornada finalizada. Registros y estado: ' + manifiesto
      )
      console.log(
        'Abre la app, reabre con contraseña y comprueba compras, ventas, cuentas, reportes y avisos QA FINAL V5.'
      )
    } finally {
      if (iniciada) await db.cerrar()
      else await db.desconectar()
    }
  })
  .then(() => app.exit(0))
  .catch((e) => {
    const mensaje = String(e?.message || '')
    const seguro =
      mensaje.includes('contraseña') ||
      mensaje.startsWith('No se pudo') ||
      mensaje.startsWith('Windows') ||
      mensaje.startsWith('La entrada interactiva') ||
      mensaje.startsWith('Cancelado') ||
      mensaje.startsWith('Se requiere el esquema') ||
      mensaje.startsWith('Esta herramienta solo admite') ||
      mensaje.startsWith('Resuelve primero') ||
      mensaje.startsWith('QA quedó incompleto') ||
      mensaje.startsWith('No coincidieron las cuentas')
    console.error(
      seguro
        ? mensaje
        : 'QA no completado. Revisa conexión, sesión, jornada y terminal interactiva.'
    )
    app.exit(1)
  })
