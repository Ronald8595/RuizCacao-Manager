# Etapa 02: datos sintéticos y paginación de Compras y Ventas

Cierre técnico: 2026-10-01T20:01:30.747Z. Rama feature/escalabilidad-postgresql; commit inicial bebcda3fb708576c47e5abc5f40914bedbe0f13f; árbol limpio al comenzar. Versión de aplicación conservada en 1.1.2; objetivo futuro 1.2.0. Stock ya cerrado visual y técnicamente según el usuario.

Compras y Ventas implementadas y verificadas con SQL keyset. Migración 009 aceptada tras ABBA y aplicada con respaldo a la base local de desarrollo. Esquema final 9, 25 tablas. Revisión visual de estos dos módulos pendiente, con pasos abajo; no se afirma haberla ejecutado.

## Base utilizada y conservación

Base ACTUAL del desarrollador ruizcacao_manager, host 127.0.0.1:5432, esquema ruizcacao; configuración cifrada en C:/Users/LENOVO/AppData/Roaming/RuizCacao Manager/postgres.enc, leída mediante safeStorage, sin imprimir credenciales. El usuario autorizó expresamente esta base; ninguna base cliente se accedió. Antes del seed: esquema 8 y 25 tablas. Antes de 009: esquema 8 y todos los registros nuevos ya confirmados. Después: esquema 9 y 25 tablas.

El seed solo agrega registros comerciales con INSERT. Compara conteos y huellas de valores de registros previos dentro de la transacción: sin borrados, UPSERT ni sobrescritura comercial. Sí actualiza existencias y costo promedio por los efectos necesarios de operaciones nuevas; añade una entrada de auditoría. No invoca comandos que abran jornadas ni modifica usuarios, sesiones, recuperación o notificaciones. La aplicación debe estar cerrada; se adquiere el mismo candado 7302027, además del candado transaccional 7302026. Las pruebas y ABBA usan motores efímeros con data_directory comprobado; su creación/limpieza solo afecta bases aisladas. La base actual no se borró, reinicializó ni truncó.

## Cantidades exactas

| Tabla              | Antes | Nuevos | Después |
| ------------------ | ----: | -----: | ------: |
| clientes           |     4 |   1000 |    1004 |
| proveedores        |     6 |    500 |     506 |
| empleados          |     3 |      0 |       3 |
| compras            |    14 |  10000 |   10014 |
| ventas             |     7 |  15000 |   15007 |
| cuentas            |    21 |  25000 |   25021 |
| movimientos_cuenta |    29 |  16666 |   16695 |
| movimientos_stock  |    33 |  25417 |   25450 |
| gastos             |    19 |  13000 |   13019 |

Los 13.000 gastos nuevos son 3.000 gastos manuales solicitados y 10.000 inversiones automáticas, una por compra, conforme al efecto actual del dominio. No se añadieron empleados. Cuentas: una por cada compra/venta. Pagos 0, parcial o total; abonos coherentes con monto pagado. Anuladas: 167 compras y 250 ventas, todas sin pago, con cuenta anulada, autor existente, motivo/fecha y compensación de stock; no se inventan devoluciones financieras. Las pruebas de dominio existentes cubren también anulaciones con pago.

Stock antes → después (qq): Cacao en Baba 26,23 → 72.576,23; Cacao Seco 9,65 → 76.459,65; Maracuyá 0 → 76.450. No hay saldo negativo. Movimientos y resultados siguen el orden de inserción, con fechas comerciales históricas entre enero y septiembre de 2026. Compras y ventas reutilizan proveedores/clientes, varían cantidades/precios e incluyen tildes y ñ.

Prefijo de este lote: PERF-203f6a49-544e-4435-8350-77cb32fe3163-. Identifica los IDs de todos los registros nuevos; nombres/observaciones contienen marcas PERF-. Los registros anteriores no se marcaron. Evidencia detallada: [seed](evidencias-escalabilidad/seed-desarrollador-2026-10-01.json). Conteos posteriores comprobados en [migración real](evidencias-escalabilidad/migracion-desarrollador-v9-2026-10-01.json).

## Respaldos verificados

Antes del seed (esquema 8, 112.625 bytes):

    C:\Users\LENOVO\AppData\Roaming\RuizCacao Manager\backups\manual_2026-10-01T19-39-06-027Z_684a733b-1b8f-4107-8079-00be41a7d173.dump

SHA-256: 67128e8fff2f8ce7b85ce38668859ed7a0b4f91f438899b1f184c3889f26d778.

