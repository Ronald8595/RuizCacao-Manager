# Estado de continuidad — Escalabilidad PostgreSQL

## Último ajuste UX 1.2.0: Cuentas y Novedades — 2026-10-03

Cuentas añade paginación visual sobre su listado filtrado en memoria, con selector 10/25/50/100 (inicial 25), total filtrado, página/total y Anterior/Siguiente. Paginacion compartido admite opciones tipadas por pantalla; los demás módulos conservan 10/15/25/50. No hay endpoint ni paginación SQL nueva. Se mantiene useFilasVisibles y sus espacios virtuales dentro de la página actual; las tarjetas financieras siguen calculándose sobre TODAS las cuentas vigentes.

Categoría, búsqueda, estado, fechas y tamaño reinician a página 1; una reducción del listado acota la página almacenada a una válida. Cambio de página reinicia el scroll mediante el hook existente. Se reemplaza “Desplázate para verlas” por el total dinámico de cuentas coincidentes. Acciones reciben la cuenta real de la página; detalle, abonos y cuentas manuales mantienen su lógica. Novedades elimina solo el punto técnico de PostgreSQL: quedan cuatro beneficios visibles; mecanismo por usuario/versión y claves de almacenamiento intactos.

Typecheck 0; lint --no-cache 0 (0 errores/726 advertencias previas); db:test 0 en clúster temporal ruizcacao-tests-8LdZpW; prueba novedades 0; diff --check 0. Código Main/shared/preload/store/migraciones sin diff contra el inicio de esta tarea. Esquema 10/25 tablas; no migración 011 ni cambios 001–010, Snapshot, saldos, abonos o reglas financieras. No seed, build, commit ni push.

Interfaz real y StrictMode: 0 en escritorio 1440×960, reducida 800×600 y zoom 1,25 / 1280×800. Fixture de 16.252 cuentas solo en memoria, perfil Electron temporal, cero IPC de negocio y fixture intacta. Se recorren las 163 páginas de 100 y sus ventanas de scroll recogiendo IDs del DOM: ninguna cuenta omitida/duplicada, última cuenta accesible y menos de 40 filas de datos montadas. También se verifican 10/25/50/100, extremos, total filtrado/páginas, reinicios de scroll, categorías, búsquedas cliente/proveedor/número/Unicode, estado/fechas desde página profunda, vacío y abono de la cuenta correcta en página 2 (abrir/cancelar, sin guardar). Tarjetas permanecen iguales en todos los cambios de páginas/filtros. Paginador predeterminado de otros módulos conserva 10/15/25/50. Novedades tiene cuatro beneficios sin texto técnico y Entendido cierra la ventana.

Arnés: scripts/probar-cuentas-ux.cjs y scripts/perfil-cuentas-ux.tsx. Evidencias: docs/evidencias-escalabilidad/cuentas-ux-2026-10-03.json, seis PNG cuentas-ux-*, y logs typecheck/lint/db-test-cuentas-ux-2026-10-03.txt. La primera ejecución restringida de db:test/Chromium no arrancó sus procesos; repetir fuera del sandbox pasó. Se corrigió una ruta del arnés y se aislaron usuarios ficticios por tamaño de ventana para que Entendido del primer escenario no ocultara Novedades en los siguientes.

Archivos de aplicación: src/renderer/src/pages/Cuentas.tsx, src/renderer/src/components/Paginacion.tsx y src/renderer/src/components/NovedadesVersion.tsx. Continuidad y arnés/evidencias de validación añadidos. SIGUIENTE PASO EXACTO: revisar visualmente Cuentas en la app completa con datos existentes (selector, navegación, filtros y apertura/cancelación del abono), antes del cierre humano de 1.2.0. No ejecutar seed ni build aún. La prueba del instalador offline permanece pendiente según el apartado siguiente.

## Prerrequisito del instalador Windows 1.2.0 — 2026-10-03

Hallazgo real de VM comunicado por el usuario: PostgreSQL 18.6 incluido terminaba con -1073741515 / 0xC0000135; faltaban las DLL del runtime VC++ x64. Instalar el redistribuible oficial permitió ejecutar los cuatro binarios. El intento data-inicializando se conservó/retiró manualmente, y se obtuvo data válido PG_VERSION=18 y Crear usuario.

Solución implementada: NSIS incorpora offline el redistribuible Microsoft x64 14.51.36247.0 aprobado por SHA-256/firma; verifica registro/versiones/DLL nativas, instala silenciosamente con UAC solo en el prerrequisito y espera/recomprueba antes de reemplazar una app anterior. Reinicio/cancelación/fallo detienen el reemplazo con mensaje comprensible. PostgresLocal comprueba cuatro --version antes de crear un intento y registra fallos sin rutas, contraseñas ni stdout/stderr. Se conserva todo data o intento incompleto. Identidad appId/nombre del paquete/executableName y almacenamiento intactos; asistente NSIS usa RuizCacaoManager (executableName) para nueva instalación y conserva la ruta registrada de 1.1.2.

Esquema 10, 25 tablas; no hay migración nueva ni cambios en 001–010 (SHA-256 iguales). Runtime binario ignorado en vendor/vcredist; manifiesto/hook/scripts versionados. [Informe del prerrequisito](Informe_Prerequisito_Windows_v1.2.0.md) y [prueba Windows limpia](WINDOWS_LIMPIA.md). Typecheck 0; lint 0 (726 advertencias de formato/0 errores); db:test final 0 en ruizcacao-tests-gCYnb4; db:sql 0; release:preflight 0; include NSIS instalador/desinstalador 0; configuración builder 0; runtime ausente/alterado y arranque/conservación 0; diff --check 0. Binarios del paquete previo y vendor responden PostgreSQL 18.6. No build de aplicación, seed ni operaciones Git de publicación. Los apartados siguientes describen cortes anteriores.

SIGUIENTE PASO EXACTO: con autorización de build, generar instalador 1.2.0 y probar offline en VM sin VC++ previo, cancelación UAC/reinicio y actualización real de 1.1.2. No declarar cerrada la validación de instalación en VM antes de repetirla con este instalador. Ejecutar db:test y release:preflight secuencialmente para evitar copiar ejecutables ocupados.

## Etapa 05 — cierre técnico verificado 2026-10-03

La tarea actual de gestión de notificaciones está implementada y probada. HEAD inicial dd558d86e54c0c845cc098f703e2abfeb987ccc0a, árbol limpio. Inspección terminó antes de editar. Avisos eran globales, sin propietario; migración 010 necesaria para aislamiento, mantiene 25 tablas y preserva históricos con copias independientes por usuario existente. Esquema final de código y suite 10; base local real no iniciada ni migrada. SQL/TS 001–009 y dependencias sin diff contra HEAD; hashes históricos registrados.

Seis IPC compactos tipados, usuario tomado de sesión Main, UUID validados, limpieza DELETE de leídas con fecha de creación <= CURRENT_TIMESTAMP-48h al listar/inicializar/abrir. Nunca elimina no leídas ni copia ajena. Badge y panel actualizados sin Snapshot; cola ignora respuestas/errores anteriores a desmontar sesión y no restaura eliminaciones desde estado de negocio viejo. Tres puntos/clic derecho, menú según leído, teclado/foco, borrar individual sin cerrar, confirmación accesible para todas y vacío verificados.

