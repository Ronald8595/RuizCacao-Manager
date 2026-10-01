# Etapa 03 — Optimización de Snapshot, IPC y carga de Compra/Venta y Cuentas

Corte 2026-10-01T22:02:09.654Z, rama feature/escalabilidad-postgresql. Aplicación 1.1.2, objetivo futuro 1.2.0. Esquema 9, 25 tablas. Trabajo anterior de Etapa 2 conservado sin commit. No se volvió a sembrar, no hay migración 010 y 001–009 permanecen intactas.

## Resultado y límites

Se redujo el trabajo síncrono al entrar a Compra/Venta y Cuentas y el coste de guardar comandos. Todos los historiales permanecen completos en el Snapshot. Cuentas conserva filtros, totales globales y acceso a cada cuenta mediante scroll; solo monta las filas del viewport y un margen. No se implementó paginación PostgreSQL de Cuentas/Gastos. Registro, saldos, impuestos, stock, anulaciones, autoría, numeración, jornadas, autenticación y recuperación conservan sus reglas. Consultas/Reportes e IPC/preload de producción no cambian en esta etapa.

El Snapshot sigue pesando 65.339.124 bytes JSON aproximados (65,34 MB), EstadoAplicacion 65.358.083 bytes. No se recortó el contrato ni se atribuye a este cambio una reducción de transporte/carga inicial SQL. La mejora está en Renderer y en el algoritmo de comparación de persistencia.

## Línea base reproducible antes de optimizar

Primero se instrumentaron herramientas aisladas y se midió código sin optimizar. Después se diagnosticó y cambió producción. Base original ruizcacao_manager en loopback, esquema 9, ya sembrada. Lecturas dentro de REPEATABLE READ READ ONLY; no se llamó iniciar/login/jornada/ejecutar sobre la base original. Datos nunca se guardan en JSON de evidencia: solo conteos, huellas, tiempos, tamaño y planes sin filas personales. Configuración cifrada se descifra en memoria, sin imprimir contraseñas.

Scripts:

    npx electron scripts/medir-snapshot-desarrollador.cjs antes
    npx electron scripts/medir-snapshot-desarrollador.cjs despues
    npx electron scripts/medir-comandos-snapshot.cjs antes
    npx electron scripts/medir-comandos-snapshot.cjs despues

Las etiquetas identifican el corte, no restauran código anterior. El antes guardado fue medido ANTES de estas optimizaciones; para reproducir ese código usar un checkout separado con el estado previo de Etapa 3. No ejecutar db:seed:performance. Las mediciones después ahora usan el código actual; no ejecutar benchmarks simultáneamente ni junto a compilación/suite.

medir-snapshot: BaseLocal.estado/datos y leerEntidades privados instrumentados en el proceso del arnés, tiempos de query (incluyen socket/decodificación pg), JSON.stringify/tamaño, crearDominio y guardar sin cambios con db stub. No escribe stock ni registros. EXPLAIN ANALYZE BUFFERS separado por entidad registra ejecución de servidor. Después monta componentes REALES de React en BrowserWindow oculta con contextIsolation/origen restringido. IPC real de EstadoAplicacion ya cargado por canal exclusivo del arnés (sin cola/validación de sesión de producción); roundtrip incluye bridge y copia de payload. Se mide render/commit, layout forzado y frame siguiente. Sin nuevos canales de diagnóstico en la aplicación normal.

CSS mínimo, sin Sidebar/Acceso ni revisión humana; React production sin StrictMode. Las cifras de montaje son del arnés, no una medición garantizada del clic visible de la app completa. El siguiente requestAnimationFrame tarda a veces ~1 s por la ventana oculta y no se usa para afirmar latencia UI. useLayoutEffect puede hacer layout durante commit: por eso se compara también render+layout, sin asumir que layoutMs=0 significa trabajo nulo. Primer corte previo adicional se conserva para ver variación de caché/asignación.

medir-comandos: pg_dump solo lectura de la base original → pg_restore a un clúster NUEVO verificado por data_directory → BaseLocal real en la copia. Usuario/jornada de benchmark preparados solo allí, fuera del tramo medido. Compra, venta y alta pequeña reales, con guardar/lectura posterior y restricciones SQL; transacción del arnés termina con ROLLBACK en la copia. No reutiliza el seed. Las secuencias de la copia pueden avanzar; la base original no cambia. Carpetas efímeras y huellas del dump quedan en evidencia, sin credenciales. Mide tres muestras por caso; no incluye fsync/COMMIT real, SQL dump/restore, login, render posterior ni IPC del comando.

## Diagnóstico de los tres mayores costes