Antes de 009, ya con el lote (esquema 8, 3.089.150 bytes):

    C:\Users\LENOVO\AppData\Roaming\RuizCacao Manager\backups\pre_migracion_2026-10-01T19-54-58-762Z_9b52ed94-4ad6-4e00-98a6-0f85d7434e4d.dump

SHA-256: 237ea0eef847dcfc30d57e9f7cacff3d204f015ebf6234d034e3ae1c2cee2fe2.

Ambos usan pg_dump custom del motor compatible, manifiesto, verificación SHA/tamaño y pg_restore --list antes de continuar. No se restauró la base actual. La restauración efectiva en base aislada pasa dentro de db:test. La migración real comparó todas las tablas salvo migraciones/respaldos antes/después, incluyendo usuarios, sesiones, stock y jornadas: valores y conteos conservados. La transacción revierte índices y versión ante fallo.

## Cómo agregar otro lote

Desde electron-app, con la aplicación cerrada:

    npm run db:seed:performance

Cada ejecución explícita crea un respaldo nuevo y agrega OTRO lote completo, con otro UUID PERF-. No es una orden idempotente para comprobar el lote existente; NO repetirla para continuar esta etapa. El algoritmo/volúmenes son reproducibles, los IDs cambian para evitar colisiones. Las ejecuciones futuras guardan una evidencia con fecha/hora única, separada de las inspecciones, para conservar este corte. Una falla revierte todas las filas y existencias del lote; las secuencias PostgreSQL pueden avanzar aun con rollback. El script exige base loopback configurada, nombre ruizcacao_manager, esquema 8/9, 25 tablas y un usuario activo existente. Nunca admite credenciales/base alternativa por argv.

La inspección sin insertar se hace con npx electron scripts/seed-datos-rendimiento.cjs --inspect; solo imprime metadatos y no reemplaza la evidencia de un seed confirmado. Medición solo lectura: npx electron scripts/medir-operaciones-desarrollador.cjs. Aplicación explícita de 009 ya ejecutada: npx electron scripts/aplicar-migracion-rendimiento.cjs --aplicar-009; si encuentra versión 9 no ejecuta DDL.

## Implementación de Compras y Ventas

Flujo: Main/BaseLocal (sesión obligatoria) → handlers IPC existentes con control de origen/cola → preload tipado → useHistorialOperaciones → Compras.tsx/Ventas.tsx. SQL exclusivamente en Main; consulta columnas explícitas de la entidad, DTO completo igual al Snapshot para Ver, PDF y Anular. Sin lectura N+1 por fila desde Renderer. Los cruces actuales con clientes/cuentas en memoria quedan limitados a 15 filas visibles.

ORDER BY orden DESC,id DESC, LIMIT 16: devuelve 15 filas visibles y usa la extra para detectar Siguiente. BIGINT se conserva como string en el cursor compuesto; nunca se convierte a Number. Cursor opaco base64url con techo de primera página, última posición, versión y firma de filtros, más prefijo distinto compras./ventas. Navegación con tupla menor a la última posición y menor/igual al techo. No usa OFFSET en el historial. El benchmark usa OFFSET solo para preparar una posición al 80% fuera del tramo medido.

Filtros existentes pasan a SQL parametrizado: fechas inclusivas, proveedor_nombre histórico en Compras; nombre actual del cliente y texto de fecha_venta en Ventas (LEFT JOIN solo cuando hay búsqueda). strpos + lower con ICU reproduce búsqueda literal Unicode; % y _ no son comodines. Validación de fechas reales, rango, tamaño/tipos de texto y cursor. No se eliminan anuladas del historial. No se cambian registro, importes/impuestos, numeración, cuentas, stock, autoría, reglas de anulación ni PDF.

Las tablas anteriores no tenían límite de filas ni paginador propio, por lo que no había un número fijo de filas que conservar. Se adoptan las 15 filas del patrón Stock, preservando columnas, acciones y filtros. Hook: 150 ms de debounce, Anterior/Siguiente, reinicio de cursores al cambiar filtros o referencia de compras/ventas del Snapshot, descarte de respuestas obsoletas, carga/error/reintento. Una inserción nueva sobre el techo no desplaza la navegación ya abierta; el techo no congela cambios de registros antiguos entre solicitudes.

Snapshot global permanece COMPLETO para dominio, reportes y módulos restantes. Este cambio reduce lectura/filtrado/render del historial específico; no reduce la carga inicial global ni las lecturas completas actuales de ejecutar/guardar. Cuentas y Gastos siguen pendientes; IPC global intacto.

