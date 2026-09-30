# Avance de escalabilidad y rendimiento PostgreSQL

Fecha: 29 de septiembre de 2026. Base estable: **1.1.2**. Objetivo de desarrollo: **1.2.0**, aún no publicado ni aplicado a `package.json`. Esquema conservado: **7**, **25 tablas** comprobadas en el benchmark aislado. Rama: `feature/escalabilidad-postgresql`.

## Estado inicial y alcance

Al comenzar, Git estaba en `main`, commit `584d7c2`, sin cambios locales, un commit por detrás de `origin/main`. No se hizo pull, commit, tag, push ni instalador. El entorno del agente no pudo escribir la referencia de la rama aun tras solicitar permisos; el usuario creó la rama desde su terminal. Se comprobó la rama antes de implementar.

Se inspeccionaron `package.json`, `tests/run.cjs`, el motor privado, las migraciones, el mapeo relacional, BaseLocal, dominio, IPC, preload, contexto React, filtros de Compras, Ventas, Cuentas, Stock y Gastos, y cálculo de reportes. Se conserva el código actual como fuente de verdad: `resumirPeriodo` excluye cuentas anuladas. No se cambió esa semántica ni la de devoluciones.

El anterior trabajo de entorno manual limpio queda sustituido en esta etapa por un **benchmark sintético efímero**. No es un perfil de pruebas manuales ni una instalación nueva destinada al cliente.

## Consultas y recorridos críticos

Rutas relativas a la raíz del proyecto: `C:\Users\LENOVO\Documents\VS_Proyects\RuizCacao Manager\electron-app`.

| Módulo | Consulta o recorrido actual | Filtros, orden y joins | Índice relevante | Riesgo detectado |
|---|---|---|---|---|
| Todos los datos comerciales | `src/main/database/relacional.ts`, `leerEntidades` | Nueve SELECT completos; `ORDER BY orden DESC` | PK por id; sin índice por orden | Transfiere todos los historiales y ordena el conjunto entero |
| Compras | `src/renderer/src/pages/Compras.tsx` | Fecha y subcadena del nombre del proveedor en React | `compra_numero_diario(fecha,numero_compra)` | El índice no ayuda a un filtro que no llega a SQL |
| Ventas | `src/renderer/src/pages/Ventas.tsx` | Fecha y búsquedas de cliente con `find` en React | `venta_numero_diario(fecha_venta,numero_factura)` | Carga completa y búsquedas lineales repetidas |
| Cuentas | `src/renderer/src/pages/Cuentas.tsx` | Estado, categoría, fecha y titular en React | PK, `cuenta_compra`, `cuenta_venta` | Resumen global y tabla comparten todo el historial |
| Movimientos de cuenta | `leerEntidades` y dominio | Carga completa; después filtra por cuenta | `movimientos_cuenta_cuenta_fecha(cuenta_id,fecha)` | Índice existente que el SELECT completo no aprovecha para restringir filas |
| Stock | `src/renderer/src/pages/Stock.tsx` | Producto/fecha en React y páginas de 15 filas | `movimientos_stock_producto_fecha(producto,fecha)` | Paginación visual no reduce datos SQL/IPC |
| Gastos | `src/renderer/src/pages/Gastos.tsx` | Rango y categoría en React | `gastos_fecha(fecha)` | Carga completa antes del filtro |
| Consultas/reportes | `src/renderer/src/utils/reportes.ts` | `filter`, `some`, `find` entre movimientos, cuentas y operaciones | PK y vistas SQL disponibles | El reporte visible no utiliza directamente `v_flujo_caja`; no confundir su plan con el coste de la pantalla |
| Notificaciones | `src/main/database/base.ts`, `estado` | No leídas OR últimas 200; orden fecha DESC | PK y UNIQUE evento_clave | No leídas sin límite; OR y subconsulta; candidato para medición, sin nueva lógica |
| Cierre de jornada | `BaseLocal.cerrarJornada` | Cuentas pendientes/parciales, saldo positivo, ORDER BY id | PK cuentas | Posible escaneo amplio; medir distribución antes de índice parcial |
| Usuarios | `BaseLocal` | Login con lower(nombre), búsquedas por id y listado | `usuario_nombre_unico(lower(nombre))`, PK | No duplicar índice funcional existente |
| Jornada | `BaseLocal.datos` | Estado activa/interrumpida OR fecha actual; LIMIT 1 | PK fecha e índices únicos parciales | Conjunto pequeño esperado; no prioridad sin evidencia |

