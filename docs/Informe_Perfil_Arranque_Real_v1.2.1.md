# Informe de perfil de arranque real — RuizCacao Manager 1.2.1

Fecha: 2026-10-13, America/Guayaquil. Diagnóstico de la aplicación completa en desarrollo, sin optimizaciones implementadas.

## Conclusión y alcance

**Incidencia que limita el cierre:** el cotejo final del origen coincide en 22/25 tablas. Cambiaron sesiones, auditoria y usuarios durante el período de intentos iniciales; las tablas comerciales conservan sus huellas. La atribución no es concluyente y no puede afirmarse cumplimiento íntegro de cero escrituras. Se detallan las fechas y evidencia al final.

**Resultado principal de la ruta de desarrollo:** con conexión externa y base grande, Inicio quedó interactivo en 4,39 s / 3,49 s desde el proceso (primer/segundo arranque), frente a 2,01 s / 1,82 s con base pequeña. Login → Inicio: 2,02 s / 1,90 s frente a 280 ms / 261 ms. En el segundo arranque grande, construir y entregar el estado consume aproximadamente el 83% del login. **Causa principal del login:** lectura/conversión/transporte del estado global. **Causa secundaria del arranque externo:** creación/carga de ventana y UI (1,08–1,87 s), sin atribución demostrada a parseo JS.

**Hay dos rutas distintas.** La configuración de desarrollo existente contiene `postgres.enc`: conecta a un servidor ya activo y omite `PostgresLocal`. La espera de unos 35 segundos pertenece a la ruta de motor administrado por la aplicación, con PostgreSQL detenido al comenzar. No se atribuye esa espera al desarrollo con servidor externo. Ambas rutas se ejecutaron contra copias aisladas, usando el entrypoint, preload, Acceso, autenticación, IPC, contexto y páginas reales.

En el motor administrado, `pg_ctl` sale con código 0 mucho antes de que cierre su comunicación con Node. La espera hasta la respuesta consume casi todo el arranque. En la ruta externa, el coste de cargar la interfaz y el de leer/convertir/transportar el estado global son los dos bloques relevantes; el aumento por volumen de datos aparece sobre todo después del login. Los números siguientes separan ambas causas.

## Método y límites

- Windows 10.0.26100, Intel Core i5-12450H, Electron 44.3.0 / Node 24.20.0; 12 procesadores lógicos, aproximadamente 15,70 GiB de RAM. PostgreSQL 18.6 en las copias. Ventana visible de aproximadamente 900 × 670 DIP, CSS completo, React desarrollo y StrictMode.
- `electron-vite dev --entry scripts/perfil-aplicacion-real.cjs` carga `out/main/index.js` real. La transpilación de desarrollo y el servidor Vite comienzan antes del proceso medido y quedan fuera de su tiempo/consumo. No se ejecutó build de release ni empaquetado. No son cifras del instalador ni del modo production.
- “Frío” significa proceso Electron nuevo; no se vació caché del sistema ni se reinició Windows. “Segundo” es otro proceso con el mismo perfil y cierre previo normal. En la ruta externa el servidor permanece activo entre ambos. En la administrada se detiene en cada cierre. Son observaciones individuales, no medianas ni percentiles.
- Base pequeña nueva, con administrador y sin operaciones comerciales; base grande restaurada mediante pg_dump/pg_restore desde el desarrollo existente, sin ejecutar seed. Contraseña temporal cambiada únicamente en la copia. Login, sesiones, avisos, cierre de jornada y respaldos operan normalmente en esas copias. Novedades se marca vista en su almacenamiento aislado para medir un acceso recurrente.
- Las conexiones de preparación/cotejo usan READ ONLY y pg_dump; las corridas guardadas señalan perfiles y clústeres aislados. El cotejo final conserva 22/25 tablas, incluidas todas las comerciales, pero difieren sesiones, auditoria y usuarios. No se puede certificar ausencia total de escrituras en el origen durante toda la sesión; véase incidencia detallada. Migraciones 001–010 no editadas; no hay 011 ni índices nuevos.
- `process-start` se estima con el uptime de Node; incluye el preflight del driver, decenas de milisegundos. Reloj de cada proceso: performance.timeOrigin + performance.now. `interactive` significa commit, dos requestAnimationFrame y una tarea del event loop; no mide latencia de entrada física ni certifica todas las peticiones asíncronas terminadas. First-paint corresponde al documento Acceso, no a Inicio; puede existir redondeo de timestamps de Chromium.
- Lectura SQL es el intervalo de `pg.Client.query`: incluye servidor, transferencia de filas y decodificación del driver; no es tiempo puro del plan SQL. DTO mide rows.map de las entidades; estado incluye además metadatos/notificaciones. IPC incluye serialización, cola, deserialización y, por separado, el puente de contextIsolation; no es latencia de red. Render → layout effect aproxima render/commit, no separa con precisión style/layout/paint. StrictMode repite render/memos; se informa la primera creación y el intervalo total Renderer.
- Electron muestreado cada 250 ms; PostgreSQL aproximadamente cada 1–1,2 s, limitado al PID del data_directory aislado y sus descendientes. CPU expresada como tiempo acumulado y porcentaje de un núcleo (puede superar 100%). Picos aproximados, no capturan ráfagas menores al intervalo. Para servidor externo, CPU PostgreSQL resta la primera muestra: puede omitir actividad durante el primer segundo. El muestreador y otras aplicaciones del equipo añaden ruido; el ~1% de Main en reposo incluye su observador.
- Working Set/RSS incluye páginas compartidas; sumarlo puede contarlas varias veces. Private Bytes es memoria privada comprometida, no RSS privado. No se suman Vite, monitor PowerShell ni otros PostgreSQL del equipo a los procesos de la app. Las muestras puntuales PostgreSQL pueden estar desplazadas hasta un intervalo.
- El tamaño es JSON UTF-8 lógico del estado obtenido en una sonda posterior al reposo: no bytes exactos del protocolo IPC ni el pico de memoria del login. La sonda y su JSON.stringify se excluyen de todos los tiempos/recursos de arranque y reposo.

## Tiempos: conexión configurada, como el desarrollo actual

Todos los valores en ms. N/D indica una fase no ejecutada, no tiempo cero. Las fases anidadas no deben sumarse entre sí.