## Decisión de índices: comparación ABBA aislada

Dataset aislado: 10.000 compras, 15.000 ventas, 1.000 clientes y 500 proveedores. Mismo clúster verificado, SQL, parámetros y respuestas en cuatro rondas sin/con/con/sin. Huellas SHA-256 y equivalencia comprobadas. Cinco muestras calientes por caso y mediana del servicio. EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) conserva planes completos. Evidencia: [ABBA](evidencias-escalabilidad/benchmark-compras-ventas-completo-2026-10-01.json).

| Módulo/caso        | Sin índice A1 / A2 (ms) | Con índice B1 / B2 (ms) |
| ------------------ | ----------------------: | ----------------------: |
| compras / primera  |         19.884 / 19.960 |           1.691 / 1.573 |
| compras / profunda |           7.715 / 8.265 |           1.825 / 1.903 |
| compras / fecha    |           4.023 / 5.278 |           1.741 / 2.025 |
| compras / titular  |         19.249 / 21.142 |           3.422 / 4.312 |
| ventas / primera   |         25.364 / 30.392 |           1.710 / 1.778 |
| ventas / profunda  |          9.010 / 11.429 |           2.052 / 2.640 |
| ventas / fecha     |           4.576 / 5.093 |           2.682 / 1.915 |
| ventas / titular   |         46.875 / 55.891 |         17.349 / 18.389 |

Aceptados: compras_orden_id y ventas_orden_id, ambos B-tree (orden DESC,id DESC). Las primeras/profundas pasan de Seq Scan de 10.000/15.000 + sort a Index Scan de 16. El catálogo previo tenía PK y unicidad diaria/comprobante, sin ese orden compuesto. No se crearon índices de texto ni otros candidatos sin evidencia; no se descartó otro candidato evaluado.

Tamaños al crear sobre los datos locales: compras 876.544 bytes; ventas 1.302.528 bytes; total 2.179.072 bytes. Cada inserción mantiene otro B-tree y genera costo adicional de espacio/escritura/WAL. No se midieron escrituras ni WAL para estos dos índices; no se afirma un porcentaje de penalización. Crecimiento y bloat futuros no estimados.

Migración 009 contiene exclusivamente los dos CREATE INDEX; BaseLocal añade versión 9 dentro de la transacción existente, con respaldo previo. 25 tablas conservadas. SQL exportado coincide con migracion-nueve.ts. Migraciones 001–008 SQL/TS y package-lock.json permanecen intactos. Prueba dedicada v8→v9: respaldo fallido bloquea; fallo al insertar versión 9 después de crear ambos índices revierte todo; éxito conserva datos/catálogo anterior; backup v8 y reinicio idempotente/credenciales verificados.

## Métricas en la base local sembrada

Comparación antes v8 y después v9 (servicio con pg, ms):

| Módulo/caso        | Antes (ms) | Después (ms) | SQL EXPLAIN antes → después (ms) | Shared Hit Blocks antes → después |
| ------------------ | ---------: | -----------: | -------------------------------: | --------------------------------: |
| compras / primera  |      6.362 |        1.416 |                    6.032 → 0.035 |                           523 → 3 |
| compras / profunda |      3.727 |        0.724 |                    3.106 → 0.068 |                           523 → 4 |
| compras / fecha    |      1.678 |        0.693 |                    0.834 → 0.042 |                           101 → 9 |
| compras / titular  |      7.381 |        1.315 |                   20.459 → 1.382 |                          525 → 58 |
| ventas / primera   |     10.722 |        0.780 |                   11.356 → 0.060 |                           683 → 4 |
| ventas / profunda  |      5.377 |        0.944 |                    3.417 → 0.051 |                           683 → 4 |
| ventas / fecha     |      2.600 |        0.731 |                    1.244 → 0.087 |                          134 → 17 |
| ventas / titular   |     22.070 |       20.073 |                  28.449 → 24.735 |                        709 → 5580 |

Primera/profunda: antes examinan todas las 10.014/15.007 operaciones; después 16, devolviendo 15 al Renderer. Fecha junio: Compras antes 1.110 filas de Bitmap Heap Scan, después 16 emitidas +99 descartadas =115; Ventas antes 1.650, después 16+239=255. Proveedor: antes 10.014 examinadas (220 coincidencias), después 16+809=825. Cliente en Ventas: antes 15.007 ventas +1.004 clientes con hash join; después nested loop, 1.825 ventas indexadas y 1.825 búsquedas de cliente por PK, 1 fila por vuelta. Los descartes del join están en el plan JSON. No sumar padres/hijos ni interpretar las vueltas SQL como solicitudes IPC adicionales. La búsqueda de cliente aún cuesta unos 20 ms y más accesos a buffers; el índice de orden no resuelve búsquedas de texto selectivas/no coincidentes.