No se identificó un N+1 de SELECT por fila para cargar entidades: son **nueve consultas fijas**, independientemente del número de registros. Sí hay búsquedas lineales anidadas en JavaScript. En `BaseLocal.guardar`, el bucle de originales usa `registros.some(...)` por cada fila para detectar eliminaciones; su coste puede ser cuadrático. Se documenta y queda pendiente de benchmark específico, sin modificarlo hoy.

`BaseLocal.datos` hace las nueve lecturas más configuración, existencias y jornada. `estado` agrega avisos, productos/umbrales, usuarios y configuración de stock inicial. `ejecutar` lee datos antes del dominio y vuelve a leerlos al devolver `estado`, después de guardar. Se repiten las nueve lecturas, además de otros datos. `leerAviso`, cambios de umbral y otras operaciones pequeñas también devuelven un estado completo.

`src/main/database/ipc.ts` serializa las solicitudes en una cola. `src/preload/index.ts` transporta las respuestas completas. `src/renderer/src/store/AppDataContext.tsx` sustituye el estado y reconstruye el dominio; este clona los arrays en `src/shared/dominio.ts`. No se cambió esa arquitectura ni el control de sesión.

## Índices existentes

El catálogo real del benchmark pequeño contiene **44 índices** (incluidas PK y restricciones UNIQUE). El JSON de evidencia conserva cada definición y su tamaño. Índices comerciales no redundantes relevantes:

- `cliente_identificacion(identificacion)`, parcial para no vacíos.
- `proveedor_identificacion(ci_ruc)`, parcial para no vacíos.
- `empleado_cedula(cedula)`, parcial para no vacíos.
- `compra_numero_diario(fecha,numero_compra)` UNIQUE.
- `venta_numero_diario(fecha_venta,numero_factura)` UNIQUE y `venta_comprobante(numero_comprobante)` UNIQUE.
- `cuenta_compra(compra_id)` y `cuenta_venta(venta_id)`, UNIQUE parciales.
- `movimientos_cuenta_cuenta_fecha(cuenta_id,fecha)`.
- `movimientos_stock_producto_fecha(producto,fecha)`.
- `gastos_fecha(fecha)`.

También existen índices de usuarios, jornadas, recuperación, respaldos e idempotencia mediante sus PK/UNIQUE. **No se añadió, eliminó ni modificó ningún índice.** No hay migración 008: seleccionar menos columnas no modifica el esquema.

## Dataset y aislamiento

`scripts/benchmark-postgres.cjs` solo admite `--small` y `--dataset-only`; no recibe URL, archivo de conexión, nombre de base ajena ni credenciales. Usa `mkdtemp` y el mismo `PostgresLocal` que la suite, con una clave AES-GCM efímera en memoria. No lee `%APPDATA%\RuizCacao Manager`, `postgres.enc`, respaldos, claves de recuperación ni datos reales.

Cada ejecución SQL crea un directorio `ruizcacao-benchmark-test-*`, un clúster propio y credenciales nuevas. Antes de migrar/sembrar comprueba `SHOW data_directory` con el bootstrap de ese mismo clúster, host loopback y usuario `ruizcacao_app`. La base interna se llama `ruizcacao_manager`, pero **no es la base real**: el clúster, directorio, puerto y credenciales son independientes. No hay DROP, TRUNCATE, reset ni eliminación de entornos anteriores. Se detiene el motor al finalizar; no se conserva la clave efímera para reutilizar el clúster. Los JSON de resultados no contienen credenciales.