1. **Cuentas monta miles de filas:** 16.252 cuentas abiertas, cada una con ocho celdas y botones. Búsqueda de nombre por find de clientes por fila, formato de importes y creación de elementos React (~1,29 s), más layout del DOM masivo (~1,90 s). Total síncrono mediano ~3,19 s al montar.
2. **Trabajo oculto en Compra/Venta:** al entrar a Compras, el padre filtra 25.021 cuentas para el historial combinado, calcula nombre incluso con búsqueda vacía y hace find en clientes para cada cuenta de venta. Ese resultado no se muestra en esa pestaña, pero bloquea su montaje (~98 ms). Cuentas añade find de venta/cliente por cuenta cuando hay búsqueda. No es una consulta keyset lenta.
3. **Copias y transporte global:** crearDominio clona profundamente las nueve colecciones (~154,5 ms en Renderer; proveedor152 ms) aunque los comandos se ejecuten por IPC/Main. Estado completo es ~65 MB, lectura ~0,7–1,1 s y roundtrip IPC cacheado ~0,5–0,7 s. Este tercer coste aparece al cargar/actualizar estado, no por cada cambio de pestaña.

Hallazgo adicional de mayor coste al guardar: originales×registros con some para detectar eliminaciones en BaseLocal.guardar. Sin cambios, ~10,95 s CPU; comandos completos ~13–15 s. JSON.stringify de filas también cuesta, pero el recorrido cuadrático domina. Se cambió primero ese recorrido tras medirlo.

Navegación: App.tsx cambia activePage, conserva AppDataProvider/estado; Acceso no recarga sesión por cada pantalla. Cambiar de pestaña monta la pantalla sobre datos existentes. Compras/Ventas piden únicamente su página SQL desde el hook. Cuentas no solicita otro Snapshot ni consulta nueva. Crear objetos de acciones/value en Provider ocurre en renders, pero crearDominio ya estaba memoizado por estado; la copia no se repetía por toda navegación. Antes sí se reconstruía al recibir cualquier estado nuevo; ahora la vista de lectura depende de estado.datos.

## Tiempos Renderer antes/después

Medianas, tres muestras, ms:

| Pantalla                       | React/commit antes | React/commit después | React+layout antes | React+layout después |
| ------------------------------ | -----------------: | -------------------: | -----------------: | -------------------: |
| Compra/Venta (pestaña Compras) |              97.80 |                 2.40 |             110.50 |                 4.80 |
| Cuentas (abiertas)             |            1291.10 |                31.10 |            3188.00 |                31.10 |

Cuentas: antes 16.252 filas DOM, después alrededor de 17–26 filas de datos (18 tr al montar, incluido espaciador), según viewport/scroll. Las 25.021 cuentas están en memoria. Todos los filtros se calculan sobre el conjunto completo antes de seleccionar DOM; resumen usa TODAS las cuentas vigentes.

Provider:152,00→9.00 ms. Crear lectura sin comandos/copia: mediana 5.40 ms. crearDominio mutable sigue disponible para Main y tarda 183.80 ms en la misma sesión del arnés; no se eliminó su aislamiento.

## Main, PostgreSQL, Snapshot e IPC

| Etapa (ms)             |    Antes | Después final |
| ---------------------- | -------: | ------------: |
| estadoMs               |   724.34 |        854.31 |
| datosMs                |   722.69 |        848.64 |
| leerEntidadesMs        |   721.19 |        830.77 |
| serializacionJsonMs    |   174.01 |        288.42 |
| dominioMs              |   199.10 |        350.00 |
| guardarSinCambiosCpuMs | 10945.11 |        313.76 |

datos y leerEntidades están incluidos en estado; no sumar etapas anidadas. El perfil después final muestra variación de asignación/GC/carga de la PC y no se afirma mejora de las lecturas SQL ni JSON: no cambiaron. Primera comparación posterior más ligera dio estado680 ms/IPC514 ms; final muestra estado854.31 ms/IPC693.80 ms. La reducción de CPU guardar y del DOM supera esa variación de forma clara.

PostgreSQL EXPLAIN (lectura completa, ejecución servidor antes/después ms):

| Entidad            | Antes | Después |
| ------------------ | ----: | ------: |
| clientes           |  0.41 |    0.43 |
| proveedores        |  0.21 |    0.21 |
| empleados          |  0.02 |    0.02 |
| compras            |  2.85 |    2.60 |
| ventas             |  4.01 |    4.04 |
| cuentas            | 44.94 |   47.05 |
| movimientos_cuenta | 61.99 |   72.94 |
| movimientos_stock  | 14.38 |   19.48 |
| gastos             | 59.06 |   67.68 |

