const fs = require('node:fs')
const path = require('node:path')
const carpeta = path.resolve(__dirname, '../docs/evidencias-arranque-real')
const leer = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
const sum = (a) => a.reduce((n, v) => n + v, 0)
const f = (n) => (Number.isFinite(n) ? Number(n.toFixed(2)) : null)
const tipos = ['Browser', 'Tab', 'GPU', 'Utility']
function analizar(nombre) {
  const r = leer(path.join(carpeta, nombre + '.json'))
  const pg = leer(path.join(carpeta, nombre + '-postgres.json'))
  const marcas = r.marcas.slice().sort((a, b) => a.epoch - b.epoch)
  const m = (nombre, canal) =>
    marcas.find((m) => m.nombre === nombre && (!canal || m.detalle?.canal === canal))
  const t = (nombre, canal) => m(nombre, canal)?.epoch
  const diferencia = (a, b) => f(t(b) - t(a))
  const finInicio = marcas.find(
    (m) => m.nombre === 'interactive' && m.detalle.pagina === 'inicio'
  ).epoch
  const estado = [t('estado-start'), t('estado-end')]
  const lecturaSql = r.sql.filter((q) => q.inicio >= estado[0] && q.fin <= estado[1])
  const dto = marcas.filter(
    (m) => m.nombre === 'conversion-dto' && m.epoch >= estado[0] && m.epoch <= estado[1]
  )
  const checkpoint = (etiqueta) => r.recursos.findLast((s) => s.etiqueta === etiqueta)
  const agruparMemoria = (muestra) =>
    Object.fromEntries(
      tipos.map((tipo) => [
        tipo,
        {
          wsMiB: f(
            sum(
              muestra.procesos.filter((p) => p.type === tipo).map((p) => p.memory.workingSetSize)
            ) / 1024
          ),
          privadoMiB: f(
            sum(
              muestra.procesos.filter((p) => p.type === tipo).map((p) => p.memory.privateBytes || 0)
            ) / 1024
          )
        }
      ])
    )
  const pgCercano = (epoch) =>
    pg.reduce((a, b) => (Math.abs(a.epoch - epoch) < Math.abs(b.epoch - epoch) ? a : b))
  const pgMem = (epoch) => {
    const muestra = pgCercano(epoch)
    return {
      wsMiB: f(sum(muestra.procesos.map((p) => p.workingSetBytes)) / 1048576),
      privadoMiB: f(sum(muestra.procesos.map((p) => p.privateBytes)) / 1048576),
      procesos: muestra.procesos.length,
      desfaseMs: Math.round(muestra.epoch - epoch)
    }
  }
  const ultimoCpu = (hasta, tipo) => {
    const pids = new Map()
    for (const s of r.recursos.filter((s) => s.epoch <= hasta))
      for (const p of s.procesos)
        if (p.type === tipo) pids.set(p.pid, (p.cpu.cumulativeCPUUsage || 0) * 1000)
    return sum([...pids.values()])
  }
  const pico = (desde, hasta, tipo) => {
    let max = 0
    const prev = new Map()
    for (const s of r.recursos)
      for (const p of s.procesos.filter((p) => p.type === tipo)) {
        const antes = prev.get(p.pid),
          actual = (p.cpu.cumulativeCPUUsage || 0) * 1000
        if (antes && s.epoch >= desde && s.epoch <= hasta)
          max = Math.max(max, (100 * (actual - antes.cpu)) / (s.epoch - antes.epoch))
        prev.set(p.pid, { cpu: actual, epoch: s.epoch })
      }
    return f(max)
  }
  const cpuPg = (hasta) => {
    const pids = new Map()
    for (const s of pg.filter((s) => s.epoch <= hasta))
      for (const p of s.procesos) pids.set(p.pid, p.cpuMs)
    return sum([...pids.values()])
  }
  const pgBase = r.entorno.conexion?.startsWith('configurada') ? cpuPg(pg[0].epoch) : 0
  const picoPg = (desde, hasta) => {
    let max = 0
    for (let i = 1; i < pg.length; i++) {
      if (pg[i].epoch < desde || pg[i].epoch > hasta) continue
      const antes = new Map(pg[i - 1].procesos.map((p) => [p.pid, p.cpuMs]))
      const delta = sum(
        pg[i].procesos.map((p) => Math.max(0, p.cpuMs - (antes.get(p.pid) ?? p.cpuMs)))
      )
      max = Math.max(max, (100 * delta) / (pg[i].epoch - pg[i - 1].epoch))
    }
    return f(max)
  }
  const inicioIdle = t('idle-start'),
    finIdle = t('idle-end'),
    duracionIdle = finIdle - inicioIdle
  let paginaAnterior = 'inicio'
  const nav = marcas
    .filter((m) => m.nombre === 'navigation-start' && (!inicioIdle || m.epoch < inicioIdle))
    .map((inicio) => {
      const fin = marcas.find(
        (m) =>
          m.epoch > inicio.epoch &&
          m.nombre === 'interactive' &&
          m.detalle.pagina === inicio.detalle.pagina
      )
      const primeraRespuesta = marcas.find(
        (m) =>
          m.epoch > inicio.epoch &&
          m.nombre === 'ipc-response-end' &&
          m.detalle.canal === 'historialCompras'
      )
      const desde = paginaAnterior
      paginaAnterior = inicio.detalle.pagina
      return {
        desde,
        pagina: inicio.detalle.pagina,
        interactivoMs: fin ? f(fin.epoch - inicio.epoch) : null,
        primeraPaginaSqlMs:
          inicio.detalle.pagina === 'ventas' && primeraRespuesta
            ? f(primeraRespuesta.epoch - inicio.epoch)
            : null
      }
    })
  const sqlArranque = r.sql.filter((q) => q.fin <= finInicio)
  const inicioRender = marcas.find(
    (m) => m.nombre === 'Inicio-render-start' && m.epoch >= t('estado-received')
  )
  const finRender = marcas.find(
    (m) => m.nombre === 'Inicio-render-end' && m.epoch >= inicioRender.epoch
  )
  const cpuCorte = checkpoint('post-login').epoch
  const resultado = {
    nombre,
    entorno: r.entorno,
    incompleto: r.error || null,
    tiempos: {
      procesoReadyMs: diferencia('process-start', 'app-whenReady'),
      persistenciaMs: diferencia('persistencia-start', 'persistencia-end'),
      verificacionPgMs: diferencia('postgres-verificacion-start', 'postgres-verificacion-end'),
      esperaMotorMs: diferencia('postgres-conexion-start', 'postgres-ready'),
      baseConexionMs: diferencia('base-conexion-start', 'base-conexion-end'),
      baseIniciarMs: diferencia('base-iniciar-start', 'base-iniciar-end'),
      ventanaReadyMs: diferencia('window-create', 'window-ready-to-show'),
      hastaAccesoMs: diferencia('process-start', 'acceso-visible'),
      pausaAutomaticaMs: diferencia('acceso-visible', 'login-click'),
      loginAuthMs: diferencia('login-main-start', 'login-auth-end'),
      estadoMs: f(estado[1] - estado[0]),
      sqlClienteEstadoMs: f(sum(lecturaSql.map((q) => q.fin - q.inicio))),
      dtoMs: f(sum(dto.map((m) => m.detalle.ms))),
      ipcMainPreloadMs: f(t('ipc-response-end', 'login') - t('ipc-response-start', 'login')),
      puenteRendererMs: f(t('estado-received') - t('ipc-response-end', 'login')),
      rendererMs: f(finInicio - t('estado-received')),
      contextoMs: diferencia('AppDataContext-start', 'AppDataContext-ready'),
      inicioRenderCommitMs: f(finRender.epoch - inicioRender.epoch),
      commitPinturaInteractivoMs: f(finInicio - finRender.epoch),
      loginInicioMs: f(finInicio - t('login-click')),
      totalMs: f(finInicio - t('process-start')),
      firstPaintMs: diferencia('process-start', 'first-paint')
    },
    payload: r.payload?.bytes ?? null,
    conteos: r.payload?.conteos ?? null,
    consultas: {
      hastaInicio: sqlArranque.length,
      estado: lecturaSql.length,
      login: r.sql.filter(
        (q) => q.inicio >= t('login-main-start') && q.fin <= t('ipc-response-start', 'login')
      ).length,
      reposo: finIdle
        ? r.sql.filter((q) => q.inicio >= inicioIdle && q.inicio <= finIdle).length
        : null
    },
    entidades: dto.map((m) => m.detalle),
    navegacion: nav,
    memoria: Object.fromEntries(
      [
        'acceso-visible',
        'post-login',
        'post-cuentas',
        'post-ventas',
        'post-inicio',
        'idle-start',
        'idle-end'
      ]
        .filter(checkpoint)
        .map((etiqueta) => {
          const s = checkpoint(etiqueta)
          return [
            etiqueta,
            {
              ...agruparMemoria(s),
              PostgreSQL: pgMem(s.epoch),
              mainRssMiB: f(s.mainRssBytes / 1048576)
            }
          ]
        })
    ),
    cpuArranque: Object.fromEntries(
      tipos.map((tipo) => [
        tipo,
        {
          ms: f(ultimoCpu(cpuCorte, tipo)),
          picoPorcentajeUnNucleo: pico(t('process-start'), cpuCorte, tipo)
        }
      ])
    ),
    cpuReposo: !finIdle
      ? null
      : Object.fromEntries(
          tipos.map((tipo) => {
            const ms = ultimoCpu(finIdle, tipo) - ultimoCpu(inicioIdle, tipo)
            return [
              tipo,
              {
                ms: f(ms),
                promedioPorcentajeUnNucleo: f((100 * ms) / duracionIdle),
                picoPorcentajeUnNucleo: pico(inicioIdle, finIdle, tipo)
              }
            ]
          })
        ),
    postgresCpu: {
      arranqueMs: f(cpuPg(cpuCorte) - pgBase),
      reposoMs: f(cpuPg(finIdle) - cpuPg(inicioIdle)),
      picoArranque: picoPg(t('process-start'), cpuCorte),
      picoReposo: picoPg(inicioIdle, finIdle)
    },
    reposoMs: f(duracionIdle),
    interaccionesReposo: marcas.filter(
      (m) => m.nombre === 'navigation-start' && m.epoch >= inicioIdle && m.epoch <= finIdle
    ).length,
    entradaBloqueadaReposo: !!m('idle-input-disabled'),
    mainBloqueoMaxMs: f(
      Math.max(...r.recursos.filter((s) => s.epoch <= cpuCorte).map((s) => s.loopMaxMs))
    ),
    pgCtl: marcas
      .filter((m) => m.nombre.startsWith('pg_ctl'))
      .map((m) => ({ nombre: m.nombre, ms: f(m.epoch - t('process-start')), detalle: m.detalle })),
    recursosWeb: r.payload
      ? {
          entradas: r.payload.recursosWeb.length,
          bytesDecodificados: sum(r.payload.recursosWeb.map((r) => r.bytes || 0))
        }
      : null
  }
  return resultado
}
const nombres = [
  'small-frio',
  'small-segundo',
  'large-frio',
  'large-segundo',
  'small-externo-frio',
  'small-externo-segundo',
  'large-externo-frio',
  'large-externo-segundo',
  'large-externo-reposo'
]
const resultados = nombres
  .filter((n) => fs.existsSync(path.join(carpeta, n + '.json')))
  .map(analizar)
