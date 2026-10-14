# Optimización de arranque pg_ctl — RuizCacao Manager 1.2.1

Fecha: 13/10/2026 (America/Guayaquil). Esquema 10, 25 tablas, migraciones 001–010 intactas; 011 NO.

## Resultado y alcance

Causa de los ~35 s confirmada y parche aplicado. La espera estaba en los pipes heredados de stdout y stderr, no en la disponibilidad inicial de PostgreSQL. Se validaron cuatro arranques reales posteriores al cierre de las regresiones: pequeña/grande, primer/segundo proceso. Se reutilizan los cuatro arranques anteriores; no se repitió el perfil completo ni los reposos válidos de cinco minutos. No cambia la ruta de PostgreSQL externo ni el Snapshot.

| Escenario | Acceso antes ms | Acceso después ms | Reducción % | Inicio antes ms | Inicio después ms |
|---|---|---|---|---|---|
| small-frio | 37.392,60 | 2.117,31 | 94,34 | 37.749,90 | 2.522,11 |
| small-segundo | 37.329,72 | 2.239,77 | 94,00 | 37.781,82 | 2.703,07 |
| large-frio | 37.586,53 | 3.278,59 | 91,28 | 39.643,83 | 5.261,99 |
| large-segundo | 37.429,97 | 2.074,41 | 94,46 | 39.414,57 | 4.067,11 |

## Causa exacta y lifecycle

La versión Windows de pg_ctl 18.6 crea CMD con los handles estándar heredados. CMD ejecuta postgres con redirección al archivo indicado por -l y permanece hasta que termina el servidor. Node observa la salida de pg_ctl, pero sus dos pipes aún no alcanzan EOF. Consumirlos no cierra los handles heredados. El temporizador de execFile destruye los streams a los 35 s; entonces se emite close y el callback puede devolver éxito porque pg_ctl ya había salido con código 0.