El plan EXPLAIN no incluye envío serializado al cliente. Las consultas de pg incluyen ejecución/transferencia/decodificación y las muestras son diferentes; no restar tiempos distintos para inventar un coste exacto de CPU Main. leerEntidades además transforma filas SQL a DTO. La lectura global ordenada de Cuentas/movimientos/gastos conserva sus sorts actuales; no se creó índice por intuición ni se inició Gastos.

JSON estimado Snapshot/estado antes=después, mismos bytes y huella completa. IPC cacheado mediana 525.50→693.80 ms, con variación de PC/caché. Producción usa structured clone, no JSON.stringify; la serialización JSON aquí es una medida de tamaño/trabajo aproximado separada. No es todo el flujo de login/cargar ni incluye la cola IPC normal.

## Ejecutar: carga previa y posterior

Se confirma datos completo antes del comando → crearDominio mutable → guardar → estado completo (incluye otra llamada a datos) después. Ambas lecturas se mantienen.

| Comando         | Antes total ms | Después total ms | guardar antes→después ms |
| --------------- | -------------: | ---------------: | -----------------------: |
| registrarCompra |       14471.14 |          3064.27 |        12967.74 → 354.31 |
| registrarVenta  |       13698.26 |          3078.75 |        12083.01 → 347.23 |
| crearCliente    |       14895.55 |          3137.14 |        13209.72 → 335.05 |

Tamaño de respuesta es idéntico por caso antes/después, ~65,36 MB, conteos exactos por entidad iguales tras el comando. El alta pequeña también sufría la comparación global. Las escrituras del benchmark se revierten únicamente en la copia; la suite valida COMMIT/idempotencia/rollback normales.

Diseño de reducción futura considerado: registrar entidades/IDs afectados en guardar, releer filas normalizadas y orden de esas entidades, componer Snapshot COMPLETO con colecciones anteriores sin cambios, bajo un contrato de revisión/aislamiento que contemple escritores concurrentes. Debe incluir defaults, nulls, redondeo SQL, autoría, triggers y orden, más jornadas/stock/configuración y avisos actualizados. No se implementó esa reutilización en esta etapa: devolver directamente dominio.snapshot() podría diferir del estado realmente persistido y omitir cambios concurrentes. No se elimina la lectura previa que valida saldos, stock, consecutivos y jornada.

## Cambios implementados

- base.ts/guardar: Set de IDs presentes por entidad reemplaza some anidado. Mantiene igualdad estricta de string/number, auditoría, prohibición de eliminar registros comerciales y eliminación permitida de gasto. Comparación JSON, autoría y transacción iguales; O(n) en detección de faltantes.
- dominio.ts: añade crearLecturaDominio sin comandos mutables, con colecciones completas compartidas como datos de solo lectura y cálculos derivados equivalentes. Índices de saldo por proveedor/cliente conservan orden de suma y redondeo final. crearDominio mutable original y reglas quedan intactos.
- AppDataContext: usa vista de lectura memoizada por estado.datos; todas las acciones siguen por Main/IPC. No clona todas las filas para volver a exponerlas en Renderer. Auditoría de consumidores: sort sobre resultados de filter/map, sin mutación directa de colecciones del contexto.
- CompraVenta: historial se filtra solo cuando la pestaña Historial está abierta; useMemo conserva resultado con entradas iguales; Map de clientes con primera coincidencia. No busca detalle cuando no hay ID seleccionado. Historial combinado mantiene su contrato/lista completa y todavía monta sus filas al abrirlo; no se midió/optimizó su DOM en este alcance de entrada a las pestañas paginadas.
- Cuentas: Map memoizado de clientes/ventas sustituye find repetidos; funciones/dependencias estables. Ventana de DOM con filas de altura56 px sin wrap, margen de ocho, scroll/resize, espaciadores y reinicio al cambiar filtros. Totales/detalles/cuentas disponibles completos. Región enfocable, aria-rowcount/rowindex; al retirar fila enfocada, foco vuelve a la región sin saltar scroll. Al abrir/cerrar detalle, listeners se vuelven a asociar. Contenedor vertical hasta65vh; horizontal para columnas completas. Sin controles de páginas ni nuevo endpoint SQL.

No se optimizó trabajo no demostrado mediante cambios globales a formateadores de Reportes, cachés de estado Main o comandos de dominio. Se descartó recortar arrays/DTO del Snapshot o quitar lecturas a ciegas. No cambios en reglas financieras/comerciales, anulación, jornadas/auth/recuperación, notificaciones, dependencias ni migraciones.

## Validación

