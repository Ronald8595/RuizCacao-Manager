# Estado de continuidad - Escalabilidad PostgreSQL

## Fecha y hora de corte
30/9/26, 13:02:47 (America/Guayaquil).
Versión base: 1.1.2; objetivo futuro 1.2.0, package.json sin cambio de versión.
Rama Git: feature/escalabilidad-postgresql.
Commit base: 584d7c21cd6274381666c83378aa3b051175fb7d.
Etapa actual: cierre técnico de Etapa 1, piloto Stock.
Estado: COMPLETADA técnicamente; pruebas y benchmarks finales v8 código 0. Revisión visual interactiva pendiente (checklist preparado).

## Qué existía antes de esta sesión
Proyección explícita SQL y benchmarks anteriores; piloto Stock paginado SQL con filtros fecha/producto/texto, LIMIT 16/15 visibles y cursor compuesto. Snapshot global completo conservado. Pruebas y pequeño v7 habían pasado. No existía 008 ni índice de orden. Todos los cambios locales estaban sin commit; conservarlos. .eslintcache ya aparecía eliminado al iniciar este cierre.

## Qué se modificó en esta sesión
Se midió completo v7, se probó candidato en clúster aislado con rondas ABBA y se aceptó tras beneficio claro. Se implementó 008 exclusivamente con índice movimientos_stock_orden_id y migración transaccional respaldada en BaseLocal. Se incorporó prueba v8 y se actualizaron solo expectativas de versión final de pruebas anteriores (sin alterar reglas). Se adaptó benchmark para esquema 8 y modo experimental aislado; no se cambió SQL funcional del historial ni UI en este cierre.
Último cambio realizado: cierre de informe, evidencia completa v8, resumen JSON de verificaciones y comprobación final de históricos.
Último archivo modificado: docs/ESTADO_CONTINUIDAD_ESCALABILIDAD.md.

## Archivos modificados
En este cierre: src/main/database/base.ts; scripts/exportar-esquema.cjs; scripts/benchmark-postgres.cjs; scripts/benchmark-paginacion-stock.cjs; tests/run.cjs; tests/anulaciones-v7.cjs; tests/migracion.cjs; tests/migracion-v2.cjs; tests/migracion-v3.cjs; tests/migracion-v5.cjs; tests/migracion-v6.cjs; este documento. Pruebas antiguas solo esperan 8 como versión final en lugar de 7; rollback histórico 2/6 sigue intacto.
Cambios previos conservados: package.json, relacional.ts, IPC/preload/persistencia, Stock.tsx, hooks/tipos/servicio/pruebas paginación y dataset. Consultar git status --short para conjunto exacto. No atribuir todo el diff acumulado a esta sesión.

## Archivos nuevos
src/main/database/migracion-ocho.ts; database/008-rendimiento-paginacion.sql; tests/migracion-v8.cjs; scripts/benchmark-indice-stock.cjs; docs/Informe_Etapa_01_Paginacion_Reduccion_Carga.md.
Evidencia nueva en docs/evidencias-escalabilidad: benchmark-stock-completo-sin-indice-2026-09-30.json, benchmark-stock-indice-comparacion-2026-09-30.json, benchmark-stock-small-v8-2026-09-30.json, typecheck-stock-cierre-2026-09-30.txt, lint-stock-cierre-2026-09-30.txt, db-test-stock-cierre-2026-09-30.txt. Completo final guardado: benchmark-stock-completo-v8-2026-09-30.json. Resumen de códigos: verificaciones-stock-cierre-2026-09-30.json.

## Módulo actualmente paginado
Solo Stock. Tabla conserva columnas/botones Anterior/Siguiente, carga/error/reintento, muestra 15 filas y número de página; no calcula total global del historial. Hook reinicia al cambiar filtros o referencia de movimientosStock del Snapshot y descarta respuestas obsoletas.
Flujo separado: PostgreSQL -> consultarHistorialStock -> BaseLocal.historialStock -> IPC con cola y control de origen existentes -> preload tipado -> useHistorialStock -> tabla.
Flujo global intacto: leerEntidades -> BaseLocal.estado -> IPC/preload -> AppDataContext -> crearDominio. Mantiene todas las filas para reglas/stock/cuentas/reportes. El piloto NO reduce carga inicial global ni lecturas de ejecutar/guardar.

