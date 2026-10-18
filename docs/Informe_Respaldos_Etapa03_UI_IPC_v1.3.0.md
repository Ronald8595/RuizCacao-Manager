# Respaldos — Etapa 03: UI e IPC

Fecha de cierre: 2026-10-17. Rama: `feature/respaldos-restauracion`. Aplicación 1.2.1, esquema 10; v1.3.0 identifica el módulo objetivo, no un release realizado.

**Etapa03 COMPLETADA: SI. Cierre definitivo verificado.** No iniciar Etapa04. Se conservan las pruebas válidas y los archivos de la sesión interrumpida. No se ha usado reset, limpieza del árbol ni la base comercial.

## Arquitectura y permisos

La página Respaldos se carga mediante importación diferida y conserva el diseño existente. Solo muestra Generar respaldo y Cargar respaldo al administrador. La identidad visual se obtiene de la sesión ya disponible; la página no consume Snapshot ni consultas comerciales.

Main autoriza con la sesión real de BaseLocal, vincula cada operación al administrador y conserva las rutas seleccionadas por diálogos nativos. Comprueba emisor y frame principal, tipos, cantidad de argumentos, UUID de operación y preparación, confirmación explícita y longitud de contraseña. Preload expone métodos específicos; no expone filesystem, shell, SQL, herramientas, credenciales técnicas ni buffers. La contraseña del administrador se verifica mediante el mecanismo existente, sin crear una sesión ni solicitar Snapshot.

Canales `respaldos:` implementados:

| Canal | Función |
|---|---|
| seleccionarDestinoRespaldo | Diálogo Guardar en Main; devuelve identificador opaco y nombre. |
| generarRespaldo | Generación portable de Etapa01 usando la selección de Main. |
| seleccionarRespaldo | Selector .back en Main. |
| validarRespaldoSeleccionado | Preparación privada de Etapa02; devuelve nombre, fecha, versión, tamaño e identificador de preparación. |
| cargarRespaldo | Comprueba preparación, confirmación y contraseña antes de sustituir. |
| cancelarOperacionRespaldo | Solicita aborto y espera finalización/limpieza real. |
| reiniciarDespuesDeRestauracion | Solo acepta una operación restaurada y confirmada. |
| progreso (evento) | Identificador, fase y cancelable; emisión deduplicada al cambiar fase. |

La credencial se confirma dentro de cargarRespaldo; no existe una autorización separada reutilizable. Main permite una sola intención, incluyendo selector, validación y revisión. Cancelar/cerrar concurrentemente comparten limpieza; solicitudes repetidas de reinicio comparten una sola ejecución. Una pérdida de permisos durante validación o revisión libera la preparación sin restaurar. Estos últimos casos se añadieron al revisar el estado recuperado, con pruebas de contrato específicas.

## Flujos y cancelación

Generar: selección nativa → exportación → verificación/empaquetado → guardado → publicación completa → éxito con nombre final. El nombre sugerido es RuizCacao_YYYY-MM-DD_HH-mm.back (fecha UTC). Si existe, se conserva y se publica con sufijo. Cancelar el selector no inicia herramientas. Cancelar una operación espera hijos y streams; nunca se anuncia éxito ni cancelación antes de resolver el backend.

Cargar: selector → copia/preparación privada y validaciones Etapa02 → resumen → confirmación informada → contraseña del administrador → copia técnica pre_restauracion → promoción segura/journal → éxito → Continuar → reinicio. La fuente original puede cambiar después de validar: se utiliza exclusivamente la preparación privada retenida por Main. El modo PostgreSQL externo continúa rechazando restauración automática.

El progreso utiliza fases reales, spinner y texto, sin porcentajes inventados. Se agrupan los pasos internos en Preparando respaldo, Exportando información, Verificando información, Guardando respaldo, Preparando datos y Guardando copia de seguridad actual. Al publicar/promover se bloquea la cancelación en Main y se muestra «Finalizando. No cierres RuizCacao Manager.». Los estados críticos permanecen agrupados en Finalizando, sin exponer nombres internos.

Errores de permisos, ocupado, archivo ajeno, daño, versión futura, espacio, configuración externa y contraseña tienen mensajes amigables. No se envían stack, stderr, SQL ni rutas internas. En recuperación bloqueada se informa que hace falta revisión técnica; no se afirma incorrectamente que la base activa ya está disponible.

Tras confirmar durablemente el restore, el gate de Main permanece cerrado hasta reiniciar. El cierre usa desconexión técnica, evitando aplicar cierre comercial a los datos restaurados. Producción utiliza app.relaunch y termina el proceso anterior. No se conserva la sesión ni el Snapshot anterior. Acceso/onboarding no se modificaron.