Migraciones aplicadas por `BaseLocal.iniciar`, sin editar 001–007. Se comprueban versiones `[1,2,3,4,5,6,7]`, 25 tablas y SHA-256 históricos antes/después. La inserción sintética usa una transacción, respeta restricciones y no desactiva triggers. Ejecuta ANALYZE únicamente sobre las tablas del clúster de benchmark.

| Conjunto | Volumen completo | Volumen pequeño validado |
|---|---:|---:|
| Clientes | 5.000 | 50 |
| Proveedores | 2.000 | 20 |
| Compras | 20.000 | 200 |
| Ventas | 30.000 | 300 |
| Cuentas | 50.000 | 500 |
| Movimientos de cuenta | 66.666 | 666 |
| Movimientos de stock | 51.667 | 517 |
| Gastos manuales | 15.000 | 150 |
| Notificaciones | 10.000 | 100 |

No se crean empleados ni usuarios autenticables. Se distribuyen cuentas pendientes, parciales, cerradas y anuladas sin pago. Los abonos suman exactamente el importe pagado; las anulaciones sin pago tienen compensación de stock. Las operaciones sintéticas anuladas representan registros heredados sin UUID de autor. El dataset no cubre todas las variantes comerciales ni reemplaza las pruebas de regresión. Sus fechas/nombres/distribución son deterministas; el estado de sesiones, instalación y tiempos internos de PostgreSQL no lo son.

## Cambio implementado y evidencia

En `src/main/database/relacional.ts`, `leerEntidades` selecciona `id` y las columnas del mapeo existente en lugar de `SELECT *`. Deja de transportar `orden` y `actualizado_en`, que el DTO descartaba. Se conserva `ORDER BY orden DESC` y el mapeo completo de números, fechas, nulos y anulaciones. No se recortan filas ni se cambian filtros, reglas o interfaz.