- typecheck:0, Node/Web.
- lint:0, cero errores/787 advertencias heredadas (antes896; formatear Cuentas eliminó avisos existentes). Archivos de esta etapa específicos sin errores/avisos añadidos.
- db:test:0, Suite PostgreSQL completa, clúster ruizcacao-tests-kHtUj5; registro de saldos/stock/anulaciones/reportes, migraciones/respaldos/rollback/auth/jornadas/reinicio, paginación y dos suites nuevas pasaron.
- lectura-dominio:0, fixture pequeño y completo; todos los campos/saldos/activos/consecutivos y variantes de jornada comparados con dominio mutable, saldos negativos/anulados/manuales, entrada sin mutación, vista sin comandos.
- guardar-indices:0, reordenación, borrado comercial rechazado, diferencia string/número, gasto eliminado con auditoría.
- rango/Map:0, primera coincidencia igual a find, tipo de clave, vacío/una/muchas filas; todas las posiciones verificadas conservan altura total/cobertura sin huecos.
- Electron real:0, orden/IDs/altura56 en inicio/mitad/final, acceso a última fila16251, detalle de cliente/retorno, foco al retirar fila y filtro Todas desde scroll profundo; 25.021 cuentas accesibles. React/DOM de producción del componente, no comprobación visual humana.
- Base original: huella SHA-256 Snapshot igual antes/después (cb3a4f31b0a317db09a4d13c32d0dd9c9851baf302faf668347ecc413954a3bb); conteos iguales: clientes1.004/proveedores506/empleados3/compras10.014/ventas15.007/cuentas25.021/movimientos cuenta16.695/stock25.450/gastos13.019. Ninguna escritura sobre la base original ni otro seed.
- Comandos antes/después:0 en clúster nuevo, conteos y bytes de respuesta por caso iguales. Reglas de saldo, stock, anulaciones y reportes se verifican además en suite de integración existente.
- git diff --check:0; históricos/lockfile protegidos. 009 SQL/TS conservados de Etapa2, sin cambio de esquema. Huellas001–009 en verificaciones-etapa03-2026-10-01.json.

## Archivos de esta etapa

Modificados: src/main/database/base.ts (guardar), src/shared/dominio.ts (vista de lectura), src/renderer/src/store/AppDataContext.tsx, src/renderer/src/pages/CompraVenta.tsx, src/renderer/src/pages/Cuentas.tsx, tests/run.cjs, docs/ESTADO_CONTINUIDAD_ESCALABILIDAD.md. No atribuir los demás cambios sin commit de Etapa2 a esta etapa.

Nuevos: src/renderer/src/utils/indices.ts, filasVisibles.ts; src/renderer/src/hooks/useFilasVisibles.ts; tests/lectura-dominio.cjs, guardar-indices.cjs; scripts/medir-snapshot-desarrollador.cjs, perfil-renderer-snapshot.tsx, perfil-preload-snapshot.cjs, medir-comandos-snapshot.cjs; este informe.

Evidencias en docs/evidencias-escalabilidad/: snapshot-antes-primer-corte, snapshot-antes, snapshot-despues, comandos-snapshot-antes, comandos-snapshot-despues (todos fecha2026-10-01.json), db-test-etapa03/lint-etapa03-2026-10-01.txt y verificaciones-etapa03-2026-10-01.json.

## Pendientes y siguiente paso exacto

Revisión visual de app completa pendiente: npm run dev, iniciar sesión existente, entrar varias veces a Compra/Venta y Cuentas; comparar respuesta con la pausa observada. Para datos históricos de Compras/Ventas elegir enero–septiembre. Cuentas: recorrer inicio/mitad/final, filtros Todas/abiertas/cliente/fechas desde scroll profundo, ancho pequeño, zoom y Tab/PageDown; abrir detalle y volver, comprobar totales/PDF/abonos con un registro de prueba de jornada normal. No volver a sembrar. Automatizado ya validó cálculos, navegación de DOM y comandos en copia.

Persiste carga global/IPC de65 MB, lectura previa/posterior de comandos y DOM del historial combinado al abrir esa pestaña. No se garantiza que desaparezca toda demora de login/guardar ni se presenta el arnés como revisión visual completa. No empezar paginación de Cuentas/Gastos ni rediseñar Snapshot hasta registrar esta validación y acordar el contrato/siguiente alcance.

Siguiente paso: ejecutar esa revisión visual y registrar resultados. Si la entrada ya responde bien, cerrar Etapa3; para reducir la demora residual de cargar/guardar, diseñar contrato de estado completo/revisiones antes de cualquier lectura incremental o separación de modelos de pantalla. Sin commit/push/tag/instalador.