| Fase | small-externo-frio | small-externo-segundo | large-externo-frio | large-externo-segundo | large-externo-reposo |
|---|---|---|---|---|---|
| Proceso → app.whenReady | 121,02 | 116,82 | 127,28 | 117,35 | 167,06 |
| Persistencia completa | 151,56 | 107,59 | 146,31 | 97,32 | 172,54 |
| Verificación de ejecutables PG | N/D | N/D | N/D | N/D | N/D |
| Conexión inicial / pg_ctl → postgres-ready | N/D | N/D | N/D | N/D | N/D |
| Conexión del pool | 42,90 | 42,15 | 42,50 | 38,79 | 45,01 |
| BaseLocal.iniciar completo | 143,44 | 98,60 | 139,87 | 90,89 | 160,69 |
| Crear ventana → ready-to-show | 1.200,04 | 1.042,99 | 1.865,11 | 1.082,25 | 1.169,06 |
| Proceso → Acceso visible | 1.621,38 | 1.399,34 | 2.271,72 | 1.424,64 | 1.636,82 |
| Pausa automática antes del clic | 103,70 | 164,30 | 106,80 | 158,70 | 114,00 |
| Autenticación Main | 146,74 | 165,57 | 238,01 | 187,86 | 147,84 |
| Estado completo Main | 66,65 | 41,61 | 1.009,50 | 916,28 | 880,23 |
| Lectura SQL vista por cliente pg | 56,85 | 29,44 | 785,09 | 665,42 | 647,39 |
| Conversión filas → DTO | 0,13 | 0,10 | 215,41 | 241,60 | 222,00 |
| Respuesta Main → resolución en preload | 4,64 | 3,31 | 277,05 | 267,18 | 313,63 |
| Preload → estado recibido en Renderer | 0,20 | 0,10 | 379,40 | 391,30 | 362,40 |
| Estado recibido → Inicio interactivo | 52,00 | 45,80 | 94,30 | 104,90 | 173,00 |
| Primera creación AppDataContext | 0,50 | 0,20 | 25,60 | 31,50 | 23,20 |
| Primer render Inicio → primer layout effect | 4,50 | 3,50 | 7,50 | 7,90 | 10,20 |
| Primer commit → frames/tarea interactiva | 40,70 | 35,40 | 38,80 | 34,40 | 74,60 |
| Login → Inicio interactivo | 280,40 | 261,30 | 2.015,40 | 1.904,60 | 1.883,30 |
| Proceso → Inicio interactivo | 2.005,48 | 1.824,94 | 4.393,92 | 3.487,94 | 3.634,12 |
| Proceso → first-paint del documento | 1.622,08 | 1.315,64 | 2.280,72 | 1.340,64 | 1.553,72 |

## Tiempos: motor administrado por la aplicación

| Fase | small-frio | small-segundo | large-frio | large-segundo |
|---|---|---|---|---|
| Proceso → app.whenReady | 108,12 | 102,69 | 108,72 | 107,83 |
| Persistencia completa | 35.605,92 | 35.614,30 | 35.596,67 | 35.648,43 |
| Verificación de ejecutables PG | 141,92 | 146,49 | 153,25 | 148,76 |
| Conexión inicial / pg_ctl → postgres-ready | 35.115,07 | 35.208,47 | 35.131,49 | 35.223,65 |
| Conexión del pool | 134,51 | 35,36 | 51,87 | 35,51 |
| BaseLocal.iniciar completo | 188,44 | 92,55 | 138,11 | 104,01 |
| Crear ventana → ready-to-show | 1.511,32 | 1.423,55 | 1.671,48 | 1.468,49 |
| Proceso → Acceso visible | 37.392,60 | 37.329,72 | 37.586,53 | 37.429,97 |
| Pausa automática antes del clic | 109,20 | 192,00 | 139,60 | 150,80 |
| Autenticación Main | 168,92 | 182,36 | 204,69 | 130,40 |
| Estado completo Main | 38,86 | 34,92 | 1.063,45 | 1.008,99 |
| Lectura SQL vista por cliente pg | 28,29 | 25,87 | 754,70 | 730,42 |
| Conversión filas → DTO | 0,07 | 0,08 | 300,24 | 269,70 |
| Respuesta Main → resolución en preload | 0,73 | 0,63 | 232,74 | 232,32 |
| Preload → estado recibido en Renderer | 0,10 | 0,10 | 331,60 | 372,50 |
| Estado recibido → Inicio interactivo | 34,10 | 36,30 | 76,70 | 79,30 |
| Primera creación AppDataContext | 0,20 | 0,20 | 20,50 | 24,70 |
| Primer render Inicio → primer layout effect | 2,40 | 2,50 | 6,90 | 6,40 |
| Primer commit → frames/tarea interactiva | 26,80 | 28,60 | 30,20 | 29,90 |
| Login → Inicio interactivo | 248,10 | 260,10 | 1.917,70 | 1.833,80 |
| Proceso → Inicio interactivo | 37.749,90 | 37.781,82 | 39.643,83 | 39.414,57 |
| Proceso → first-paint del documento | 37.260,00 | 37.166,12 | 37.411,33 | 37.246,27 |

La corrida `large-segundo` completó Acceso, login e Inicio; después terminó por `Timeout esperando interactive/ventas`. Sus tiempos de arranque son válidos, pero no se utiliza como medición de reposo ni como navegación completa. Se conserva el JSON de error. Las corridas externas completan las transiciones solicitadas y el reposo de la base grande. El driver posterior restaura/muestra/enfoca la ventana antes de cada navegación; la causa exacta de la marca ausente en aquella corrida no quedó demostrada.

## Evidencia de la espera de pg_ctl

| Corrida | spawn → exit (ms) | exit → close (ms) | spawn → callback (ms) | Resultado |
|---|---|---|---|---|
| large-frio | 425,75 | 34.582,97 | 35.008,68 | exit 0; callback sin error |
| large-segundo | 314,16 | 34.698,63 | 35.012,66 | exit 0; callback sin error |

El log de la copia grande declara servidor listo en unos 70 ms desde el inicio de postgres.exe; el proceso pg_ctl termina en 0,31–0,43 s, mientras su callback/close llega cerca del timeout de 35.000 ms configurado en `src/main/database/postgres-local.ts`. La diferencia exit/close está medida. **Causa principal probable de esa ruta:** descriptores/stdio heredados mantienen pendiente el cierre observado por execFile/promisify hasta su timeout. No se identificó el handle concreto ni se ensayó una corrección; la herencia es una inferencia, no una optimización validada.

