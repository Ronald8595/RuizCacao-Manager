const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const dir = path.join(root, 'docs/evidencias-pgctl')
const anterior = path.join(root, 'docs/evidencias-arranque-real')
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''))
const fmt = (v) =>
  v == null
    ? 'N/D'
    : v.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const tabla = (cabecera, filas) =>
  '| ' +
  cabecera.join(' | ') +
  ' |\n|' +
  cabecera.map(() => '---').join('|') +
  '|\n' +
  filas.map((f) => '| ' + f.join(' | ') + ' |').join('\n') +
  '\n'
const nombres = ['small-frio', 'small-segundo', 'large-frio', 'large-segundo']
const mark = (r, n) => r.marcas.find((m) => m.nombre === n)?.epoch
const delta = (r, a, b) =>
  mark(r, a) != null && mark(r, b) != null ? mark(r, b) - mark(r, a) : null
function metricas(r) {
  const log = fs.readFileSync(path.join(r.entorno.perfil, 'postgres/postgresql.log'), 'utf8')
  const tiempos = log
    .split('\n')
    .filter((l) => l.includes('ready to accept connections'))
    .map((l) => {
      const m = l.match(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d\.\d+) ([+-]\d\d)/)
      return m ? Date.parse(m[1] + 'T' + m[2] + m[3] + ':00') : NaN
    })
  const spawn = mark(r, 'pg_ctl-spawn')
  const pgReady = tiempos.find((t) => t >= spawn && t < mark(r, 'pg_ctl-close'))
  return {
    appReady: delta(r, 'process-start', 'app-whenReady'),
    persistencia: delta(r, 'persistencia-start', 'persistencia-end'),
    verificacion: delta(r, 'postgres-verificacion-start', 'postgres-verificacion-end'),
    pgDisponibleLog: pgReady ? pgReady - spawn : null,
    spawnExit: delta(r, 'pg_ctl-spawn', 'pg_ctl-exit'),
    exitClose: delta(r, 'pg_ctl-exit', 'pg_ctl-close'),
    spawnResolucion: mark(r, 'pg_ctl-resolved')
      ? delta(r, 'pg_ctl-spawn', 'pg_ctl-resolved')
      : delta(r, 'pg_ctl-spawn', 'pg_ctl-callback'),
    postgresLocal: mark(r, 'postgres-local-iniciar-start')
      ? delta(r, 'postgres-local-iniciar-start', 'postgres-local-iniciar-end')
      : delta(r, 'postgres-verificacion-start', 'postgres-ready'),
    ventana: delta(r, 'window-create', 'window-ready-to-show'),
    acceso: delta(r, 'process-start', 'acceso-visible'),
    login: delta(r, 'login-click', 'interactive'),
    inicio: delta(r, 'process-start', 'interactive')
  }
}
const series = nombres.map((nombre) => {
  const antes = read(path.join(anterior, nombre + '.json'))
  const despues = read(path.join(dir, nombre + '-final.json'))
  assert.ok(!despues.error)
  const cierre = read(path.join(dir, nombre + '-final-cierre.json'))
  const procesos = read(path.join(dir, nombre + '-final-procesos-final.json'))
  const consolas = read(path.join(dir, nombre + '-final-consolas.json'))
  assert.ok(cierre.cierreNormal && cierre.motorDetenido)
  assert.equal(procesos.residuales.length, 0)
  assert.equal(consolas.nuevasConsolas.length, 0)
  const a = metricas(antes),
    d = metricas(despues)
  assert.ok(d.exitClose < 100 && d.acceso < a.acceso)
  return {
    nombre,
    antes: a,
    despues: d,
    reduccionAccesoPct: (100 * (a.acceso - d.acceso)) / a.acceso,
    rawAntes: antes,
    rawDespues: despues
  }
})
const iniciales = read(path.join(dir, 'huellas-iniciales.json'))
const conservados = Object.entries(iniciales).filter(
  ([f]) => f !== 'src/main/database/postgres-local.ts'
)
for (const [f, h] of conservados)
  assert.equal(
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(root, f)))
      .digest('hex'),
    h,
    f
  )