El benchmark compara SELECT * de 1.1.2 con la proyección explícita sobre las mismas tablas, verifica igualdad exacta de las columnas consumidas y registra ambos planes `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. Cada consulta tiene cinco muestras cliente PostgreSQL→Node después del EXPLAIN; la tabla usa la mediana. Incluyen conversión de tipos y transferencia, no solamente ejecución del servidor. No se vacían cachés: pruebas calientes; la referencia se mide antes que la candidata, por lo que los tiempos no prueban una mejora universal. La reducción de columnas/bytes sí es determinista para esas filas.

Medición pequeña real, PostgreSQL 18.6, ejecutada desde la terminal del usuario y leída por el agente:

| Conjunto | Filas | Antes ms | Después ms | Bytes antes | Bytes después |
|---|---:|---:|---:|---:|---:|
| Clientes | 50 | 2,61 | 1,86 | 14.612 | 11.771 |
| Proveedores | 20 | 1,27 | 1,10 | 5.082 | 3.951 |
| Compras | 200 | 26,79 | 7,96 | 144.091 | 132.599 |
| Ventas | 300 | 22,74 | 14,57 | 224.097 | 206.805 |
| Cuentas | 500 | 24,14 | 15,38 | 292.052 | 263.160 |
| Movimientos cuenta | 666 | 16,28 | 13,79 | 325.843 | 287.323 |
| Movimientos stock | 517 | 15,03 | 10,20 | 348.724 | 318.846 |
| Gastos | 150 | 5,14 | 3,70 | 82.283 | 73.691 |

Empleados: cero filas; 0,90→1,52 ms, 2 bytes en ambos casos. Esa diferencia sobre una tabla vacía no demuestra una regresión de escalabilidad. No se creó un índice para forzar un plan. Los SELECT completos siguen leyendo todas las filas; planes, buffers, nodos e índices utilizados se conservan en la evidencia. Las filas se expresan por nodo y vuelta: no se suman padres e hijos, porque contarían varias veces las mismas filas.

Lectura de entidades pequeña anterior: 131,23 ms; snapshot mapeado: 760.199 bytes. **No es latencia de pantalla ni tiempo real de IPC**.

Dataset completo generado y validado sin PostgreSQL: 78.785.546 bytes JSON del snapshot, aproximadamente 75,1 MiB; una muestra de serialización: 332,15 ms. No incluye avisos ni otros metadatos de EstadoAplicacion. Quitar columnas SQL no reduce el DTO enviado por IPC: esas columnas ya se descartaban antes. El principal problema de volumen permanece.

### Volumen completo: comparación verificada

La ejecución externa completa terminó con estado `comparacion_medida_proyeccion_equivalente`. Se verificaron los volúmenes de la columna «Volumen completo», las 25 tablas, versiones 1–7 e igualdad de todas las columnas consumidas antes/después. Motor PostgreSQL 18.6. Datos: `C:\Users\LENOVO\AppData\Local\Temp\ruizcacao-benchmark-test-79SEdo\motor\data`; puerto privado 55432. Base `ruizcacao_manager`, usuario `ruizcacao_app`. El directorio real del servidor coincidió con el generado; no se utilizó la base del cliente.

| Conjunto | Filas leídas antes y después | Mediana antes ms | Mediana después ms | Reducción aproximada de mediana | Bytes antes | Bytes después |
|---|---:|---:|---:|---:|---:|---:|
| Clientes | 5.000 | 35,99 | 25,00 | 30,5% | 1.500.564 | 1.206.671 |
| Proveedores | 2.000 | 12,99 | 6,83 | 47,4% | 523.564 | 406.671 |
| Empleados | 0 | 0,68 | 0,52 | No significativo | 2 | 2 |
| Compras | 20.000 | 257,53 | 165,72 | 35,7% | 14.603.835 | 13.414.941 |
| Ventas | 30.000 | 336,93 | 297,83 | 11,6% | 22.707.913 | 20.919.019 |
| Cuentas | 50.000 | 518,86 | 463,00 | 10,8% | 29.740.058 | 26.751.164 |
| Movimientos cuenta | 66.666 | 581,58 | 440,68 | 24,2% | 33.145.653 | 29.156.799 |
| Movimientos stock | 51.667 | 548,25 | 366,20 | 33,2% | 35.339.676 | 32.250.762 |
| Gastos | 15.000 | 129,94 | 87,70 | 32,5% | 8.317.925 | 7.429.031 |

Estas medianas son mediciones de cliente Node y no garantizan porcentajes equivalentes en cualquier equipo. Los bytes corresponden a JSON de filas recibidas por Node, **no** al tamaño del protocolo binario PostgreSQL ni al IPC de Electron. Sumando los nueve conjuntos, pasan de **145.879.190 a 131.535.060 bytes**: reducción de **14.344.130 bytes (9,83%)**.

Planes antes/después de las nueve lecturas: **Seq Scan → Sort**, sin índice utilizado y sin reducción del número de filas examinadas. Los planes JSON incluyen buffers y método de ordenación. Algunas mediciones individuales de servidor empeoraron aunque la mediana del recorrido cliente mejoró: por ejemplo, EXPLAIN de compras 17,26→21,43 ms y ventas 66,60→90,61 ms. No se presenta esta proyección como aceleración universal del servidor; su beneficio comprobado es menor transferencia/procesamiento de columnas y mejor mediana cliente en esta ejecución. Conviene repetir alternando el orden para reducir sesgo de caché y variación.

Lectura conjunta del método optimizado `leerEntidades`: **2.818,98 ms**, snapshot mapeado **77.706.071 bytes** (aproximadamente 74,1 MiB). No se midió el método conjunto anterior con ese volumen; no comparar 2.818,98 ms con los 131,23 ms del dataset pequeño. El DTO final debe mantenerse igual, por lo que su volumen no disminuye con este cambio.

Consultas exploratorias con volumen completo:

| Caso | Mediana ms | Evidencia del plan |
|---|---:|---|
| Compras recientes LIMIT 50 | 15,31 | Escanea 20.000, ordena y limita |
| Compras por proveedor/fecha | 3,36 | 10 emitidas + 19.990 descartadas en Seq Scan |
| Ventas por cliente/fecha | 6,03 | 6 emitidas + 29.994 descartadas en Seq Scan |
| Cuentas abiertas | 19,03 | 12.667 emitidas + 37.333 descartadas; limita a 50 |
| Cuentas anuladas | 10,39 | 1.667 emitidas + 48.333 descartadas; limita a 50 |
| Movimientos de una cuenta | 0,25 | Index Scan `movimientos_cuenta_cuenta_fecha`, 2 filas |
| Stock producto/rango | 1,58 | Bitmap Scan con índice existente producto/fecha, 820 filas antes de LIMIT |
| Gastos por rango | 1,15 | Bitmap Scan con `gastos_fecha`, 1.230 filas antes de LIMIT |
| Agregado SQL de flujo de caja | 20,96 | Escanea cuentas/movimientos; índice de fecha en gastos; no es el reporte React |
| Consulta real de avisos | 5,53 | Dos recorridos de notificaciones, 693 filas de salida |
| No leídos solamente | 2,30 | 500 emitidas + 9.500 descartadas |
| Página profunda OFFSET | 57,34 | Seq Scan de 30.000 ventas y ordenación |
| Página profunda cursor | 12,58 | Seq Scan, descarta 15.000 y ordena las otras 15.000 |

El cursor reduce el conjunto ordenado en este ensayo, pero todavía no tiene índice por `orden`; no se afirma que tenga coste constante. No se implantó paginación en la UI a partir de esta comparación exploratoria.

Evidencia persistida sin credenciales: `docs/evidencias-escalabilidad/benchmark-small-2026-09-29.json` y `docs/evidencias-escalabilidad/benchmark-completo-2026-09-29.json`. Contienen muestras, consultas, parámetros sintéticos, planes completos, catálogo de índices, tamaños, conteos y hashes históricos.

## Paginación e IPC: decisiones

El benchmark incluye consultas propuestas con LIMIT para fecha/proveedor, fecha/cliente, cuentas, movimientos y gastos, así como OFFSET frente a cursor por `orden`. Se etiquetan como **propuestas**, no como consultas utilizadas actualmente por las pantallas. El SQL de referencia para flujo de caja no reemplaza el cálculo de reportes de React.

No se añadieron índices por proveedor/cliente/estado ni un índice parcial de no leídas. No se justifican únicamente porque aparezcan en una lista de candidatos. Los índices simples de fecha de compra/venta duplicarían el prefijo de sus UNIQUE existentes. Los índices de cuenta+fecha, producto+fecha y gastos ya están presentes.

Siguiente diseño a evaluar: separar consultas de historial paginado de los datos mínimos necesarios para comandos y resúmenes globales. Comenzar por stock o compras; filtro SQL y cursor estable por `orden`, con política de actualización explícita. No paginar el Snapshot del dominio sin rediseñar su contrato: rompería saldos, stock, validaciones y reportes globales. No se implementó un endpoint que la UI no consume ni se reemplazó un estado completo por uno parcial incompatible.

## Pruebas, problemas y pendientes

Estado final de verificaciones, incluida la ejecución externa confirmada por el usuario:

- `npm run typecheck`: salida 0, también después del cambio.
- `npm run lint`: salida 0 final, 0 errores y 899 advertencias; 0 advertencias en los archivos de código nuevos/modificados de esta etapa. Las advertencias existentes no se ocultan ni se corrigen en masa.
- `node tests/benchmark-dataset.cjs`: salida 0, escalas 0,01 y 1; determinismo, IDs únicos, referencias, saldos y stock.
- `node tests/proyeccion-entidades.cjs`: salida 0; nueve consultas con columnas explícitas y orden conservado, importes, fechas y datos de anulación.
- Ambas pruebas se añadieron a `tests/run.cjs`, sin quitar ni desactivar las existentes.
- `npm run db:test` en el entorno del agente: salida 1, fallo de arranque del PostgreSQL privado antes de ejecutar suites. No equivale a un fallo de una regla de negocio.
- `npm run db:test` desde la terminal habitual del usuario: **suite completa correctamente**, confirmado por el usuario con el mensaje final `Suite PostgreSQL completa`. Artefactos: `C:\Users\LENOVO\AppData\Local\Temp\ruizcacao-tests-ygyHEN`. Última prueba: arranque automático, SCRAM, rol sin superusuario, credenciales cifradas, exportación pgAdmin y reinicio conservando datos. El runner ejecuta secuencialmente las suites y se detiene ante un código de error; el mensaje de finalización confirma que todas llegaron a completarse. El agente no capturó directamente `$LASTEXITCODE` de esa terminal.
- Las regresiones existentes permanecen activas: integración, migraciones históricas, multiusuario, seguridad/recuperación, jornadas, stock inicial, anulaciones, cuentas, reportes y motor privado. No se quitaron ni ajustaron expectativas comerciales para conseguir resultados verdes.
- Benchmark `--small` en el entorno del agente: salida 1, mismo fallo de arranque.
- Benchmark pequeño ejecutado por el usuario: JSON final `linea_base_medida_sin_optimizaciones`; migraciones, conteos, planes y equivalencia SQL correctos.
- Benchmark completo ejecutado por el usuario: JSON final `comparacion_medida_proyeccion_equivalente`, sin error ni error de cierre, con conteos, planes y equivalencia correctos. No se dispone del código de salida de esas terminales; los archivos finales confirman que completaron ambos recorridos.
- No corresponde `db:sql` ni prueba v7→v8: no hay migración nueva ni modificación del esquema.
- No se generaron instaladores ni publicaciones.

Las pruebas de esta etapa están completadas. Para continuar la escalabilidad quedan pendientes repetir el benchmark alternando referencia/proyección y medir el recorrido completo de un comando pequeño antes de intervenir en la doble carga, el bucle de detección de eliminaciones o la paginación. Los índices por proveedor/cliente/estado quedan condicionados a implementar y medir consumidores SQL reales. No se declara resuelta toda la escalabilidad ni listo un release 1.2.0.

## Archivos de esta etapa

Modificados: `package.json` (comando `db:benchmark`), `src/main/database/relacional.ts` (proyección), `tests/run.cjs` (dos pruebas). `.eslintcache` fue actualizado automáticamente por el comando de lint existente; no es un cambio funcional.

Nuevos: `scripts/benchmark-dataset.cjs`, `scripts/benchmark-postgres.cjs`, `tests/benchmark-dataset.cjs`, `tests/proyeccion-entidades.cjs`, este informe y los JSON de evidencia que lo acompañan.

Lista exacta para revisión:

```text
.eslintcache
package.json
src/main/database/relacional.ts
tests/run.cjs
scripts/benchmark-dataset.cjs
scripts/benchmark-postgres.cjs
tests/benchmark-dataset.cjs
tests/proyeccion-entidades.cjs
docs/Informe_Avance_Escalabilidad_Rendimiento_PostgreSQL.md
docs/evidencias-escalabilidad/benchmark-small-2026-09-29.json
docs/evidencias-escalabilidad/benchmark-completo-2026-09-29.json
```

`git diff --check`: salida 0. `git diff --exit-code -- database package-lock.json`: salida 0. La caché de ESLint estaba limpia al comenzar y fue actualizada por el lint solicitado; se conserva visible para revisión, sin descartar otros cambios.

No se modificaron dependencias, `package-lock.json`, versión de producto, interfaz, migraciones históricas 001–007, claves, certificados, respaldos ni base real. La actualización desde 1.1.2 sigue usando esquema 7; las regresiones se completaron desde la terminal del usuario.

## Continuación reproducible

Desde la raíz del proyecto:

```powershell
npm run db:benchmark -- --small
npm run db:benchmark
npm run db:test
```

Cada benchmark informa la carpeta y escribe `resultado.json`. Conservar ese JSON para comparar planes y medianas; no compartir `conexion.enc` ni archivos de credenciales. No reutilizar `db:qa` como benchmark: usa el perfil configurado habitual y puede sembrar datos en él.