La separación stdout/stderr reproduce la dependencia de ambos; eliminar stdin no ayuda. El árbol de procesos confirma pg_ctl → CMD → postgres. No se enumeró el número nativo de cada HANDLE dentro de CMD: la atribución del mecanismo combina aislamiento experimental, árbol de PID y código fuente de la versión exacta. Fuentes primarias: [pg_ctl REL_18_6, start_postmaster e InheritStdHandles](https://github.com/postgres/postgres/blob/REL_18_6/src/bin/pg_ctl/pg_ctl.c), [evento close de Node](https://nodejs.org/api/child_process.html#event-close).

```mermaid
sequenceDiagram
  participant M as Electron Main
  participant P as pg_ctl
  participant C as CMD heredado
  participant D as PostgreSQL
  M->>P: start -D copia -l postgresql.log -w -t 30
  P->>C: Crear proceso con handles heredados
  C->>D: postgres; salida al log
  D-->>P: Disponible
  P-->>M: exit 0
  Note over M,C: Antes: pipes vivos; close esperaba hasta timeout 35 s
  Note over M,P: Después: stdout/stderr a pg_ctl.log; close inmediato
  M->>D: Conexión autenticada
  D-->>M: Conexión válida
  M->>M: Continuar PostgresLocal.iniciar
```

## Inspección y experimentos mínimos

Antes: promisify(execFile), pipes predeterminados, windowsHide:true, shell:false y detached:false por defecto, timeout35000, SIGTERM predeterminado; sin listeners de aplicación que anticipen exit. El callback interno espera close. -l conserva postgresql.log; -w/-t30 comprueban el arranque del servidor. Stop usa execFile con status previo, -m fast -w -t20 y timeout25000. No crea otro servidor ni shell descendiente persistente.

| Evidencia/variante | spawn → exit ms | exit → close ms | Resolución ms desde llamada | Resultado |
|---|---|---|---|---|
| experimento-1791943750566.json | N/D | N/D | N/D | initdb falló por permisos del sandbox; repetido fuera del sandbox |
| experimento-1791943795210.json / execFile-actual-1 | 588,52 | 34.418,86 | 35.016,24 | Completado |
| experimento-1791943795210.json / spawn-pipes-consumidos | 348,08 | 34.663,51 | 35.019,82 | Completado |
| experimento-1791943795210.json / spawn-sin-stdout | 344,73 | 34.663,25 | 35.015,51 | Completado |
| experimento-1791943795210.json / spawn-sin-stderr | 346,78 | 34.658,55 | 35.012,78 | Completado |
| experimento-1791943795210.json / spawn-sin-stdin | 319,61 | 34.689,61 | 35.014,11 | Completado |
| experimento-1791943795210.json / spawn-sin-pipes-1 | 466,72 | 0,08 | 473,68 | Completado |
| experimento-1791943795210.json / execFile-pipes-destruidos | 580,22 | 0,26 | 590,70 | Completado |
| experimento-1791943795210.json / execFile-actual-2 | 504,26 | 34.510,62 | 35.030,16 | Completado |
| experimento-1791943795210.json / spawn-sin-pipes-2 | 345,12 | 0,10 | 352,95 | Completado |
| experimento-1791943961881.json / spawn-stdout-stderr-archivo-1 | 196,75 | 0,17 | N/D | Descartado: fallo conservado |
| experimento-1791944050048.json / spawn-stdout-stderr-archivo-1 | 425,62 | 0,28 | 447,07 | Completado |
| experimento-1791944050048.json / spawn-stdout-stderr-archivo-2 | 545,13 | 0,12 | 560,97 | Completado |
| experimento-1791944796855.json / stop-fast-recuperacion-t60 | 33.246,97 | 0,13 | 33.261,26 | PostgreSQL terminado |

El experimento mínimo usa Node26.7 y PostgreSQL18.6 empaquetado, clústeres temporales vacíos con SCRAM. La app real usa Electron44.3/Node24.20. Los SHA256 de pg_ctl/postgres instalados y empaquetados coinciden (binarios.json). Disponibilidad experimental: conexión autenticada y SELECT1; tiempos incluyen sondeo/latencia de autenticación. No hay datos del cliente. Los PID y descendientes están en cada JSON.

Descartadas: consumir pipes, quitar uno solo o stdin; siguen esperando. Destruir pipes en exit elimina la espera como experimento, pero no se adoptó. Ignorar toda salida elimina la espera, pero pierde diagnóstico. Dirigir stdout/stderr al mismo postgresql.log que -l produce un conflicto de apertura en Windows; se conservó el fallo. Solución elegida: archivo separado pg_ctl.log. En las variantes spawn con pipes el límite de observación de35 s fuerza el cierre de los streams; no es un close espontáneo ni una solución propuesta.

## Cambio de producción

Solo PostgresLocal: spawn para start, stdin ignore, stdout/stderr a un descriptor abierto en append de pg_ctl.log. Se conservan -l postgresql.log, -w, -t30, windowsHide:true, shell:false, detached:false y timeout35000/SIGTERM. Se espera close y se rechaza error, código distinto de0 o señal. Se cierra el descriptor del padre en finally. Después se exige conexión autenticada; exit0 sin servidor falla. No se redujo timeout ni se resuelve por exit.

Los errores de pg_ctl se registran sanitizados y se propagan; se intenta cerrar el clúster privado antes de devolver el error. Ya no se transforma un error de pg_ctl en éxito aunque el servidor termine iniciando. Se preservan credenciales, puerto, SCRAM, cifrado, protecciones de data/data-inicializando y comprobación de versión. No se modifican servicios Windows. Los logs de tiempos permanecen opt-in; pg_ctl.log contiene diagnóstico operativo, no muestras de rendimiento ni contraseñas.

## Cierre fast: fallo descubierto, causa y corrección

La regresión introduce recovery.signal y un restore_command de32 s exclusivamente en su clúster temporal. Con -t20, pg_ctl stop devolvió error mientras postgres seguía esperando que finalizase la orden de recuperación. El log marca fast a21:19:59.826 y servidor detenido a21:20:33.801:33,975 s reales. No era un cierre completado que Node ocultase. El fallo inicial permanece en regresion-1791944311032.json/db-test.txt. No se rebajó ninguna aserción.

La limpieza de un arranque fallido permite -t60/timeout65000, margen acotado basado en esos34 s observados; el cierre normal conserva -t20/timeout25000. Mantiene fast, sin matar postgres ni cambiar recuperación de contraseña/datos comerciales. La sonda exclusiva stop confirmó33.246,97 ms desde spawn hasta exit y0,13 ms hasta close, con stdout/stderr cerrados antes de exit; PID inexistente al finalizar. Por eso stop conserva execFile/pipes. Evidencia experimento-1791944796855.json. La regresión completa posterior pasa cierre/reapertura y conserva el valor42 de su tabla de prueba.

La primera suite posterior alcanzó el último caso pero otra sonda iniciada por el agente compitió por el puerto55433. El log de PostgreSQL acredita bind fallido. Se conserva db-test-final.txt (exit1); la validación definitiva se ejecutó secuencialmente en db-test-secuencial.txt, sin sonda concurrente. Los dos primeros perfiles pequeños también se conservan como preliminares y no son la comparación final.

## Benchmark completo antes/después

Cada celda es antes → después, ms. Fases anidadas, no sumarlas. Proceso frío significa un proceso nuevo, no caché del SO vaciada. Mismo driver real/main/preload/Renderer, modo desarrollo; Vite previo al proceso medido, sin build/release. Las cifras antes son las corridas ya acreditadas; los cuatro después se ejecutan secuencialmente tras la suite. Primera instalación/initdb queda fuera de esta comparación recurrente.

| Fase | small-frio | small-segundo | large-frio | large-segundo |
|---|---|---|---|---|
| Proceso → app.whenReady | 108,12 → 117,76 | 102,69 → 109,08 | 108,72 → 122,38 | 107,83 → 120,18 |
| Persistencia completa | 35.605,92 → 886,75 | 35.614,30 → 997,80 | 35.596,67 → 1.540,30 | 35.648,43 → 892,17 |
| Verificación ejecutables | 141,92 → 155,67 | 146,49 → 148,76 | 153,25 → 270,90 | 148,76 → 148,43 |
| pg_ctl llamada → disponibilidad en log PG | N/D → 281,61 | N/D → 320,54 | 358,45 → 452,55 | 248,20 → 294,23 |
| pg_ctl llamada → exit | N/D → 326,73 | N/D → 344,71 | 425,75 → 562,72 | 314,16 → 330,69 |
| pg_ctl exit → close | N/D → 0,28 | N/D → 0,34 | 34.582,97 → 0,57 | 34.698,62 → 0,32 |
| pg_ctl llamada → resolución | N/D → 327,06 | N/D → 345,13 | 35.008,68 → 563,41 | 35.012,66 → 331,07 |
| PostgresLocal.iniciar | 35.409,19 → 774,70 | 35.512,80 → 757,87 | 35.451,21 → 1.291,22 | 35.536,41 → 786,57 |
| Crear ventana → ready-to-show | 1.511,32 → 971,62 | 1.423,55 → 1.005,81 | 1.671,48 → 1.501,07 | 1.468,49 → 907,90 |
| Proceso → Acceso visible | 37.392,60 → 2.117,31 | 37.329,72 → 2.239,77 | 37.586,53 → 3.278,59 | 37.429,97 → 2.074,41 |
| Login → Inicio interactivo | 248,10 → 287,70 | 260,10 → 333,00 | 1.917,70 → 1.806,80 | 1.833,80 → 1.832,90 |
| Proceso → Inicio interactivo | 37.749,90 → 2.522,11 | 37.781,82 → 2.703,07 | 39.643,83 → 5.261,99 | 39.414,57 → 4.067,11 |

La marca histórica pg_ctl-spawn se toma antes de llamar a child_process (no es el evento spawn del SO). Se conserva esa definición para A/B. Las corridas nuevas incluyen además spawn-event, conexión autenticada y resolución. PostgresLocal antes se aproxima por verificacion-start→postgres-ready (primer/último punto de ese método); después tiene marcas explícitas. Disponibilidad en log se obtiene de la línea de PostgreSQL de esa misma corrida, no se confunde con la resolución Node.

Los dos JSON históricos pequeños preceden a los listeners de pg_ctl: esos eventos antes se indican N/D, sin inventarlos ni volver a ejecutar el perfil completo. La espera anterior está delimitada directamente en las dos corridas grandes y en la reproducción mínima.

## Memoria, login y estabilidad

Working Set MiB inmediatamente después de Inicio; incluye memoria compartida. CPU acumulada de cada proceso hasta esa muestra, ms. Comparación de observaciones individuales, sin intervalos de confianza. No se repitió el reposo de5 minutos: este cambio de handles afecta arranque/cierre; cada corrida conserva una observación corta de5 s y el diagnóstico anterior conserva los reposos válidos.

| Escenario | Main MiB antes→después | Renderer MiB antes→después | Main CPU ms antes→después | Renderer CPU ms antes→después |
|---|---|---|---|---|
| small-frio | 109,44 → 111,78 | 119,71 → 118,78 | 1.288,39 → 762,79 | 406,41 → 438,48 |
| small-segundo | 112,16 → 111,93 | 121,47 → 118,13 | 1.276,99 → 792,85 | 443,86 → 481,66 |
| large-frio | 273,91 → 275,19 | 267,98 → 268,72 | 2.650,10 → 1.954,02 | 1.148,89 → 1.203,49 |
| large-segundo | 277,68 → 275,82 | 269,45 → 268,51 | 2.708,35 → 1.955,48 | 1.171,95 → 1.196,46 |

Login grande se mantiene en 1,81–1,83 s (antes 1,83–1,92 s). El pequeño sube 40–73 ms: el estado pasa de35–39 a62 ms y Renderer de34–36 a46–76 ms; autenticación cambia menos de3 ms. Son dos observaciones por tamaño, insuficientes para atribuir ese incremento al parche o descartarlo estadísticamente. La mejora demostrada es el arranque previo a Acceso. Working Set Main/Renderer permanece próximo a la referencia (variaciones de pocos MiB), sin nueva prueba de fuga prolongada.

| Escenario | PostgreSQL suma WS MiB antes → después |
|---|---|
| small-frio | 173,75 → 174,05 |
| small-segundo | 170,74 → 173,86 |
| large-frio | 246,30 → 241,78 |
| large-segundo | 239,22 → 242,07 |

La suma PostgreSQL puede contar páginas compartidas varias veces; muestra más cercana al post-login, desplazable aproximadamente1 s.

## Regresiones y controles

| Caso | Resultado | ms |
|---|---|---|
| motor detenido, disponibilidad SQL y datos persistentes | OK | 10.074,39 |
| motor ya iniciado: conexión verificada sin lanzar pg_ctl | OK | 575,39 |
| cierre normal y reapertura: datos y credenciales conservados | OK | 2.273,56 |
| puerto ocupado: rechazo, sin cambiar puerto ni credenciales | OK | 1.720,15 |
| postgres no puede iniciar: biblioteca inexistente | OK | 501,45 |
| error real de pg_ctl y stderr conservado | OK | 335,52 |
| exit 0 sin servidor no es aceptado | OK | 377,03 |
| timeout real de proceso a 35000 ms, hijo terminado | OK | 35.328,18 |
| timeout legítimo pg_ctl -t30 durante recuperación bloqueada | OK | 66.733,87 |
| reapertura después de fallos y logs conservados | OK | 1.368,14 |

Además, postgres-prerrequisito conserva las aserciones de data válido sin clave, data sin PG_VERSION, data-inicializando previo, versiones incompatibles y runtime ausente. La suite general verifica SCRAM, privilegios, cifrado, esquema, datos, respaldos y reapertura. El timeout de proceso35 s usa un hijo Node que no termina para ejercitar el temporizador real; el timeout PostgreSQL30 s usa el motor real bloqueado en recuperación. No son el mismo caso.

Cierre de app: cuatro archivos *-final-cierre.json confirman el flujo normal (que usa fast); *-procesos-final.json verifica que ninguno de los PID PostgreSQL muestreados sigue activo. motores-final.json añade un barrido final de las raíces aisladas: cero motores residuales. El monitor EnumWindows observa cada20 ms y registra cero consolas visibles nuevas en las corridas finales; no lee títulos ni contenido. windowsHide/shell/detached se verifican además por aserciones. No puede excluir un destello más breve que el intervalo; revisión humana final pendiente.

| Comando | Código final | Evidencia |
|---|---|---|
| npm run typecheck | 0 | typecheck.txt |
| npm run lint -- --no-cache | 0 | lint-final.txt: 0 errores, 726 advertencias |
| npm run db:test | 0 | db-test-secuencial.txt |
| git diff --check | 0 | diff-check.txt |

## Archivos, conservación y riesgos

Producción: src/main/database/postgres-local.ts. Pruebas: tests/pgctl-arranque.cjs y su registro en tests/run.cjs. Instrumentación: scripts/perfil-aplicacion-real.cjs extendido, scripts/experimento-pgctl.cjs, benchmark-pgctl-final.cjs, vigilar-consolas-pgctl.ps1 y documentar-pgctl.cjs. Documentación: este informe, continuidad y docs/evidencias-pgctl. La instrumentación de producción sigue opt-in. Los scripts experimentales no forman parte del arranque del cliente. Los cambios previos de versión, Fecha de operación y perfilado quedan conservados.

69 archivos protegidos coinciden con sus SHA256 iniciales: todas las evidencias previas de arranque, migraciones SQL y Cuentas/DetalleCuenta. original-final.json no se alteró; su incidencia22/25 permanece sin atribución. Esta tarea no conectó a la base comercial original ni reparó tablas. No seed, build, commit, push, merge ni tag.

Riesgos residuales: Windows/equipo observado y desarrollo; falta revisión humana y release en equipo final. Un restore_command externo arbitrariamente bloqueado puede exceder incluso el límite excepcional de60 s: se registra el fallo y no se declara cierre satisfactorio, sin terminación forzada. Ese límite no garantiza cierre de cualquier bloqueo del SO. pg_ctl.log se añade en append dentro de la carpeta protegida; no se introdujo rotación nueva. Snapshot65 MB y costes posteriores al login permanecen fuera de alcance. No atribuir variación de login/UI al cambio de pg_ctl sin más repeticiones.

## CONTINUAR DESDE AQUI

1. Leer este informe y resumen-final.json; conservar todas las evidencias, incluidas las fallidas.
2. Revisar únicamente el diff de PostgresLocal y sus pruebas; no tocar Snapshot, Cuentas ni migraciones001–010.
3. Siguiente paso exacto: revisión humana de arranque/cierre/reapertura sin consola, en una copia aislada; no iniciar otra optimización.
4. Para revalidar cambios posteriores, ejecutar desde electron-app: `npm run typecheck`, `npm run lint -- --no-cache`, `npm run db:test`, `git diff --check`, secuencialmente respecto a pruebas de motor.
5. No volver a ejecutar el benchmark actual sobre sus mismos nombres: rechaza sobrescribir evidencia. No repetir diagnósticos o reposos acreditados.
6. Regenerar solamente este documento con `node scripts/documentar-pgctl.cjs` si cambian datos derivados; no modificar los JSON originales.
7. No seed/build/publicación Git. No resolver la incidencia histórica del origen mediante escrituras.

Últimos comandos y códigos: tabla de controles anterior. Ninguna corrida final queda pendiente tras producir este informe; los logs/archivos de salida permiten recuperar el estado de cada proceso.
