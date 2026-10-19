const { load, root } = require('./loader.cjs')
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict')
const { randomBytes, randomUUID, generateKeyPairSync } = require('node:crypto')
const { Pool } = require('pg')
const { spawn } = require('node:child_process')
const fsSync = require('node:fs')
const L = (n) => load(path.join(root, 'src/main/database', n + '.ts'))
const { PostgresLocal, localizarPostgres } = L('postgres-local'),
  { BaseLocal, hoy } = L('base'),
  { Respaldos } = L('respaldos')
const { GenerarRespaldoPortable } = L('respaldo-portable'),
  { PaqueteRespaldoZip } = L('respaldo-paquete'),
  { AlmacenRespaldoLocal } = L('respaldo-storage'),
  { ExportadorRespaldoPostgres } = L('respaldo-postgres')
const { WorkspaceRestorePostgres } = L('restore-workspace'),
  { DestinoRestorePostgres } = L('restore-destino'),
  { PromocionPostgres } = L('restore-promocion'),
  { RestaurarRespaldoSeguro } = L('restore-caso')
const { MigracionesPostgres, versionHistorial } = L('migration-runner'),
  { hashSecreto } = L('seguridad'),
  { procesosPostgresActivos } = L('proceso-postgres'),
  { operacionesRespaldos } = L('operacion-respaldo')
const { crearDataset } = require('../scripts/dataset-qa.cjs'),
  { insertarRendimiento } = require('../scripts/seed-rendimiento-core.cjs')