const experimentos = fs
  .readdirSync(dir)
  .filter((f) => /^experimento-.*\.json$/.test(f))
  .map((f) => ({ archivo: f, ...read(path.join(dir, f)) }))
const regresiones = fs
  .readdirSync(dir)
  .filter((f) => /^regresion-.*\.json$/.test(f))
  .sort()
const regresion = read(path.join(dir, regresiones.at(-1)))
assert.ok(regresion.completo && regresion.casos.every((c) => c.ok))
const exit = (nombre) =>
  fs.existsSync(path.join(dir, nombre + '-exit.txt'))
    ? fs.readFileSync(path.join(dir, nombre + '-exit.txt'), 'utf8').trim()
    : 'pendiente'
const resumen = {
  fecha: new Date().toISOString(),
  series: series.map((r) => ({
    nombre: r.nombre,
    antes: r.antes,
    despues: r.despues,
    reduccionAccesoPct: r.reduccionAccesoPct
  })),
  archivosProtegidosIguales: conservados.length,
  regresion: regresiones.at(-1),
  checks: {
    typecheck: exit('typecheck'),
    lint: exit('lint-final'),
    dbTest: exit('db-test-secuencial'),
    diffCheck: exit('diff-check')
  }
}
fs.writeFileSync(path.join(dir, 'resumen-final.json'), JSON.stringify(resumen, null, 2))
let md =
  '# Optimización de arranque pg_ctl — RuizCacao Manager 1.2.1\n\nFecha: 13/10/2026 (America/Guayaquil). Esquema 10, 25 tablas, migraciones 001–010 intactas; 011 NO.\n\n'
md +=
  '## Resultado y alcance\n\nCausa de los ~35 s confirmada y parche aplicado. La espera estaba en los pipes heredados de stdout y stderr, no en la disponibilidad inicial de PostgreSQL. Se validaron cuatro arranques reales posteriores al cierre de las regresiones: pequeña/grande, primer/segundo proceso. Se reutilizan los cuatro arranques anteriores; no se repitió el perfil completo ni los reposos válidos de cinco minutos. No cambia la ruta de PostgreSQL externo ni el Snapshot.\n\n'
md += tabla(
  [
    'Escenario',
    'Acceso antes ms',
    'Acceso después ms',
    'Reducción %',
    'Inicio antes ms',
    'Inicio después ms'
  ],
  series.map((r) => [
    r.nombre,
    fmt(r.antes.acceso),
    fmt(r.despues.acceso),
    fmt(r.reduccionAccesoPct),
    fmt(r.antes.inicio),
    fmt(r.despues.inicio)
  ])
)
md +=
  '\n## Causa exacta y lifecycle\n\nLa versión Windows de pg_ctl 18.6 crea CMD con los handles estándar heredados. CMD ejecuta postgres con redirección al archivo indicado por -l y permanece hasta que termina el servidor. Node observa la salida de pg_ctl, pero sus dos pipes aún no alcanzan EOF. Consumirlos no cierra los handles heredados. El temporizador de execFile destruye los streams a los 35 s; entonces se emite close y el callback puede devolver éxito porque pg_ctl ya había salido con código 0.\n\n'
md +=
  'La separación stdout/stderr reproduce la dependencia de ambos; eliminar stdin no ayuda. El árbol de procesos confirma pg_ctl → CMD → postgres. No se enumeró el número nativo de cada HANDLE dentro de CMD: la atribución del mecanismo combina aislamiento experimental, árbol de PID y código fuente de la versión exacta. Fuentes primarias: [pg_ctl REL_18_6, start_postmaster e InheritStdHandles](https://github.com/postgres/postgres/blob/REL_18_6/src/bin/pg_ctl/pg_ctl.c), [evento close de Node](https://nodejs.org/api/child_process.html#event-close).\n\n'