Lectura completa anterior, una muestra: Compras 10.014 filas, 66,770 ms y 9.004.006 bytes JSON raw; Ventas 15.007 filas, 82,895 ms y 13.149.532 bytes. Primera página específica: 15 filas, 11.130/10.806 bytes JSON de respuesta IPC aproximada. Todas las páginas medidas rondan 10,8–11,3 KB. Las formas raw/DTO son distintas: no es una medición idéntica del transporte. Snapshot completo conserva su volumen.

[Antes](evidencias-escalabilidad/benchmark-operaciones-desarrollador-2026-10-01.json) y [después](evidencias-escalabilidad/benchmark-operaciones-desarrollador-v9-2026-10-01.json). Caché caliente y procesos distintos; ABBA aislada es evidencia principal de aceptación. Tiempo servicio incluye query/mapeo, excluye BaseLocal.transaccion/candado, cola/IPC, debounce y render. SQL y servicio son muestras diferentes; resultados no garantizan latencia de producción. No se afirma medición visual de FPS o carga inicial.

## Pruebas y resultados

- npm run typecheck: código 0, Node/Web.
- npm run lint: código 0, 0 errores y 896 advertencias heredadas (principalmente formato), sin ampliarlas en archivos nuevos; log guardado.
- npm run db:test: código 0, Suite PostgreSQL completa; clúster ruizcacao-tests-fXGCfa. Incluye seed aditivo/repetición/rollback, paginación Compras/Ventas, v8→v9, Stock, migraciones previas, dominio/anulaciones, autenticación, respaldo/restauración y arranque/reinicio del motor.
- Paginación específica: recorrido completo y filtros de fecha/nombre/Unicode/griego/literales/vacío, empate BIGINT 9007199254740993, orden/id, DTO exacto igual al Snapshot, rechazo de cursor entre módulos/filtros, sesión obligatoria, Snapshot intacto.
- npm run db:sql: código 0, históricos protegidos por el exportador.
- Seed real, ABBA, migración real y medición/validación real: código 0.
- Base real en READ ONLY/REPEATABLE READ: 10.014 compras/668 páginas y 15.007 ventas/1.001 páginas, sin omisiones ni duplicados frente a referencia independiente. Junio 1.110/1.650 filas; nombres 220/165; literal %_ sin coincidencias; fecha de venta 2026-01-02 devuelve 56. No modifica filas.
- git diff --check e históricos/lockfile: comprobados al cierre; resumen de códigos/huellas en verificaciones-etapa02-2026-10-01.json.

## Archivos del cambio

Nuevos de implementación: src/shared/historialOperaciones.ts; src/main/database/historial-operaciones.ts; src/main/database/migracion-nueve.ts; src/renderer/src/hooks/useHistorialOperaciones.ts; database/009-rendimiento-paginacion-compras-ventas.sql.

Scripts nuevos: conexion-desarrollador.cjs, seed-datos-rendimiento.cjs, seed-rendimiento-core.cjs, benchmark-operaciones-core.cjs, benchmark-compras-ventas.cjs, medir-operaciones-desarrollador.cjs, aplicar-migracion-rendimiento.cjs. Todos bajo scripts/.

Pruebas nuevas: tests/seed-rendimiento.cjs, tests/paginacion-operaciones.cjs, tests/migracion-v9.cjs. Archivos existentes modificados y evidencias nuevas según git status:

- docs/ESTADO_CONTINUIDAD_ESCALABILIDAD.md
- package.json
- scripts/benchmark-postgres.cjs
- scripts/exportar-esquema.cjs
- src/main/database/base.ts
- src/main/database/ipc.ts
- src/preload/index.ts
- src/renderer/src/pages/Compras.tsx
- src/renderer/src/pages/Ventas.tsx
- src/shared/persistencia.ts
- tests/anulaciones-v7.cjs
- tests/migracion-v2.cjs
- tests/migracion-v3.cjs
- tests/migracion-v5.cjs
- tests/migracion-v6.cjs
- tests/migracion-v8.cjs
- tests/migracion.cjs
- tests/run.cjs
- database/009-rendimiento-paginacion-compras-ventas.sql
- docs/evidencias-escalabilidad/benchmark-compras-ventas-completo-2026-10-01.json
- docs/evidencias-escalabilidad/benchmark-operaciones-desarrollador-2026-10-01.json
- docs/evidencias-escalabilidad/benchmark-operaciones-desarrollador-v9-2026-10-01.json
- docs/evidencias-escalabilidad/lint-etapa02-2026-10-01.txt
- docs/evidencias-escalabilidad/migracion-desarrollador-v9-2026-10-01.json
- docs/evidencias-escalabilidad/seed-desarrollador-2026-10-01.json
- scripts/aplicar-migracion-rendimiento.cjs
- scripts/benchmark-compras-ventas.cjs
- scripts/benchmark-operaciones-core.cjs
- scripts/conexion-desarrollador.cjs
- scripts/medir-operaciones-desarrollador.cjs
- scripts/seed-datos-rendimiento.cjs
- scripts/seed-rendimiento-core.cjs
- src/main/database/historial-operaciones.ts
- src/main/database/migracion-nueve.ts
- src/renderer/src/hooks/useHistorialOperaciones.ts
- src/shared/historialOperaciones.ts
- tests/migracion-v9.cjs
- tests/paginacion-operaciones.cjs
- tests/seed-rendimiento.cjs
- docs/Informe_Etapa_02_Paginacion_Compras_Ventas.md (este informe).
- docs/evidencias-escalabilidad/verificaciones-etapa02-2026-10-01.json.

Las pruebas antiguas solo actualizan versión final esperada a 9, manteniendo expectativas históricas de rollback; migracion-v8 reconoce los dos índices finales además del índice Stock que prueba. Benchmark previo espera migraciones 1–9. package.json añade únicamente el comando de seed; sin dependencias/versiones cambiadas, commit/push ni instalador.

## Checklist manual pendiente y siguiente paso exacto

Ejecutar npm run dev desde electron-app e iniciar sesión con un usuario ya existente. Esta base ya está sembrada y migrada: NO ejecutar otra vez el seed. El día actual es octubre y las filas ficticias son históricas; para verlas borrar Desde/Hasta o elegir 2026-01-01 → 2026-09-30. El filtro inicial Hoy puede mostrar cero filas correctamente.

1. Compras y Ventas: avanzar al menos 20 páginas, volver varias con Anterior, comprobar 15 filas, orden/IDs y que Siguiente se deshabilite al final. Cambiar a junio desde una página profunda: debe reiniciar a página 1. Automatizado ya comprobó todas las páginas; observar la interacción visual.
2. Buscar Peña Ñandú 17 / Muñoz Álvarez 17; probar mayúsculas/tildes/ñ, ausencia y %_. Probar fechas inclusive junio y fecha por texto en Ventas. Cambiar filtros rápido: la respuesta anterior no debe sustituir a la nueva.
3. Abrir Ver en activa/anulada, comparar autor, motivo, fechas, importes, cuenta y estado. Generar PDF de una venta y revisar comprobante/numeración existente.
4. Iniciar o reabrir una jornada con el flujo normal si corresponde. Registrar una compra pequeña a proveedor PERF-, observación PERF-MANUAL-ETAPA02, usando fecha comercial actual. Desde página profunda, guardar y comprobar que el historial reinicie y muestre la nueva fila al quitar filtros o elegir Hoy.
5. Registrar venta pequeña a cliente PERF-, lote/observación PERF-MANUAL-ETAPA02; comprobar actualización, cuenta, stock y PDF. No usar registros previos para anular.
6. Anular UNA operación de prueba de esta jornada, con motivo y contraseña del autor, y comprobar fila Anulada, detalle, cuenta, stock y refresco. La lógica de registro/anulación ya pasó en pruebas aisladas; estos pasos confirman UI. Las pruebas manuales nuevas cambian conteos, por lo que las cantidades de arriba son el corte anterior a ellas.
7. Registrar resultados visuales en este informe/continuidad. Sin errores, cerrar Etapa 2 y solicitar alcance para Cuentas/Gastos y, posteriormente, reducción del Snapshot/IPC global. No iniciar esos cambios automáticamente.

No quedan verificaciones automatizadas obligatorias pendientes ni bloqueo técnico. Pendiente exacto: checklist visual de Compras/Ventas y operaciones nuevas/anulación/PDF sobre el lote. Siguiente paso: npm run dev, autenticar, ampliar rango a enero–septiembre y ejecutar ese checklist; no volver a sembrar.