// Solo para clústeres efímeros: claves diferentes y sin consultar safeStorage/AppData.
const cripto = () => {
  const k = randomBytes(32)
  return {
    cifrar: (s) => Buffer.from(s).map((v, i) => v ^ k[i % k.length]),
    descifrar: (b) =>
      Buffer.from(b)
        .map((v, i) => v ^ k[i % k.length])
        .toString('utf8')
  }
}
async function firmas(pool) {
  const result = {}
  for (const tabla of [
    'usuarios',
    'clientes',
    'proveedores',
    'empleados',
    'compras',
    'ventas',
    'cuentas',
    'movimientos_cuenta',
    'movimientos_stock',
    'gastos',
    'jornadas',
    'existencias',
    'configuracion',
    'notificaciones'
  ])
    result[tabla] = (
      await pool.query(
        `SELECT count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) hash FROM ruizcacao.${tabla} t`
      )
    ).rows[0]
  return result
}
async function main() {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'ruizcacao-restore-tests-')),
    binarios = process.env.RCM_TEST_BIN || (await localizarPostgres(path.join(root, 'vendor')))
  const evidencia = { fecha: new Date().toISOString(), pruebas: [], perfiles: [], carpeta }
  const destinoEvidencia = process.env.RCM_TEST_ARTIFACTS || carpeta
  let sampler, finSampler
  const faseSampler = path.join(carpeta, 'perfil-fase.json'),
    stopSampler = path.join(carpeta, 'perfil.stop'),
    recursos = path.join(destinoEvidencia, 'restore-recursos.jsonl')
  if (process.env.RCM_RESTORE_PROFILE === '1') {
    fsSync.writeFileSync(faseSampler, JSON.stringify({ caso: 'fuera_medicion', fase: '' }))
    sampler = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(root, 'scripts/medir-restore-recursos.ps1'),
        '-MainPid',
        String(process.pid),
        '-Raiz',
        carpeta,
        '-Salida',
        recursos,
        '-Parada',
        stopSampler,
        '-Fase',
        faseSampler
      ],
      { windowsHide: true, shell: false, stdio: 'ignore' }
    )
    finSampler = new Promise((resolve, reject) => {
      sampler.on('error', reject)
      sampler.on('close', (code) =>
        code === 0 ? resolve() : reject(Error('Falló el muestreo de recursos Windows.'))
      )
    })
    evidencia.runtime = {
      electron: process.versions.electron || null,
      node: process.versions.node,
      renderer: 'N/A: sin ventanas'
    }
  }
  const guardar = () =>
    fs.writeFile(
      path.join(destinoEvidencia, 'restore-seguro.json'),
      JSON.stringify(evidencia, null, 2)
    )
  const motorA = new PostgresLocal({ carpeta: path.join(carpeta, 'A'), binarios, ...cripto() }),
    motorB = new PostgresLocal({ carpeta: path.join(carpeta, 'B'), binarios, ...cripto() })
  const paquete = new PaqueteRespaldoZip(),
    clave = 'Prueba-restaurar-2026-segura!',
    publica = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' })
  let a,
    b,
    configB,
    backupA,
    configA,
    fallo = '',
    inMantenimiento = false
  const check = async (nombre, fn) => {
    await fn()
    evidencia.pruebas.push(nombre)
    console.log('OK restore ' + nombre)
    await guardar()
  }
  const punto = async (nombre) => {
    if (fallo === nombre) throw Error('Fallo inyectado ' + nombre)
  }
  const generar = async (pool, config, etiqueta, ctx = {}) =>
    new GenerarRespaldoPortable(
      new ExportadorRespaldoPostgres(
        new Respaldos(config, binarios, path.join(carpeta, 'legacyA')),
        pool
      ),
      paquete,
      new AlmacenRespaldoLocal(
        path.join(carpeta, 'copias Ñ con espacios', etiqueta),
        path.join(carpeta, 'trabajo-backup')
      ),
      async () => {},
      '1.2.1'
    ).ejecutar(ctx)
  const servicio = () => {
    const journal = motorB.journalRestauracion(),
      d = new DestinoRestorePostgres(
        motorB,
        binarios,
        path.join(carpeta, 'seguridadB'),
        () => b.pool
      )
    const respaldo = d.respaldoSeguridad.bind(d)
    d.respaldoSeguridad = async (ctx) => {
      await punto('antes_pre_restauracion')
      await respaldo(ctx)
      await punto('despues_pre_restauracion')
    }
    const validar = d.validarFinal.bind(d)
    d.validarFinal = async (p) => {
      await punto('validacion_final')
      await validar(p)
    }
    return new RestaurarRespaldoSeguro(
      new WorkspaceRestorePostgres({
        raiz: path.join(carpeta, 'workspaces'),
        binarios,
        ...cripto()
      }),
      d,
      journal,
      new PromocionPostgres((fn) => motorB.conAdministracionRestauracion(fn), journal, punto),
      {
        entrar: async () => {
          inMantenimiento = true
          await b.transaccion(async () => {}, true)
        },
        cerrarPool: async () => {
          if (b) {
            await b.desconectarParaRestauracion()
            b = undefined
            await punto('pool_cerrado')
          }
        },
        reconectar: async () => {
          if (!b) {
            b = new BaseLocal(configB)
            await b.iniciar()
          }
        },
        salir: (seguro) => {
          inMantenimiento = !seguro
        }
      }
    )
  }
  const perfil = async (nombre, fn) => {
    if (sampler) fsSync.writeFileSync(faseSampler, JSON.stringify({ caso: nombre, fase: 'inicio' }))
    const inicio = performance.now(),
      cpu = process.cpuUsage(),
      mem0 = process.memoryUsage().rss,
      fases = []
    let peak = mem0
    const timer = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss)
    }, 20)
    const fase = (f) => {
      if (sampler) fsSync.writeFileSync(faseSampler, JSON.stringify({ caso: nombre, fase: f }))
      const t = performance.now()
      if (fases.length) fases.at(-1).ms = t - fases.at(-1).desde
      fases.push({ fase: f, desde: t, ms: 0 })
      if (fallo === f) throw Error('Fallo inyectado ' + f)
    }
    try {
      return await fn(fase)
    } finally {
      clearInterval(timer)
      const ms = performance.now() - inicio,
        c = process.cpuUsage(cpu)
      if (fases.length) fases.at(-1).ms = performance.now() - fases.at(-1).desde
      evidencia.perfiles.push({
        nombre,
        total_ms: ms,
        cpu_main_ms: (c.user + c.system) / 1000,
        cpu_main_porcentaje: ((c.user + c.system) / 1000 / ms) * 100,
        rss_antes: mem0,
        rss_pico: peak,
        rss_despues: process.memoryUsage().rss,
        fases: fases.map(({ fase, ms }) => ({ fase, ms })),
        hijos_residuales: procesosPostgresActivos.size
      })
      if (sampler)
        fsSync.writeFileSync(faseSampler, JSON.stringify({ caso: 'fuera_medicion', fase: '' }))
    }
  }
  try {
    await check(
      'modo externo o sin control privado rechazado antes de acceder a datos',
      async () => {
        await assert.rejects(L('conexion').crearRestauradorInterno(), /externo/)
      }
    )
    await check('inactivo no inicia herramientas ni operaciones', async () => {
      const estado = operacionesRespaldos.estado
      await perfil('inactivo', () => new Promise((r) => setTimeout(r, 1500)))
      assert.deepEqual(operacionesRespaldos.estado, estado)
      assert.equal(procesosPostgresActivos.size, 0)
    })
    configA = await motorA.iniciar()
    a = new BaseLocal(configA, { publica })
    await a.iniciar()
    await a.crearAdministrador('Principal restore', clave)
    await a.login('Principal restore', clave)
    await a.crearUsuario('Operador restore', clave)
    await a.jornada('abrir')
    await crearDataset(a, hoy())
    await a.solicitarRecuperacion('Principal restore')
    const identidadA = (await a.pool.query('SELECT installation_id FROM ruizcacao.instalacion'))
      .rows[0].installation_id
    const hashesUsuarios = (
      await a.pool.query('SELECT id,password_hash,rol FROM ruizcacao.usuarios ORDER BY id')
    ).rows
    backupA = await perfil('backup_pequeno', (fase) =>
      generar(a.pool, configA, 'pequeno', { fase })
    )
    const pequeno = await firmas(a.pool)
    const sql = await a.pool.connect()
    try {
      await insertarRendimiento(sql, {
        clientes: 1000,
        proveedores: 500,
        compras: 10000,
        ventas: 15000,
        gastos: 3000
      })
    } finally {
      sql.release()
    }
    const grande = await firmas(a.pool),
      backupGrande = await perfil('backup_grande', (fase) =>
        generar(a.pool, configA, 'grande', { fase })
      )
    await check('cancelación backup durante proceso, hash y empaquetado', async () => {
      for (const objetivo of ['exportando', 'hash', 'empaquetando']) {
        const abort = new AbortController()
        await assert.rejects(
          perfil('cancelar_backup_' + objetivo, (fase) =>
            generar(a.pool, configA, 'cancelado-' + objetivo, {
              signal: abort.signal,
              fase: (f) => {
                fase(f)
                if (f === objetivo) setImmediate(() => abort.abort())
              }
            })
          )
        )
        assert.equal(procesosPostgresActivos.size, 0)
        const archivos = await fs.readdir(
          path.join(carpeta, 'copias Ñ con espacios', 'cancelado-' + objetivo)
        )
        assert.equal(archivos.filter((n) => n.endsWith('.back')).length, 0)
      }
    })
    await check('históricos 1 a 9 migran sin sesiones ni efectos de jornada', async () => {
      for (let v = 1; v < 10; v++) {
        const nombre = 'rcm_ref_' + randomUUID().replaceAll('-', '')
        await motorA.conAdministracionRestauracion((db) =>
          db.query('CREATE DATABASE "' + nombre + '" OWNER ruizcacao_app')
        )
        const pool = new Pool({ ...configA, database: nombre }),
          runner = new MigracionesPostgres(),
          db = await pool.connect()
        try {
          await db.query('BEGIN')
          await runner.aplicarEnTransaccion(db, v)
          await db.query('COMMIT')
          await runner.migrar(pool)
          assert.equal(await versionHistorial(pool), 10)
          assert.equal(
            (await pool.query('SELECT count(*)::int n FROM ruizcacao.sesiones')).rows[0].n,
            0
          )
        } finally {
          db.release()
          await pool.end()
        }
      }
    })
    const extraido = path.join(carpeta, 'extraido.dump')
    await paquete.extraerDump(backupA.archivo, extraido)
    const alterados = {}
    for (const [nombre, cambios] of [
      ['futuro', { schema_version: 11 }],
      ['discordante', { schema_version: 9 }]
    ]) {
      const archivo = path.join(carpeta, nombre + '.back')
      await paquete.escribir(extraido, { ...backupA.manifest, ...cambios }, archivo)
      alterados[nombre] = archivo
    }
    await a.pool.query('CREATE TABLE ruizcacao.objeto_inesperado(id integer)')
    alterados.objeto = (await generar(a.pool, configA, 'objeto')).archivo
    await a.pool.query('DROP TABLE ruizcacao.objeto_inesperado')
    const fila2 = (await a.pool.query('SELECT * FROM ruizcacao.migraciones WHERE version=2'))
      .rows[0]
    await a.pool.query('DELETE FROM ruizcacao.migraciones WHERE version=2')
    alterados.hueco = (await generar(a.pool, configA, 'hueco')).archivo
    await a.pool.query('INSERT INTO ruizcacao.migraciones VALUES($1,$2)', [2, fila2.aplicada_en])
    const histName = 'rcm_ref_' + randomUUID().replaceAll('-', '')
    await motorA.conAdministracionRestauracion((db) =>
      db.query('CREATE DATABASE "' + histName + '" OWNER ruizcacao_app')
    )
    const histConfig = { ...configA, database: histName },
      hist = new Pool(histConfig),
      h = await hist.connect()
    try {
      await h.query('BEGIN')
      await new MigracionesPostgres().aplicarEnTransaccion(h, 4)
      await h.query(
        'INSERT INTO ruizcacao.administrador(id,nombre,password_hash) VALUES(1,$1,$2)',
        ['Historico restore', await hashSecreto(clave)]
      )
      await h.query('COMMIT')
    } finally {
      h.release()
    }
    const backupHistorico = await generar(hist, histConfig, 'historico4')
    await hist.end()
    await a.desconectar()
    a = undefined
    // El fixture construyó nueve bases históricas: vaciar buffers fuera de la
    // medición, sin alterar los timeouts/lifecycle del producto.
    await motorA.conAdministracionRestauracion((db) => db.query('CHECKPOINT'))
    await motorA.detener()
    configB = await motorB.iniciar()
    b = new BaseLocal(configB)
    await b.iniciar()
    await b.crearAdministrador('Original destino', clave)
    assert.notEqual(configA.password, configB.password)
    for (const [nombre, archivo] of process.env.RCM_RESTORE_PROFILE === '1'
      ? []
      : Object.entries(alterados))
      await check('rechazo ' + nombre + ' mantiene activa intacta', async () => {
        const antes = await firmas(b.pool)
        const motivo = {
          futuro: ['BACKUP_FORMAT_UNSUPPORTED'],
          discordante: ['BACKUP_INVENTORY_INVALID', 'BACKUP_SCHEMA_HISTORY_MISMATCH'],
          objeto: ['BACKUP_INVENTORY_INVALID'],
          hueco: ['BACKUP_SCHEMA_HISTORY_MISMATCH']
        }[nombre]
        await assert.rejects(
          servicio().ejecutar(archivo, async () => true),
          (error) => motivo.includes(error.codigoTecnico)
        )
        assert.deepEqual(await firmas(b.pool), antes)
        assert.equal(inMantenimiento, false)
      })
    const r = await perfil('restore_pequeno', (fase) =>
      servicio().ejecutar(backupA.archivo, async () => true, { fase })
    )
    evidencia.mantenimiento_pequeno_ms = r.mantenimiento_ms
    await check('schema10, datos, identidad nueva, sesiones, solicitudes y login', async () => {
      assert.deepEqual(await firmas(b.pool), pequeno)
      assert.notEqual(
        (await b.pool.query('SELECT installation_id FROM ruizcacao.instalacion')).rows[0]
          .installation_id,
        identidadA
      )
      assert.equal(
        (await b.pool.query('SELECT count(*)::int n FROM ruizcacao.solicitudes_recuperacion'))
          .rows[0].n,
        0
      )
      assert.deepEqual(
        (await b.pool.query('SELECT id,password_hash,rol FROM ruizcacao.usuarios ORDER BY id'))
          .rows,
        hashesUsuarios
      )
      await b.login('Principal restore', clave)
      await b.logout()
      await b.login('Operador restore', clave)
      assert.equal((await motorB.journalRestauracion().leer()).phase, 'confirmada')
    })
    const mat =
      process.env.RCM_RESTORE_PROFILE === '1'
        ? []
        : [
            'preparando_restore',
            'restaurando_staging',
            'migrando_staging',
            'normalizando',
            'restaurando_candidata',
            'candidata_validada',
            'antes_mantenimiento',
            'antes_pre_restauracion',
            'despues_pre_restauracion',
            'antes_promocion',
            'pool_cerrado',
            'antes_renombrar_original',
            'original_renombrada',
            'candidata_promovida',
            'validacion_final',
            'validada'
          ]
    for (const fase of mat)
      await check('fallo ' + fase + ' conserva original recuperable', async () => {
        const antes = await firmas(b.pool)
        fallo = fase
        try {
          await assert.rejects(
            servicio().ejecutar(backupA.archivo, async () => true, {
              fase: (f) => {
                if (f === fase) throw Error('Fallo inyectado ' + f)
              }
            })
          )
        } finally {
          fallo = ''
        }
        assert.ok(b)
        assert.deepEqual(await firmas(b.pool), antes)
        assert.equal(inMantenimiento, false)
        assert.equal(procesosPostgresActivos.size, 0)
      })
    await check('cancelación restore previa a promoción mantiene activa', async () => {
      const antes = await firmas(b.pool),
        abort = new AbortController()
      await assert.rejects(
        servicio().ejecutar(backupA.archivo, async () => true, {
          signal: abort.signal,
          fase: (f) => {
            if (f === 'restaurando_staging') setImmediate(() => abort.abort())
          }
        })
      )
      assert.deepEqual(await firmas(b.pool), antes)
      assert.equal(procesosPostgresActivos.size, 0)
    })
    await check('confirmación rechazada y cierre cancelable no promueven', async () => {
      const antes = await firmas(b.pool)
      await assert.rejects(servicio().ejecutar(backupA.archivo, async () => false))
      await assert.rejects(
        servicio().ejecutar(backupA.archivo, async () => true, {
          fase: (f) => {
            if (f === 'restaurando_staging')
              setImmediate(() => operacionesRespaldos.cancelarAlCerrar())
          }
        })
      )
      assert.deepEqual(await firmas(b.pool), antes)
    })
    const rg = await perfil('restore_grande', (fase) =>
      servicio().ejecutar(backupGrande.archivo, async () => true, { fase })
    )
    evidencia.mantenimiento_grande_ms = rg.mantenimiento_ms
    await check('restore grande conserva todas las filas comerciales', async () =>
      assert.deepEqual(await firmas(b.pool), grande)
    )
    await check('pre_restauracion existe y es verificable', async () => {
      const archivos = await fs.readdir(path.join(carpeta, 'seguridadB'))
      assert.ok(archivos.some((n) => n.startsWith('pre_restauracion') && n.endsWith('.dump.json')))
    })
    await check('backup máximo uno, exclusión de promoción y cierre crítico', async () => {
      const bk = operacionesRespaldos.adquirir('backup'),
        rs = operacionesRespaldos.adquirir('restore')
      assert.throws(() => operacionesRespaldos.adquirir('backup'))
      assert.throws(() => rs.critica())
      bk.liberar()
      rs.critica()
      assert.equal(rs.cancelar(), false)
      assert.equal(operacionesRespaldos.cancelarAlCerrar(), false)
      rs.liberar()
    })
    await perfil('restore_historico4', (fase) =>
      servicio().ejecutar(backupHistorico.archivo, async () => true, { fase })
    )
    await check('schema4→10 conserva contraseña y login principal', async () => {
      await b.login('Historico restore', clave)
      assert.equal(await versionHistorial(b.pool), 10)
    })
    await b.desconectarParaRestauracion()
    b = undefined
    await motorB.conAdministracionRestauracion((db) => db.query('CHECKPOINT'))
    await motorB.detener()
    // La instancia original conserva sus claves y ejecuta el mismo startup recovery.
    await motorB.iniciar()
    b = new BaseLocal(configB)
    await b.iniciar()
    await check('startup con journal confirmado conserva base y login', () =>
      b.login('Historico restore', clave)
    )
    await perfil('reposo_final', () => new Promise((r) => setTimeout(r, 1500)))
    evidencia.exito = true
  } finally {
    fallo = ''
    if (a) await a.desconectar()
    if (b) await b.desconectar()
    for (const motor of [motorA, motorB]) {
      let listo = false
      try {
        motor.configuracionRestauracion()
        listo = true
      } catch {
        /* Motor aún no iniciado o ya detenido en esta prueba. */
      }
      try {
        if (listo) await motor.conAdministracionRestauracion((db) => db.query('CHECKPOINT'))
      } finally {
        await motor.detener()
      }
    }
    if (sampler) {
      await fs.writeFile(stopSampler, 'stop')
      await finSampler
      const muestras = (await fs.readFile(recursos, 'utf8'))
        .split(/\r?\n/)
        .filter((s) => s.trim())
        .map((s) => JSON.parse(s.replace(/^\uFEFF/, '')))
      for (const p of evidencia.perfiles) {
        const filas = muestras.filter((m) => m.caso === p.nombre)
        const grupo = (nombres) => {
          let peak = 0
          const pids = new Map()
          for (const m of filas) {
            let ws = 0
            for (const s of m.procesos) {
              if (!nombres.includes(s.nombre)) continue
              ws += s.working_set
              const previo = pids.get(s.pid)
              pids.set(s.pid, { primero: previo?.primero ?? s.cpu_ms, ultimo: s.cpu_ms })
            }
            peak = Math.max(peak, ws)
          }
          return {
            muestras: filas.length,
            pids: pids.size,
            working_set_pico_muestreado: pids.size ? peak : null,
            cpu_delta_muestreada_ms: pids.size
              ? [...pids.values()].reduce((n, x) => n + Math.max(0, x.ultimo - x.primero), 0)
              : null
          }
        }
        p.postgres = grupo(['postgres'])
        p.herramientas = grupo(['pg_dump', 'pg_restore'])
        const cpuHijos = new Map()
        for (const m of filas)
          for (const s of m.procesos)
            if (['pg_dump', 'pg_restore'].includes(s.nombre))
              cpuHijos.set(s.pid, Math.max(cpuHijos.get(s.pid) || 0, s.cpu_ms))
        p.herramientas.cpu_acumulada_observada_ms = cpuHijos.size
          ? [...cpuHijos.values()].reduce((a, b) => a + b, 0)
          : null
      }
    }
    evidencia.hijos_residuales = procesosPostgresActivos.size
    await guardar()
    console.log('Evidencia restore: ' + path.join(destinoEvidencia, 'restore-seguro.json'))
  }
}
if (process.versions.electron) {
  const { app } = require('electron')
  const perfil = require('node:fs').mkdtempSync(
    path.join(os.tmpdir(), 'ruizcacao-restore-electron-')
  )
  app.setPath('userData', perfil)
  app
    .whenReady()
    .then(main)
    .then(
      () => app.exit(0),
      (e) => {
        console.error(e)
        app.exit(1)
      }
    )
} else
  main().catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