## UI, accesibilidad y StrictMode

Se reutiliza ModalAccesible. Título accesible, estado anunciado, errores enfocables, botones con texto, spinner acompañado de fase, foco inicial Cancelar en confirmación, contención Tab/Shift+Tab y Escape solo cuando es seguro. Enter inicial no confirma la sustitución. En fase crítica no se puede abandonar por Escape ni cancelar. Los listeners se suscriben solo durante operaciones y se retiran al terminar/desmontar; doble clic y doble envío están protegidos.

Evidencia conservada: `evidencias-respaldos-etapa03/visual/resultados.json`, 39 capturas de 13 estados en 1440×900, 800×600 y 1000×750 con zoom real 125%. Chromium/Electron y React StrictMode reales; fixtures en memoria. En cada escenario: cero llamadas al montar, cero consultas comerciales, máximo un listener y cero listeners al terminar/desmontar; 20 frames durante una operación simulada de ~300 ms. Operador sin botones. La prueba visual terminó con código 0 y no se repitió tras la interrupción, porque la UI no cambió.

## Integración real y rendimiento nuevo

`producto.json` registra nueve grupos de comprobaciones con Electron Main, preload específico, IPC real y PostgreSQL privado temporal. Generación pequeña/grande, cancelación durante exportación y hash, rechazo de operador/otro emisor/payload/ruta arbitraria, producto/formato/esquema futuro, archivo roto y falta de espacio. Se alteró solo la copia seleccionada del fixture después de validarla: restore grande completado desde la preparación privada. Contraseña incorrecta no restaura; cancelación crítica rechazada; acceso bloqueado hasta reiniciar. Hijos registrados al cierre: 0.

`reinicio-producto.json` y `login-reinicio.png`: proceso Electron nuevo, administrador existente, autenticado=false, componente Acceso de producción mostrando Login; contraseña original restaurada aceptada. El arnés sustituye la llamada app.relaunch por el lanzamiento observable de un proceso nuevo para comprobar su salida. No es una prueba de instalador ni de relanzamiento empaquetado. La prueba terminó con código 0 y se conserva.

Perfil adicional `rendimiento-ipc.json`, limitado al costo UI/IPC de backups reales:

| Caso | Duración | CPU Main usuario+sistema | Frames Renderer | Máximo entre frames | Evento IPC máximo |
|---|---:|---:|---:|---:|---:|
| Pequeño | 522 ms | 140 ms | 32 | 16,8 ms | 94 bytes |
| Grande | 1109 ms | 328 ms | 67 | 16,8 ms | 94 bytes |

Working set Renderer ~78,4–78,7 MiB en esas observaciones. No es un perfil del arranque completo ni una certificación de todas las escalas. El arnés de medición usa requestAnimationFrame y esperas acotadas; esos instrumentos no forman parte de la aplicación. No se repite el perfil pesado Etapa02.

El módulo no incorpora Snapshot, polling, timers persistentes, watchers, workers residentes, escaneo de directorios ni historial automático. Main permanece inerte sin intención del usuario. La preparación privada existe mientras la confirmación está abierta y se libera al cancelar/cerrar; el PostgreSQL normal de la aplicación no debe confundirse con procesos residuales de respaldo. La ausencia de invocaciones del módulo desde otras páginas se comprueba por revisión de sus puntos de llamada y carga diferida; no se afirma una nueva prueba interactiva completa de todas las rutas.

## Comprobaciones y trazabilidad

La suite previa `db-test.txt` alcanzó «Suite PostgreSQL completa», incluyendo todas las suites hijas con salida 0. La sesión shell anterior no puede recuperarse después del límite de uso; no se atribuye un código de shell no observado. Se preserva como evidencia previa. Los guardas adicionales Main justifican una nueva validación final del código afectado; no se repiten capturas ni el restore de producto ya válidos.

Typecheck de cierre: código 0. Lint --no-cache de cierre: código 0, 850 advertencias/0 errores; no se aplicó un formateo general del repositorio. Contratos IPC tras los guardas adicionales: código 0. `fuentes-validadas.json` guarda el inventario y SHA-256 de los 23 archivos de producción/pruebas para relacionarlos con estas ejecuciones.

Resultados definitivos, ejecutados secuencialmente cuando requieren motor:

