const fs = require('node:fs')
const path = require('node:path')
const dir = path.resolve(__dirname, '../docs/evidencias-arranque-real')
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8').replace(/^\uFEFF/, ''))
const resultados = read('resumen.json')
const externos = resultados.filter((r) => r.nombre.includes('externo'))
const locales = resultados.filter((r) => !r.nombre.includes('externo'))
const formato = (n) =>
  n == null || !Number.isFinite(n)
    ? 'N/D'
    : n.toLocaleString('es-EC', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
const tabla = (cabeceras, filas) =>
  '| ' +
  cabeceras.join(' | ') +
  ' |\n|' +
  cabeceras.map(() => '---').join('|') +
  '|\n' +
  filas.map((f) => '| ' + f.join(' | ') + ' |').join('\n') +
  '\n'
const tipos = {
  Browser: 'Main',
  Tab: 'Renderer',
  GPU: 'GPU',
  Utility: 'Utility',
  PostgreSQL: 'PostgreSQL (suma)'
}
const fases = {
  procesoReadyMs: 'Proceso → app.whenReady',
  persistenciaMs: 'Persistencia completa',
  verificacionPgMs: 'Verificación de ejecutables PG',
  esperaMotorMs: 'Conexión inicial / pg_ctl → postgres-ready',
  baseConexionMs: 'Conexión del pool',
  baseIniciarMs: 'BaseLocal.iniciar completo',
  ventanaReadyMs: 'Crear ventana → ready-to-show',
  hastaAccesoMs: 'Proceso → Acceso visible',
  pausaAutomaticaMs: 'Pausa automática antes del clic',
  loginAuthMs: 'Autenticación Main',
  estadoMs: 'Estado completo Main',
  sqlClienteEstadoMs: 'Lectura SQL vista por cliente pg',
  dtoMs: 'Conversión filas → DTO',
  ipcMainPreloadMs: 'Respuesta Main → resolución en preload',
  puenteRendererMs: 'Preload → estado recibido en Renderer',
  rendererMs: 'Estado recibido → Inicio interactivo',
  contextoMs: 'Primera creación AppDataContext',
  inicioRenderCommitMs: 'Primer render Inicio → primer layout effect',
  commitPinturaInteractivoMs: 'Primer commit → frames/tarea interactiva',
  loginInicioMs: 'Login → Inicio interactivo',
  totalMs: 'Proceso → Inicio interactivo',
  firstPaintMs: 'Proceso → first-paint del documento'
}
let md = '# Informe de perfil de arranque real — RuizCacao Manager 1.2.1\n\n'
md +=
  'Fecha: 2026-10-13, America/Guayaquil. Diagnóstico de la aplicación completa en desarrollo, sin optimizaciones implementadas.\n\n'
md += '## Conclusión y alcance\n\n'
md +=
  '**Incidencia que limita el cierre:** el cotejo final del origen coincide en 22/25 tablas. Cambiaron sesiones, auditoria y usuarios durante el período de intentos iniciales; las tablas comerciales conservan sus huellas. La atribución no es concluyente y no puede afirmarse cumplimiento íntegro de cero escrituras. Se detallan las fechas y evidencia al final.\n\n'
md +=
  '**Resultado principal de la ruta de desarrollo:** con conexión externa y base grande, Inicio quedó interactivo en 4,39 s / 3,49 s desde el proceso (primer/segundo arranque), frente a 2,01 s / 1,82 s con base pequeña. Login → Inicio: 2,02 s / 1,90 s frente a 280 ms / 261 ms. En el segundo arranque grande, construir y entregar el estado consume aproximadamente el 83% del login. **Causa principal del login:** lectura/conversión/transporte del estado global. **Causa secundaria del arranque externo:** creación/carga de ventana y UI (1,08–1,87 s), sin atribución demostrada a parseo JS.\n\n'
md +=
  '**Hay dos rutas distintas.** La configuración de desarrollo existente contiene `postgres.enc`: conecta a un servidor ya activo y omite `PostgresLocal`. La espera de unos 35 segundos pertenece a la ruta de motor administrado por la aplicación, con PostgreSQL detenido al comenzar. No se atribuye esa espera al desarrollo con servidor externo. Ambas rutas se ejecutaron contra copias aisladas, usando el entrypoint, preload, Acceso, autenticación, IPC, contexto y páginas reales.\n\n'
md +=
  'En el motor administrado, `pg_ctl` sale con código 0 mucho antes de que cierre su comunicación con Node. La espera hasta la respuesta consume casi todo el arranque. En la ruta externa, el coste de cargar la interfaz y el de leer/convertir/transportar el estado global son los dos bloques relevantes; el aumento por volumen de datos aparece sobre todo después del login. Los números siguientes separan ambas causas.\n\n'
md += '## Método y límites\n\n'
md +=
  '- Windows 10.0.26100, Intel Core i5-12450H, Electron 44.3.0 / Node 24.20.0; 12 procesadores lógicos, aproximadamente 15,70 GiB de RAM. PostgreSQL 18.6 en las copias. Ventana visible de aproximadamente 900 × 670 DIP, CSS completo, React desarrollo y StrictMode.\n'
md +=
  '- `electron-vite dev --entry scripts/perfil-aplicacion-real.cjs` carga `out/main/index.js` real. La transpilación de desarrollo y el servidor Vite comienzan antes del proceso medido y quedan fuera de su tiempo/consumo. No se ejecutó build de release ni empaquetado. No son cifras del instalador ni del modo production.\n'
md +=
  '- “Frío” significa proceso Electron nuevo; no se vació caché del sistema ni se reinició Windows. “Segundo” es otro proceso con el mismo perfil y cierre previo normal. En la ruta externa el servidor permanece activo entre ambos. En la administrada se detiene en cada cierre. Son observaciones individuales, no medianas ni percentiles.\n'
md +=
  '- Base pequeña nueva, con administrador y sin operaciones comerciales; base grande restaurada mediante pg_dump/pg_restore desde el desarrollo existente, sin ejecutar seed. Contraseña temporal cambiada únicamente en la copia. Login, sesiones, avisos, cierre de jornada y respaldos operan normalmente en esas copias. Novedades se marca vista en su almacenamiento aislado para medir un acceso recurrente.\n'
md +=
  '- Las conexiones de preparación/cotejo usan READ ONLY y pg_dump; las corridas guardadas señalan perfiles y clústeres aislados. El cotejo final conserva 22/25 tablas, incluidas todas las comerciales, pero difieren sesiones, auditoria y usuarios. No se puede certificar ausencia total de escrituras en el origen durante toda la sesión; véase incidencia detallada. Migraciones 001–010 no editadas; no hay 011 ni índices nuevos.\n'
md +=
  '- `process-start` se estima con el uptime de Node; incluye el preflight del driver, decenas de milisegundos. Reloj de cada proceso: performance.timeOrigin + performance.now. `interactive` significa commit, dos requestAnimationFrame y una tarea del event loop; no mide latencia de entrada física ni certifica todas las peticiones asíncronas terminadas. First-paint corresponde al documento Acceso, no a Inicio; puede existir redondeo de timestamps de Chromium.\n'
md +=
  '- Lectura SQL es el intervalo de `pg.Client.query`: incluye servidor, transferencia de filas y decodificación del driver; no es tiempo puro del plan SQL. DTO mide rows.map de las entidades; estado incluye además metadatos/notificaciones. IPC incluye serialización, cola, deserialización y, por separado, el puente de contextIsolation; no es latencia de red. Render → layout effect aproxima render/commit, no separa con precisión style/layout/paint. StrictMode repite render/memos; se informa la primera creación y el intervalo total Renderer.\n'
md +=
  '- Electron muestreado cada 250 ms; PostgreSQL aproximadamente cada 1–1,2 s, limitado al PID del data_directory aislado y sus descendientes. CPU expresada como tiempo acumulado y porcentaje de un núcleo (puede superar 100%). Picos aproximados, no capturan ráfagas menores al intervalo. Para servidor externo, CPU PostgreSQL resta la primera muestra: puede omitir actividad durante el primer segundo. El muestreador y otras aplicaciones del equipo añaden ruido; el ~1% de Main en reposo incluye su observador.\n'
md +=
  '- Working Set/RSS incluye páginas compartidas; sumarlo puede contarlas varias veces. Private Bytes es memoria privada comprometida, no RSS privado. No se suman Vite, monitor PowerShell ni otros PostgreSQL del equipo a los procesos de la app. Las muestras puntuales PostgreSQL pueden estar desplazadas hasta un intervalo.\n'
md +=
  '- El tamaño es JSON UTF-8 lógico del estado obtenido en una sonda posterior al reposo: no bytes exactos del protocolo IPC ni el pico de memoria del login. La sonda y su JSON.stringify se excluyen de todos los tiempos/recursos de arranque y reposo.\n\n'
md +=
  '## Tiempos: conexión configurada, como el desarrollo actual\n\nTodos los valores en ms. N/D indica una fase no ejecutada, no tiempo cero. Las fases anidadas no deben sumarse entre sí.\n\n'
md += tabla(
  ['Fase', ...externos.map((r) => r.nombre)],
  Object.entries(fases).map(([k, v]) => [v, ...externos.map((r) => formato(r.tiempos[k]))])
)
md += '\n## Tiempos: motor administrado por la aplicación\n\n'
md += tabla(
  ['Fase', ...locales.map((r) => r.nombre)],
  Object.entries(fases).map(([k, v]) => [v, ...locales.map((r) => formato(r.tiempos[k]))])
)
md +=
  '\nLa corrida `large-segundo` completó Acceso, login e Inicio; después terminó por `Timeout esperando interactive/ventas`. Sus tiempos de arranque son válidos, pero no se utiliza como medición de reposo ni como navegación completa. Se conserva el JSON de error. Las corridas externas completan las transiciones solicitadas y el reposo de la base grande. El driver posterior restaura/muestra/enfoca la ventana antes de cada navegación; la causa exacta de la marca ausente en aquella corrida no quedó demostrada.\n\n'
md += '## Evidencia de la espera de pg_ctl\n\n'
md += tabla(
  ['Corrida', 'spawn → exit (ms)', 'exit → close (ms)', 'spawn → callback (ms)', 'Resultado'],
  locales
    .filter((r) => r.pgCtl.length)
    .map((r) => {
      const t = (n) => r.pgCtl.find((m) => m.nombre === n)?.ms
      return [
        r.nombre,
        formato(t('pg_ctl-exit') - t('pg_ctl-spawn')),
        formato(t('pg_ctl-close') - t('pg_ctl-exit')),
        formato(t('pg_ctl-callback') - t('pg_ctl-spawn')),
        'exit 0; callback sin error'
      ]
    })
)
md +=
  '\nEl log de la copia grande declara servidor listo en unos 70 ms desde el inicio de postgres.exe; el proceso pg_ctl termina en 0,31–0,43 s, mientras su callback/close llega cerca del timeout de 35.000 ms configurado en `src/main/database/postgres-local.ts`. La diferencia exit/close está medida. **Causa principal probable de esa ruta:** descriptores/stdio heredados mantienen pendiente el cierre observado por execFile/promisify hasta su timeout. No se identificó el handle concreto ni se ensayó una corrección; la herencia es una inferencia, no una optimización validada.\n\n'
md +=
  'Node distingue la salida del proceso de `close`, que espera el cierre de stdio; varios procesos pueden compartir esos streams. Esto respalda la interpretación, sin demostrar qué descriptor permanece abierto aquí. [Documentación Node, evento close](https://nodejs.org/api/child_process.html#event-close). PostgreSQL documenta que `pg_ctl -w` espera disponibilidad del servidor. [Documentación pg_ctl](https://www.postgresql.org/docs/18/app-pg-ctl.html).\n\n'
md += '## Volumen y coste del estado\n\n'
md += tabla(
  [
    'Corrida',
    'Estado JSON (bytes)',
    'Consultas estado',
    'SQL cliente (ms)',
    'DTO (ms)',
    'Entrega IPC + puente (ms)'
  ],
  resultados
    .filter((r) => r.payload != null)
    .map((r) => [
      r.nombre,
      r.payload,
      r.consultas.estado,
      formato(r.tiempos.sqlClienteEstadoMs),
      formato(r.tiempos.dtoMs),
      formato(r.tiempos.ipcMainPreloadMs + r.tiempos.puenteRendererMs)
    ])
)
const grande = resultados.find((r) => r.conteos?.cuentas > 0)
md +=
  '\nEl estado grande conserva aproximadamente 65,34 MB decimales (62,31 MiB), frente a 1.096 bytes de la base pequeña. La pequeña es una referencia vacía, no una instalación pequeña con actividad representativa. El anterior arnés de 65.339.663 bytes no era la ruta completa; esta diferencia menor corresponde al estado autenticado/metadatos de las copias, no a una reducción implementada.\n\n'
md += tabla(['Colección', 'Registros grandes'], Object.entries(grande.conteos))
const detalleGrande =
  resultados.find((r) => r.nombre === 'large-externo-segundo') ||
  resultados.find((r) => r.nombre === 'large-externo-frio')
if (detalleGrande) {
  const raw = read(detalleGrande.nombre + '.json'),
    a = raw.marcas.find((m) => m.nombre === 'estado-start').epoch,
    b = raw.marcas.find((m) => m.nombre === 'estado-end').epoch
  md +=
    '\nDesglose de lectura de estado en ' +
    detalleGrande.nombre +
    ' (tiempo cliente, no EXPLAIN ANALYZE):\n\n'
  md += tabla(
    ['Consulta / tabla', 'Filas', 'ms'],
    raw.sql
      .filter((q) => q.inicio >= a && q.fin <= b)
      .sort((a, b) => b.fin - b.inicio - (a.fin - a.inicio))
      .map((q) => [q.tipo + ' ' + (q.tabla || ''), q.filas, formato(q.fin - q.inicio)])
  )
  md +=
    '\n' +
    tabla(
      ['Conversión DTO', 'Filas', 'ms'],
      detalleGrande.entidades
        .slice()
        .sort((a, b) => b.ms - a.ms)
        .map((e) => [e.entidad, e.filas, formato(e.ms)])
    )
}
md += '\n## Ranking de fases por coste\n\n'
for (const nombre of ['large-frio', 'large-externo-frio', 'large-externo-segundo']) {
  const r = resultados.find((r) => r.nombre === nombre)
  if (!r) continue
  const t = r.tiempos
  const candidatos = [
    ['Persistencia antes de ventana', t.persistenciaMs],
    ['Crear ventana → ready-to-show', t.ventanaReadyMs],
    ['SQL cliente del estado', t.sqlClienteEstadoMs],
    ['Conversión DTO', t.dtoMs],
    ['Entrega IPC + puente', t.ipcMainPreloadMs + t.puenteRendererMs],
    ['Autenticación', t.loginAuthMs],
    ['Renderer tras recibir estado', t.rendererMs]
  ].sort((a, b) => b[1] - a[1])
  md +=
    '**' +
    nombre +
    '** (bloques sin anidar estado dentro de SQL/DTO; hay intervalos menores no incluidos):\n\n' +
    tabla(
      ['Orden', 'Bloque', 'ms'],
      candidatos.map((c, i) => [i + 1, c[0], formato(c[1])])
    ) +
    '\n'
}
md +=
  '## Navegación real\n\nSe usa Inicio → Cuentas → Inicio → Compra/Venta → Inicio en las corridas externas. La tabla diferencia montaje interactivo y llegada de la primera página SQL; Compra/Venta añade el debounce existente de 150 ms. No se etiqueta esa respuesta como pintura final de las filas. Las corridas locales iniciales iban de Cuentas directamente a Compra/Venta y quedan fuera de esta comparación de rutas.\n\n'
md += tabla(
  [
    'Corrida',
    'Transición',
    'Frames/tarea interactiva (ms)',
    'Primera respuesta SQL desde clic (ms)'
  ],
  externos.flatMap((r) =>
    r.navegacion.map((n) => [
      r.nombre,
      n.desde + ' → ' + n.pagina,
      formato(n.interactivoMs),
      formato(n.primeraPaginaSqlMs)
    ])
  )
)
md +=
  '\n## Memoria por proceso\n\nMiB. Muestras tomadas inmediatamente después de detectar Inicio interactivo; el polling del driver puede demorar hasta 100 ms.\n\n'
md += tabla(
  ['Corrida', 'Proceso', 'Working Set / RSS', 'Private Bytes'],
  resultados.flatMap((r) =>
    Object.entries(tipos).map(([k, v]) => [
      r.nombre,
      v,
      formato(r.memoria['post-login'][k].wsMiB),
      formato(r.memoria['post-login'][k].privadoMiB)
    ])
  )
)
const reposos = resultados.filter(
  (r) => r.reposoMs >= 299000 && !r.incompleto && !r.interaccionesReposo
)
md += '\n**Estabilidad observada en cinco minutos: sí, sin crecimiento neto.** En la corrida válida grande, Main bajó de 281,30 a 112,26 MiB, Renderer de 283,72 a 189,48 MiB y PostgreSQL de 245,43 a 180,83 MiB de Working Set. Se observan liberaciones de memoria; no se forzó GC y no se atribuye cada descenso a una causa específica. Esta ventana no prueba ausencia de fugas de largo plazo.\n\n'
md +=
  '\nSe descarta el supuesto reposo de `large-externo-segundo`: registró seis navegaciones y 19 consultas, terminando en Empleados. Sus tiempos de arranque y sus cuatro transiciones automáticas previas siguen siendo válidos. Se repitió el reposo en `large-externo-reposo`, con entrada de teclado/ratón deshabilitada temporalmente, ventana visible y aplicación real. Ese control de entrada difiere de las primeras corridas; no altera las reglas de negocio. Los picos de toda la corrida original pueden incluir esas interacciones y no se atribuyen a inactividad.\n\n'
md += '\n### Tras cinco minutos sin actividad\n\n'
md += tabla(
  ['Corrida', 'Proceso', 'WS inicio reposo', 'WS tras 5 min', 'Private Bytes tras 5 min', 'Δ WS'],
  reposos.flatMap((r) =>
    Object.entries(tipos).map(([k, v]) => {
      const a = r.memoria['idle-start'][k],
        b = r.memoria['idle-end'][k]
      return [
        r.nombre,
        v,
        formato(a.wsMiB),
        formato(b.wsMiB),
        formato(b.privadoMiB),
        formato(b.wsMiB - a.wsMiB)
      ]
    })
  )
)
md += '\n### Picos observados y navegación (sin sonda de tamaño)\n\n'
md += tabla(
  [
    'Corrida',
    'Proceso',
    'Pico WS (MiB)',
    'WS tras Cuentas',
    'WS tras Compra/Venta',
    'WS tras volver a Inicio'
  ],
  externos.flatMap((r) => {
    const raw = read(r.nombre + '.json'),
      hasta = raw.marcas.find((m) => m.nombre === 'idle-end').epoch
    return Object.entries(tipos)
      .filter(([k]) => k !== 'PostgreSQL')
      .map(([k, v]) => [
        r.nombre,
        v,
        formato(
          Math.max(
            ...raw.recursos
              .filter((s) => s.epoch <= hasta)
              .map(
                (s) =>
                  s.procesos
                    .filter((p) => p.type === k)
                    .reduce((n, p) => n + p.memory.workingSetSize, 0) / 1024
              )
          )
        ),
        ...['post-cuentas', 'post-ventas', 'post-inicio'].map((c) =>
          formato(r.memoria[c]?.[k].wsMiB)
        )
      ])
  })
)
md +=
  '\n### PIDs al terminar el reposo\n\nLos archivos crudos conservan todos los PIDs PostgreSQL y sus muestras; la suma anterior solo corresponde al clúster aislado.\n\n'
md += tabla(
  ['Corrida', 'Tipo', 'PID', 'WS (MiB)', 'Private Bytes (MiB)'],
  reposos
    .filter((r) => r.nombre.includes('externo'))
    .flatMap((r) =>
      read(r.nombre + '.json')
        .recursos.find((s) => s.etiqueta === 'idle-end')
        .procesos.map((p) => [
          r.nombre,
          tipos[p.type] || p.type,
          p.pid,
          formato(p.memory.workingSetSize / 1024),
          formato(p.memory.privateBytes / 1024)
        ])
    )
)
md +=
  '\n## CPU durante arranque y reposo\n\nCPU acumulada en ms hasta la muestra post-login; pico como % de un núcleo. PostgreSQL externo: acumulación desde primera muestra, según limitación indicada.\n\n'
md += tabla(
  ['Corrida', 'Proceso', 'CPU acumulada (ms)', 'Pico aproximado (%)'],
  resultados.flatMap((r) => [
    ...Object.entries(r.cpuArranque).map(([k, v]) => [
      r.nombre,
      tipos[k],
      formato(v.ms),
      formato(v.picoPorcentajeUnNucleo)
    ]),
    [
      r.nombre,
      'PostgreSQL (suma)',
      formato(r.postgresCpu.arranqueMs),
      formato(r.postgresCpu.picoArranque)
    ]
  ])
)
md += '\nReposo de cinco minutos, después de volver a Inicio, sin la sonda de tamaño:\n\n'
md += tabla(
  ['Corrida', 'Proceso', 'CPU en reposo (ms)', 'Promedio (%)', 'Pico (%)'],
  reposos.flatMap((r) => [
    ...Object.entries(r.cpuReposo).map(([k, v]) => [
      r.nombre,
      tipos[k],
      formato(v.ms),
      formato(v.promedioPorcentajeUnNucleo),
      formato(v.picoPorcentajeUnNucleo)
    ]),
    [
      r.nombre,
      'PostgreSQL (suma)',
      formato(r.postgresCpu.reposoMs),
      formato((100 * r.postgresCpu.reposoMs) / r.reposoMs),
      formato(r.postgresCpu.picoReposo)
    ]
  ])
)
md +=
  '\n' +
  tabla(
    [
      'Corrida',
      'Reposo medido (s)',
      'SQL durante reposo',
      'Máxima demora del event loop Main en arranque (ms)'
    ],
    reposos.map((r) => [
      r.nombre,
      formato(r.reposoMs / 1000),
      r.consultas.reposo,
      formato(r.mainBloqueoMaxMs)
    ])
  )
md +=
  '\nLa demora del event loop mide retraso de temporizador (resolución base de 20 ms), no atribución de CPU por función. Sí existen ráfagas de trabajo Main al leer/convertir/serializar el estado; la espera de 35 s no es 35 s de CPU bloqueada. Cinco minutos no permiten descartar fugas de largo plazo.\n\n'
md +=
  '## Consumidores y viabilidad de Snapshot parcial\n\nInicio usa ventas, gastos, movimientosCuenta, cuentas y compras para resumirPeriodo, además de identidad y ControlJornada. El Provider creaLecturaDominio recorre cuentas y calcula saldos/consecutivos usando ventas y movimientos; no admite sustituir colecciones ausentes por vacíos sin cambiar resultados. Header/Sidebar requieren identidad, roles y notificaciones. Cambios de página y comandos asumen hoy un estado completo.\n\n'
md +=
  'Se inventariaron los 27 puntos de consumo directo con el AST TypeScript; el siguiente mapa no equivale aún a un diseño de hidratación, invalidación ni equivalencia financiera. También deben revisarse crearLecturaDominio, hooks de listados/notificaciones, utilidades de reportes, respuestas de comandos y persistencia antes de modificar el contrato.\n\n'
md += tabla(
  ['Archivo / línea', 'Consumidor', 'Campos y acciones'],
  read('consumidores-contexto.json').map((c) => [
    c.archivo.replaceAll('\\', '/') + ':' + c.linea,
    c.consumidor,
    c.campos.replaceAll('|', '\\|')
  ])
)
md += '\n## Tres acciones propuestas, ordenadas por impacto y riesgo\n\n'
md +=
  '1. **Corregir la espera de lanzamiento del motor administrado**, solo después de aprobar este diagnóstico. Impacto potencial más alto en esa ruta: unos 34,6 s observados entre exit y close; no beneficia directamente a la conexión externa. Riesgo medio: preservar logs, validación de disponibilidad, timeout, cierre y arranque sin consola. Ensayar manejo explícito de streams/lifecycle de pg_ctl en una copia; no resolver el Promise solo por exit sin comprobar errores/disponibilidad. Repetir ambos arranques y probar motor fallido/puerto ocupado/datos conservados. Ahorro aún no demostrado.\n'
md +=
  '2. **Diseñar estado inicial específico para Inicio con carga de módulos por demanda.** Prioridad de escalabilidad para la ruta externa: evitar materializar/transmitir 65 MB cuando Inicio necesita un resumen. Impacto potencial en login y memoria, riesgo alto por contratos, saldos, permisos, consecutivos, invalidaciones y comandos. Primero completar el mapa anterior y diseñar un contrato explícito de resumen/hidratación; nunca llenar con arrays vacíos y darlo por equivalente. Benchmark y equivalencia contra Snapshot completo antes de conservar un cambio.\n'
md +=
  '3. **Experimento acotado de carga diferida de páginas distintas de Inicio.** El bloque ventana→ready-to-show está medido, pero no se ha separado cuánto es descarga Vite, parseo JS, React, CSS o pintura. Se observaron 78 recursos y ~5,13 MB decodificados en desarrollo; no son tamaño de bundle de release. Riesgo bajo/medio, beneficio incierto. Si se autoriza, comparar tamaño y tiempos antes/después en el mismo modo; descartar si es despreciable. No se implementó React.lazy en este diagnóstico.\n\n'
md += tabla(
  ['Opción', 'Recomendación explícita', 'Justificación / condición'],
  [
    [
      'Splash screen',
      'Sí para motor administrado; no priorizar para conexión externa',
      'Solo experiencia percibida mientras existe la larga espera anterior a Acceso. Primero corregir la causa; reevaluar necesidad después. No mejora rendimiento.'
    ],
    [
      'Lazy React',
      'No conservar/aplicar ahora; sí a un experimento posterior',
      'No hay comparación A/B ni atribución suficiente al parseo/carga JS.'
    ],
    [
      'Snapshot parcial',
      'Sí como siguiente diseño de escalabilidad; no implementarlo todavía',
      'Volumen y coste demostrados; completar consumidores/contratos y pruebas de equivalencia antes de cambiar AppDataContext.'
    ],
    [
      'Worker / UtilityProcess',
      'No como siguiente optimización',
      'Hay ráfagas Main, pero la mayor espera local es asíncrona y gran parte del coste de login está en transferencia/copia. Un worker podría añadir otra copia. Requiere perfil CPU por función antes.'
    ],
    [
      'Nuevos índices',
      'No',
      'SQL cliente incluye transferencia de todas las filas; no existe EXPLAIN ANALYZE comparativo que justifique un índice ni migración 011.'
    ],
    [
      'V8 snapshot',
      'No',
      'Parseo/carga JS no están aislados como coste significativo; no iniciar por intuición.'
    ]
  ]
)
if (fs.existsSync(path.join(dir, 'nuevo-frio.json'))) {
  const nuevo = read('nuevo-frio.json'),
    marca = (n) => nuevo.marcas.find((m) => m.nombre === n)?.epoch
  const delta = (a, b) => formato(marca(b) - marca(a))
  md += '\n## C. Primera instalación real: initdb separado del arranque recurrente\n\n'
  md +=
    'Perfil temporal nuevo, sin data, credenciales de motor ni usuarios anteriores. La aplicación real ejecutó initdb y las migraciones normales, hasta mostrar Crear usuario. **No hubo alta de administrador ni login en C**: son onboarding posterior, y no se inventa un tiempo hasta Inicio para una instalación sin usuario. Login, navegación y reposo están medidos en A/B. A conecta a servidor activo; B inicia un clúster ya configurado; C crea uno nuevo. Las mediciones de B no incluyen initdb.\n\n'
  md += tabla(
    ['Fase C', 'ms'],
    [
      ['Proceso → app.whenReady', delta('process-start', 'app-whenReady')],
      ['Persistencia total', delta('persistencia-start', 'persistencia-end')],
      [
        'Verificación ejecutables',
        delta('postgres-verificacion-start', 'postgres-verificacion-end')
      ],
      ['initdb exclusivamente', delta('initdb-start', 'initdb-end')],
      [
        'Conexión inicial/pg_ctl → postgres-ready',
        delta('postgres-conexion-start', 'postgres-ready')
      ],
      ['BaseLocal.iniciar y migraciones nuevas', delta('base-iniciar-start', 'base-iniciar-end')],
      ['Ventana → ready-to-show', delta('window-create', 'window-ready-to-show')],
      ['Proceso → Crear usuario visible', delta('process-start', 'acceso-visible')],
      ['Login → Inicio', 'N/D: no existe usuario aún']
    ]
  )
  const muestra = nuevo.recursos.find((s) => s.etiqueta === 'acceso-visible'),
    pg = read('nuevo-frio-postgres.json')
  const cercano = pg.reduce((a, b) =>
    Math.abs(a.epoch - muestra.epoch) < Math.abs(b.epoch - muestra.epoch) ? a : b
  )
  md +=
    '\nRecursos de C al llegar al acceso inicial:\n\n' +
    tabla(
      ['Proceso', 'WS MiB', 'Private Bytes MiB', 'CPU acumulada ms'],
      muestra.procesos
        .map((p) => [
          tipos[p.type] || p.type,
          formato(p.memory.workingSetSize / 1024),
          formato(p.memory.privateBytes / 1024),
          formato(p.cpu.cumulativeCPUUsage * 1000)
        ])
        .concat([
          [
            'PostgreSQL (suma)',
            formato(cercano.procesos.reduce((n, p) => n + p.workingSetBytes, 0) / 1048576),
            formato(cercano.procesos.reduce((n, p) => n + p.privateBytes, 0) / 1048576),
            'Ver muestras por PID; no sumar initdb a CPU recurrente'
          ]
        ])
    )
  md +=
    '\nC no tiene reposo de cinco minutos ni estado comercial autenticado. Sus muestras PostgreSQL incluyen el servidor final, no todos los procesos transitorios de initdb; el tiempo de initdb sí está delimitado directamente. Evidencia: nuevo-frio.json, nuevo-frio-postgres.json y nuevo-frio-crear-administrador.png. Es una primera instalación de proceso/almacenamiento en el equipo actual; no es una prueba del instalador en Windows limpio.\n\n'
}
md += '\n## Evidencias, reproducción y siguiente paso\n\n'
md +=
  '**Límite de conservación del origen:** la preparación terminó con las 25 huellas iguales. El cotejo final detectó auditoria 164→166 filas, sesiones 86→87 y cambio de huella de usuarios (siguen 2 filas). La lectura de actividad identifica una sesión original abierta el 13/10/2026 a las 11:53:42 y cerrada normalmente a las 11:54:01 (UTC−5), con dos autenticaciones fallidas a las 11:53:54 y 11:53:58. Coincide con el período de intentos iniciales; los registros disponibles no permiten atribuir de forma concluyente su origen ni excluir un intento previo de la instrumentación. Las corridas finales verificadas apuntan a copias en puerto 55436; el origen usa 5432. No se restauraron contadores ni se borró auditoría para ocultar diferencias. El resto de las 22 tablas mantiene conteos y huellas. Se conserva `original-final.json`; esta condición impide afirmar cumplimiento íntegro de la restricción de cero escrituras en la base real.\n\n'
if (fs.existsSync(path.join(dir, 'validacion-comandos.json'))) {
  const validaciones = read('validacion-comandos.json')
  md +=
    tabla(
      ['Validación', 'Resultado'],
      Object.entries(validaciones).map(([k, v]) => [k, String(v)])
    ) + '\n'
}
md +=
  'Evidencia primaria: `docs/evidencias-arranque-real/*-frio.json`, `*-segundo.json`, muestras `*-postgres.json`, capturas `*-inicio.png`, `preparacion.json`, `original-final.json`, `consumidores-contexto.json`, `resumen.json` y [tabla completa de marcas](evidencias-arranque-real/marcas.md). No contienen passwords ni filas comerciales; las capturas muestran la UI de la copia. Dumps/credenciales cifradas permanecen en perfiles temporales fuera del repositorio y no son entregables.\n\n'
md +=
  'Incidencia adicional: el cierre de la primera copia grande registró un conflicto de la restricción `respaldo_automatico_equivalente` y un warning de transacción. Ocurrió después de guardar las mediciones, fuera de arranque/reposo; se conserva el extracto `pg-cierre-incidencias.txt`. No se modificó el respaldo ni se investigó/corrigió esa ruta en este diagnóstico. No afecta a las huellas del origen.\n\n'
md +=
  'Preparación: `electron scripts/preparar-perfil-real.cjs` crea copias nuevas (no hace falta repetirla mientras se conserven). Ruta administrada: establecer RCM_PERFIL_ESCENARIO=small/large y RCM_PERFIL_CORRIDA=frio/segundo; dejar RCM_PERFIL_CONEXION sin definir. Ruta externa: primero `electron scripts/conexion-perfil-externo.cjs small` (o large), luego RCM_PERFIL_CONEXION=externa y el mismo driver; al terminar `electron scripts/conexion-perfil-externo.cjs small --detener`. Ejecutar perfiles secuencialmente porque pueden compartir puerto. Cada driver carga la app real mediante electron-vite dev. `electron scripts/preparar-perfil-real.cjs --verificar` solo coteja el origen en READ ONLY. `node scripts/resumir-perfil-real.cjs` y `node scripts/documentar-perfil-real.cjs` regeneran tablas/informe.\n\n'
md +=
  'Se conserva instrumentación opt-in (`RCM_PERFIL_ARRANQUE=1` con el driver); sin ese modo no se publican marcas ni se ejecutan los muestreadores. No se retiró evidencia ni se alteraron las reglas de negocio. Fecha de operación de Cuentas conservada. Sin seed, release build, commit, push ni tag.\n\n'
md +=
  '**Siguiente paso:** revisar este diagnóstico y escoger un único experimento: resolver el lifecycle de pg_ctl si el objetivo es el motor administrado, o diseñar la carga inicial mínima si el objetivo es el desarrollo con servidor externo. Aplicar y medir ese cambio en una tarea posterior; este corte entrega mediciones y recomendaciones, no una mejora de rendimiento.\n'
md += '\n## Estado exacto y archivos modificados\n\n'
md +=
  'Diagnóstico A/B y reposo completados; C queda delimitado hasta Crear usuario, según su tabla. Instrumentación opt-in en Main (index, perfil-arranque, database/base, conexion, ipc, postgres-local, relacional), preload (index.ts y tipos), Renderer (App, Acceso, main, inicio, AppDataContext, utils/perfilArranque). No se aplicaron optimizaciones. Los cambios funcionales anteriores de Fecha de operación siguen en Cuentas/DetalleCuenta y tests/cuentas-fecha; versiones package/lock y su informe previo se conservan. `.eslintcache` ya figuraba eliminado al retomar: no se revirtió.\n\n'
md +=
  'Scripts existentes extendidos: perfil-aplicacion-real.cjs, preparar-perfil-real.cjs, conexion-perfil-externo.cjs, perfil-recursos-postgres.ps1, resumir-perfil-real.cjs, documentar-perfil-real.cjs y verificar-perfil-real.cjs. Perfil-parche.cjs y evidencias anteriores siguen siendo arnés, separados de las corridas reales. Documentos obligatorios actualizados junto con evidencias-arranque-real.\n\n'
md +=
  'Pruebas humanas pendientes: equipo final/instalador offline (requiere tarea autorizada de release), ingreso con teclado físico y revisión visual de Cuentas, primera creación de usuario y primer login de instalación nueva. No se afirma revisión humana ni equivalencia de performance de release. La atribución de cambios en las tres tablas de acceso del origen sigue sin resolución concluyente.\n\n'
md += '## CONTINUAR DESDE AQUÍ\n\n'
md +=
  '1. Leer este informe y original-final.json; no repetir A/B ni los reposos válidos.\n2. Revisar la incidencia del origen en solo lectura, sin restaurar datos, contadores ni auditoría.\n3. Para motor administrado, elegir como próximo experimento la espera exit/close de pg_ctl; para servidor externo, diseñar el contrato inicial mínimo antes de editar AppDataContext.\n4. No tocar migraciones 001–010, base original, reglas de negocio, Fecha de operación ni evidencia de estas mediciones. No crear 011.\n5. Si se hacen cambios posteriores, ejecutar desde electron-app: `npm run typecheck`, `npm run lint -- --no-cache`, `npm run db:test`, `git diff --check`. La suite de este corte ya terminó; no repetirla solo por perder la sesión del terminal.\n6. Regenerar únicamente documentos/tablas con `node scripts/resumir-perfil-real.cjs` y `node scripts/documentar-perfil-real.cjs`; comprobar invariantes con `node scripts/verificar-perfil-real.cjs`.\n7. Para repetir solo C en otra tarea: `electron scripts/preparar-perfil-real.cjs --nuevo`; establecer RCM_PERFIL_ESCENARIO=nuevo, RCM_PERFIL_CORRIDA=frio, RCM_PERFIL_CONEXION=local y ejecutar `electron-vite dev --entry scripts/perfil-aplicacion-real.cjs`. No recrear perfiles small/large.\n8. Conservar el cierre sin seed, build de release, commit, push ni tag. No iniciar optimizaciones sin presentar/revisar este diagnóstico.\n\n'
md +=
  'Ninguna prueba de regresión queda ejecutándose al cierre. El log db-test.txt termina con Suite PostgreSQL completa (ruizcacao-tests-oQgSqd); el código de salida del terminal anterior no pudo recuperarse tras la interrupción, por lo que se registra el resultado funcional del log. Los últimos comandos de cierre y sus resultados figuran en validacion-comandos.json y la continuidad.\n'
fs.writeFileSync(path.join(dir, '../Informe_Perfil_Arranque_Real_v1.2.1.md'), md)
const marcasRequeridas = [
  'process-start',
  'app-whenReady',
  'persistencia-start',
  'postgres-verificacion-end',
  'postgres-ready',
  'base-iniciar-start',
  'base-iniciar-end',
  'window-create',
  'window-ready-to-show',
  'acceso-render',
  'login-click',
  'login-main-start',
  'login-auth-end',
  'estado-start',
  'estado-end',
  'ipc-response-start',
  'ipc-response-end',
  'estado-received',
  'AppDataContext-ready',
  'Inicio-render-start',
  'Inicio-render-end',
  'first-paint',
  'interactive'
]
fs.writeFileSync(
  path.join(dir, 'marcas.md'),
  '# Marcas desde process-start (ms)\n\n' +
    tabla(
      ['Marca', ...resultados.map((r) => r.nombre)],
      marcasRequeridas.map((nombre) => [
        nombre,
        ...resultados.map((r) => {
          const raw = read(r.nombre + '.json'),
            start = raw.marcas.find((m) => m.nombre === 'process-start').epoch
          const m = raw.marcas.find(
            (m) =>
              m.nombre === nombre &&
              (!nombre.startsWith('ipc-response') || m.detalle?.canal === 'login')
          )
          return formato(m ? m.epoch - start : null)
        })
      ])
    )
)
console.log('Informe y tabla completa de marcas actualizados.')