## Consulta SQL implementada
SELECT columnas explícitas FROM ruizcacao.movimientos_stock WHERE filtros parametrizados ORDER BY orden DESC,id DESC LIMIT 16. Fechas >=/<=, producto =; texto literal con strpos(lower(coalesce(columna,'') COLLATE "und-x-icu"),texto)>0 sobre fecha/producto/proveedor_nombre/observacion. %/_ no son comodines. Máximo 16 devueltas, 15 visibles y una detecta siguiente. Nada de SQL/credenciales en Renderer.

## Tipo de cursor/paginación utilizado
Keyset orden BIGINT como string + id; techo de primera página, última fila visible y hash de filtros en cursor base64url validado. Siguiente con (orden,id)<posicion y <=techo. Evita desplazamiento por inserciones nuevas superiores al techo; no congela cambios a registros antiguos entre páginas. OFFSET solo se usa en benchmark para localizar posición sintética mitad, fuera de tiempos medidos.

## Índices creados o descartados y motivo
Aceptado: movimientos_stock_orden_id ON movimientos_stock(orden DESC,id DESC). Catálogo inicial Stock solo PK(id) y producto/fecha, no redundantes. Decisión posterior a benchmark completo, no intuición.
ABBA sin/con/con/sin: primera servicio 26,7710–27,1657 ms -> 0,4972–0,5250; profunda 17,4816–18,3193 -> 0,5794–0,6368. SQL primera 28,972/30,425 -> 0,045/0,063 ms; profunda 19,450/18,929 -> 0,039/0,037. Seq Scan + Sort de 51.667 pasa a Index Scan + Limit de 16 para ambas. SQL/parámetros/respuestas idénticos comprobados con huellas SHA-256.
Índice 2.580.480 bytes (2,46 MiB) para 51.667 filas. Lote 100 INSERT revertidos: sin 3,1709/3,1777 ms; con 3,7777/1,8707; alta variación, no afirmar porcentaje estable de escritura. WAL lote sin 33.752–37.173 -> con 46.400–46.438 bytes: coste adicional. No mide COMMIT/fsync ni comando comercial; rollback conserva filas, la secuencia avanza. Tamaño al crear no predice crecimiento/bloat.
Producto/fecha tiempos similares; con índice nuevo examina 2.302 (16+2.286 descartadas), frente a 820 del índice existente + sort. Texto sigue examinando 31.683 con candidato; no es índice de texto. No se propone otro índice ni migración de otro módulo.
Esquema PostgreSQL actual de código/pruebas: 8, 25 tablas. Base real no fue accedida ni migrada.
Migración 008: SI, solo CREATE INDEX y registro versión dentro de transacción, con respaldo previo usando patrón existente. Históricos 001–007 sin cambios.

## Métricas antes
Completo v7 sin índice: primera SQL 27,452 ms/servicio 21,7161; profunda 19,849/17,945; producto-fecha 0,467/0,9608; texto 59,863/57,1099. Dataset: 5.000 clientes, 2.000 proveedores, 20.000 compras, 30.000 ventas, 50.000 cuentas, 66.666 movimientos cuenta, 51.667 Stock, 15.000 gastos, 10.000 avisos.
ABBA usa mismo dataset/clúster en todas sus rondas y es evidencia principal de decisión. Todas las consultas devuelven 16 SQL/15 Renderer en completo, respuestas 2.144/2.013/2.014/2.071 bytes (primera/profunda/producto-fecha/texto).

## Métricas después
ABBA con candidato: ver sección índices y JSON completo de comparación. Pequeño v8 definitivo código 0: 517 Stock; primera 0,3549 ms, profunda 0,4520, producto-fecha 0,4720, texto 0,7829 servicio. 16/16/10/16 filas SQL, 15/15/10/15 visibles; 2.107/1.972/1.168/2.031 bytes JSON.
Completo v8 final código 0: primera 0.2913 ms servicio/0.032 ms SQL; profunda 0.3625/0.033; producto-fecha 0.6071/0.272; texto 41.1281/31.066. Índice en catálogo 4.579.328 bytes (4,37 MiB): se creó en base vacía y creció al sembrar; ABBA lo construyó con datos ya presentes (2,46 MiB). Ambas cifras son reales, no estimaciones idénticas. Snapshot global conserva 77.706.071 bytes. No comparar tiempos de pequeño con completo. Mediana servicio mide consultarHistorialStock con cliente pg; excluye BaseLocal.transaccion/advisory lock, cola/IPC y render. Bytes son JSON aproximado, no transporte binario PostgreSQL/IPC. EXPLAIN server y cliente son muestras diferentes, caché caliente; no garantías de latencia en producción. Planes ANALYZE/BUFFERS completos en JSON; filas por nodo/loop, no sumar padres e hijos.