| Comprobación | Salida | Evidencia en evidencias-respaldos-etapa03/ |
|---|---:|---|
| npm run typecheck | 0 | typecheck-cierre.txt |
| npm run lint -- --no-cache | 0 | lint-cierre.txt; 0 errores, 850 advertencias |
| npm run db:test | 0 | db-test-cierre.txt y db-test-cierre-resultado.json; sesión17924 finalizada |
| node tests/respaldo-portable.cjs | 0 | portable-cierre.txt y portable-cierre-resultado.json; 22 casos |
| node tests/respaldo-portabilidad.cjs | 0 | portabilidad-cierre.txt, portabilidad-cierre-resultado.json y portabilidad-independiente.json |
| node tests/respaldos-ipc.cjs | 0 | ipc-cierre.txt; también incluido en db:test final |
| git diff --check | 0 | diff-check.txt |
| Consulta Windows de procesos propios | 0 | procesos-final.json; propios_residuales=0 |

Suite general final: `ruizcacao-tests-YPhZqP`, finalizada el 17 de octubre con código observado y persistido 0. Incluye 32 comprobaciones restore/16 fallos, seis estados de corte startup más rechazos de identidad/journal, portable22, portabilidad A→B y regresiones generales. Evidencia copiada: restore-suite-cierre.json, restore-startup-cierre.json, portabilidad-suite-cierre.json. Regresión pg_ctl: `../evidencias-pgctl/regresion-1792238392902.json`.

La prueba portable independiente tuvo un primer intento bloqueado por el sandbox al renombrar un archivo temporal (salida1, conservado en portable-cierre-sandbox.txt). Se repitió con autorización fuera del sandbox, sin cambios de código, y pasó22 casos/salida0. Portabilidad independiente: dos clústeres nuevos `ruizcacao-portable-9gOTbI`, pequeño/grande con25 tablas idénticas, contraseña original y rol limitado; salida0. Ninguna suite simultánea.

Consulta final Windows de solo lectura: 2026-10-17T13:14:16-05:00. Cero procesos propios de prueba, cero motores/herramientas fuera del servicio preexistente `postgresql-x64-18` (PID4212 y descendientes, iniciado el13 de octubre; no se detuvo ni se consultó su base). Motores de prueba cerrados. Los contratos IPC posteriores a esta consulta no inician motores ni hijos y finalizaron0.

Resumen de aceptación: página/permisos/IPC/generación/carga/validación/confirmación/progreso/cancelación/fase crítica/reinicio/StrictMode/accesibilidad OK; Renderer responsive SI; Snapshot usado por el módulo NO; polling/timers del módulo NO; consultas comerciales al montar0; listeners residuales0; procesos propios residuales0; restauración termina en Login SI; contraseña original OK. No queda comprobación obligatoria pendiente de Etapa03. `validacion-final.json` consolida resultados e inventario.

## Archivos

Producción modificada: `src/main/database/{base,conexion,respaldo-paquete,respaldo-storage,restore-caso}.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/data/menu.ts`, `src/renderer/src/types.ts`.

Producción nueva: `src/main/respaldos-servicio.ts`, `src/main/respaldos-ipc.ts`, `src/preload/respaldos.ts`, `src/shared/respaldos.ts`, `src/renderer/src/pages/Respaldos.tsx`.

Pruebas: `tests/run.cjs` modificado; nuevos `tests/respaldos-ipc.cjs`, `tests/respaldos-producto.cjs`, `scripts/probar-respaldos-ui.cjs`, `scripts/perfil-respaldos-ui.tsx`, `scripts/perfil-respaldos-login.tsx`. Documentación: este informe, continuidad, evidencias Etapa03 y resultados pg_ctl de regresión. `.eslintcache` aparece eliminado por lint --no-cache; se conserva el estado recibido sin reset ni limpieza. No se modifican SQL001–010, esquema, versión package.json, reglas financieras, Acceso, paginación ni Snapshot.

## Riesgos residuales y siguiente paso

- Publicación conserva el límite ya documentado de hardlinks: FAT/exFAT/destinos sin soporte y sincronizadores reales requieren la aceptación posterior. Se falla sin publicar un archivo parcial.
- Pendientes de su etapa: Windows limpio, otro SID/PC, instalador, relanzamiento empaquetado y cortes físicos. Los diálogos nativos se interceptan en la integración automatizada; revisión manual del selector del sistema queda para aceptación de producto.
- Se conservan intentos fallidos de los arneses junto con los resultados válidos. No representan fallos pendientes de la UI final. El primer ensayo de producto corrigió solo una variable del preload de prueba; se separó posteriormente la caché Chromium del hijo para evitar advertencias del arnés.

Siguiente paso exacto tras cerrar Etapa03: revisión humana del diff y evidencias; esperar autorización para Etapa04 «Primera instalación y recuperación: Crear usuario nuevo / Cargar respaldo». No iniciar esa etapa, build, commit, push, merge ni tag en esta tarea.
