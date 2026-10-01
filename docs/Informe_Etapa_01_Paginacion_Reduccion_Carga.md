# Etapa 01 - Paginación y reducción de carga: piloto Stock

Fecha: 2026-09-30. Base 1.1.2, rama feature/escalabilidad-postgresql. Estado: COMPLETADO técnicamente; revisión visual interactiva pendiente.

## Alcance y situación inicial
Stock ya consume consulta SQL paginada de 15 filas visibles (LIMIT 16), filtros parametrizados fecha/producto/texto y cursor determinista orden BIGINT + id descendentes. Snapshot global completo conservado. Ningún otro módulo se migra en esta etapa. La primera implementación y benchmark pequeño se documentan en ESTADO_CONTINUIDAD_ESCALABILIDAD.md.

## Benchmark completo sin índice
Evidencia: evidencias-escalabilidad/benchmark-stock-completo-sin-indice-2026-09-30.json; código 0. Clúster sintético efímero verificado, PostgreSQL privado; 25 tablas, esquema 7, hashes 001–007 intactos.
Dataset: 5.000 clientes, 2.000 proveedores, 20.000 compras, 30.000 ventas, 50.000 cuentas, 66.666 movimientos cuenta, 51.667 movimientos Stock, 15.000 gastos, 10.000 notificaciones.

| Consulta real | Servicio mediana ms | SQL EXPLAIN ms | Filas emitidas / descartadas en scan | Filas SQL / visibles | Bytes Respuesta JSON |
|---|---:|---:|---|---|---:|
| Primera | 21,7161 | 27,452 | 51.667 / 0 | 16 / 15 | 2.144 |
| Profunda (mitad) | 17,9450 | 19,849 | 25.833 / 25.834 | 16 / 15 | 2.013 |
| Producto/fecha | 0,9608 | 0,467 | 820 / 0 | 16 / 15 | 2.014 |
| Texto SINTÉTICO | 57,1099 | 59,863 | 10.000 / 15.834 por vuelta; 2 vueltas en plan paralelo | 16 / 15 | 2.071 |

Primera/profunda: Seq Scan -> Sort -> Limit. Producto/fecha: Bitmap Heap Scan con movimientos_stock_producto_fecha -> Sort -> Limit. Texto: plan paralelo; usar loops y árbol completo para interpretar filas, no sumar padres/hijos. Planes ANALYZE/BUFFERS completos en JSON.

## Evaluación del índice
Candidato a probar: CREATE INDEX movimientos_stock_orden_id ON ruizcacao.movimientos_stock (orden DESC,id DESC).
El catálogo inicial solo tiene PK(id) y producto/fecha para Stock. Sus prefijos no satisfacen ese orden. Escanear 51.667 para devolver 16 justifica el experimento; aceptación demostrada por comparación ABBA documentada más abajo.
Nuevo modo aislado: npm run db:benchmark -- --evaluar-indice-stock. Verifica directorio real antes de DDL. Rondas ABBA sin/con/con/sin, mismos SQL/parámetros/huellas de respuesta, cinco muestras cliente por consulta, planes y tamaño. Lotes INSERT de 100 filas revertidos para estudiar coste de escritura; no son un comando comercial ni COMMIT durable.
En ese corte inicial aún no había 008 (esquema 7). Resultado final: índice aceptado, 008 creada, esquema 8 y 25 tablas.

## Checklist visual pendiente
No se afirma revisión visual interactiva: no se interactuó con la aplicación ni se abrió su base real. Ejecutar en un entorno de prueba autenticado preparado por el desarrollador:

- [ ] Abrir Stock.
- [ ] Confirmar 15 filas por página con suficiente historial y menos en la última.
- [ ] Probar Siguiente.
- [ ] Probar Anterior y verificar las mismas filas.
- [ ] Cambiar filtro de fechas.
- [ ] Cambiar producto.
- [ ] Buscar texto, incluyendo acentos y caracteres %/_ literales.
- [ ] Cambiar filtro mientras hay cursor activo y comprobar retorno a página 1.
- [ ] Registrar un movimiento de prueba y confirmar refresco del historial.
- [ ] Confirmar ausencia de duplicados o saltos visibles durante navegación sin cambios concurrentes.
- [ ] Confirmar carga, error y Reintentar (simular fallo en entorno de prueba).

## Pruebas y archivos
Resultados finales y códigos de salida registrados abajo.
Modificados en cierre: scripts/benchmark-postgres.cjs, scripts/benchmark-paginacion-stock.cjs, docs/ESTADO_CONTINUIDAD_ESCALABILIDAD.md. Nuevos: scripts/benchmark-indice-stock.cjs, este informe y evidencia completa. Sin cambios comerciales ni otros módulos.
Siguiente paso exacto: completar el checklist visual en entorno de prueba separado; no comenzar Compras.