md +=
  '```mermaid\nsequenceDiagram\n  participant M as Electron Main\n  participant P as pg_ctl\n  participant C as CMD heredado\n  participant D as PostgreSQL\n  M->>P: start -D copia -l postgresql.log -w -t 30\n  P->>C: Crear proceso con handles heredados\n  C->>D: postgres; salida al log\n  D-->>P: Disponible\n  P-->>M: exit 0\n  Note over M,C: Antes: pipes vivos; close esperaba hasta timeout 35 s\n  Note over M,P: Después: stdout/stderr a pg_ctl.log; close inmediato\n  M->>D: Conexión autenticada\n  D-->>M: Conexión válida\n  M->>M: Continuar PostgresLocal.iniciar\n```\n\n'
md +=
  '## Inspección y experimentos mínimos\n\nAntes: promisify(execFile), pipes predeterminados, windowsHide:true, shell:false y detached:false por defecto, timeout35000, SIGTERM predeterminado; sin listeners de aplicación que anticipen exit. El callback interno espera close. -l conserva postgresql.log; -w/-t30 comprueban el arranque del servidor. Stop usa execFile con status previo, -m fast -w -t20 y timeout25000. No crea otro servidor ni shell descendiente persistente.\n\n'
const evt = (v, n) => v.eventos.find((e) => e.nombre === n)?.ms
md += tabla(
  [
    'Evidencia/variante',
    'spawn → exit ms',
    'exit → close ms',
    'Resolución ms desde llamada',
    'Resultado'
  ],
  experimentos.flatMap((e) =>
    e.variantes.length
      ? e.variantes.map((v) => [
          e.archivo + ' / ' + v.nombre,
          fmt(evt(v, 'exit') - evt(v, 'spawn')),
          fmt(evt(v, 'close') - evt(v, 'exit')),
          fmt(evt(v, 'promise-resolve') ?? evt(v, 'callback') ?? null),
          v.postgresResidual === false
            ? 'PostgreSQL terminado'
            : e.completo
              ? 'Completado'
              : 'Descartado: fallo conservado'
        ])
      : [
          [
            e.archivo,
            'N/D',
            'N/D',
            'N/D',
            'initdb falló por permisos del sandbox; repetido fuera del sandbox'
          ]
        ]
  )
)
md +=
  '\nEl experimento mínimo usa Node26.7 y PostgreSQL18.6 empaquetado, clústeres temporales vacíos con SCRAM. La app real usa Electron44.3/Node24.20. Los SHA256 de pg_ctl/postgres instalados y empaquetados coinciden (binarios.json). Disponibilidad experimental: conexión autenticada y SELECT1; tiempos incluyen sondeo/latencia de autenticación. No hay datos del cliente. Los PID y descendientes están en cada JSON.\n\n'
md +=
  'Descartadas: consumir pipes, quitar uno solo o stdin; siguen esperando. Destruir pipes en exit elimina la espera como experimento, pero no se adoptó. Ignorar toda salida elimina la espera, pero pierde diagnóstico. Dirigir stdout/stderr al mismo postgresql.log que -l produce un conflicto de apertura en Windows; se conservó el fallo. Solución elegida: archivo separado pg_ctl.log. En las variantes spawn con pipes el límite de observación de35 s fuerza el cierre de los streams; no es un close espontáneo ni una solución propuesta.\n\n'
md +=
  '## Cambio de producción\n\nSolo PostgresLocal: spawn para start, stdin ignore, stdout/stderr a un descriptor abierto en append de pg_ctl.log. Se conservan -l postgresql.log, -w, -t30, windowsHide:true, shell:false, detached:false y timeout35000/SIGTERM. Se espera close y se rechaza error, código distinto de0 o señal. Se cierra el descriptor del padre en finally. Después se exige conexión autenticada; exit0 sin servidor falla. No se redujo timeout ni se resuelve por exit.\n\n'
md +=
  'Los errores de pg_ctl se registran sanitizados y se propagan; se intenta cerrar el clúster privado antes de devolver el error. Ya no se transforma un error de pg_ctl en éxito aunque el servidor termine iniciando. Se preservan credenciales, puerto, SCRAM, cifrado, protecciones de data/data-inicializando y comprobación de versión. No se modifican servicios Windows. Los logs de tiempos permanecen opt-in; pg_ctl.log contiene diagnóstico operativo, no muestras de rendimiento ni contraseñas.\n\n'