fs.writeFileSync(path.join(carpeta, 'resumen.json'), JSON.stringify(resultados, null, 2))
let md =
  '| Fase (ms) | ' +
  resultados.map((r) => r.nombre).join(' | ') +
  ' |\n|---|' +
  resultados.map(() => '---:').join('|') +
  '|\n'
for (const campo of Object.keys(resultados[0].tiempos))
  md += '| ' + campo + ' | ' + resultados.map((r) => r.tiempos[campo]).join(' | ') + ' |\n'
md +=
  '\n| Recursos | ' +
  resultados.map((r) => r.nombre).join(' | ') +
  ' |\n|---|' +
  resultados.map(() => '---:').join('|') +
  '|\n'
md += '| Estado JSON bytes | ' + resultados.map((r) => r.payload).join(' | ') + ' |\n'
md +=
  '| Consultas hasta Inicio | ' +
  resultados.map((r) => r.consultas.hastaInicio).join(' | ') +
  ' |\n'
for (const tipo of [...tipos, 'PostgreSQL'])
  md +=
    '| Working Set ' +
    tipo +
    ' al login (MiB) | ' +
    resultados.map((r) => r.memoria['post-login'][tipo].wsMiB).join(' | ') +
    ' |\n'
fs.writeFileSync(path.join(carpeta, 'tablas.md'), md)
console.log(
  JSON.stringify(
    resultados.map((r) => ({
      nombre: r.nombre,
      tiempos: r.tiempos,
      pgCtl: r.pgCtl,
      memoriaLogin: r.memoria['post-login'],
      cpu: r.cpuArranque,
      reposo: r.cpuReposo,
      consultas: r.consultas
    })),
    null,
    2
  )
)