## Decisión definitiva tras comparación ABBA
Evidencia: evidencias-escalabilidad/benchmark-stock-indice-comparacion-2026-09-30.json; código 0, mismo clúster/dataset de 51.667 Stock. SQL, parámetros y SHA-256 de respuesta verificados idénticos entre rondas. Sin/con/con/sin reduce sesgo de caché y orden, sin eliminar toda variación del equipo.

| Caso | Servicio ms sin, rondas A1/A2 | Servicio ms con, B1/B2 | SQL EXPLAIN ms sin | SQL EXPLAIN ms con |
|---|---|---|---|---|
| Primera | 27,1657 / 26,7710 | 0,4972 / 0,5250 | 28,972 / 30,425 | 0,045 / 0,063 |
| Profunda | 18,3193 / 17,4816 | 0,5794 / 0,6368 | 19,450 / 18,929 | 0,039 / 0,037 |
| Producto/fecha | 1,1687 / 1,1211 | 1,0154 / 1,1840 | 0,461 / 0,664 | 0,432 / 0,428 |
| Texto | 56,8120 / 63,5168 | 49,7534 / 49,2989 | 137,812 / 137,464 | 54,190 / 47,932 |

Con índice, primera/profunda: Limit -> Index Scan movimientos_stock_orden_id; 16 filas emitidas, 0 descartadas, 16 filas SQL/15 visibles. Sin índice recorren las 51.667 y ordenan. JSON de respuesta permanece 2.144/2.013 bytes respectivamente; el índice cambia acceso, no payload.
Producto/fecha con índice examina 2.302 filas (16+2.286 descartadas) en lugar de 820 del Bitmap Heap Scan del índice existente; sus tiempos son similares y no se afirma mejora. Texto con índice examina 31.683 (16+31.667 descartadas); aún es costoso: el candidato no indexa búsquedas textuales. Sin índice texto usa scan paralelo, datos por nodo/vuelta en JSON, no sumar árboles.

Índice **aceptado por navegación**, sin duplicar PK(id) ni producto/fecha. Tamaño: 2.580.480 bytes (2,46 MiB) al construirlo para 51.667 filas. Añade almacenamiento y mantenimiento por cada escritura.
Escritura por lote sintético de 100 INSERT revertidos: sin 3,1709/3,1777 ms; con 3,7777/1,8707 ms. Variación alta: no se concluye mejora ni porcentaje estable de regresión. WAL EXPLAIN de lote: sin 33.752–37.173 bytes; con 46.400–46.438 bytes, muestra coste adicional. No mide COMMIT/fsync durable ni comandos comerciales. ROLLBACK conserva filas; secuencia avanza y filas abortadas pueden afectar bloat/caché. Índice medido después de creación, tamaño no predice crecimiento futuro.

## Migración 008
Se agrega exclusivamente CREATE INDEX movimientos_stock_orden_id ON ruizcacao.movimientos_stock (orden DESC,id DESC). BaseLocal aplica el patrón de respaldo previo y transacción existentes; registra versión 8 en la misma transacción. Sin tablas ni cambios de columnas o reglas.
Archivos: src/main/database/migracion-ocho.ts y database/008-rendimiento-paginacion.sql; integración base.ts. Exportador ahora protege también 007 y usa su encabezado histórico exacto, sin cambiar SQL 001–007.
Nueva tests/migracion-v8.cjs comprueba v7->v8, todas las tablas de datos/control salvo versiones/sesiones/respaldos que cambian naturalmente, credenciales, hashes SQL históricos, un solo índice añadido, 25 tablas, SQL exportado equivalente, respaldo real v7, fallo previo de respaldo, rollback tras CREATE INDEX y reinicio idempotente.
Tests de migración anteriores actualizan solo expectativa de versión final a 8 (las expectativas de rollback histórico siguen en 2/6, y las reglas comerciales siguen activas).
Estado final: implementación y verificaciones automatizadas completadas. El primer pequeño v8 falló al arrancar motor; la repetición separada pasó. Ese primer intento no fue una prueba verde.


## Benchmark definitivo v8 y límites
Evidencia: evidencias-escalabilidad/benchmark-stock-completo-v8-2026-09-30.json. Código 0, migraciones 1–8, 25 tablas y hashes SQL 001–007 intactos. Snapshot global: 77.706.071 bytes, sin recortar. Índice único movimientos_stock_orden_id en catálogo.

| Consulta real v8 | Servicio ms mediana | SQL EXPLAIN ms | Filas examinadas en Index Scan | SQL / visibles | Bytes Respuesta JSON |
|---|---:|---:|---:|---|---:|
| primera | 0.2913 | 0.032 | 16 | 16 / 15 | 2144 |
| profunda | 0.3625 | 0.033 | 16 | 16 / 15 | 2013 |
| producto-fecha | 0.6071 | 0.272 | 2302 | 16 / 15 | 2014 |
| texto | 41.1281 | 31.066 | 31683 | 16 / 15 | 2071 |