md +=
  '## Cierre fast: fallo descubierto, causa y corrección\n\nLa regresión introduce recovery.signal y un restore_command de32 s exclusivamente en su clúster temporal. Con -t20, pg_ctl stop devolvió error mientras postgres seguía esperando que finalizase la orden de recuperación. El log marca fast a21:19:59.826 y servidor detenido a21:20:33.801:33,975 s reales. No era un cierre completado que Node ocultase. El fallo inicial permanece en regresion-1791944311032.json/db-test.txt. No se rebajó ninguna aserción.\n\n'
md +=
  'La limpieza de un arranque fallido permite -t60/timeout65000, margen acotado basado en esos34 s observados; el cierre normal conserva -t20/timeout25000. Mantiene fast, sin matar postgres ni cambiar recuperación de contraseña/datos comerciales. La sonda exclusiva stop confirmó33.246,97 ms desde spawn hasta exit y0,13 ms hasta close, con stdout/stderr cerrados antes de exit; PID inexistente al finalizar. Por eso stop conserva execFile/pipes. Evidencia experimento-1791944796855.json. La regresión completa posterior pasa cierre/reapertura y conserva el valor42 de su tabla de prueba.\n\n'
md +=
  'La primera suite posterior alcanzó el último caso pero otra sonda iniciada por el agente compitió por el puerto55433. El log de PostgreSQL acredita bind fallido. Se conserva db-test-final.txt (exit1); la validación definitiva se ejecutó secuencialmente en db-test-secuencial.txt, sin sonda concurrente. Los dos primeros perfiles pequeños también se conservan como preliminares y no son la comparación final.\n\n'
md +=
  '## Benchmark completo antes/después\n\nCada celda es antes → después, ms. Fases anidadas, no sumarlas. Proceso frío significa un proceso nuevo, no caché del SO vaciada. Mismo driver real/main/preload/Renderer, modo desarrollo; Vite previo al proceso medido, sin build/release. Las cifras antes son las corridas ya acreditadas; los cuatro después se ejecutan secuencialmente tras la suite. Primera instalación/initdb queda fuera de esta comparación recurrente.\n\n'
const campos = {
  appReady: 'Proceso → app.whenReady',
  persistencia: 'Persistencia completa',
  verificacion: 'Verificación ejecutables',
  pgDisponibleLog: 'pg_ctl llamada → disponibilidad en log PG',
  spawnExit: 'pg_ctl llamada → exit',
  exitClose: 'pg_ctl exit → close',
  spawnResolucion: 'pg_ctl llamada → resolución',
  postgresLocal: 'PostgresLocal.iniciar',
  ventana: 'Crear ventana → ready-to-show',
  acceso: 'Proceso → Acceso visible',
  login: 'Login → Inicio interactivo',
  inicio: 'Proceso → Inicio interactivo'
}
md += tabla(
  ['Fase', ...series.map((r) => r.nombre)],
  Object.entries(campos).map(([k, label]) => [
    label,
    ...series.map((r) => fmt(r.antes[k]) + ' → ' + fmt(r.despues[k]))
  ])
)
md +=
  '\nLa marca histórica pg_ctl-spawn se toma antes de llamar a child_process (no es el evento spawn del SO). Se conserva esa definición para A/B. Las corridas nuevas incluyen además spawn-event, conexión autenticada y resolución. PostgresLocal antes se aproxima por verificacion-start→postgres-ready (primer/último punto de ese método); después tiene marcas explícitas. Disponibilidad en log se obtiene de la línea de PostgreSQL de esa misma corrida, no se confunde con la resolución Node.\n\n'
md +=
  'Los dos JSON históricos pequeños preceden a los listeners de pg_ctl: esos eventos antes se indican N/D, sin inventarlos ni volver a ejecutar el perfil completo. La espera anterior está delimitada directamente en las dos corridas grandes y en la reproducción mínima.\n\n'
