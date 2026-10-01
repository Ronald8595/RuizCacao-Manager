# Estado de continuidad — Escalabilidad PostgreSQL

Corte 2026-10-01T22:04:20.065Z (2026-10-01, America/Guayaquil). Rama feature/escalabilidad-postgresql. Aplicación 1.1.2, objetivo futuro1.2.0. Commit base bebcda3fb708576c47e5abc5f40914bedbe0f13f. Todo el trabajo de Etapas2/3 sigue sin commit; conservarlo. Sin push/tag/instalador/dependencias nuevas.

## Estado actual

Etapa1 Stock cerrada técnica/visualmente según usuario. Etapa2 SQL keyset Compras/Ventas, seed local y009 completa técnicamente; informes anteriores se conservan. Etapa3 medición/optimización de pausa al ingresar Compra/Venta y Cuentas COMPLETA técnicamente; tests finales código0. Revisión visual de la app completa pendiente. [Informe Etapa3](Informe_Etapa_03_Optimizacion_Snapshot_IPC.md) contiene método, antes/después, límites, archivos y checklist.

Esquema actual de código/suite/base local:9, 25 tablas. Migraciones001–009 intactas durante Etapa3. No010, no seed nuevo ni paginación PostgreSQL Cuentas/Gastos. Snapshot global COMPLETO.

## Base de desarrollo y datos conservados

ruizcacao_manager en127.0.0.1:5432, esquema ruizcacao, configuración cifrada userData/postgres.enc. Etapa3 solo lee la base original mediante transacciones READ ONLY o pg_dump. No llama iniciar/login/jornada/ejecutar allí; no modifica registros/sesiones/jornadas/avisos. Comandos de medición se ejecutan con ROLLBACK en copias efímeras verificadas del dump actual.

Lote existente PERF-203f6a49-544e-4435-8350-77cb32fe3163-. Totales siguen: clientes1.004/proveedores506/empleados3/compras10.014/ventas15.007/cuentas25.021/movimientosCuenta16.695/movimientosStock25.450/gastos13.019. Huella Snapshot completa antes=después: cb3a4f31b0a317db09a4d13c32d0dd9c9851baf302faf668347ecc413954a3bb. Snapshot65.339.124 bytes JSON; estado65.358.083; tamaños íntegros idénticos.

NO ejecutar db:seed:performance al continuar: agrega OTRO lote y no es una comprobación. Datos sintéticos no se entregan al cliente. Respaldos de Etapa2 verificados y conservados:

    C:/Users/LENOVO/AppData/Roaming/RuizCacao Manager/backups/manual_2026-10-01T19-39-06-027Z_684a733b-1b8f-4107-8079-00be41a7d173.dump
    C:/Users/LENOVO/AppData/Roaming/RuizCacao Manager/backups/pre_migracion_2026-10-01T19-54-58-762Z_9b52ed94-4ad6-4e00-98a6-0f85d7434e4d.dump

Hashes/detalles en Informe_Etapa_02_Paginacion_Compras_Ventas.md. Etapa3 no restaura ni escribe en la base original.

## Diagnóstico medido y solución

Navegar cambia componentes y reutiliza Snapshot; no provoca nueva carga completa. Cuentas antes montaba16.252 filas DOM: mediana React+layout3.188 ms. Ahora monta viewport+margen, unas17–26 filas de datos, con todas las cuentas/filtros/totales en memoria y acceso por scroll; mediana31,1 ms. No páginas ni endpoint SQL nuevo. Detalle/retorno, foco, cambio de filtros desde scroll profundo y acceso a última fila validados en Electron oculto.

Compra/Venta calculaba historial de25.021 cuentas con find de clientes aun en pestaña Compras. Ahora difiere filtrado hasta abrir Historial y usa Map/memo. React/commit97,8→2,4 ms; React+layout110,5→4,8 ms. Historial combinado todavía monta todas sus filas al abrirlo; no se afirma optimización de ese DOM.

Renderer creaba dominio mutable y clonaba todas las colecciones para exponer datos. Nueva crearLecturaDominio sin comandos comparte datos completos como lectura, deriva índices de saldo equivalentes y se memoiza por estado.datos. Provider152→9 ms; lectura~5,4 ms. Dominio mutable Main conserva clonado y reglas.