Tamaño del índice final sembrado incrementalmente desde base vacía: **4.579.328 bytes (4,37 MiB)**. Diferente del experimento ABBA donde CREATE INDEX reconstruye sobre filas ya existentes (2.580.480 bytes, 2,46 MiB). Considerar ambos caminos y crecimiento futuro. No se ocultó coste de tamaño/WAL ni se atribuyó al índice mejora en todos los filtros.
Mediana de servicio mide consultarHistorialStock con cliente pg; excluye BaseLocal.transaccion/advisory lock, cola IPC y render. Cada caso usa cinco muestras; EXPLAIN es otra muestra del servidor. Bytes son JSON de Respuesta, no protocolo PostgreSQL ni IPC binario. Caché caliente y variabilidad del equipo; comparación causal principal es ABBA dentro del mismo clúster. No extrapolar latencia de pantalla ni porcentajes universales.
Texto todavía examina 31.683 para devolver 16. Producto/fecha examina 2.302 con este plan; vigilar distribuciones/filtros más selectivos antes de ampliar optimizaciones. Snapshot global inicial y lecturas de comandos permanecen completos deliberadamente.

## Pruebas finales y códigos de salida
| Comando / verificación | Código | Resultado |
|---|---:|---|
| npm run typecheck | 0 | Node y Web |
| npm run lint | 0 | 0 errores, 899 advertencias existentes |
| npm run db:test (final) | 0 | Suite PostgreSQL completa, clúster ruizcacao-tests-IdeJQg |
| npm run db:benchmark -- --small (final v8) | 0 | 517 Stock, 25 tablas, índice presente |
| npm run db:benchmark (final v8) | 0 | 51.667 Stock, 25 tablas, índice presente |
| npm run db:benchmark -- --evaluar-indice-stock (v7, ABBA) | 0 | SQL/params/huellas idénticos, planes con/sin, tamaño y escritura |
| npm run db:sql (final) | 0 | Exportó 008, conservó hashes 001–007 |
| git diff --check | 0 | Sin errores de whitespace |
| git diff --exit-code -- SQL/TS históricos y package-lock.json | 0 | Sin modificaciones históricas/dependencias |

Nueva prueba v8 verifica respaldos/rollback/conservación/idempotencia y SQL exportado. Todas las regresiones originales siguen activas; pruebas de anulación/finanzas/reportes/multiusuario/jornadas/recuperación pasaron sin modificar reglas. Nueva prueba se ajustó a lecturas secuenciales del mismo Client pg y se repitió la suite completa después.
Pequeño v8 final: primera 0,3549 ms, profunda 0,4520, producto/fecha 0,4720, texto 0,7829. Respuestas 2.107/1.972/1.168/2.031 bytes. Evidencia benchmark-stock-small-v8-2026-09-30.json; no comparar sus tiempos con completo.
Intentos fallidos registrados: experimento inicial código 1 por permiso SHOW data_directory del rol app (resuelto reutilizando comprobación bootstrap, sin aumentar permisos); primer db:sql código 1 por encabezado distinto del exportador de 007 (se corrigió exportador, no archivo histórico); primer pequeño v8 código 1 al arrancar motor con suite iniciándose (causa no demostrada, repetición separada código 0). No representan resultados finales verdes.

## Lista de archivos del cierre
Modificados: src/main/database/base.ts; scripts/exportar-esquema.cjs; scripts/benchmark-postgres.cjs; scripts/benchmark-paginacion-stock.cjs; tests/run.cjs; tests/anulaciones-v7.cjs; tests/migracion.cjs; tests/migracion-v2.cjs; tests/migracion-v3.cjs; tests/migracion-v5.cjs; tests/migracion-v6.cjs; docs/ESTADO_CONTINUIDAD_ESCALABILIDAD.md.
Nuevos: src/main/database/migracion-ocho.ts; database/008-rendimiento-paginacion.sql; tests/migracion-v8.cjs; scripts/benchmark-indice-stock.cjs; este informe; los cuatro JSON de evidencia sin índice/ABBA/pequeño v8/completo v8 y logs/resúmenes typecheck/lint/db:test indicados en continuidad.
Cambios anteriores del piloto/proyección/dataset permanecen sin commit y se identifican en continuidad. .eslintcache ya estaba eliminado al comenzar este cierre; no se restauró. Sin dependencias nuevas ni cambio de versión del producto.

## Estado y siguiente paso
Cierre técnico automatizado **completado**; esquema 8, 25 tablas y migración 008 aceptada por evidencia. Revisión visual **pendiente**: checklist de este documento. Siguiente paso exacto: ejecutarlo en entorno separado de prueba autenticado y registrar resultados antes de otro módulo. No se inició Compras. No base real, db:qa, pull/commit/push/tag/instalador ni publicación. El desarrollo v8 migra una base v7 al iniciar mediante respaldo previo; aquí solo se aplicó en bases efímeras verificadas.