md +=
  '## Memoria, login y estabilidad\n\nWorking Set MiB inmediatamente después de Inicio; incluye memoria compartida. CPU acumulada de cada proceso hasta esa muestra, ms. Comparación de observaciones individuales, sin intervalos de confianza. No se repitió el reposo de5 minutos: este cambio de handles afecta arranque/cierre; cada corrida conserva una observación corta de5 s y el diagnóstico anterior conserva los reposos válidos.\n\n'
function recurso(r, tipo) {
  const p = r.recursos
    .find((x) => x.etiqueta === 'post-login')
    ?.procesos.find((x) => x.type === tipo)
  return { ws: p?.memory.workingSetSize / 1024, cpu: p?.cpu.cumulativeCPUUsage * 1000 }
}
md += tabla(
  [
    'Escenario',
    'Main MiB antes→después',
    'Renderer MiB antes→después',
    'Main CPU ms antes→después',
    'Renderer CPU ms antes→después'
  ],
  series.map((r) => {
    const a = recurso(r.rawAntes, 'Browser'),
      b = recurso(r.rawDespues, 'Browser'),
      c = recurso(r.rawAntes, 'Tab'),
      d = recurso(r.rawDespues, 'Tab')
    return [
      r.nombre,
      fmt(a.ws) + ' → ' + fmt(b.ws),
      fmt(c.ws) + ' → ' + fmt(d.ws),
      fmt(a.cpu) + ' → ' + fmt(b.cpu),
      fmt(c.cpu) + ' → ' + fmt(d.cpu)
    ]
  })
)
md +=
  '\nLogin grande se mantiene en 1,81–1,83 s (antes 1,83–1,92 s). El pequeño sube 40–73 ms: el estado pasa de35–39 a62 ms y Renderer de34–36 a46–76 ms; autenticación cambia menos de3 ms. Son dos observaciones por tamaño, insuficientes para atribuir ese incremento al parche o descartarlo estadísticamente. La mejora demostrada es el arranque previo a Acceso. Working Set Main/Renderer permanece próximo a la referencia (variaciones de pocos MiB), sin nueva prueba de fuga prolongada.\n\n'
function pgMemoria(r, file) {
  const epoch = r.recursos.find((m) => m.etiqueta === 'post-login').epoch
  const muestras = read(file)
  const m = muestras.reduce((a, b) =>
    Math.abs(b.epoch - epoch) < Math.abs(a.epoch - epoch) ? b : a
  )
  return m.procesos.reduce((n, p) => n + p.workingSetBytes, 0) / 1048576
}
md += tabla(
  ['Escenario', 'PostgreSQL suma WS MiB antes → después'],
  series.map((r) => [
    r.nombre,
    fmt(pgMemoria(r.rawAntes, path.join(anterior, r.nombre + '-postgres.json'))) +
      ' → ' +
      fmt(pgMemoria(r.rawDespues, path.join(dir, r.nombre + '-final-postgres.json')))
  ])
)
md +=
  '\nLa suma PostgreSQL puede contar páginas compartidas varias veces; muestra más cercana al post-login, desplazable aproximadamente1 s.\n'
md += '\n## Regresiones y controles\n\n'
md += tabla(
  ['Caso', 'Resultado', 'ms'],
  regresion.casos.map((c) => [c.nombre, c.ok ? 'OK' : 'FALLO', fmt(c.ms)])
)
md +=
  '\nAdemás, postgres-prerrequisito conserva las aserciones de data válido sin clave, data sin PG_VERSION, data-inicializando previo, versiones incompatibles y runtime ausente. La suite general verifica SCRAM, privilegios, cifrado, esquema, datos, respaldos y reapertura. El timeout de proceso35 s usa un hijo Node que no termina para ejercitar el temporizador real; el timeout PostgreSQL30 s usa el motor real bloqueado en recuperación. No son el mismo caso.\n\n'