Node distingue la salida del proceso de `close`, que espera el cierre de stdio; varios procesos pueden compartir esos streams. Esto respalda la interpretación, sin demostrar qué descriptor permanece abierto aquí. [Documentación Node, evento close](https://nodejs.org/api/child_process.html#event-close). PostgreSQL documenta que `pg_ctl -w` espera disponibilidad del servidor. [Documentación pg_ctl](https://www.postgresql.org/docs/18/app-pg-ctl.html).

## Volumen y coste del estado

| Corrida | Estado JSON (bytes) | Consultas estado | SQL cliente (ms) | DTO (ms) | Entrega IPC + puente (ms) |
|---|---|---|---|---|---|
| small-frio | 1096 | 16 | 28,29 | 0,07 | 0,83 |
| small-segundo | 1096 | 16 | 25,87 | 0,08 | 0,73 |
| large-frio | 65340429 | 16 | 754,70 | 300,24 | 564,34 |
| small-externo-frio | 1096 | 16 | 56,85 | 0,13 | 4,84 |
| small-externo-segundo | 1096 | 16 | 29,44 | 0,10 | 3,41 |
| large-externo-frio | 65340664 | 16 | 785,09 | 215,41 | 656,45 |
| large-externo-segundo | 65340664 | 16 | 665,42 | 241,60 | 658,48 |
| large-externo-reposo | 65340664 | 16 | 647,39 | 222,00 | 676,03 |

El estado grande conserva aproximadamente 65,34 MB decimales (62,31 MiB), frente a 1.096 bytes de la base pequeña. La pequeña es una referencia vacía, no una instalación pequeña con actividad representativa. El anterior arnés de 65.339.663 bytes no era la ruta completa; esta diferencia menor corresponde al estado autenticado/metadatos de las copias, no a una reducción implementada.

| Colección | Registros grandes |
|---|---|
| empleados | 3 |
| clientes | 1004 |
| proveedores | 506 |
| compras | 10014 |
| ventas | 15007 |
| cuentas | 25021 |
| movimientosCuenta | 16695 |
| movimientosStock | 25450 |
| gastos | 13019 |

Desglose de lectura de estado en large-externo-segundo (tiempo cliente, no EXPLAIN ANALYZE):

| Consulta / tabla | Filas | ms |
|---|---|---|
| SELECT cuentas | 25021 | 147,82 |
| SELECT movimientos_stock | 25450 | 119,13 |
| SELECT compras | 10014 | 95,98 |
| SELECT gastos | 13019 | 88,39 |
| SELECT ventas | 15007 | 85,53 |
| SELECT movimientos_cuenta | 16695 | 84,13 |
| SELECT clientes | 1004 | 16,33 |
| SELECT proveedores | 506 | 9,08 |
| SELECT empleados | 3 | 6,62 |
| SELECT jornadas | 0 | 3,18 |
| SELECT notificaciones | 4 | 3,04 |
| SELECT configuracion | 1 | 1,99 |
| SELECT productos | 3 | 1,79 |
| SELECT existencias | 3 | 1,25 |
| SELECT usuarios | 2 | 0,73 |
| SELECT configuracion | 1 | 0,42 |

| Conversión DTO | Filas | ms |
|---|---|---|
| cuentas | 25021 | 60,92 |
| ventas | 15007 | 44,26 |
| compras | 10014 | 36,58 |
| movimientosStock | 25450 | 33,09 |
| movimientosCuenta | 16695 | 32,09 |
| gastos | 13019 | 29,62 |
| clientes | 1004 | 4,11 |
| proveedores | 506 | 0,77 |
| empleados | 3 | 0,17 |

## Ranking de fases por coste

**large-frio** (bloques sin anidar estado dentro de SQL/DTO; hay intervalos menores no incluidos):

| Orden | Bloque | ms |
|---|---|---|
| 1 | Persistencia antes de ventana | 35.596,67 |
| 2 | Crear ventana → ready-to-show | 1.671,48 |
| 3 | SQL cliente del estado | 754,70 |
| 4 | Entrega IPC + puente | 564,34 |
| 5 | Conversión DTO | 300,24 |
| 6 | Autenticación | 204,69 |
| 7 | Renderer tras recibir estado | 76,70 |

**large-externo-frio** (bloques sin anidar estado dentro de SQL/DTO; hay intervalos menores no incluidos):

| Orden | Bloque | ms |
|---|---|---|
| 1 | Crear ventana → ready-to-show | 1.865,11 |
| 2 | SQL cliente del estado | 785,09 |
| 3 | Entrega IPC + puente | 656,45 |
| 4 | Autenticación | 238,01 |
| 5 | Conversión DTO | 215,41 |
| 6 | Persistencia antes de ventana | 146,31 |
| 7 | Renderer tras recibir estado | 94,30 |

**large-externo-segundo** (bloques sin anidar estado dentro de SQL/DTO; hay intervalos menores no incluidos):

| Orden | Bloque | ms |
|---|---|---|
| 1 | Crear ventana → ready-to-show | 1.082,25 |
| 2 | SQL cliente del estado | 665,42 |
| 3 | Entrega IPC + puente | 658,48 |
| 4 | Conversión DTO | 241,60 |
| 5 | Autenticación | 187,86 |
| 6 | Renderer tras recibir estado | 104,90 |
| 7 | Persistencia antes de ventana | 97,32 |

## Navegación real

Se usa Inicio → Cuentas → Inicio → Compra/Venta → Inicio en las corridas externas. La tabla diferencia montaje interactivo y llegada de la primera página SQL; Compra/Venta añade el debounce existente de 150 ms. No se etiqueta esa respuesta como pintura final de las filas. Las corridas locales iniciales iban de Cuentas directamente a Compra/Venta y quedan fuera de esta comparación de rutas.

| Corrida | Transición | Frames/tarea interactiva (ms) | Primera respuesta SQL desde clic (ms) |
|---|---|---|---|
| small-externo-frio | inicio → cuentas | 26,90 | N/D |
| small-externo-frio | cuentas → inicio | 23,40 | N/D |
| small-externo-frio | inicio → ventas | 17,40 | 188,00 |
| small-externo-frio | ventas → inicio | 21,90 | N/D |
| small-externo-segundo | inicio → cuentas | 23,60 | N/D |
| small-externo-segundo | cuentas → inicio | 18,70 | N/D |
| small-externo-segundo | inicio → ventas | 25,90 | 181,20 |
| small-externo-segundo | ventas → inicio | 12,20 | N/D |
| large-externo-frio | inicio → cuentas | 127,90 | N/D |
| large-externo-frio | cuentas → inicio | 22,90 | N/D |
| large-externo-frio | inicio → ventas | 15,40 | 173,20 |
| large-externo-frio | ventas → inicio | 25,30 | N/D |
| large-externo-segundo | inicio → cuentas | 66,90 | N/D |
| large-externo-segundo | cuentas → inicio | 17,40 | N/D |
| large-externo-segundo | inicio → ventas | 20,20 | 182,00 |
| large-externo-segundo | ventas → inicio | 35,30 | N/D |
| large-externo-reposo | inicio → cuentas | 100,90 | N/D |
| large-externo-reposo | cuentas → inicio | 40,40 | N/D |
| large-externo-reposo | inicio → ventas | 36,30 | 194,20 |
| large-externo-reposo | ventas → inicio | 24,60 | N/D |

## Memoria por proceso

MiB. Muestras tomadas inmediatamente después de detectar Inicio interactivo; el polling del driver puede demorar hasta 100 ms.

| Corrida | Proceso | Working Set / RSS | Private Bytes |
|---|---|---|---|
| small-frio | Main | 109,44 | 76,51 |
| small-frio | Renderer | 119,71 | 58,16 |
| small-frio | GPU | 146,82 | 115,62 |
| small-frio | Utility | 54,09 | 14,35 |
| small-frio | PostgreSQL (suma) | 173,75 | 41,52 |
| small-segundo | Main | 112,16 | 79,19 |
| small-segundo | Renderer | 121,47 | 60,94 |
| small-segundo | GPU | 139,93 | 112,70 |
| small-segundo | Utility | 54,22 | 14,26 |
| small-segundo | PostgreSQL (suma) | 170,74 | 40,95 |
| large-frio | Main | 273,91 | 240,53 |
| large-frio | Renderer | 267,98 | 208,57 |
| large-frio | GPU | 136,31 | 108,95 |
| large-frio | Utility | 53,95 | 14,29 |
| large-frio | PostgreSQL (suma) | 246,30 | 43,22 |
| large-segundo | Main | 277,68 | 244,74 |
| large-segundo | Renderer | 269,45 | 209,96 |
| large-segundo | GPU | 138,13 | 111,33 |
| large-segundo | Utility | 53,87 | 14,00 |
| large-segundo | PostgreSQL (suma) | 239,22 | 42,32 |
| small-externo-frio | Main | 111,65 | 77,83 |
| small-externo-frio | Renderer | 116,35 | 57,31 |
| small-externo-frio | GPU | 138,92 | 112,04 |
| small-externo-frio | Utility | 54,34 | 14,43 |
| small-externo-frio | PostgreSQL (suma) | 173,64 | 40,75 |
| small-externo-segundo | Main | 113,14 | 79,29 |
| small-externo-segundo | Renderer | 117,01 | 57,91 |
| small-externo-segundo | GPU | 138,18 | 111,68 |
| small-externo-segundo | Utility | 53,89 | 14,07 |
| small-externo-segundo | PostgreSQL (suma) | 174,23 | 40,79 |
| large-externo-frio | Main | 279,93 | 244,67 |
| large-externo-frio | Renderer | 266,69 | 207,39 |
| large-externo-frio | GPU | 137,14 | 109,59 |
| large-externo-frio | Utility | 54,11 | 14,20 |
| large-externo-frio | PostgreSQL (suma) | 244,85 | 42,11 |
| large-externo-segundo | Main | 273,96 | 238,45 |
| large-externo-segundo | Renderer | 268,34 | 208,61 |
| large-externo-segundo | GPU | 136,22 | 108,66 |
| large-externo-segundo | Utility | 54,07 | 14,18 |
| large-externo-segundo | PostgreSQL (suma) | 244,82 | 42,04 |
| large-externo-reposo | Main | 277,02 | 241,54 |
| large-externo-reposo | Renderer | 266,49 | 206,99 |
| large-externo-reposo | GPU | 138,98 | 112,02 |
| large-externo-reposo | Utility | 54,03 | 14,14 |
| large-externo-reposo | PostgreSQL (suma) | 245,21 | 41,99 |

**Estabilidad observada en cinco minutos: sí, sin crecimiento neto.** En la corrida válida grande, Main bajó de 281,30 a 112,26 MiB, Renderer de 283,72 a 189,48 MiB y PostgreSQL de 245,43 a 180,83 MiB de Working Set. Se observan liberaciones de memoria; no se forzó GC y no se atribuye cada descenso a una causa específica. Esta ventana no prueba ausencia de fugas de largo plazo.


Se descarta el supuesto reposo de `large-externo-segundo`: registró seis navegaciones y 19 consultas, terminando en Empleados. Sus tiempos de arranque y sus cuatro transiciones automáticas previas siguen siendo válidos. Se repitió el reposo en `large-externo-reposo`, con entrada de teclado/ratón deshabilitada temporalmente, ventana visible y aplicación real. Ese control de entrada difiere de las primeras corridas; no altera las reglas de negocio. Los picos de toda la corrida original pueden incluir esas interacciones y no se atribuyen a inactividad.


### Tras cinco minutos sin actividad

| Corrida | Proceso | WS inicio reposo | WS tras 5 min | Private Bytes tras 5 min | Δ WS |
|---|---|---|---|---|---|
| small-segundo | Main | 112,61 | 114,09 | 74,39 | 1,48 |
| small-segundo | Renderer | 128,47 | 112,66 | 49,74 | -15,81 |
| small-segundo | GPU | 160,91 | 135,58 | 99,30 | -25,33 |
| small-segundo | Utility | 54,29 | 53,57 | 13,29 | -0,72 |
| small-segundo | PostgreSQL (suma) | 174,01 | 156,59 | 35,96 | -17,42 |
| small-externo-segundo | Main | 118,33 | 109,38 | 72,88 | -8,95 |
| small-externo-segundo | Renderer | 124,94 | 114,36 | 52,50 | -10,58 |
| small-externo-segundo | GPU | 154,54 | 128,63 | 99,54 | -25,91 |
| small-externo-segundo | Utility | 53,97 | 53,31 | 13,10 | -0,66 |
| small-externo-segundo | PostgreSQL (suma) | 174,41 | 158,70 | 34,80 | -15,71 |
| large-externo-reposo | Main | 281,30 | 112,26 | 74,74 | -169,04 |
| large-externo-reposo | Renderer | 283,72 | 189,48 | 126,33 | -94,24 |
| large-externo-reposo | GPU | 158,41 | 125,95 | 96,87 | -32,46 |
| large-externo-reposo | Utility | 53,95 | 53,28 | 13,00 | -0,67 |
| large-externo-reposo | PostgreSQL (suma) | 245,43 | 180,83 | 34,70 | -64,60 |

### Picos observados y navegación (sin sonda de tamaño)

| Corrida | Proceso | Pico WS (MiB) | WS tras Cuentas | WS tras Compra/Venta | WS tras volver a Inicio |
|---|---|---|---|---|---|
| small-externo-frio | Main | 115,73 | 115,34 | 115,40 | 115,69 |
| small-externo-frio | Renderer | 124,28 | 118,85 | 122,53 | 124,18 |
| small-externo-frio | GPU | 156,05 | 154,66 | 154,79 | 154,86 |
| small-externo-frio | Utility | 54,38 | 54,34 | 54,34 | 54,17 |
| small-externo-segundo | Main | 118,68 | 117,96 | 117,99 | 118,33 |
| small-externo-segundo | Renderer | 125,03 | 119,55 | 123,23 | 124,62 |
| small-externo-segundo | GPU | 233,60 | 153,80 | 155,80 | 154,63 |
| small-externo-segundo | Utility | 54,40 | 53,89 | 53,90 | 53,97 |
| large-externo-frio | Main | 284,41 | 284,41 | 284,41 | 284,19 |
| large-externo-frio | Renderer | 326,48 | 278,37 | 280,89 | 282,35 |
| large-externo-frio | GPU | 158,73 | 157,57 | 157,84 | 158,71 |
| large-externo-frio | Utility | 54,63 | 54,12 | 54,23 | 54,23 |
| large-externo-segundo | Main | 278,44 | 278,44 | 278,44 | 278,04 |
| large-externo-segundo | Renderer | 360,11 | 281,62 | 284,13 | 285,70 |
| large-externo-segundo | GPU | 162,64 | 156,86 | 157,02 | 158,07 |
| large-externo-segundo | Utility | 54,39 | 54,07 | 54,00 | 54,00 |
| large-externo-reposo | Main | 281,58 | 281,48 | 281,52 | 281,25 |
| large-externo-reposo | Renderer | 312,87 | 279,61 | 282,06 | 283,60 |
| large-externo-reposo | GPU | 158,57 | 157,00 | 157,60 | 158,55 |
| large-externo-reposo | Utility | 54,36 | 54,03 | 53,95 | 53,95 |

### PIDs al terminar el reposo

Los archivos crudos conservan todos los PIDs PostgreSQL y sus muestras; la suma anterior solo corresponde al clúster aislado.

| Corrida | Tipo | PID | WS (MiB) | Private Bytes (MiB) |
|---|---|---|---|---|
| small-externo-segundo | Main | 26364 | 109,38 | 72,88 |
| small-externo-segundo | GPU | 14040 | 128,63 | 99,54 |
| small-externo-segundo | Utility | 5724 | 53,31 | 13,10 |
| small-externo-segundo | Renderer | 11136 | 114,36 | 52,50 |
| large-externo-reposo | Main | 23124 | 112,26 | 74,74 |
| large-externo-reposo | GPU | 24700 | 125,95 | 96,87 |
| large-externo-reposo | Utility | 15728 | 53,28 | 13,00 |
| large-externo-reposo | Renderer | 12664 | 189,48 | 126,33 |

## CPU durante arranque y reposo

CPU acumulada en ms hasta la muestra post-login; pico como % de un núcleo. PostgreSQL externo: acumulación desde primera muestra, según limitación indicada.

| Corrida | Proceso | CPU acumulada (ms) | Pico aproximado (%) |
|---|---|---|---|
| small-frio | Main | 1.288,39 | 107,44 |
| small-frio | Renderer | 406,41 | 52,06 |
| small-frio | GPU | 445,01 | 101,30 |
| small-frio | Utility | 273,92 | 31,06 |
| small-frio | PostgreSQL (suma) | 296,88 | 1,35 |
| small-segundo | Main | 1.276,99 | 87,51 |
| small-segundo | Renderer | 443,86 | 46,74 |
| small-segundo | GPU | 397,25 | 67,24 |
| small-segundo | Utility | 221,78 | 21,53 |
| small-segundo | PostgreSQL (suma) | 359,38 | 1,36 |
| large-frio | Main | 2.650,10 | 141,33 |
| large-frio | Renderer | 1.148,89 | 156,49 |
| large-frio | GPU | 474,58 | 91,41 |
| large-frio | Utility | 296,23 | 31,86 |
| large-frio | PostgreSQL (suma) | 1.375,00 | 26,71 |
| large-segundo | Main | 2.708,35 | 134,60 |
| large-segundo | Renderer | 1.171,95 | 152,86 |
| large-segundo | GPU | 384,14 | 101,52 |
| large-segundo | Utility | 213,04 | 15,92 |
| large-segundo | PostgreSQL (suma) | 687,50 | 17,41 |
| small-externo-frio | Main | 806,12 | 79,44 |
| small-externo-frio | Renderer | 491,61 | 64,98 |
| small-externo-frio | GPU | 426,47 | 68,53 |
| small-externo-frio | Utility | 228,14 | 24,19 |
| small-externo-frio | PostgreSQL (suma) | 0,00 | 0,00 |
| small-externo-segundo | Main | 762,71 | 89,68 |
| small-externo-segundo | Renderer | 456,08 | 64,19 |
| small-externo-segundo | GPU | 427,02 | 62,37 |
| small-externo-segundo | Utility | 189,42 | 16,44 |
| small-externo-segundo | PostgreSQL (suma) | 15,63 | 1,07 |
| large-externo-frio | Main | 2.138,75 | 132,84 |
| large-externo-frio | Renderer | 1.330,55 | 157,80 |
| large-externo-frio | GPU | 411,91 | 133,55 |
| large-externo-frio | Utility | 224,79 | 26,61 |
| large-externo-frio | PostgreSQL (suma) | 515,63 | 24,91 |
| large-externo-segundo | Main | 1.952,59 | 138,05 |
| large-externo-segundo | Renderer | 1.323,67 | 169,72 |
| large-externo-segundo | GPU | 397,88 | 104,32 |
| large-externo-segundo | Utility | 193,16 | 18,40 |
| large-externo-segundo | PostgreSQL (suma) | 250,00 | 14,25 |
| large-externo-reposo | Main | 1.991,32 | 119,06 |
| large-externo-reposo | Renderer | 1.345,95 | 173,52 |
| large-externo-reposo | GPU | 403,88 | 147,23 |
| large-externo-reposo | Utility | 198,75 | 22,99 |
| large-externo-reposo | PostgreSQL (suma) | 375,00 | 16,81 |

Reposo de cinco minutos, después de volver a Inicio, sin la sonda de tamaño:

| Corrida | Proceso | CPU en reposo (ms) | Promedio (%) | Pico (%) |
|---|---|---|---|---|
| small-segundo | Main | 3.092,62 | 1,03 | 6,45 |
| small-segundo | Renderer | 253,38 | 0,08 | 41,90 |
| small-segundo | GPU | 46,77 | 0,02 | 5,12 |
| small-segundo | Utility | 19,10 | 0,01 | 0,43 |
| small-segundo | PostgreSQL (suma) | 125,00 | 0,04 | 2,69 |
| small-externo-segundo | Main | 3.178,35 | 1,06 | 16,50 |
| small-externo-segundo | Renderer | 205,00 | 0,07 | 22,57 |
| small-externo-segundo | GPU | 371,55 | 0,12 | 23,77 |
| small-externo-segundo | Utility | 22,85 | 0,01 | 0,56 |
| small-externo-segundo | PostgreSQL (suma) | 250,00 | 0,08 | 8,87 |
| large-externo-reposo | Main | 3.679,35 | 1,23 | 12,85 |
| large-externo-reposo | Renderer | 495,80 | 0,17 | 78,40 |
| large-externo-reposo | GPU | 140,23 | 0,05 | 17,58 |
| large-externo-reposo | Utility | 25,50 | 0,01 | 0,64 |
| large-externo-reposo | PostgreSQL (suma) | 187,50 | 0,06 | 4,03 |

| Corrida | Reposo medido (s) | SQL durante reposo | Máxima demora del event loop Main en arranque (ms) |
|---|---|---|---|
| small-segundo | 300,01 | 0 | 123,27 |
| small-externo-segundo | 300,01 | 0 | 105,25 |
| large-externo-reposo | 300,00 | 0 | 259,92 |

La demora del event loop mide retraso de temporizador (resolución base de 20 ms), no atribución de CPU por función. Sí existen ráfagas de trabajo Main al leer/convertir/serializar el estado; la espera de 35 s no es 35 s de CPU bloqueada. Cinco minutos no permiten descartar fugas de largo plazo.

## Consumidores y viabilidad de Snapshot parcial

Inicio usa ventas, gastos, movimientosCuenta, cuentas y compras para resumirPeriodo, además de identidad y ControlJornada. El Provider creaLecturaDominio recorre cuentas y calcula saldos/consecutivos usando ventas y movimientos; no admite sustituir colecciones ausentes por vacíos sin cambiar resultados. Header/Sidebar requieren identidad, roles y notificaciones. Cambios de página y comandos asumen hoy un estado completo.

Se inventariaron los 27 puntos de consumo directo con el AST TypeScript; el siguiente mapa no equivale aún a un diseño de hidratación, invalidación ni equivalencia financiera. También deben revisarse crearLecturaDominio, hooks de listados/notificaciones, utilidades de reportes, respuestas de comandos y persistencia antes de modificar el contrato.

| Archivo / línea | Consumidor | Campos y acciones |
|---|---|---|
| src/renderer/src/components/AnularOperacion.tsx:17 | AnularOperacion | { anularOperacion } |
| src/renderer/src/components/CambiarPassword.tsx:9 | CambiarPassword | {administrador,cambiarPassword} |
| src/renderer/src/components/ControlJornada.tsx:9 | ControlJornada | { estadoJornada, fechaJornadaActiva, horaInicioJornada, gestionarJornada } |
| src/renderer/src/pages/Compras.tsx:34 | CompraModal | { proveedoresActivos, registrarCompra, estadoJornada } |
| src/renderer/src/pages/Compras.tsx:522 | Compras | { compras, cuentas, estadoJornada } |
| src/renderer/src/components/DetalleCuenta.tsx:13 | DetalleCuenta | { movimientosCuenta, clientes, compras, ventas } |
| src/renderer/src/pages/CompraVenta.tsx:16 | CompraVenta | { cuentas } |
| src/renderer/src/pages/Clientes.tsx:148 | Clientes | { clientes, crearCliente, actualizarCliente, desactivarCliente, proveedores, crearProveedor, actualizarProveedor, desactivarProveedor } |
| src/renderer/src/pages/Cuentas.tsx:566 | Cuentas | { cuentas, movimientosCuenta, clientes, clientesActivos, ventas, registrarAbono, crearCuentaManual, anularCuenta } |
| src/renderer/src/pages/Consultas.tsx:21 | Consultas | { cuentas } |
| src/renderer/src/pages/Empleados.tsx:23 | Empleados | { empleados, desactivarEmpleado } |
| src/renderer/src/components/EmpleadoFormModal.tsx:23 | EmpleadoFormModal | { empleados, crearEmpleado, actualizarEmpleado } |
| src/renderer/src/pages/inicio.tsx:49 | Inicio | { ventas, gastos, movimientosCuenta, cuentas, compras, administrador, usuarioActual } |
| src/renderer/src/components/Header.tsx:13 | Header | { noLeidas: pendientes, administrador, usuarioActual, listarNotificaciones, cerrarSesion } |
| src/renderer/src/pages/Gastos.tsx:127 | GastoFormModal | { fechaJornadaActiva } |
| src/renderer/src/pages/Gastos.tsx:337 | Gastos | { gastos, movimientosStock, estadoJornada, fechaJornadaActiva, crearGastoManual, actualizarGastoManual, eliminarGastoManual } |
| src/renderer/src/pages/Stock.tsx:31 | ConversionModal | { stock, ultimoFactorUsado, registrarConversionCacao } |
| src/renderer/src/pages/Stock.tsx:165 | DiferenciaConversionModal | { registrarDiferenciaConversion } |
| src/renderer/src/pages/Stock.tsx:305 | AjusteStockModal | { stock, registrarAjusteStock, fechaJornadaActiva } |
| src/renderer/src/pages/Stock.tsx:513 | StockInicialModal | { registrarStockInicial } |
| src/renderer/src/pages/Stock.tsx:726 | Stock | { stock, movimientosStock, umbralesStock, configurarUmbralStock, usuarioActual, stockInicialRegistrado, estadoJornada } |
| src/renderer/src/pages/Usuarios.tsx:12 | Usuarios | { usuarios, usuarioActual, crearUsuario, cambiarEstadoUsuario, restablecerPasswordUsuario } |
| src/renderer/src/components/PanelNotificaciones.tsx:14 | PanelNotificaciones | { avisos, noLeidas, actualizandoNotificaciones: ocupado, errorNotificaciones, marcarNotificacionLeida, marcarTodasNotificacionesLeidas, eliminarNotificacion, eliminarTodasNotificaciones } |
| src/renderer/src/pages/Ventas.tsx:89 | Ventas | { clientes, clientesActivos, crearCliente, stock, ventas, cuentas, proximoNumeroFactura, proximoNumeroComprobante, registrarVenta, estadoJornada, fechaJornadaActiva } |
| src/renderer/src/components/ProveedorCompraModal.tsx:16 | ProveedorCompraModal | { proveedores, crearProveedor } |
| src/renderer/src/components/Sidebar.tsx:15 | Sidebar | { usuarioActual } |
| src/renderer/src/components/SelectorEmpleado.tsx:17 | SelectorEmpleado | { empleados, empleadosActivos } |

## Tres acciones propuestas, ordenadas por impacto y riesgo

1. **Corregir la espera de lanzamiento del motor administrado**, solo después de aprobar este diagnóstico. Impacto potencial más alto en esa ruta: unos 34,6 s observados entre exit y close; no beneficia directamente a la conexión externa. Riesgo medio: preservar logs, validación de disponibilidad, timeout, cierre y arranque sin consola. Ensayar manejo explícito de streams/lifecycle de pg_ctl en una copia; no resolver el Promise solo por exit sin comprobar errores/disponibilidad. Repetir ambos arranques y probar motor fallido/puerto ocupado/datos conservados. Ahorro aún no demostrado.
2. **Diseñar estado inicial específico para Inicio con carga de módulos por demanda.** Prioridad de escalabilidad para la ruta externa: evitar materializar/transmitir 65 MB cuando Inicio necesita un resumen. Impacto potencial en login y memoria, riesgo alto por contratos, saldos, permisos, consecutivos, invalidaciones y comandos. Primero completar el mapa anterior y diseñar un contrato explícito de resumen/hidratación; nunca llenar con arrays vacíos y darlo por equivalente. Benchmark y equivalencia contra Snapshot completo antes de conservar un cambio.
3. **Experimento acotado de carga diferida de páginas distintas de Inicio.** El bloque ventana→ready-to-show está medido, pero no se ha separado cuánto es descarga Vite, parseo JS, React, CSS o pintura. Se observaron 78 recursos y ~5,13 MB decodificados en desarrollo; no son tamaño de bundle de release. Riesgo bajo/medio, beneficio incierto. Si se autoriza, comparar tamaño y tiempos antes/después en el mismo modo; descartar si es despreciable. No se implementó React.lazy en este diagnóstico.

| Opción | Recomendación explícita | Justificación / condición |
|---|---|---|
| Splash screen | Sí para motor administrado; no priorizar para conexión externa | Solo experiencia percibida mientras existe la larga espera anterior a Acceso. Primero corregir la causa; reevaluar necesidad después. No mejora rendimiento. |
| Lazy React | No conservar/aplicar ahora; sí a un experimento posterior | No hay comparación A/B ni atribución suficiente al parseo/carga JS. |
| Snapshot parcial | Sí como siguiente diseño de escalabilidad; no implementarlo todavía | Volumen y coste demostrados; completar consumidores/contratos y pruebas de equivalencia antes de cambiar AppDataContext. |
| Worker / UtilityProcess | No como siguiente optimización | Hay ráfagas Main, pero la mayor espera local es asíncrona y gran parte del coste de login está en transferencia/copia. Un worker podría añadir otra copia. Requiere perfil CPU por función antes. |
| Nuevos índices | No | SQL cliente incluye transferencia de todas las filas; no existe EXPLAIN ANALYZE comparativo que justifique un índice ni migración 011. |
| V8 snapshot | No | Parseo/carga JS no están aislados como coste significativo; no iniciar por intuición. |

## C. Primera instalación real: initdb separado del arranque recurrente

Perfil temporal nuevo, sin data, credenciales de motor ni usuarios anteriores. La aplicación real ejecutó initdb y las migraciones normales, hasta mostrar Crear usuario. **No hubo alta de administrador ni login en C**: son onboarding posterior, y no se inventa un tiempo hasta Inicio para una instalación sin usuario. Login, navegación y reposo están medidos en A/B. A conecta a servidor activo; B inicia un clúster ya configurado; C crea uno nuevo. Las mediciones de B no incluyen initdb.

| Fase C | ms |
|---|---|
| Proceso → app.whenReady | 223,77 |
| Persistencia total | 48.437,97 |
| Verificación ejecutables | 226,24 |
| initdb exclusivamente | 12.072,57 |
| Conexión inicial/pg_ctl → postgres-ready | 35.521,67 |
| BaseLocal.iniciar y migraciones nuevas | 477,94 |
| Ventana → ready-to-show | 4.785,12 |
| Proceso → Crear usuario visible | 53.683,89 |
| Login → Inicio | N/D: no existe usuario aún |

Recursos de C al llegar al acceso inicial:

| Proceso | WS MiB | Private Bytes MiB | CPU acumulada ms |
|---|---|---|---|
| Main | 106,91 | 75,30 | 2.008,67 |
| GPU | 130,19 | 102,64 | 413,84 |
| Utility | 54,25 | 14,53 | 500,96 |
| Renderer | 113,35 | 54,32 | 786,03 |
| PostgreSQL (suma) | 190,28 | 45,59 | Ver muestras por PID; no sumar initdb a CPU recurrente |

C no tiene reposo de cinco minutos ni estado comercial autenticado. Sus muestras PostgreSQL incluyen el servidor final, no todos los procesos transitorios de initdb; el tiempo de initdb sí está delimitado directamente. Evidencia: nuevo-frio.json, nuevo-frio-postgres.json y nuevo-frio-crear-administrador.png. Es una primera instalación de proceso/almacenamiento en el equipo actual; no es una prueba del instalador en Windows limpio.


## Evidencias, reproducción y siguiente paso

**Límite de conservación del origen:** la preparación terminó con las 25 huellas iguales. El cotejo final detectó auditoria 164→166 filas, sesiones 86→87 y cambio de huella de usuarios (siguen 2 filas). La lectura de actividad identifica una sesión original abierta el 13/10/2026 a las 11:53:42 y cerrada normalmente a las 11:54:01 (UTC−5), con dos autenticaciones fallidas a las 11:53:54 y 11:53:58. Coincide con el período de intentos iniciales; los registros disponibles no permiten atribuir de forma concluyente su origen ni excluir un intento previo de la instrumentación. Las corridas finales verificadas apuntan a copias en puerto 55436; el origen usa 5432. No se restauraron contadores ni se borró auditoría para ocultar diferencias. El resto de las 22 tablas mantiene conteos y huellas. Se conserva `original-final.json`; esta condición impide afirmar cumplimiento íntegro de la restricción de cero escrituras en la base real.

| Validación | Resultado |
|---|---|
| npm run typecheck | Aprobado, exit 0; Node y Web. Log: typecheck.txt. |
| npm run lint -- --no-cache | Aprobado, exit 0; 0 errores y 726 advertencias. Log: lint.txt. |
| npm run db:test | Suite PostgreSQL completa según db-test.txt; 14 pruebas RC satisfactorias y cierre completo de la suite. Clúster ruizcacao-tests-oQgSqd. Código de salida de la sesión anterior no recuperable; no se repitió la suite. |
| Alcance de regresión | La suite completa precede a las dos marcas opt-in initdb-start/end; estas se ejercitaron en la corrida real C y pasaron typecheck/lint posteriores. No hubo cambios de negocio posteriores a la suite. |
| git diff --check | Aprobado, exit 0; advertencias de normalización LF/CRLF, sin errores de whitespace. |
| node scripts/verificar-perfil-real.cjs | Aprobado, exit 0 para integridad de mediciones y migraciones. Registra explícitamente conservación parcial del origen: 22/25 tablas, no certifica cero escrituras. |
| Estado de ejecuciones | Sin prueba de regresión ni corrida de perfil pendiente. Motores aislados detenidos. |
| Últimos comandos de cierre | node scripts/documentar-perfil-real.cjs; node scripts/verificar-perfil-real.cjs; git diff --check. Son regeneración documental y verificación; no repiten mediciones. |
| Pendiente humano | Revisión visual/entrada física; alta de administrador y primer login de una instalación nueva; validación de equipo final/instalador en otra tarea. Atribución de la incidencia en tablas de acceso no concluyente. |

Evidencia primaria: `docs/evidencias-arranque-real/*-frio.json`, `*-segundo.json`, muestras `*-postgres.json`, capturas `*-inicio.png`, `preparacion.json`, `original-final.json`, `consumidores-contexto.json`, `resumen.json` y [tabla completa de marcas](evidencias-arranque-real/marcas.md). No contienen passwords ni filas comerciales; las capturas muestran la UI de la copia. Dumps/credenciales cifradas permanecen en perfiles temporales fuera del repositorio y no son entregables.

Incidencia adicional: el cierre de la primera copia grande registró un conflicto de la restricción `respaldo_automatico_equivalente` y un warning de transacción. Ocurrió después de guardar las mediciones, fuera de arranque/reposo; se conserva el extracto `pg-cierre-incidencias.txt`. No se modificó el respaldo ni se investigó/corrigió esa ruta en este diagnóstico. No afecta a las huellas del origen.

Preparación: `electron scripts/preparar-perfil-real.cjs` crea copias nuevas (no hace falta repetirla mientras se conserven). Ruta administrada: establecer RCM_PERFIL_ESCENARIO=small/large y RCM_PERFIL_CORRIDA=frio/segundo; dejar RCM_PERFIL_CONEXION sin definir. Ruta externa: primero `electron scripts/conexion-perfil-externo.cjs small` (o large), luego RCM_PERFIL_CONEXION=externa y el mismo driver; al terminar `electron scripts/conexion-perfil-externo.cjs small --detener`. Ejecutar perfiles secuencialmente porque pueden compartir puerto. Cada driver carga la app real mediante electron-vite dev. `electron scripts/preparar-perfil-real.cjs --verificar` solo coteja el origen en READ ONLY. `node scripts/resumir-perfil-real.cjs` y `node scripts/documentar-perfil-real.cjs` regeneran tablas/informe.

Se conserva instrumentación opt-in (`RCM_PERFIL_ARRANQUE=1` con el driver); sin ese modo no se publican marcas ni se ejecutan los muestreadores. No se retiró evidencia ni se alteraron las reglas de negocio. Fecha de operación de Cuentas conservada. Sin seed, release build, commit, push ni tag.

**Siguiente paso:** revisar este diagnóstico y escoger un único experimento: resolver el lifecycle de pg_ctl si el objetivo es el motor administrado, o diseñar la carga inicial mínima si el objetivo es el desarrollo con servidor externo. Aplicar y medir ese cambio en una tarea posterior; este corte entrega mediciones y recomendaciones, no una mejora de rendimiento.

## Estado exacto y archivos modificados

Diagnóstico A/B y reposo completados; C queda delimitado hasta Crear usuario, según su tabla. Instrumentación opt-in en Main (index, perfil-arranque, database/base, conexion, ipc, postgres-local, relacional), preload (index.ts y tipos), Renderer (App, Acceso, main, inicio, AppDataContext, utils/perfilArranque). No se aplicaron optimizaciones. Los cambios funcionales anteriores de Fecha de operación siguen en Cuentas/DetalleCuenta y tests/cuentas-fecha; versiones package/lock y su informe previo se conservan. `.eslintcache` ya figuraba eliminado al retomar: no se revirtió.

Scripts existentes extendidos: perfil-aplicacion-real.cjs, preparar-perfil-real.cjs, conexion-perfil-externo.cjs, perfil-recursos-postgres.ps1, resumir-perfil-real.cjs, documentar-perfil-real.cjs y verificar-perfil-real.cjs. Perfil-parche.cjs y evidencias anteriores siguen siendo arnés, separados de las corridas reales. Documentos obligatorios actualizados junto con evidencias-arranque-real.

Pruebas humanas pendientes: equipo final/instalador offline (requiere tarea autorizada de release), ingreso con teclado físico y revisión visual de Cuentas, primera creación de usuario y primer login de instalación nueva. No se afirma revisión humana ni equivalencia de performance de release. La atribución de cambios en las tres tablas de acceso del origen sigue sin resolución concluyente.

## CONTINUAR DESDE AQUÍ

1. Leer este informe y original-final.json; no repetir A/B ni los reposos válidos.
2. Revisar la incidencia del origen en solo lectura, sin restaurar datos, contadores ni auditoría.
3. Para motor administrado, elegir como próximo experimento la espera exit/close de pg_ctl; para servidor externo, diseñar el contrato inicial mínimo antes de editar AppDataContext.
4. No tocar migraciones 001–010, base original, reglas de negocio, Fecha de operación ni evidencia de estas mediciones. No crear 011.
5. Si se hacen cambios posteriores, ejecutar desde electron-app: `npm run typecheck`, `npm run lint -- --no-cache`, `npm run db:test`, `git diff --check`. La suite de este corte ya terminó; no repetirla solo por perder la sesión del terminal.
6. Regenerar únicamente documentos/tablas con `node scripts/resumir-perfil-real.cjs` y `node scripts/documentar-perfil-real.cjs`; comprobar invariantes con `node scripts/verificar-perfil-real.cjs`.
7. Para repetir solo C en otra tarea: `electron scripts/preparar-perfil-real.cjs --nuevo`; establecer RCM_PERFIL_ESCENARIO=nuevo, RCM_PERFIL_CORRIDA=frio, RCM_PERFIL_CONEXION=local y ejecutar `electron-vite dev --entry scripts/perfil-aplicacion-real.cjs`. No recrear perfiles small/large.
8. Conservar el cierre sin seed, build de release, commit, push ni tag. No iniciar optimizaciones sin presentar/revisar este diagnóstico.

Ninguna prueba de regresión queda ejecutándose al cierre. El log db-test.txt termina con Suite PostgreSQL completa (ruizcacao-tests-oQgSqd); el código de salida del terminal anterior no pudo recuperarse tras la interrupción, por lo que se registra el resultado funcional del log. Los últimos comandos de cierre y sus resultados figuran en validacion-comandos.json y la continuidad.