Guardar comprobaba borrados con originales×registros.some: mediana CPU sin cambios10.945→314 ms (cortes finales). Set mantiene igualdad estricta/guardas/auditoría. En copia con guardar y SQL reales: compra14.471→3.064 ms; venta13.698→3.079; alta cliente14.896→3.137. Sigue lectura completa antes y después del comando. No devolver dominio.snapshot a ciegas: defaults/nulls/redondeo/autoría/orden/concurrencia deben resolverse antes de leer incrementos.

Lectura global/IPC no reducidos: estado~~0,7–1,1s, IPC cacheado~~0,5–0,7s, JSON~0,17s. Perfil final muestra variación CPU/GC; no atribuir mejora de SQL/IPC. Cuentas/movimientos/gastos conservan sorts actuales. No nuevo índice sin comparación medida. Contrato completo65 MB impone demora residual en carga/actualización.

Mediciones con React production, componentes reales/DOM/IPC, ventana oculta y CSS mínimo; excluyen Sidebar/login/cola IPC de producción. requestAnimationFrame oculto a veces1s no se usa para afirmar respuesta visual. Son mediciones de arnés, no prueba manual ni garantía de producción.

## Archivos y pruebas

Etapa3 modifica base.ts solo en guardar, dominio.ts vista de lectura, AppDataContext.tsx, CompraVenta.tsx, Cuentas.tsx, tests/run.cjs y documentación. Nuevos: utils indices/filasVisibles, hook useFilasVisibles, tests lectura-dominio/guardar-indices, scripts perfil-renderer/preload/medir-snapshot/medir-comandos. Lista exacta en informe; git status incluye también todo el trabajo anterior de Etapa2.

- typecheck0 Node/Web; lint0, cero errores/787 advertencias heredadas (antes896).
- db:test0, suite completa, clúster ruizcacao-tests-kHtUj5: dominio/finanzas/saldos/stock/anulaciones/reportes, auth/jornadas/recuperación, respaldos/rollback/reinicio, migraciones/paginación y dos suites nuevas.
- Nueva lectura igual a todos los campos/derivados/saldos del dominio original en fixture pequeño/completo; entrada intacta, jornadas activas/interrumpidas/históricas y saldos negativos/manuales/anulados. Guardar conserva rechazo de borrados y tipo de ID, gasto/auditoría permitidos.
- Rangos virtuales/Map0; Electron DOM0 con inicio/mitad/final/última cuenta, retorno detalle, foco y filtro Todas(25.021) desde profundidad.
- Comandos en copias0 antes/después, conteos/bytesRespuesta por caso idénticos; Snapshot original/huellas iguales. No writes/seed en original.
- git diff --check0; 001–008 SQL/TS/lockfile comparados sin diff; 009 SQL/TS conservados del trabajo previo. Hashes001–009 y códigos en verificaciones-etapa03-2026-10-01.json.

Evidencia en docs/evidencias-escalabilidad: snapshot-antes-primer-corte, snapshot-antes, snapshot-despues, comandos-snapshot-antes/despues (2026-10-01.json); db-test-etapa03/lint-etapa03-2026-10-01.txt; verificaciones-etapa03-2026-10-01.json. Sin bloqueos ni verificaciones automatizadas obligatorias pendientes.

## SIGUIENTE PASO EXACTO

Desde C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app ejecutar npm run dev e iniciar sesión existente. Entrar repetidamente en Compra/Venta y Cuentas; verificar visualmente pausa, scroll de cuentas al inicio/mitad/final, filtros desde profundidad, detalle/retorno, zoom/ancho pequeño y teclado; contrastar resumen/abonos/PDF con operación de prueba. Compras/Ventas: ampliar fechas a enero–septiembre2026; Hoy octubre no muestra lote histórico. Registrar resultados en Informe Etapa3. NO repetir seed.

Después cerrar visualmente esta optimización. Para demora residual de login/guardar, acordar contrato completo/revisiones y diseño de lectura incremental o modelos de pantalla. No empezar paginación de Cuentas/Gastos ni rediseñar Snapshot sin ese alcance. Mantener reglas, anulaciones, reportes, auth/recuperación/jornadas y notificaciones; no editar migraciones ni hacer commit/push/instalador.