md +=
  'Cierre de app: cuatro archivos *-final-cierre.json confirman el flujo normal (que usa fast); *-procesos-final.json verifica que ninguno de los PID PostgreSQL muestreados sigue activo. motores-final.json añade un barrido final de las raíces aisladas: cero motores residuales. El monitor EnumWindows observa cada20 ms y registra cero consolas visibles nuevas en las corridas finales; no lee títulos ni contenido. windowsHide/shell/detached se verifican además por aserciones. No puede excluir un destello más breve que el intervalo; revisión humana final pendiente.\n\n'
md += tabla(
  ['Comando', 'Código final', 'Evidencia'],
  [
    ['npm run typecheck', resumen.checks.typecheck, 'typecheck.txt'],
    [
      'npm run lint -- --no-cache',
      resumen.checks.lint,
      'lint-final.txt: 0 errores, 726 advertencias'
    ],
    ['npm run db:test', resumen.checks.dbTest, 'db-test-secuencial.txt'],
    ['git diff --check', resumen.checks.diffCheck, 'diff-check.txt']
  ]
)
md +=
  '\n## Archivos, conservación y riesgos\n\nProducción: src/main/database/postgres-local.ts. Pruebas: tests/pgctl-arranque.cjs y su registro en tests/run.cjs. Instrumentación: scripts/perfil-aplicacion-real.cjs extendido, scripts/experimento-pgctl.cjs, benchmark-pgctl-final.cjs, vigilar-consolas-pgctl.ps1 y documentar-pgctl.cjs. Documentación: este informe, continuidad y docs/evidencias-pgctl. La instrumentación de producción sigue opt-in. Los scripts experimentales no forman parte del arranque del cliente. Los cambios previos de versión, Fecha de operación y perfilado quedan conservados.\n\n'
md += `${conservados.length} archivos protegidos coinciden con sus SHA256 iniciales: todas las evidencias previas de arranque, migraciones SQL y Cuentas/DetalleCuenta. original-final.json no se alteró; su incidencia22/25 permanece sin atribución. Esta tarea no conectó a la base comercial original ni reparó tablas. No seed, build, commit, push, merge ni tag.\n\n`
md +=
  'Riesgos residuales: Windows/equipo observado y desarrollo; falta revisión humana y release en equipo final. Un restore_command externo arbitrariamente bloqueado puede exceder incluso el límite excepcional de60 s: se registra el fallo y no se declara cierre satisfactorio, sin terminación forzada. Ese límite no garantiza cierre de cualquier bloqueo del SO. pg_ctl.log se añade en append dentro de la carpeta protegida; no se introdujo rotación nueva. Snapshot65 MB y costes posteriores al login permanecen fuera de alcance. No atribuir variación de login/UI al cambio de pg_ctl sin más repeticiones.\n\n'
md +=
  '## CONTINUAR DESDE AQUI\n\n1. Leer este informe y resumen-final.json; conservar todas las evidencias, incluidas las fallidas.\n2. Revisar únicamente el diff de PostgresLocal y sus pruebas; no tocar Snapshot, Cuentas ni migraciones001–010.\n3. Siguiente paso exacto: revisión humana de arranque/cierre/reapertura sin consola, en una copia aislada; no iniciar otra optimización.\n4. Para revalidar cambios posteriores, ejecutar desde electron-app: `npm run typecheck`, `npm run lint -- --no-cache`, `npm run db:test`, `git diff --check`, secuencialmente respecto a pruebas de motor.\n5. No volver a ejecutar el benchmark actual sobre sus mismos nombres: rechaza sobrescribir evidencia. No repetir diagnósticos o reposos acreditados.\n6. Regenerar solamente este documento con `node scripts/documentar-pgctl.cjs` si cambian datos derivados; no modificar los JSON originales.\n7. No seed/build/publicación Git. No resolver la incidencia histórica del origen mediante escrituras.\n\nÚltimos comandos y códigos: tabla de controles anterior. Ninguna corrida final queda pendiente tras producir este informe; los logs/archivos de salida permiten recuperar el estado de cada proceso.\n'
fs.writeFileSync(path.join(root, 'docs/Informe_Optimizacion_Arranque_pgctl_v1.2.1.md'), md)
console.log('Informe pgctl y resumen final generados; evidencia anterior intacta.')
