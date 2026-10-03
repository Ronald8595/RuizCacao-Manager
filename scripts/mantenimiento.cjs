const { writeFile, unlink } = require('node:fs/promises')
const { entorno, app, load, root } = require('./entorno-db.cjs')
const { Pool } = require('pg'),
  { resolve, join } = require('node:path')
const { createInterface } = require('node:readline/promises')
const { traducirError } = load(join(root, 'src/main/database/errores.ts'))
const { ErrorNegocio } = load(join(root, 'src/shared/errorNegocio.ts'))
const { publicarAviso } = load(join(root, 'src/main/database/notificaciones.ts'))
app
  .whenReady()
  .then(async () => {
    const { config, opciones } = await entorno(),
      pool = new Pool({ ...config, max: 3 }),
      backup = opciones.respaldos
    try {
      if (process.argv.includes('backup')) {
        try {
          const m = await backup.crear(pool, 'manual')
          console.log('Respaldo verificado: ' + join(backup.carpeta, m.archivo))
          return
        } catch (error) {
          await pool
            .query('SELECT CURRENT_DATE::text fecha')
            .then((r) =>
              publicarAviso(
                pool,
                'Respaldo pendiente',
                'No se pudo crear el respaldo manual. Contacta con soporte.',
                'respaldo_manual_fallido:' + r.rows[0].fecha,
                'inicio'
              )
            )
            .catch(() => {})
          await pool
            .query(
              "INSERT INTO ruizcacao.auditoria(accion,responsable) VALUES('respaldo_fallido','Soporte')"
            )
            .catch(() => {})
          throw error
        }
      }
      if (!process.argv.includes('restore')) throw new ErrorNegocio('Comando inválido.')
      const i = process.argv.indexOf('--file')
      if (i < 0 || !process.argv[i + 1])
        throw new ErrorNegocio('Indica --file con un respaldo custom verificado.')
      const archivo = resolve(process.argv[i + 1]),
        m = await backup.validarRestauracion(archivo)
      const db = await pool.connect()
      try {
        if (!(await db.query('SELECT pg_try_advisory_lock(7302027) AS ok')).rows[0].ok)
          throw new ErrorNegocio('Cierra RuizCacao Manager antes de restaurar.')
        const version = Number(
          (await db.query('SELECT max(version) AS v FROM ruizcacao.migraciones')).rows[0].v
        )
        const major = Math.floor(
          Number((await db.query('SHOW server_version_num')).rows[0].server_version_num) / 10000
        )
        if (
          m.base !== config.database ||
          m.esquema_version !== version ||
          m.postgres_major !== major
        )
          throw new ErrorNegocio(
            'El respaldo debe corresponder a esta base y a las mismas versiones de esquema y PostgreSQL. Usa una base aislada para recuperar versiones anteriores.'
          )
        const entrada = createInterface({ input: process.stdin, output: process.stdout })
        let confirmacion
        try {
          confirmacion = await entrada.question(
            'Se reemplazarán los datos de ' +
              config.database +
              '. Escribe RESTAURAR ' +
              config.database +
              ' para continuar: '
          )
        } finally {
          entrada.close()
        }
        if (confirmacion !== 'RESTAURAR ' + config.database) {
          console.log('Restauración cancelada.')
          return
        }
        await backup.crear(pool, 'pre_restauracion')
        const marcador = join(app.getPath('userData'), 'restauracion-pendiente')
        await writeFile(marcador, 'Restauración técnica pendiente de completar.\n', { mode: 0o600 })
        await db.query('SELECT pg_advisory_lock(7302026)')
        try {
          await backup.herramienta('pg_restore', [
            ...backup.argumentosConexion(),
            '--clean',
            '--if-exists',
            '--single-transaction',
            '--exit-on-error',
            '--no-owner',
            '--no-privileges',
            '--schema=ruizcacao',
            archivo
          ])
          await db.query('BEGIN')
          if (version >= 3)
            await db.query(
              "UPDATE ruizcacao.solicitudes_recuperacion SET estado='invalidada' WHERE estado='activa'"
            )
          await db.query(
            "INSERT INTO ruizcacao.auditoria(accion,responsable) VALUES('restauracion','Soporte')"
          )
          await db.query('COMMIT')
          await unlink(marcador)
        } catch (error) {
          await db.query('ROLLBACK').catch(() => {})
          throw error
        } finally {
          await db.query('SELECT pg_advisory_unlock(7302026)')
        }
        console.log(
          'Restauración terminada. Abre la aplicación para validar los datos recuperados.'
        )
      } finally {
        await db.query('SELECT pg_advisory_unlock(7302027)').catch(() => {})
        db.release()
      }
    } finally {
      await pool.end()
    }
  })
  .then(() => app.exit(0))
  .catch((e) => {
    console.error(traducirError(e, { modulo: 'mantenimiento', operacion: 'cli' }))
    app.exit(1)
  })