Typecheck 0; lint 0 (0 errores/727 advertencias de formato); db:test 0, clúster aislado ruizcacao-tests-zvN1Zn; db:sql 0; git diff --check 0. Nueva prueba v9→10: respaldo/fallo/rollback/preservación/25 tablas, instalación sin usuarios, seis acciones, privados ajenos, 48h exactas, idempotencia, reinicio, concurrencia y cero Snapshot. Suite completa conserva finanzas/reportes/PDF/CRUD/jornadas/auth/recuperación. Chromium oculto con CSS real y StrictMode pasa escritorio 1443×778, reducida 803×603 y zoom 1,25 / 1026×622; nueve PNG y JSON de acciones. Informes/logs/hashes en docs/evidencias-escalabilidad/*etapa05*. No db:seed:performance, seed en desarrollo, build, publicación Git ni dependencias nuevas. Fixtures de la suite solo en clúster temporal.

SIGUIENTE PASO EXACTO: npm run dev desde electron-app en desarrollo, verificar respaldo pre_migracion y actualización 9→10, iniciar sesión existente y ejecutar lista humana de campana/acciones/menús/confirmación/teclado/ventana/zoom/persistencia/dos usuarios preparada en [Informe Etapa 05](Informe_Etapa_05_Notificaciones_v1.2.0.md). Registrar cierre humano antes de congelar 1.2.0. No iniciar base cliente ni seed/build/publicación. Los apartados siguientes son el corte histórico de Etapa 04 (esquema 9); no describen el esquema nuevo del código.

Corte 2026-10-02, America/Guayaquil. Rama feature/escalabilidad-postgresql. Aplicación 1.1.2; objetivo futuro 1.2.0. HEAD inicial de Etapa 04: 9efb6c6 (Etapas 02/03 ya incorporadas por el usuario). Cambios de Etapa 04 sin commit. Sin pull/merge/commit/push/tag/build/seed ni dependencias nuevas.

## Estado actual

Etapas 01/02/03 conservadas. Etapa 04 implementa paginación SQL y COUNT para Historial combinado, Gastos y detalle de Reportes; mejora controles de Stock/Compras/Ventas y Proveedores. Equivalencia financiera exacta y PDF completo diario/semanal/mensual comprobados. Cierre técnico y scroll interno de los nueve módulos verificados en Chromium con CSS completo; Etapa 04 lista para cierre visual humano; revisión visual humana de la app completa pendiente. [Informe Etapa 04](Informe_Etapa_04_Paginacion_Integral_Reportes.md).

Esquema final de código/suite/base local: 9, 25 tablas. Migraciones 001–009 intactas, comprobadas por SHA-256. Sin 010 ni índices nuevos. Sin nuevo seed local. Snapshot global COMPLETO; Cuentas mantiene virtualización.

## Base de desarrollo y datos conservados

ruizcacao_manager en127.0.0.1:5432, esquema ruizcacao, configuración cifrada userData/postgres.enc. Etapa3 solo lee la base original mediante transacciones READ ONLY o pg_dump. No llama iniciar/login/jornada/ejecutar allí; no modifica registros/sesiones/jornadas/avisos. Comandos de medición se ejecutan con ROLLBACK en copias efímeras verificadas del dump actual.

Lote existente PERF-203f6a49-544e-4435-8350-77cb32fe3163-. Totales siguen: clientes1.004/proveedores506/empleados3/compras10.014/ventas15.007/cuentas25.021/movimientosCuenta16.695/movimientosStock25.450/gastos13.019. Huella del corte histórico de Etapa 03: cb3a4f31b0a317db09a4d13c32d0dd9c9851baf302faf668347ecc413954a3bb. Etapa 04 antes=después: 942fb1869779bd707aa4d37ea228e859f9274dcdc2f94b5e1df8f59c2e1354e7. Snapshot65.339.124 bytes JSON; estado65.358.083; tamaños íntegros idénticos.

NO ejecutar db:seed:performance al continuar: agrega OTRO lote y no es una comprobación. Datos sintéticos no se entregan al cliente. Respaldos de Etapa2 verificados y conservados:

    C:/Users/LENOVO/AppData/Roaming/RuizCacao Manager/backups/manual_2026-10-01T19-39-06-027Z_684a733b-1b8f-4107-8079-00be41a7d173.dump
    C:/Users/LENOVO/AppData/Roaming/RuizCacao Manager/backups/pre_migracion_2026-10-01T19-54-58-762Z_9b52ed94-4ad6-4e00-98a6-0f85d7434e4d.dump

Hashes/detalles en Informe_Etapa_02_Paginacion_Compras_Ventas.md. Etapa3 no restaura ni escribe en la base original.

## Diagnóstico medido y solución

Navegar cambia componentes y reutiliza Snapshot; no provoca nueva carga completa. Cuentas antes montaba16.252 filas DOM: mediana React+layout3.188 ms. Ahora monta viewport+margen, unas17–26 filas de datos, con todas las cuentas/filtros/totales en memoria y acceso por scroll; mediana31,1 ms. No páginas ni endpoint SQL nuevo. Detalle/retorno, foco, cambio de filtros desde scroll profundo y acceso a última fila validados en Electron oculto.

Compra/Venta calculaba historial de25.021 cuentas con find de clientes aun en pestaña Compras. Ahora difiere filtrado hasta abrir Historial y usa Map/memo. React/commit97,8→2,4 ms; React+layout110,5→4,8 ms. Este era el estado al cerrar Etapa 03; Etapa 04 sustituye el historial por consulta SQL paginada.

Renderer creaba dominio mutable y clonaba todas las colecciones para exponer datos. Nueva crearLecturaDominio sin comandos comparte datos completos como lectura, deriva índices de saldo equivalentes y se memoiza por estado.datos. Provider152→9 ms; lectura~5,4 ms. Dominio mutable Main conserva clonado y reglas.

Guardar comprobaba borrados con originales×registros.some: mediana CPU sin cambios10.945→314 ms (cortes finales). Set mantiene igualdad estricta/guardas/auditoría. En copia con guardar y SQL reales: compra14.471→3.064 ms; venta13.698→3.079; alta cliente14.896→3.137. Sigue lectura completa antes y después del comando. No devolver dominio.snapshot a ciegas: defaults/nulls/redondeo/autoría/orden/concurrencia deben resolverse antes de leer incrementos.

Lectura global/IPC no reducidos: estado~~0,7–1,1s, IPC cacheado~~0,5–0,7s, JSON~0,17s. Perfil final muestra variación CPU/GC; no atribuir mejora de SQL/IPC. Cuentas/movimientos/gastos conservan sorts actuales. No nuevo índice sin comparación medida. Contrato completo65 MB impone demora residual en carga/actualización.

Mediciones con React production, componentes reales/DOM/IPC, ventana oculta y CSS mínimo; excluyen Sidebar/login/cola IPC de producción. requestAnimationFrame oculto a veces1s no se usa para afirmar respuesta visual. Son mediciones de arnés, no prueba manual ni garantía de producción.

## Archivos y pruebas históricas Etapa 03

Etapa3 modifica base.ts solo en guardar, dominio.ts vista de lectura, AppDataContext.tsx, CompraVenta.tsx, Cuentas.tsx, tests/run.cjs y documentación. Nuevos: utils indices/filasVisibles, hook useFilasVisibles, tests lectura-dominio/guardar-indices, scripts perfil-renderer/preload/medir-snapshot/medir-comandos. Lista exacta en informe; git status incluye también todo el trabajo anterior de Etapa2.

- typecheck0 Node/Web; lint0, cero errores/787 advertencias heredadas (antes896).
- db:test0, suite completa, clúster ruizcacao-tests-kHtUj5: dominio/finanzas/saldos/stock/anulaciones/reportes, auth/jornadas/recuperación, respaldos/rollback/reinicio, migraciones/paginación y dos suites nuevas.
- Nueva lectura igual a todos los campos/derivados/saldos del dominio original en fixture pequeño/completo; entrada intacta, jornadas activas/interrumpidas/históricas y saldos negativos/manuales/anulados. Guardar conserva rechazo de borrados y tipo de ID, gasto/auditoría permitidos.
- Rangos virtuales/Map0; Electron DOM0 con inicio/mitad/final/última cuenta, retorno detalle, foco y filtro Todas(25.021) desde profundidad.
- Comandos en copias0 antes/después, conteos/bytesRespuesta por caso idénticos; Snapshot original/huellas iguales. No writes/seed en original.
- git diff --check0; 001–008 SQL/TS/lockfile comparados sin diff; 009 SQL/TS conservados del trabajo previo. Hashes001–009 y códigos en verificaciones-etapa03-2026-10-01.json.

Evidencia en docs/evidencias-escalabilidad: snapshot-antes-primer-corte, snapshot-antes, snapshot-despues, comandos-snapshot-antes/despues (2026-10-01.json); db-test-etapa03/lint-etapa03-2026-10-01.txt; verificaciones-etapa03-2026-10-01.json. Sin bloqueos ni verificaciones automatizadas obligatorias pendientes.

## Etapa 04 — Cierre técnico 2026-10-02

Cliente/proveedor: catálogos completos de 1.004/506 en Snapshot, paginación React. Clientes conservado por coste pequeño (~9 ms render/layout); Proveedores pasa de 506 a 15 filas iniciales y controles 10/15/25/50 (~100 → 7 ms render/layout). CRUD y búsquedas preservados.

Stock/Compras/Ventas: keyset BIGINT y COUNT con exactamente los filtros funcionales; selector 10/15/25/50, total, página/total de páginas y anterior/siguiente compartidos. Cursor ligado a tamaño/filtros; nunca OFFSET. COUNT de Compras/Ventas corregido para conservar el total del filtro al avanzar; la suite verifica cada página. Transacciones de listados READ ONLY REPEATABLE READ.

Historial: consulta directa de cuentas no manuales, titular, tipo/estado/búsqueda/rango, DTO compatible con detalle. No UNION duplicador ni descarga global adicional. Gastos: SQL paginado con categoría/tipo/rango y marca de anulada equivalente; agregado financiero aparte. Resumen usa Rango de la lista inicialmente y conserva Diario/Semanal/Mensual con fecha de referencia. Hoy permanece filtro inicial. Categoría/tipo de lista no reducen el resumen global.

Reportes: agregado SQL completo con COUNT integrado + detalle keyset de hasta 50 filas. Renderer no ejecuta resumirPeriodo ni cruces masivos al cambiar fecha. Respuestas atrasadas descartadas; rango, modo, tamaño y revisión reinician cursores. PDF pide todo el periodo y se construye en Main, manteniendo impresión/diálogo actuales.

Primer arnés limpio: Historial 25.021 → 15 filas, render+layout 4.074 → 26,5 ms; Gastos 13.019 → 15, 18.060 → 5,4 ms; Reportes 19.691 → 15, 32.351 → 3,7 ms. Servicio de primera página ~27/~22/~180 ms. Datos listos del arnés ~471/~464/~621 ms, incluyendo 250 ms de asentamiento. Corte final repite efecto y valida controles. No son tiempos garantizados del clic en app completa. Snapshot ~65 MB sigue completo.

Equivalencia real: diario 106, semanal 553, mensual 2.237, enero–septiembre 19.691 y vacío 0 filas. DTO/orden/totales exactos; HTML PDF idéntico salvo emisión. PDF impresos completos: diario 5, semanal 25, mensual 98 páginas. Anulados con pagos y categoría legado cubiertos también en base aislada. Conteo del algoritmo anterior: some 208.998.776 y find 317.397.121 evaluaciones por rango amplio; esa ejecución extra solo cuenta funciones, no se usa como tiempo.

Validaciones finales: typecheck 0; lint 0 (777 advertencias de formato, cero errores); db:test 0 (clúster ruizcacao-tests-wfJ7qx); arnés React/SQL 0; PDF 0. db:sql no aplica. Hashes 001–009 iguales al corte anterior; Snapshot antes/después igual. Evidencia en docs/evidencias-escalabilidad/etapa04-*, verificaciones-etapa04-2026-10-02.json, logs etapa04 y PDF_etapa04_*.pdf. Sin código obligatorio de equivalencia pendiente. Archivo ajeno how --stat bebcda3 preservado.

## SIGUIENTE PASO EXACTO

Desde electron-app ejecutar npm run dev e iniciar sesión existente. Revisar app completa y registrar resultados en Informe Etapa 04: Historial enero–septiembre, selector/tipo/estado/búsqueda/Anterior/Siguiente/Ver detalle; Gastos 01/01/2026–30/09/2026, filtros y Resumen de rango invariante con página; Reportes diario/semanal/mensual, rangos grandes, cards, 10/15/25/50, navegación y guardar PDF completo. Revisar zoom/ancho pequeño, scroll, foco y diálogo de archivo. Cuentas conserva scroll virtual.

NO ejecutar seed, build ni operaciones Git de publicación. No tocar base cliente ni migraciones 001–009. No iniciar índices ni reducción de Snapshot por intuición. Si aparece una diferencia visual/financiera, documentar caso exacto y resolverla antes de declarar cierre visual o preparar 1.2.0.

## Cierre UX de scroll interno — 2026-10-02

ContenedorTabla y estilos compartidos aplicados a Historial Compra/Venta, Gastos (solo Lista), detalle financiero de Reportes, Stock, Compras, Ventas y Proveedores. Altura máxima calcula el espacio superior real y reserva el pie; scroll nativo en ambos ejes, encabezados sticky con fondo opaco y paginación externa. Reinicio vertical por página/tamaño/filtros. SQL, COUNT, cursores, finanzas, PDF, Snapshot y Cuentas sin cambios en este cierre. CSS completo comprobado en Chromium offscreen: 28 casos (7 módulos × escritorio/reducida/compacta/zoom real 125 %), rueda, PageDown, Tab en acciones, reinicios, detalle y foco del paginador correctos. Typecheck 0 y lint 0 (776 advertencias, cero errores). db:test 0 en clúster aislado ruizcacao-tests-CXqaGR tras ajustar guardas del paginador; git diff --check 0. Documentación de cierre actualizada. Esquema permanece 9; sin migración 010.


Matriz final UX: viewports reales escritorio 1443×778, reducida 1027×771, compacta 803×603 y zoom Chromium real 1,25 / 1026×622. Las 28 verificaciones pasan con 50 filas: scroll vertical/horizontal, sticky opaco, pie externo, regreso al inicio por página/tamaño/filtros, rueda/PageDown, Tab en acciones, foco al avanzar y Ver detalle. JSON scroll-etapa04-2026-10-02.json y 28 PNG en docs/evidencias-escalabilidad. ContenedorTabla mide el espacio real con ResizeObserver; CSS usa max-height relativo al viewport. En ventanas bajas Reportes/Stock pueden necesitar scroll exterior para su estructura superior, pero no para recorrer 50 filas. Paginación de Reportes siempre montada; controles aria-disabled con guardas conservan foco.

Archivos de este cierre: ContenedorTabla.tsx, Paginacion.tsx, assets/main.css, ReporteDiario.tsx, siete páginas (CompraVenta/Gastos/Consultas/Stock/Compras/Ventas/Clientes para Proveedores), tres scripts nuevos de prueba scroll, documentos y evidencias. SQL/COUNT/keyset/hook de datos/PDF/resúmenes/Snapshot/Cuentas/migraciones/lockfile conservados. Hashes SQL 001–009 iguales al corte de Etapa 04; no 010.

Siguiente paso exacto del cierre UX: npm run dev, sesión existente y lista de revisión humana preparada al final del Informe Etapa 04: 50 filas, columnas/acciones, tamaños y filtros profundos, detalle/abonos, rangos/modos, teclado y trackpad físicos, ventana reducida/zoom y diálogo de guardar PDF. Pruebas automáticas confirmadas; revisión humana con hardware final pendiente. No seed/build/publicación Git.

## Cierre final UX — Clientes y Empleados, verificado 2026-10-02

Clientes usa ahora ContenedorTabla con su paginación React 10/25/50/100 intacta. Empleados ya tenía paginación React fija de 15 filas; su tabla también está envuelta, sin selector nuevo ni cambios de búsqueda/orden/estado/pagos. Pies actuales externos marcados como navegación para reservar su espacio. ContenedorTabla, CSS compartido y lógica de datos intactos. Typecheck 0, lint 0 (775 advertencias/cero errores), git diff --check 0. Seis casos visuales correctos con fixtures solo en memoria; cero acceso a PostgreSQL y cero llamadas de datos. Los hashes de 58 archivos protegidos coinciden antes/después. db:test no aplica en este ajuste: no hay cambios funcionales compartidos; última suite anterior 0.


Validación de catálogos: Clientes 50 filas, Empleados 15 por su paginación existente; escritorio 1443×778, reducida 803×603, zoom real 1,25 / 1026×622. Scroll vertical y horizontal interno, sticky, pie externo, rueda/PageDown/Tab en acciones, reinicios, búsqueda, estado/orden, abrir/cancelar Editar y Desactivar correctos en los seis casos. Fixture de 200 clientes/90 empleados solo en memoria, intacta, sin guardar ni seed. Evidencia scroll-catalogos-etapa04-2026-10-02.json, seis PNG catalogos-*, logs typecheck/lint-catalogos y verificaciones-catalogos.

Archivos de este último ajuste: páginas Clientes.tsx/Empleados.tsx; scripts probar-scroll-catalogos-etapa04.cjs/perfil-scroll-catalogos-etapa04.tsx; ambos documentos y evidencia. ContenedorTabla, Paginacion, CSS, Main/IPC/preload, Snapshot, SQL/hook de datos, finanzas/PDF y dependencias sin cambios. Esquema 9, 25 tablas, 010 NO.

SIGUIENTE PASO EXACTO: npm run dev, sesión existente, lista humana final al final del Informe Etapa 04: Clientes con 50, Empleados con 15 y lista larga, filtros/páginas/orden, edición/desactivación con cancelación, rueda/teclado/trackpad físicos, ventana reducida y zoom 125%; completar además los siete módulos anteriores y diálogo de guardar PDF. Etapa 04 lista para cierre visual humano; no declarar la revisión humana terminada antes de ejecutarla. No seed/build ni publicación Git.

## Diagnóstico y fecha de Cuentas v1.2.1 — 2026-10-13

Estado actual prevalece sobre las referencias históricas a esquema 9: esquema 10 y 25 tablas, migraciones 001–010 intactas, 011 NO. Fuentes/versiones raíz sincronizadas en 1.2.1, sin build ni publicación.

Fecha de operación agregada a Cuentas y al detalle, DD/MM/YYYY. Usa Cuenta.fecha existente, originada en compra/venta/manual; no usa último abono ni reescribe historia. Nuevo botón permite detalle por cuenta para cualquier categoría/estado. Conserva paginación 10/25/50/100, filtros y virtualización. Suite de fechas con abonos posteriores y saldado aprobada e incorporada a db:test.

Perfil reproducible scripts/perfil-parche.cjs: base grande existente READ ONLY, IPC real cacheado sin UI; opción --small en clúster temporal nuevo para motor/migraciones/login. Payload 65.339.663 bytes y 15 consultas de estado sin sesión, sin reducción. Corte inicial estado 888,49 ms / IPC 613 ms; corte final 1.720,64 / 2.982,80 ms. Variación del arnés, sin optimización aceptada ni mejora atribuible. La memoria de este arnés retiene filas/estado y no equivale a la app real.

Dos variantes de preclasificación DTO descartadas por ausencia de ventaja fiable, relacional.ts restaurado. Consulta de notificaciones conservada: incluye asignación de avisos históricos y limpieza de leídos de más de 48 horas, no es una lectura duplicada pura. Snapshot, cola IPC, cálculos financieros, reportes/PDF, jornadas, recuperación y dependencias funcionales conservados.

Typecheck 0; lint 0, 725 advertencias y cero errores; db:test 0, clúster ruizcacao-tests-4b7xoY; fechas/novedades 0; git diff --check 0. Evidencia y alcance en Informe_Parche_Optimizacion_v1.2.1.md y docs/evidencias-escalabilidad/parche-*.json.

**Trabajo de rendimiento aún pendiente:** bootstrap de producción hasta Acceso/Inicio interactivo, login real, navegación Cuentas/Compra-Venta/vuelta, memoria privada PostgreSQL y reposo de cinco minutos. No declarar terminada la optimización de arranque ni revisión humana de Cuentas. No seed/build/commit/push/tag. Siguiente paso: medir aplicación completa con sesión existente y motor recurrente; aplicar únicamente cambios con evidencia comparativa y consistencia verificada.

## Perfil real v1.2.1 — cierre del diagnóstico 2026-10-13

A (servidor externo), B (PostgresLocal recurrente ya configurado) y C (primera instalación hasta Crear usuario) medidos. Este cierre sustituye el pendiente de perfil real del corte anterior; no es un perfil de producción ni una optimización. Evidencias en docs/evidencias-arranque-real y tablas completas en [Informe_Perfil_Arranque_Real_v1.2.1.md](Informe_Perfil_Arranque_Real_v1.2.1.md).

| Ruta | Acceso visible | Login → Inicio | Proceso → Inicio |
|---|---|---|---|
| A pequeña, primer/segundo proceso | 1,62 / 1,40 s | 0,280 / 0,261 s | 2,01 / 1,82 s |
| A grande, primer/segundo proceso | 2,27 / 1,42 s | 2,02 / 1,90 s | 4,39 / 3,49 s |
| B pequeña, primer/segundo proceso | 37,39 / 37,33 s | 0,248 / 0,260 s | 37,75 / 37,78 s |
| B grande, primer/segundo proceso | 37,59 / 37,43 s | 1,918 / 1,834 s | 39,64 / 39,41 s |
| C nueva | 53,68 s hasta Crear usuario | N/D, sin alta | N/D, sin alta |

C: initdb **12,07 s**, fase posterior de conexión/arranque PG **35,52 s**, BaseLocal.iniciar/migraciones **0,478 s**. B no incluye initdb. La demora recurrente B queda localizada entre la salida de pg_ctl (exit 0 tras ~0,3–0,4 s) y close/resolución (~35 s): ~34,6 s adicionales. Posible retención de stdio/handles heredados; causalidad exacta pendiente de experimento, no de asumir que PostgreSQL tarda 35 s en estar listo. A usa configuración externa y omite PostgresLocal.

Cuello principal A: Snapshot completo de **65.340.429 bytes** frente a **1.096 bytes** en pequeña. Segundo login grande: estado916,28 ms (SQL cliente665,42 + DTO241,60), Main→preload267,18 ms, puente→Renderer391,30 ms, procesamiento restante104,90 ms. Estado/transporte explican ~83% del login. Secundario: carga de ventana/UI1,08–1,87 s, sin atribución demostrada a parseo JS.

Reposo válido grande: 300 s, cero interacciones/SQL. Working Set Main281,30→112,26 / Renderer283,72→189,48 / PostgreSQL245,43→180,83 MiB; GPU125,95 y Utility53,28 MiB finales. CPU media Main1,23% / Renderer0,17% / PostgreSQL0,06% de un núcleo, incluida instrumentación. Memoria estable en esa ventana (sin crecimiento neto), no prueba ausencia de fugas largas. CPU de arranque, picos y PID individuales en el informe. La corrida large-externo-segundo tuvo actividad durante reposo y se excluyó de esa comparación; large-externo-reposo la reemplaza con entrada deshabilitada. large-segundo tiene arranque válido pero navegación/reposo incompletos, conservado como evidencia parcial.

Suite PostgreSQL recuperada: log termina en “Suite PostgreSQL completa”, clúster ruizcacao-tests-oQgSqd. La sesión de terminal 10117 ya no existe: código de salida no recuperable, resultado funcional completo registrado; no repetir la suite. Typecheck0, lint0 (**726 advertencias/0 errores**), diff-check0 y verificador de evidencia0. La suite precede a dos marcas opt-in initdb-start/end; C las ejercita y typecheck/lint posteriores pasan. No hay pruebas en ejecución y los motores aislados están detenidos. Sin optimización implementada; cambios de fecha de Cuentas previos conservados.

Incidencia: origen22/25 tablas iguales. Auditoria164→166, sesiones86→87, huella usuarios distinta. Sesión11:53:42–11:54:01 y dos autenticaciones fallidas11:53:54/58; atribución no concluyente, imposible certificar cero escrituras durante todos los intentos previos. No borrar ni restaurar datos para ocultar diferencias. Todas las tablas comerciales coinciden. Se conserva original-final.json.

Recomendaciones: **Splash SÍ solo UX en B/C**, no prioridad A y reevaluar tras corregir la espera; **lazy NO por ahora** (sin A/B que pruebe beneficio); **Snapshot parcial SÍ como diseño/piloto posterior**, riesgo alto de contratos/saldos/hidratación; **Worker NO**, **índices NO**, **V8 snapshot NO** por falta de evidencia específica. Prioridades: 1) investigar/corregir lifecycle de pg_ctl para motor administrado, impacto potencial ~34,6 s/riesgo medio; 2) contrato inicial mínimo para ruta externa, alto impacto potencial en login/memoria y alto riesgo funcional; 3) experimento lazy de páginas ajenas a Inicio, beneficio aún no demostrado. Ninguna aplicada.

Archivos del diagnóstico: instrumentación opt-in Main/index y database/{base,conexion,ipc,postgres-local,relacional}, nuevo main/perfil-arranque.ts; preload/index.ts e index.d.ts; Renderer App, Acceso, main, inicio, AppDataContext y utils/perfilArranque. Scripts de preparación, conexión externa, driver real, recursos PG, resumen, documentación y verificación conservados/extendidos. Informe, continuidad y evidencias actualizados. Se preservan package/lock1.2.1, Cuentas/DetalleCuenta, tests/cuentas-fecha y tests/run, informe/arnés/evidencias del parche previo. `.eslintcache` ya estaba eliminado al retomar; no se revirtió. Migraciones001–010 intactas, sin011 ni cambios de negocio nuevos.

Límites y pendientes humanos: desarrollo React/StrictMode, frío de proceso sin vaciar caché del SO, Vite fuera del intervalo; no release/instalador. C termina en Crear usuario, sin alta ni primer login, sin reposo propio; sus muestras no capturan todos los procesos transitorios de initdb. Revisar entrada física/visual de Cuentas y equipo final en otra tarea. Incidencia de origen pendiente de atribución; no certificar conservación integral. No quedan mediciones automatizadas obligatorias en ejecución.

### CONTINUAR DESDE AQUÍ

1. Leer el informe final y original-final.json; conservar las corridas A/B/C y no repetir los reposos válidos.
2. Revisar la incidencia de auditoria/sesiones/usuarios solo en lectura; no restaurar contadores ni borrar evidencia.
3. Siguiente experimento propuesto para motor administrado: localizar por qué pg_ctl exit tarda ~34,6 s en llegar a close y validar una corrección en copia aislada. Para priorizar desarrollo externo, diseñar primero el contrato inicial mínimo.
4. No tocar migraciones001–010, base original, reglas, Fecha de operación ni evidencia. No crear011 ni aplicar optimizaciones como parte de este cierre.
5. Si cambia código posteriormente, ejecutar desde electron-app: `npm run typecheck`, `npm run lint -- --no-cache`, `npm run db:test`, `git diff --check`. No repetir la suite solo por haber perdido su sesión de terminal.
6. Para regenerar documentos: `node scripts/resumir-perfil-real.cjs` y `node scripts/documentar-perfil-real.cjs`; verificar con `node scripts/verificar-perfil-real.cjs`. No son nuevas mediciones.
7. Registrar revisión humana de teclado/ventana/Cuentas y onboarding nuevo en otra tarea; release/instalador requiere alcance posterior.
8. Mantener prohibición de seed, build, commit, push y tag. Presentar/revisar el diagnóstico antes de implementar la estrategia elegida.

Últimos comandos de cierre: `node scripts/documentar-perfil-real.cjs`, `node scripts/verificar-perfil-real.cjs` y `git diff --check`, resultado0. Resultados y límites en docs/evidencias-arranque-real/validacion-comandos.json; logs typecheck.txt, lint.txt y db-test.txt. Ninguna prueba queda ejecutándose. Diagnóstico entregado; no hay mejora de rendimiento implementada ni demostrada por comparación antes/después.

## Parche pg_ctl v1.2.1 — cierre validado 2026-10-13

Este corte sucede al diagnóstico anterior: ahora sí hay una corrección de arranque implementada y medida. Alcance exclusivo: lifecycle de pg_ctl en PostgresLocal. Informe: [Informe_Optimizacion_Arranque_pgctl_v1.2.1.md](Informe_Optimizacion_Arranque_pgctl_v1.2.1.md). Evidencia nueva en docs/evidencias-pgctl; no se alteró evidencia anterior.

Causa confirmada: pg_ctl Windows crea CMD con stdout/stderr heredados; CMD permanece mientras vive PostgreSQL. Aunque pg_ctl termina con exit0, ambos pipes impiden close hasta que execFile los destruye a35 s. Consumirlos, quitar solo uno o stdin no resuelve. Eliminar ambos o enviarlos a archivo elimina la espera. El árbol de PID y fuente REL_18_6 explican el mecanismo; no se inspeccionó el identificador nativo de cada HANDLE.

Solución: spawn exclusivamente para start, stdin ignore, stdout/stderr a pg_ctl.log en append, separado de postgresql.log de -l. Se conserva windowsHide, sin shell/detached, -w/-t30, timeout35000 y verificación autenticada posterior. Error/señal/código no0 se propaga; exit0 sin servidor se rechaza. No se aceptan errores de pg_ctl por el solo hecho de que una conexión posterior funcione.

El caso de recuperación bloqueada descubrió un fallo real de shutdown, no de pipes: restore_command de32 s retrasó la salida ~34 s tras fast, superior a -t20. Se conserva el fallo original. Solo la limpieza de un arranque fallido permite -t60/timeout65000, margen basado en esa medición; el cierre normal conserva -t20/timeout25000. La sonda stop confirmó33.246,97 ms spawn→exit,0,13 ms exit→close y PID terminado. No se mató postgres ni se rebajó ninguna aserción. Si un comando externo supera también60 s, el cierre sigue considerándose fallido y se registra; no hay garantía contra bloqueos ilimitados.

| Escenario | Acceso antes → después ms | Inicio antes → después ms | pg_ctl exit→close después ms |
|---|---|---|---|
| Pequeña, primer proceso | 37.392,60 → 2.117,31 | 37.749,90 → 2.522,11 | 0,28 |
| Pequeña, segundo proceso | 37.329,72 → 2.239,77 | 37.781,82 → 2.703,07 | 0,34 |
| Grande, primer proceso | 37.586,53 → 3.278,59 | 39.643,83 → 5.261,99 | 0,57 |
| Grande, segundo proceso | 37.429,97 → 2.074,41 | 39.414,57 → 4.067,11 | 0,32 |

Antes, exit→close grande34.582,97/34.698,62 ms. Persistencia pasa de~35,6 s a0,89–1,54 s; mejora de Acceso91,28–94,46%. Login grande1,81/1,83 s, similar a1,92/1,83 s antes. Pequeña sube40–73 ms (estado/Renderer); no se atribuye causalmente ni se descarta estadísticamente con solo dos observaciones. RAM Main/Renderer varía pocos MiB; no se repitieron reposos acreditados de5 minutos. Los JSON pequeños antiguos no tenían listeners pg_ctl; sus eventos anteriores individuales se indican N/D. Desarrollo real, sin medición de release ni initdb en este A/B.

Regresiones: motor detenido/ya iniciado, segundo arranque, SQL disponible, error real pg_ctl, puerto ocupado, postgres fallido, exit0 sin servidor, timeout de proceso35 s y timeout PostgreSQL30 s, datos/clave conservados, cierre/reapertura, logs y protecciones data/data-inicializando/versión: OK. Cuatro cierres de la app con cero PID PostgreSQL observados aún activos; barrido final motores-final.json sin motores residuales en raíces verificadas. EnumWindows cada20 ms no detectó consolas nuevas; revisión humana no sustituida, posibles destellos inferiores al intervalo no excluidos.

Validación definitiva: typecheck0; lint0,0 errores/726 advertencias; db:test0, suite funcional completa, clúster ruizcacao-tests-GzrPO1; git diff --check0. Se conservaron db-test.txt (fallo de cierre inicial), db-test-final.txt (último caso afectado por una sonda del agente que compitió por puerto55433) y lint.txt (dos variables sin uso en generador documental, corregidas). Logs válidos: db-test-secuencial.txt y lint-final.txt. Los motores se validaron finalmente sin pruebas paralelas; no queda prueba en ejecución.

Archivos propios del parche: src/main/database/postgres-local.ts; tests/pgctl-arranque.cjs y tests/run.cjs; scripts/perfil-aplicacion-real.cjs extendido; nuevos experimento-pgctl.cjs, benchmark-pgctl-final.cjs, vigilar-consolas-pgctl.ps1, documentar-pgctl.cjs; informe, continuidad y evidencias-pgctl. Resto de cambios previos preservados. Instrumentación opt-in conservada; scripts de diagnóstico fuera del arranque cliente, sin logs de rendimiento por defecto.

69 huellas protegidas iguales: evidencia anterior, SQL001–010 y Cuentas/DetalleCuenta. original-final.json conserva su incidencia22/25; esta tarea no se conectó al origen ni corrigió sus tablas. Esquema10,25 tablas,011 NO. Snapshot, reglas, notificaciones, recuperación de contraseña, reportes/PDF, Fecha de operación, índices, lazy, splash, workers y V8 snapshots sin cambios. Sin seed/build/commit/push/merge/tag.

### CONTINUAR DESDE AQUI

1. Leer el informe pg_ctl y resumen-final.json; no repetir experimentos cerrados ni sobrescribir evidencia.
2. Siguiente paso exacto: revisión humana de arranque/cierre/reapertura sin consola usando una copia aislada, antes de preparar un release en otra tarea.
3. Revisar el diff de PostgresLocal y pruebas. No tocar base original, migraciones001–010, Snapshot ni Fecha de operación.
4. Ante cambios nuevos, ejecutar desde electron-app: `npm run typecheck`, `npm run lint -- --no-cache`, `npm run db:test`, `git diff --check`. Pruebas de motor siempre secuenciales entre sí.
5. Regenerar solo el informe derivado con `node scripts/documentar-pgctl.cjs`; los archivos *-final.json son mediciones inmutables. El benchmark rechaza sobrescribirlos.
6. Conservar fallos anteriores y riesgos de cierre con comandos externos bloqueados. No ocultar errores ni terminar postgres por fuerza.
7. Mantener prohibición de seed/build/publicación Git y de nuevas optimizaciones fuera de alcance.

Última prueba de aplicación: large-segundo-final, código0, cierre normal y sin procesos residuales. Última suite: npm run db:test, código0 y Suite PostgreSQL completa. Últimos comandos documentales de cierre: node scripts/documentar-pgctl.cjs y git diff --check, código0. Pendiente únicamente revisión humana; ningún proceso de prueba activo.

## Auditoría de Respaldos y Restauración v1.3.0 — 2026-10-14

Auditoría estática completada; solo diseño, sin implementación. Informe: [Informe_Auditoria_Respaldos_v1.3.0.md](Informe_Auditoria_Respaldos_v1.3.0.md). Aplicación sigue en 1.2.1/esquema 10; migraciones históricas intactas, 011 NO necesaria para el alcance propuesto.

La raíz Git es electron-app. Estado inicial limpio y diff vacío sobre feature/escalabilidad-postgresql; feature/respaldos-restauracion no existía y se creó desde el HEAD actual para esta entrega. Cambios exclusivos: informe nuevo y este bloque documental. No se arrancó app/motor, no se conectó a origen, no se ejecutaron pruebas, backups, restores, seed, build, Docker, commit, push ni tag. La revisión humana pendiente del parche pg_ctl y las incidencias históricas conservan su estado; esta auditoría no las resuelve.

Existe generación manual CLI, automática al cierre, pre_migracion y retención de 14 automáticos. Formato actual: pg_dump -Fc con snapshot y par .dump + .dump.json (hash/manifiesto); no cumple archivo único. Existe restore técnico CLI con pre_restauracion, locks, transacción pg_restore y marcador, pero reemplaza el esquema de la activa sin staging/promoción. Exige mismo nombre de base/esquema/major y no restaura desde Crear usuario. Scripts de diagnóstico restauran copias con conexiones nuevas; no certifican desastre en otro Windows.

Diseño recomendado: .back como contenedor versionado de manifest.json + database.dump custom; no cifrado. Credenciales, safeStorage, puertos, rutas y preferencias se generan/guardan localmente. Usuarios y hashes scrypt son portables. UUID de instalación se renueva en destino, resolviendo las FKs de solicitudes y descartando autorizaciones viejas; conservar negocio/historia. No es necesario disponer del UUID ni AppData de origen por separado.

Arquitectura: casos de uso dependen de contratos pequeños de exportación, paquete, almacenamiento, workspace de restore, migraciones y promoción. Reutilizar Respaldos, PostgresLocal y SQL histórico; extraer MigrationRunner de BaseLocal.iniciar para evitar sesiones/AutoRecover incidentales durante validación. Renderer no recibe fs/SQL/herramientas/credenciales; diálogos y autorización en Main. Rutas de respaldo/frecuencia/retención en configuración local, sin migración comercial.

Seguridad propuesta: staging en clúster separado con rol limitado, migración y validación completas; candidata en clúster privado de destino; congelar escrituras, respaldo de activa, confirmación y promoción conservando base original como reserva. Dos renombres no son atómicos: journal duradero y recuperación de startup antes de crear automáticamente una base fija ausente son obligatorios. El modo postgres.enc externo requiere política separada; no asumir privilegios administrativos. Riesgo alto si se publica el restore actual como módulo; recuperación en PC nueva viable por diseño, PENDIENTE de certificación A → B.

### CONTINUAR DESDE AQUI — Respaldos

1. Revisar informe y contrato recomendado de .back v1; esta tarea termina en documentación.
2. Siguiente paso exacto, solo tras autorizar implementación: etapa 1, adaptar exportador existente a archivo único con manifiesto/hash y probar contenido en clúster aislado con credenciales nuevas.
3. Etapa 2: validación real, runner, identidad nueva y promoción/journal/rollback; probar cortes en cada fase antes de habilitar restore al usuario.
4. Etapa 3: UI Respaldos e IPC específico con autorización, diálogos, progreso y confirmación.
5. Etapa 4: automático y retención, reutilizando comportamiento existente y preferencias locales.
6. Etapa 5: primera instalación con Crear instalación nueva o Restaurar, sin alta previa de usuario, terminando en Login.
7. Etapa 6: VM Windows limpia, perfil distinto y solo .back procedente de A; comparar todos los datos y login original, sin reset de contraseña.
8. Mantener origen, SQL001–010 y evidencia intactos; no seed/build/publicación ni Docker dentro de esta auditoría.

Último archivo de seguridad revisado: src/main/database/recuperacion.ts. Cobertura estática: backup/restore, motor/credenciales, migraciones/rollback, usuarios/login/recuperación, IPC/diálogos, empaquetado y pruebas relacionadas. Pendientes empíricos: archivos reales, matriz de majors, promoción/cortes, instalador, revisión humana y A → B. Ninguna suite nueva ejecutada ni proceso de pruebas iniciado. Verificación documental de cierre: git diff --check y comprobación del alcance de archivos; no atribuir a este corte las pruebas históricas del parche anterior.

## Respaldos etapa 01 portable — implementada y validada 2026-10-14

Este corte sucede a la auditoría: etapa 1 implementada en feature/respaldos-restauracion. Informe: [Informe_Respaldos_Etapa01_Portable_v1.3.0.md](Informe_Respaldos_Etapa01_Portable_v1.3.0.md). App continúa 1.2.1/esquema10; 011 NO. No se tocaron SQL001–010, Renderer/IPC, BaseLocal, PostgresLocal ni reglas comerciales. La auditoría previa se conserva íntegra.

Archivo único .back: ZIP STORE con manifest.json estricto v1 y database.dump custom pg_dump -Fc. Contratos pequeños BackupExporter/Package/Storage; caso sin fs/Electron/procesos. Respaldos.crear legacy y exportar portable comparten snapshot, advisory lock y herramientas; SHA-256/stat en streaming, también para integridad legacy. Validación: exactamente dos entradas regulares, sin rutas/duplicados/symlinks/ejecutables, sin cifrado, CRC, PGDMP, tamaño y hash; límite64GiB/manifest16KiB. Sin credenciales/puerto/rutas de origen en manifest, sin dependencia de AppData o claves Windows anteriores.

Publicación segura: workspace privado → contenedor verificado → copia provisional dentro del destino cotejada por hash/tamaño → flush y rename de sellado → hardlink exclusivo a nombre final. Se eligió link para no sobrescribir ni siquiera en carreras, pues fs.rename puede reemplazar. NTFS local probado; destinos sin hardlinks fallan sin publicar archivo parcial. Sufijos deterministas evitan colisiones. Fallo secundario de limpieza no elimina final válido. Sin APIs cloud; carpetas sincronizadas tratadas como filesystem, sincronización real pendiente de ensayo.

Nuevo comando técnico: npm run db:backup:portable -- --dest "D:\Respaldos RuizCacao"; hora UTC en nombre. No ejecutado contra perfil comercial. No modifica CLI backup/restore legacy ni automáticos/retención; no hay restore de producto ni UI/onboarding/promoción/journal. Scripts técnicos siguen excluidos del instalador; añadido ignore/exclusión de .back y dependencias yauzl3.4.0/yazl3.3.1 con tipos y lockfile.

Portabilidad técnica local A→B: fixture QA pequeño y grande con10002 compras/15002 ventas/25004 cuentas; se retiró clúster A con sus claves antes de restaurar en B nuevo, credenciales distintas, rol comercial sin SUPERUSER/CREATEDB. Todas las25 tablas iguales en conteo/MD5 de filas canónicas; SHA-256 de dump verificado. Login de principal y operador con sus contraseñas originales, sin reset. Ensayo repetido tras últimos ajustes de CRC/storage. No certifica otra PC, SID Windows, instalador ni recuperación de producto.

Validación: typecheck0; lint final0,727 warnings/0 errores, sin diagnósticos en los archivos de implementación nuevos/modificados; db:test0, suite completa ruizcacao-tests-L0qiXG; contenedor final22 casos0 (incluye64MiB sin readFile); portabilidad final0; diff-check0 y fuentes/documentos nuevos sin whitespace. La suite empezó antes de dos endurecimientos del paquete/storage; las pruebas afectadas se repitieron después, sin repetir regresiones no afectadas. Evidencia en docs/evidencias-respaldos-etapa01, incluyendo comparaciones completas, logs, pgctl-regresion nuevo y validacion-final.json. La evidencia histórica no se sobrescribió; .eslintcache se restauró al estado de entrada.

No se leyó ni conectó la base comercial original. No seed comercial, build, Docker, commit, push, merge ni tag. Prueba de procesos final en modo lectura: cero PostgreSQL de la suite principal y ensayo final; todos los ensayos completaron su finally de parada. No quedan pruebas en ejecución. Sin cambios de migraciones ni versión.

### CONTINUAR DESDE AQUI — después de etapa 01

1. Leer informe Etapa01 y evidencia final; etapa cerrada, no repetir mediciones válidas.
2. Siguiente paso exacto: diseñar e implementar etapa2 en tarea autorizada: MigrationRunner sin efectos de sesión, staging aislado, validación comercial, identidad destino y protocolo de promoción/journal/rollback.
3. No conectar restore CLI al Renderer ni restaurar sobre la base activa. No ofrecer UI Restaurar antes de resolver cortes/promoción.
4. Mantener legacy/automáticos/retención y SQL001–010. No crear011 sin necesidad comercial demostrada.
5. Resolver adaptador de publicación sin hardlinks antes de certificar FAT/exFAT/destinos remotos; sincronizadores reales pendientes.
6. La aceptación de producto A→PC B limpia/otro SID/instalador sigue en etapa6; este ensayo solo certifica portabilidad técnica entre clústeres locales.
7. Última prueba con motor: node tests/respaldo-portabilidad.cjs, código0; último control documental: git diff --check y fuentes nuevas, código0. Ninguna prueba obligatoria de etapa1 pendiente.

## Respaldos etapa 02 — implementación en verificación, 2026-10-15

Nueva política definitiva: respaldos de usuario SOLO MANUALES. Sustituye la propuesta histórica de automatización: se retiran todos los disparos de respaldarCierre en jornada/logout/cierre/recuperación, conservando reglas comerciales. pre_migracion y pre_restauracion permanecen como copias técnicas. No timers de respaldo, scheduler, polling de reposo, watchers ni retención .back.

Informe de trabajo: [Informe_Respaldos_Etapa02_Restore_Seguro_v1.3.0.md](Informe_Respaldos_Etapa02_Restore_Seguro_v1.3.0.md). Rama correcta inicialmente limpia; etapa1 guardada y preservada. App1.2.1/esquema10, SQL001–010 intactos, sin011. No acceso a origen comercial ni perfil de desarrollo, sin build/Docker/publicación Git.

Implementado: MigrationRunner extraído con secuencia completa para restore y sin efectos de sesión; workspace privado, referencia SQL confiable y clúster staging independiente; validación de inventario/catálogo/25 tablas/usuarios/secuencias/consultas acotadas; normalización técnica; candidata validada; pre_restauracion; mantenimiento Main; promoción por OID/system_identifier con journal local e intención persistida; rollback conservador y recuperación antes de CREATE DATABASE en startup. Herramientas y streams cancelables, espera de close, controlador de máximo un backup/un restore y exclusión de promoción. Sin UI, cambios Acceso ni IPC público. Modo postgres.enc externo rechazado por la composición interna.

Verificación intermedia: typecheck0. Matriz de16 fallos, cancelaciones y login actual pasaron en corrida aislada; un cast de metadata se corrigió tras fallo temprano en staging. Primera carga grande rechazó backends pendientes antes de renombrar: se distingue cliente de autovacuum y se espera drenaje acotado (solo operación activa). Perfil Electron inicial luego completó pequeño/grande/schema4→10, mantenimiento~1,2s, pero la identificación de procesos Windows requirió normalizar separadores. Perfil posterior encontró cierre de fixture A excediendo20s por checkpoint de5623 archivos; fallo preservado. Se añade CHECKPOINT únicamente en los fixtures, fuera de intervalos medidos, sin cambiar lifecycle/timeouts pg_ctl del producto.

Startup recovery: seis estados de corte, intención previa, original renombrada, candidata promovida, validada sin confirmar y confirmada; también OID ambiguo, clúster incorrecto y JSON corrupto: pruebas aisladas completadas, originales conservadas y sin crear vacías. Perfil Electron con muestreador Windows corregido y suite general final programados secuencialmente en una sesión de terminal; no iniciar otro motor mientras siga activa.

### CONTINUAR DESDE AQUI — cierre etapa 02

1. Leer este bloque y el informe Etapa02. Código implementado; no añadir UI ni funcionalidades nuevas.
2. Revisar docs/evidencias-respaldos-etapa02/perfil-validado/ejecucion.txt y esperar cierre seguro; después la misma sesión ejecuta npm run db:test.
3. Registrar código final y copiar comparaciones JSON del clúster efímero de suite a evidencia; conservar intentos fallidos y perfil inicial.
4. Cerrar typecheck/lint/diff-check y regresiones Etapa01 incluidas en db:test; restaurar solo .eslintcache generado por lint al estado inicial.
5. Resumir Main/PG/herramientas, fases/mantenimiento y límites del muestreo; Renderer N/A sin ventanas.
6. Verificar cero procesos de estas pruebas en modo lectura y terminar muestreador; no tocar servicios ni motores ajenos.
7. Actualizar ambos documentos con resultados reales, riesgos y último comando/código. No declarar etapa terminada antes.
8. Siguiente etapa autorizable: UI/IPC y UX acordada, conservando servidor externo rechazado y pruebas Windows limpio/otra PC para aceptación posterior.

## Respaldos etapa 02 — cierre verificado, 2026-10-15

Este cierre sustituye los pendientes del bloque anterior, que queda como historial. Etapa02 backend COMPLETADA. Política definitiva: respaldo de usuario SOLO MANUAL, sin disparos de cierre/logout/jornada/recuperación. pre_migracion/pre_restauracion conservados. MigrationRunner sin efectos de sesión, staging privado con otro clúster/credenciales, TOC permitido y catálogo contra referencia confiable, schema histórico1–9→10 y futuro rechazado, identidad nueva, candidata, gate/pool drain, journal, renombres, rollback y recuperación de arranque antes de crear la base fija implementados. Cancelación espera hijos/streams; tramo crítico protegido. Sin UI/IPC público, sin Snapshot ni SQL001–010/011 ni cambios de lifecycle/timeouts pg_ctl.

Validación final: typecheck0; lint0 (727 advertencias/0 errores); db:test0 completo en ruizcacao-tests-7ozeCT; portable22 casos0 y portabilidad A→B25 tablas/login pequeño y grande0; restore32 comprobaciones con16 fallos inyectados; startup6 cortes más OID/clúster/JSON inválidos0; contratos adicionales0, incluido pg_roles real del padre temporal en solo lectura. Guard aditivo de privilegios probado por separado tras cargar suite/perfil. Diff-check0 y fuentes nuevas sin whitespace. .eslintcache restaurado al estado inicial. Original preservada en fallos, login principal/operador conservado. Sin conexión comercial ni seed de rendimiento comercial, build, Docker, commit/push/merge/tag.

Perfil definitivo Electron44.3.0/Node24.20.0 sin Renderer: backup grande1,771s/CPU Main843ms; restore grande29,303s/CPU Main2844ms; mantenimiento pequeño1,313s/grande1,407s. Inactivo1,507s/CPU47ms, reposo posterior1,503s/CPU16ms, cero herramientas nuevas de backup. RSS y WS/CPU PG/herramientas por fase en informe y JSON; muestreo y fixture en mismo Main limitan atribución, no certificar bases de64GiB ni arranque completo/UI. Checkpoint de fixtures corregido sin tocar el producto; intentos fallidos conservados.

Consulta final Windows de solo lectura a16:46:49-05:00: cero procesos PostgreSQL/herramientas de estos ensayos y cero muestreadores. No queda prueba activa. Informe: docs/Informe_Respaldos_Etapa02_Restore_Seguro_v1.3.0.md. Evidencia: docs/evidencias-respaldos-etapa02/validacion-final.json, restore-suite.json, restore-startup.json, db-test.txt, perfil-validado y procesos-final.json. Último comando con motores npm run db:test código0; últimos controles procesos/diff-check0.

### CONTINUAR DESDE AQUI — etapa 02 cerrada

1. Leer informe Etapa02 y validacion-final.json; implementación backend y pruebas obligatorias terminadas.
2. Siguiente paso exacto: etapa03 UI/IPC y UX de respaldos manuales con permisos/confirmación acordados; no implementada en este corte.
3. Usar el caso interno seguro, conservar modo externo rechazado, journal ambiguo bloqueante y reserva/pre_restauracion.
4. Mantener política manual y ausencia de timers/polling de reposo; espera de drenaje acotada solo en promoción.
5. Aceptación de Windows limpio/otro SID/otra PC/instalador/corte físico y filesystem sin hardlinks sigue pendiente de su etapa; no repetir ensayos locales válidos.

## Respaldos etapa 03 — cierre definitivo verificado, 2026-10-17

Se retomó el árbol existente en feature/respaldos-restauracion, revisando status, rama, diff-check, diff completo y archivos nuevos antes de editar. No se reinició la etapa, no se hizo reset/limpieza y no se usó la base comercial. Etapas01/02 preservadas. Informe: [Informe_Respaldos_Etapa03_UI_IPC_v1.3.0.md](Informe_Respaldos_Etapa03_UI_IPC_v1.3.0.md).

Implementados UI Respaldos, permiso Main/administrador, siete canales IPC tipados, selecciones opacas, generación, preparación privada, confirmación/contraseña, progreso por fases, cancelación y fase crítica, mensajes, bloqueo hasta reinicio, StrictMode/listeners y accesibilidad. Sin Snapshot nuevo, polling/timers del módulo, cambios SQL001–010/011, build ni operaciones de publicación Git. Acceso/onboarding intactos; Etapa04 NO iniciada.

Conservados y válidos: UI tres tamaños/125%, 39 capturas, datos comerciales0, listeners finales0; producto Electron/IPC/PG temporal con backup pequeño/grande, archivos inválidos rechazados, restore desde copia privada aun alterando la selección, nuevo proceso hasta Login y contraseña original OK; hijos0 en arnés. Suite previa db-test.txt completa en ruizcacao-tests-JHl7Xa; el proceso de terminal ya no está disponible para recuperar su código final. No repetir pruebas visuales ni restauración de producto por continuidad.

Revisión adicional encontró duplicación potencial de limpieza/reinicio por IPC y preparación retenida al perder permisos. Guardas corregidos y contratos focalizados código0. Typecheck de cierre código0; lint código0 (850 advertencias/0 errores). Suite general final sesión17924 TERMINADA código0, log db-test-cierre.txt y resultado persistido en db-test-cierre-resultado.json; raíz temporal ruizcacao-tests-YPhZqP.32 comprobaciones restore/16 fallos, seis estados startup y regresiones generales pasaron. No relanzar la suite por continuidad.

Regresiones independientes finales: portable22 casos código0; portabilidad pequeño/grande25 tablas/login original/rol limitado código0 en ruizcacao-portable-9gOTbI. Primer intento portable bloqueado por rename en sandbox, conservado; repetición autorizada fuera del sandbox código0 sin modificar código. Contratos IPC final0. Consulta Windows final13:14:16-05:00, solo lectura: procesos propios residuales0; servicio PostgreSQL ajeno PID4212 y descendientes excluidos y preservados. No hay pruebas/motores propios activos. Git diff --check0.

Etapa03 COMPLETADA SI. Snapshot usado NO, polling/timers del módulo NO, nueva migración011 NO, restauración termina en Login SI, contraseña original OK. UI3 tamaños/125%,39 capturas, producto restore/nuevo proceso y perfil IPC válidos se conservaron sin repetición. Evidencias: docs/evidencias-respaldos-etapa03/validacion-final.json y procesos-final.json. fuentes-validadas.json conserva SHA-256 e inventario de23 archivos de producción/pruebas; se comprobó que no cambiaron tras validar. Dos documentos actualizados y evidencia añadida; .eslintcache permanece eliminado por lint --no-cache, sin reset.

Riesgos posteriores: filesystem sin hardlinks/sincronizadores reales; Windows limpio/otro SID/otra PC, instalador, relanzamiento empaquetado y corte físico pendientes de aceptación de su etapa. Lint conserva850 advertencias. No hay bloqueo funcional pendiente para el alcance Etapa03. Sin base comercial, db:seed:performance, SQL001–010/011, build, commit/push/merge/tag ni cambios de Acceso/onboarding.

### CONTINUAR DESDE AQUI — Etapa03 cerrada; detenerse

1. Leer informe Etapa03 y validacion-final.json; las comprobaciones obligatorias están terminadas.
2. Conservar cambios/evidencias y no repetir pruebas válidas sin cambios que las afecten.
3. Siguiente paso exacto: revisión humana del diff y evidencias; esperar autorización para Etapa04 «Primera instalación y recuperación: Crear usuario nuevo / Cargar respaldo».
4. No iniciar Etapa04, build ni operaciones Git de publicación bajo esta autorización. Trabajo de Etapa03 detenido tras entregar resultados.