## Pruebas ejecutadas y resultado
- npm run typecheck: código 0, Node/Web.
- npm run lint: código 0, 0 errores/899 advertencias existentes; archivo de resumen. ESLint específico prueba v8 final código 0.
- npm run db:test final: código 0, Suite PostgreSQL completa, clúster ruizcacao-tests-IdeJQg. Prueba v8 pasó respaldo fallido, rollback posterior a CREATE INDEX, 25 tablas, datos/hashes intactos, un único índice añadido, equivalencia SQL exportado, respaldo real v7 y reinicio/credenciales/páginas.
- Pruebas paginación siguen activas: fechas/producto/texto/acento/griego/literales, empates, BIGINT, navegación sin duplicados, inserción, sesión y Snapshot completo intacto.
- npm run db:sql: código 0 final; SQL 001–007 protegidos. Primer intento detectó distinto encabezado exportador de 007, se corrigió exportador para coincidir sin editar histórico.
- npm run db:benchmark sin índice v7: código 0, evidencia guardada.
- npm run db:benchmark -- --evaluar-indice-stock: código 0 ABBA, evidencia guardada.
- npm run db:benchmark -- --small final v8: código 0, evidencia guardada.
- npm run db:benchmark completo final v8: código 0, migraciones 1–8, 25 tablas, único índice y hashes históricos intactos. Evidencia benchmark-stock-completo-v8-2026-09-30.json.
- git diff --check: código 0. git diff --exit-code -- SQL 001–007, schema/migraciones TS históricas y package-lock.json: código 0.

## Pruebas pendientes
No quedan pruebas automatizadas obligatorias pendientes. Revisión visual interactiva pendiente con checklist en Informe_Etapa_01_Paginacion_Reduccion_Carga.md. No se inició aplicación contra datos reales ni se afirmó revisión manual.

## Errores o bloqueos
Sin bloqueo de código. Primer experimento falló antes de CREATE porque rol app no puede SHOW data_directory; resuelto pasando directorio ya verificado por bootstrap y contrastándolo con ruta efímera sin aumentar permisos. Primer pequeño v8 falló al iniciar motor mientras se arrancaba suite; repetición separada código 0, causa no demostrada. Prueba v8 se ajustó para consultas secuenciales en un mismo Client pg; suite final pasó sin advertencia añadida. Entorno restringido históricamente no inicia motor; usar autorización existente para comandos aislados.

## Módulos que aún cargan historiales completos
Compras, Ventas, Cuentas, Gastos; Snapshot global incluido Stock permanece completo. BaseLocal.ejecutar y guardar no optimizados en esta sesión. No comenzar Compras hasta validar visualmente piloto y recibir alcance de siguiente etapa.

## SIGUIENTE PASO EXACTO
Ejecutar el checklist visual de Informe_Etapa_01_Paginacion_Reduccion_Carga.md en un entorno separado de prueba autenticado; registrar resultados. No comenzar Compras ni otro módulo sin nuevo alcance. Evidencia completa v8 ya guardada y verificaciones cerradas.

## Comandos exactos para continuar
Desde C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app:

    git status --short
    git branch --show-current
    npm run typecheck
    npm run lint
    npm run db:test
    npm run db:benchmark -- --small
    npm run db:benchmark
    npm run db:benchmark -- --evaluar-indice-stock
    npm run db:sql
    git diff --check

Ejecutar motores de suite/benchmark uno después de otro. Modo evaluar-indice-stock solo hace DDL en clúster nuevo verificado y restaura presencia/definición original del índice al terminar. No admite conexiones externas. Copiar resultado.json, nunca credenciales.

## Advertencias para no romper lo implementado
Conservar todo el trabajo previo sin commit. No editar 001–007 ni paginar Snapshot. No cambiar compras/ventas/cuentas/gastos, reglas, anulaciones, reportes, autenticación/recuperación/jornadas ni dependencias. Sin db:qa para medir, base real, pull/commit/push/tag/instalador. No iniciar otro módulo. Producto/fecha y texto requieren vigilar filtros selectivos; índice de orden beneficia navegación, no elimina todo escaneo. El código v8 migra al iniciar una base v7 con respaldo previo; ninguna base cliente fue usada en esta sesión.
