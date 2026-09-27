// Herramienta exclusiva de desarrollo/soporte. No forma parte del login del cliente.
const { app, safeStorage } = require('electron')
const { join } = require('node:path')
const fs = require('node:fs/promises')
const { load, root } = require('../tests/loader.cjs')
const { ErrorNegocio } = load(join(root, 'src/shared/errorNegocio.ts'))
const { traducirError, configurarLogs } = load(join(root, 'src/main/database/errores.ts'))
app.setName('RuizCacao Manager')
configurarLogs(join(app.getPath('userData'), 'logs'))
app
  .whenReady()
  .then(async () => {
    if (
      await fs.access(join(app.getPath('userData'), 'restauracion-pendiente')).then(
        () => true,
        () => false
      )
    )
      throw new ErrorNegocio('Completa la restauración pendiente antes de abrir la administración.')
    const { PostgresLocal, localizarPostgres, exportarConexionPgAdmin } = load(
      join(root, 'src/main/database/postgres-local.ts')
    )
    const { Respaldos } = load(join(root, 'src/main/database/respaldos.ts'))
    const { BaseLocal } = load(join(root, 'src/main/database/base.ts'))
    if (!safeStorage.isEncryptionAvailable())
      throw new ErrorNegocio(
        'No hay cifrado Windows disponible. Ejecuta este comando desde tu terminal de Windows, fuera del entorno restringido del asistente.'
      )
    let anterior
    try {
      anterior = await fs.readFile(join(app.getPath('userData'), 'postgres.enc'))
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
    let local, config
    if (anterior) config = JSON.parse(safeStorage.decryptString(anterior))
    else {
      local = new PostgresLocal({
        carpeta: join(app.getPath('userData'), 'postgres'),
        binarios: await localizarPostgres(process.resourcesPath),
        cifrar: (s) => safeStorage.encryptString(s),
        descifrar: (b) => safeStorage.decryptString(b)
      })
      config = await local.iniciar()
    }
    const base = new BaseLocal(config, {
      respaldos: new Respaldos(
        config,
        await localizarPostgres(process.resourcesPath),
        join(app.getPath('userData'), 'backups')
      )
    })
    let iniciada = false
    try {
      try {
        await base.iniciar()
        iniciada = true
      } catch (e) {
        if (!e.message.includes('Otra instancia')) throw e
      }
      const version = (
        await base.pool.query('SELECT max(version) AS version FROM ruizcacao.migraciones')
      ).rows[0].version
      if (version !== 7)
        throw new ErrorNegocio(
          'La app abierta todavía usa el esquema anterior. Ciérrala normalmente y vuelve a ejecutar npm run db:pgadmin para aplicar la migración.'
        )
      const tablas = (
        await base.pool.query(
          "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='ruizcacao' AND table_type='BASE TABLE'"
        )
      ).rows[0].n
      const documentos = (
        await base.pool.query(
          "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='ruizcacao' AND column_name='datos'"
        )
      ).rows[0].n
      console.log(
        `Esquema verificado: versión ${version}, ${tablas} tablas, ${documentos} columnas de documentos comerciales.`
      )
    } finally {
      if (iniciada) await base.cerrar()
      else await base.desconectar()
    }
    const carpeta = await exportarConexionPgAdmin(
      config,
      join(app.getPath('userData'), 'postgres', 'administracion')
    )
    console.log(
      'Base: ' +
        config.database +
        ' | Host: ' +
        config.host +
        ' | Puerto: ' +
        config.port +
        ' | Usuario: ' +
        config.user
    )
    console.log('Importar en pgAdmin: ' + join(carpeta, 'servidor-pgadmin.json'))
    console.log('Passfile (privado, no adjuntar al informe): ' + join(carpeta, 'pgpass.conf'))
    console.log(
      local
        ? 'El motor queda disponible para pgAdmin. La aplicación lo reutilizará y lo detendrá al cerrarse.'
        : 'Se conservó la conexión PostgreSQL existente; no se creó otra base.'
    )
    app.exit(0)
  })
  .catch((error) => {
    console.error(traducirError(error, { modulo: 'administracion', operacion: 'pgadmin' }))
    app.exit(1)
  })
