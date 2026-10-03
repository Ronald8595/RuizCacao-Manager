# Estado de continuidad — Escalabilidad PostgreSQL

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
