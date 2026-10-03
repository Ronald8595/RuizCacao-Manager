# Etapa 04 — Paginación integral y Reportes

Corte de trabajo 2026-10-02, America/Guayaquil. Rama `feature/escalabilidad-postgresql`, HEAD inicial `9efb6c6`. Aplicación conserva versión 1.1.2; 1.2.0 es objetivo futuro. Esquema 9, 25 tablas. Sin migración 010, seed local nuevo, build de aplicación ni operaciones Git de escritura. Archivo ajeno sin seguimiento `how --stat bebcda3` preservado.

## Estado y método

Se leyeron continuidad e informes 02/03 y los servicios/contratos/páginas implicados. La base de desarrollo existente se consulta exclusivamente con `REPEATABLE READ READ ONLY`. No se inicia sesión, abre jornada ni ejecuta comandos sobre esa base. Credenciales protegidas mediante safeStorage, nunca incluidas en evidencia. La suite usa exclusivamente un motor efímero con `data_directory` comprobado; sus fixtures no modifican la base original.

Arnés `scripts/medir-etapa04.cjs antes|despues`: Snapshot inicial real, algoritmos anteriores sin modificar, React/DOM reales con componentes y contextos, ventana oculta y CSS mínimo. El antes se carga mediante `git show 9efb6c6:archivo` en memoria; no cambia el checkout. La instrumentación transpila su entrada de prueba con esbuild, sin ejecutar build de producto, instalador ni cambiar versión. Se corrigió el timeout de inactividad de la transacción del arnés, exclusivamente con SET LOCAL, para permitir cálculos/DOM antiguos lentos. Intentos abortados no representan mediciones completas.

Evidencia antes: `evidencias-escalabilidad/etapa04-antes-2026-10-02.json`. Primera comparación después, sin otras pruebas concurrentes: `etapa04-despues-primer-corte-2026-10-02.json`. Corte final después incluye validaciones adicionales de controles. Son muestras, no percentiles ni garantía de latencia del equipo cliente. `datosListosMs` incluye 250 ms de asentamiento del arnés; no confundir con tiempo preciso del clic en la app completa. Render/layout antes incluye montaje y los mismos cambios de fechas; después el procesamiento de consulta ocurre fuera del tramo síncrono.

## Módulos

| Módulo | Antes | Cambio |
| --- | --- | --- |
| Clientes | 1.004 entidades completas en Snapshot; filtro y slice en React, 10 filas iniciales; selector 10/25/50/100 | Conservado por coste pequeño y autorización explícita de no refactorizar por uniformidad. |
| Proveedores | 506 entidades completas; búsqueda por nombre, CI/RUC, teléfono, correo y cuenta; render de las 506 | Paginación React sobre catálogo pequeño ya cargado; controles compartidos 10/15/25/50, total, página y anterior/siguiente. CRUD/inactivación conservados. |
| Stock | SQL keyset de 15, botones básicos | LIMIT variable, COUNT SQL filtrado, cursor ligado también a límite y controles compartidos. |
| Compras/Ventas | SQL keyset de 15 | Mismos cambios; filtros y DTO completos, detalle/anulación/comprobantes conservados. COUNT excluye posición de avance y conserva techo. |
| Historial combinado | Filtro sobre 25.021 cuentas; todas las filas al abrir, aunque el cálculo ya usaba Map de clientes | SQL sobre cuentas no manuales, join único de cliente, filtros nombre/fecha/número/tipo/estado/rango, COUNT y keyset. No UNION de operaciones ni duplicados. DTO conserva cuenta y titular. |
| Gastos | Filtro de 13.019 gastos y some de cuentas por gasto automático; todas las filas en DOM | Listado SQL, COUNT, filtros categoría/tipo/fechas, keyset y marca visual de anulación. Resumen agregado aparte. |
| Consultas/Reportes | resumirPeriodo en cada render: some/find anidados y todas las filas del periodo | Agregado SQL completo con COUNT integrado, detalle SQL limitado, DTO de totales separado de filas visibles. PDF completo pedido aparte y HTML construido en Main. |
| Cuentas | Virtualización existente | Conservada; no se fuerza paginación ni se cambian sus cálculos. |

Clientes y proveedores: aproximadamente 257.543 y 108.716 bytes JSON, respectivamente; auditoría de búsqueda amplia 0,31 y 0,13 ms. La auditoría usa búsqueda sobre valores del catálogo como cota práctica, no atribuye esos tiempos exactos a cada filtro de producción. Clientes render/layout 8,9 ms, Proveedores 99,5 → 7,4 ms. No se introduce una consulta SQL extra para catálogos de este tamaño.

## Antes/después con enero–septiembre de 2026

Primera comparación sin pruebas concurrentes, ms:

| Vista | Filas antes → después | Render + layout síncrono antes → después | Datos listos del arnés antes → después |
| --- | ---: | ---: | ---: |
| Historial | 25.021 → 15 | 4.074,4 → 26,5 | 4.473,0 → 470,6 |
| Gastos | 13.019 → 15 | 18.059,9 → 5,4 | 18.383,6 → 464,1 |
| Reportes | 19.691 → 15 | 32.350,8 → 3,7 | 32.771,7 → 620,5 |

Consultas nuevas de apertura (servicio SQL y conversión Main): Historial 27,0 ms/9.247 bytes, Gastos 22,0 ms/6.653 bytes, Reportes 180,4 ms/3.847 bytes. Main recibe una fila de cortes, una de COUNT/agregado y hasta 16 filas para entregar 15; PostgreSQL sí examina el periodo completo para agregación/conteo. No se descargan las entidades completas para contar. Los conjuntos anteriores involucraban 14.348.255 bytes de cuentas, 9.409.323 de gastos y 5.023.736 del resumen financiero con filas. Esos tamaños no son un IPC nuevo anterior: provenían del Snapshot ya cargado y del resultado construido.

El cálculo anterior de Reportes aislado en Main, sin DOM, tardó 6.633 ms sobre el periodo grande; nuevo servicio completo ~186 ms en equivalencia. Diario ~59 → 16 ms; semanal ~232 → 28 ms; mensual medido en evidencia. El problema mayor estaba en Renderer y el DOM, no en transportar una página SQL pequeña. El Snapshot global sigue completo y no se proclama reducción de su carga inicial de ~65 MB.

## Semántica financiera y exportación

Fuente SQL común: Abonos de cuentas no anuladas más gastos manuales. Para Reportes el tipo proviene de categoría de cuenta, exactamente como `reportes.ts`; para Resumen de Gastos se conserva categoría del movimiento, exactamente como su algoritmo anterior. No se inventan devoluciones, no se suman inversiones automáticas como gasto operativo y las anulaciones no son egresos/ingresos.

Se comparan DTO, orden y todos los importes contra `resumirPeriodo` sin modificar. Orden financiero ascendente fecha/ISO de registro; empates conservan primero movimientos y luego gastos, con orden de inserción descendente dentro de cada fuente. Cursor usa fecha, instante, fuente, BIGINT como string e ID; no OFFSET. Techos de inserción evitan incorporar registros posteriores durante navegación; revisión de Snapshot invalida cursores. Búsqueda Unicode literal y cursor ligado a filtros/módulo/límite.

Equivalencia real: diario 106 filas, semanal 553, mensual 2.237, enero–septiembre 19.691 y periodo vacío 0. Todas las filas y todos los campos coinciden en recorridos completos; totales coinciden exactamente a centavos. Para enero–septiembre: ingresos 827.674,34; pagos de compras 6.306.021,45; operativos 79.699,50; egresos 6.385.720,95; saldo −5.558.046,61. Las cifras pertenecen a datos de prueba, no al cliente.

HTML de exportación idéntico al anterior para diario/semanal/mensual y periodo amplio, salvo fecha/hora de emisión. Incluye todas las filas, independientemente del límite/página. Renderer recibe HTML completo únicamente al solicitar exportación; no construye el historial del periodo. Se conserva el canal de impresión, diálogo de destino y notificación existentes. Hay transporte extra del HTML entre Main y Renderer en esa exportación explícita; no ocurre al cambiar filtros ni páginas.

Gastos conserva filtro inicial de hoy. Resumen agrega todo el rango y no depende de página. Se añade `Rango de la lista` como opción inicial para resumir las fechas elegidas en Lista; Diario/Semanal/Mensual con fecha de referencia siguen disponibles. Categoría/tipo de la lista no reducen esos indicadores globales. Se preserva la marca visual histórica de anulada, incluido el caso legado de referencia de compra ausente; los agregados siempre usan cuentas no anuladas.

## Índices y esquema

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) de consultas reales en evidencia. Historial: página ~48 ms, COUNT ~12 ms; Gastos: página ~17 ms, COUNT ~3 ms; financiero: agregado/COUNT ~56 ms, detalle ~173 ms para el rango completo. SQL de cortes registra ~7–14 ms. No sumar tiempos de servicio y sus subconsultas como si fueran independientes.

Se conservan índices existentes de Stock/Compras/Ventas. No se ensayó ni creó un índice nuevo: la reducción del DOM y cálculo cuadrático satisface el objetivo, y el rango amplio requiere agregar casi todas las filas. Candidatos de orden para cuentas/gastos o fecha financiera no se aceptan por intuición. No hay comparación ABBA de DDL ni costes de escritura porque no se propone DDL. Esquema final 9, 25 tablas, 010 NO; no aplica db:sql ni prueba v9→v10. Hashes 001–009 deben quedar verificados en cierre.

## Pruebas y cierre técnico

Typecheck 0; lint 0 (777 advertencias de formato, cero errores); db:test 0, suite completa en clúster aislado ruizcacao-tests-wfJ7qx; arnés antes/después 0; PDF 0. Las comprobaciones adicionales de COUNT detectaron que Compras/Ventas contaban solo filas restantes después del cursor; se corrigió y la suite final verifica COUNT filtrado en todas las páginas. db:sql no aplica. Verificaciones y hashes en verificaciones-etapa04-2026-10-02.json.

Pruebas añadidas: listados aislados, sesión obligatoria, fechas/filtros inválidos, tamaños 10/15/25/50, recorrido sin duplicados/omisiones, BIGINT >2^53, Unicode, anulados con pagos, discrepancia de categoría legado, resumen completo y HTML de PDF equivalente. Stock/Compras/Ventas verifican COUNT filtrado en cada página. Arnés React comprueba cambios de límite, anterior/siguiente, filtros desde profundidad, detalle/abonos, cards invariantes, rango/modo y respuesta vieja deliberadamente atrasada.

Pruebas visuales humanas aún pendientes en app completa: abrir Historial con enero–septiembre, buscar nombre/fecha/número, tipo/estado y Ver detalle; Gastos 01/01–30/09, categorías/tipos, paginar y revisar Resumen; Reportes diario/semanal/mensual, rango amplio, cards completos, tamaños, navegación y guardar PDF completo. Comprobar estilos, scroll/foco y diálogo de archivo en el equipo; el arnés oculto no reemplaza esa revisión.

Siguiente paso exacto: npm run dev, iniciar sesión existente y ejecutar la revisión visual anterior en app completa, registrando resultados aquí; no repetir seed ni hacer build. Cierre técnico verificado; cierre visual pendiente.

## Evidencia final adicional

Conteo exacto del algoritmo anterior, conservado sin modificar, sobre enero–septiembre: 6 filter/108.478 evaluaciones; 1 map/16.686; 16.693 some/208.998.776; 33.372 find/317.397.121. Se instrumentó aparte para no alterar las mediciones temporales; evidencia etapa04-funciones-2026-10-02.json. La nueva página no ejecuta esos cruces en Renderer.

Arnés final validó 10/15/25/50 en Historial, Gastos, Reportes y Proveedores, páginas 1/2/3, regreso, reinicio por filtros/rango/modo, detalle, resumen invariante y respuesta financiera antigua retrasada deliberadamente. Corte final: render/layout Historial 25,4 ms, Gastos 10,2 ms, Reportes 6,5 ms; carga del arnés 469/464/607 ms. La primera comparación independiente de carga se conserva separada; el corte final amplía pruebas y puede variar con actividad del equipo.

PDF impresos mediante Chromium con las opciones A4 de producción: diario 106 filas/5 páginas/114.801 bytes; semanal 553/25/156.590; mensual 2.237/98/307.552. Magic PDF, páginas y SHA-256 comprobados en pdf-etapa04-2026-10-02.json. Revisión visual humana de páginas/diálogo de guardar pendiente. No se imprime aquí el PDF enorme de nueve meses; sí se compara su HTML completo de 19.691 filas y todos sus importes.

## Archivos modificados o añadidos

- `docs/ESTADO_CONTINUIDAD_ESCALABILIDAD.md`
- `docs/Informe_Etapa_04_Paginacion_Integral_Reportes.md`
- `scripts/medir-etapa04.cjs`
- `scripts/perfil-renderer-etapa04.tsx`
- `scripts/probar-pdf-etapa04.cjs`
- `scripts/verificar-etapa04.cjs`
- `src/main/database/base.ts`
- `src/main/database/historial-operaciones.ts`
- `src/main/database/historial-stock.ts`
- `src/main/database/ipc.ts`
- `src/main/database/listados.ts`
- `src/preload/index.ts`
- `src/renderer/src/components/Paginacion.tsx`
- `src/renderer/src/components/reportes/ReporteDiario.tsx`
- `src/renderer/src/hooks/useHistorialOperaciones.ts`
- `src/renderer/src/hooks/useHistorialStock.ts`
- `src/renderer/src/hooks/useListados.ts`
- `src/renderer/src/hooks/usePaginaSQL.ts`
- `src/renderer/src/pages/Clientes.tsx`
- `src/renderer/src/pages/CompraVenta.tsx`
- `src/renderer/src/pages/Compras.tsx`
- `src/renderer/src/pages/Consultas.tsx`
- `src/renderer/src/pages/Gastos.tsx`
- `src/renderer/src/pages/Stock.tsx`
- `src/renderer/src/pages/Ventas.tsx`
- `src/shared/historialOperaciones.ts`
- `src/shared/historialStock.ts`
- `src/shared/listados.ts`
- `src/shared/persistencia.ts`
- `tests/listados.cjs`
- `tests/paginacion-operaciones.cjs`
- `tests/paginacion-stock.cjs`
- `tests/run.cjs`

Evidencia generada:

- `docs/evidencias-escalabilidad/PDF_etapa04_diario.pdf`
- `docs/evidencias-escalabilidad/PDF_etapa04_mensual.pdf`
- `docs/evidencias-escalabilidad/PDF_etapa04_semanal.pdf`
- `docs/evidencias-escalabilidad/db-test-etapa04.txt`
- `docs/evidencias-escalabilidad/etapa04-antes-2026-10-02.json`
- `docs/evidencias-escalabilidad/etapa04-despues-2026-10-02.json`
- `docs/evidencias-escalabilidad/etapa04-despues-primer-corte-2026-10-02.json`
- `docs/evidencias-escalabilidad/etapa04-funciones-2026-10-02.json`
- `docs/evidencias-escalabilidad/lint-etapa04.txt`
- `docs/evidencias-escalabilidad/pdf-etapa04-2026-10-02.json`
- `docs/evidencias-escalabilidad/typecheck-etapa04.txt`
- `docs/evidencias-escalabilidad/verificaciones-etapa04-2026-10-02.json`

`git diff --check`: código 0. Migraciones 001–009 intactas; archivo ajeno sin seguimiento preservado. No se hicieron operaciones Git de escritura, seed local ni build de aplicación.

## Cierre UX — scroll interno de listados (2026-10-02)

Historial Compra/Venta, Lista de gastos, detalle financiero de Reportes, movimientos de Stock, Compras, Ventas y Proveedores usan ahora ContenedorTabla. Clientes conserva su listado previo y Cuentas conserva virtualización. No hay cambios adicionales de SQL, filtros funcionales, COUNT, keyset, resúmenes, PDF, Snapshot, migraciones ni dependencias en este cierre.

El contenedor limita su altura con max(20dvh, calc(100dvh - espacio real)). Un ResizeObserver mide la posición superior del listado, el pie y el margen de la página, y se adapta a cambios de ancho/alto/zoom. No se recalcula la altura al desplazar la página exterior. El piso relativo de 20dvh deja una tabla utilizable cuando los filtros/cards ocupan gran parte de una ventana baja; en ese caso se permite recorrer la estructura superior con el scroll exterior, nunca las 50 filas para llegar a la navegación. Las tablas cortas no reciben altura fija.

Ambos ejes usan overflow:auto nativo y scrollbar-gutter:stable. Las anchuras mínimas existentes se conservan; Historial combinado incorpora min-width de 1100px para mantener legibles sus nueve columnas y Ver detalle. Las barras horizontales quedan dentro del listado. Los th usan sticky/top:0, fondo opaco y z-index:1; el contenedor tiene región con nombre, Tab, indicador de foco y scroll-padding superior para las acciones. No hay controladores de rueda ni desplazamiento personalizado.

Paginación queda fuera del scroll en todos los módulos. Cambiar página, tamaño o filtro reinicia scrollTop; el hook SQL existente sigue reiniciando cursores/página. El paginador puede envolver sus controles en anchuras reducidas. Anterior/Siguiente usan aria-disabled con guardas para impedir activación durante la carga o en los extremos y conservar el foco; el atributo disabled nativo retiraba el foco en Chromium al comenzar la consulta. Reportes mantiene su paginador montado también durante la carga. Los cards y selectores de periodo permanecen fuera del detalle; Resumen de Gastos y exportación PDF conservan el comportamiento de Etapa 04.

### Validación visual automatizada

Arnés scripts/probar-scroll-etapa04.cjs: Vite en modo desarrollo, CSS Tailwind completo, Sidebar/Header y componentes reales, Electron offscreen para capturar el fotograma actual. Base local solo en transacción REPEATABLE READ READ ONLY y ROLLBACK; sin login, jornada, comandos, migraciones ni seed. No ejecuta build de aplicación. Las capturas iniciales de ventana oculta mostraban fotogramas anteriores: se sustituyeron por capturas offscreen después de dos frames. Se corrigió también la preparación del zoom: se aplica tras cargar el origen y antes de entregar el Snapshot al Renderer.

28 casos correctos: siete módulos en cuatro escenarios. Viewports CSS medidos: escritorio 1443×778; reducida 1027×771; compacta 803×603; zoom real 1,25 con viewport 1026×622. Windows ajusta las dimensiones nominales de la ventana al área disponible y DPI; se registran las dimensiones reales, no se presentan como 1440×960 garantizados. Todos verifican 50 filas, scroll vertical, header sticky/opaco, pie externo y accesible, columnas finales accesibles con scroll horizontal cuando hace falta, sin desbordamiento global significativo (tolerancia de redondeo DPI de 1px), Anterior/Siguiente, 50→10, filtro/rango desde página 3 y conservación del foco al avanzar.

Rueda y PageDown nativos correctos en los 28 casos. Tab entra a acciones en Historial, Gastos, Compras, Ventas y Proveedores; Stock y Reportes no tienen acciones de fila en sus tablas. Ver detalle de Historial abre/cierra el diálogo en los cuatro escenarios. Cards de Reportes no cambian al navegar. Se inspeccionaron capturas de Historial/Reportes en escritorio y compacta, Proveedores en reducida y Reportes con zoom 125 %, con scrollbar y controles externos visibles. En compacta Reportes necesita hasta 337px de scroll exterior para alcanzar la estructura inferior; el detalle se limita a ~106px y no crece con 50 filas. Stock en compacta necesita ~146px; el resto de listados conserva el pie dentro del viewport sin scroll exterior.

Evidencias: [matriz de resultados](evidencias-escalabilidad/scroll-etapa04-2026-10-02.json) y 28 PNG scroll-{escenario}-{modulo}-50-scroll.png. Ejemplos: [Historial escritorio](evidencias-escalabilidad/scroll-escritorio-historial-50-scroll.png), [Reportes compacta](evidencias-escalabilidad/scroll-compacta-reportes-50-scroll.png), [Reportes zoom real](evidencias-escalabilidad/scroll-zoom125-reportes-50-scroll.png).

Typecheck 0; lint 0 con 776 advertencias de formato y cero errores. Logs typecheck-scroll-etapa04.txt y lint-scroll-etapa04.txt. db:test 0 en clúster aislado ruizcacao-tests-CXqaGR; se repitió porque se ajustaron guardas del paginador compartido. Log db-test-scroll-etapa04.txt. git diff --check 0. Esquema continúa en 9, 25 tablas; migración 010 NO. PDF completo y equivalencia financiera ya comprobados en Etapa 04; este cierre no altera esos mecanismos.

### Archivos de este cierre

- src/renderer/src/components/ContenedorTabla.tsx (nuevo), Paginacion.tsx y componentes/reportes/ReporteDiario.tsx.
- src/renderer/src/assets/main.css.
- src/renderer/src/pages/CompraVenta.tsx, Gastos.tsx, Consultas.tsx, Stock.tsx, Compras.tsx, Ventas.tsx y Clientes.tsx (tabla de Proveedores).
- scripts/probar-scroll-etapa04.cjs, scripts/perfil-scroll-etapa04.tsx y scripts/preload-scroll-etapa04.cjs (nuevos).
- Ambos documentos de Etapa 04/continuidad y evidencias de scroll.

### Lista preparada para revisión humana en app completa

Desde electron-app ejecutar npm run dev e iniciar sesión existente. No ejecutar seed ni build. Usar 01/01/2026–30/09/2026 para los listados de prueba.

- [ ] Historial con 50: rueda/trackpad, header, horizontal hasta Ver detalle, abrir/cerrar detalle y abonos.
- [ ] Gastos con 50: categoría/tipo/rango, scroll, Anterior/Siguiente, 50→10 y filtro desde página profunda; Resumen conserva todo el periodo.
- [ ] Reportes con 50: Diario/Semanal/Mensual, cambio de rango, cards externos, detalle con scroll, pie accesible y PDF del periodo completo.
- [ ] Stock, Compras, Ventas y Proveedores con 50: navegación, header, horizontal y acciones de última columna.
- [ ] Ventana reducida y zoom real 125 %: botones completos, barras sin superponer acciones, reinicio vertical al navegar/cambiar tamaño/filtros.
- [ ] Tab/Shift+Tab, foco de Anterior/Siguiente durante carga y rueda/trackpad físicos; registrar versión de Windows/DPI/resolución usados.

Comprobación automatizada del patrón y capturas confirmada; prueba humana con trackpad físico, login, diálogo de guardar y equipo final pendiente. El arnés no reemplaza esa revisión.

## Cierre final UX — Clientes y Empleados (2026-10-02)

Clientes incorpora ContenedorTabla únicamente alrededor de su tabla. Conserva catálogo completo en Snapshot, filtros React, CRUD y selector existente 10/25/50/100. La navegación queda fuera y reinicio incluye página, tamaño, búsqueda, tipo y mostrar inactivos. Empleados ya paginaba en React con 15 filas fijas: mantiene esa estrategia, búsqueda diferida de 300ms, filtros de estado, orden y acciones. Su tabla incorpora el mismo contenedor; reinicio incluye página, consulta efectiva, estado, campo de orden y dirección. No se agregó selector ni nueva paginación. Pagos, adelantos y mano de obra no fueron modificados.

Los pies actuales usan nav con aria-label Paginación para que el contenedor existente reserve su altura. Se añadió flex-wrap al pie y min-w-0/shrink-0 en la estructura de Empleados para ventanas reducidas. Headers sticky y scroll nativo en ambos ejes provienen del CSS ya validado; no se modificaron ContenedorTabla, CSS ni paginador compartido. Se mantienen Editar y Eliminar/Desactivar, estados y controles fuera del área desplazable.

### Pruebas y evidencia

Typecheck 0; lint 0, 775 advertencias y cero errores; git diff --check 0. db:test no se repitió: no se modificó código funcional compartido, contratos, servicios ni hooks de datos; la suite del cierre anterior conserva código 0. Los hashes de 58 archivos protegidos (Main, preload, shared/Snapshot, migraciones, hooks, componentes compartidos, CSS, reportes/PDF y package/lockfile) coinciden antes/después. Esquema conserva versión 9 y 25 tablas; migración 010 NO. No PostgreSQL, seed, build, dependencias ni operaciones Git de publicación en este ajuste.

Arnés nuevo scripts/probar-scroll-catalogos-etapa04.cjs y scripts/perfil-scroll-catalogos-etapa04.tsx, reutilizando preload-scroll-etapa04.cjs sin cambios. Vite en modo desarrollo y Electron offscreen con CSS, Sidebar/Header y páginas reales. Fixture aislada de 200 clientes y 90 empleados generada exclusivamente en memoria de la ventana de prueba: no se conecta a PostgreSQL, no lee/modifica el Snapshot real, no llama comandos de datos. Se comprueba fixture intacta y cero llamadas de datos al terminar cada escenario. Editar y Desactivar se abren y cancelan; no se guardan ni desactivan registros.

Seis casos correctos (dos módulos × tres escenarios). Viewports CSS reales: escritorio 1443×778, ventana reducida 803×603, zoom Chromium confirmado 1,25 con viewport 1026×622. Clientes muestra 50 filas y Empleados sus 15 actuales. Todos verifican scroll vertical, header sticky/opaco, pie externo visible, rueda, PageDown, Tab hasta acciones visibles bajo el header, Anterior/Siguiente y regreso al inicio, búsqueda desde página 3, estados, límite de Clientes 50→10 y orden de Empleados. En ventana reducida ambas tablas tienen scroll horizontal interno y la columna Acciones se alcanza sin quedar tapada por la barra; no hay desbordamiento horizontal global significativo (tolerancia DPI de 1px). Capturas inspeccionadas: Clientes escritorio/zoom y Empleados reducida.

Evidencias en docs/evidencias-escalabilidad: scroll-catalogos-etapa04-2026-10-02.json, seis PNG catalogos-{escenario}-{modulo}-scroll.png, typecheck-catalogos-etapa04.txt, lint-catalogos-etapa04.txt, protegidos-clientes-empleados-2026-10-02.json y verificaciones-catalogos-etapa04-2026-10-02.json. [Clientes escritorio](evidencias-escalabilidad/catalogos-escritorio-clientes-scroll.png), [Empleados reducida](evidencias-escalabilidad/catalogos-reducida-empleados-scroll.png), [Clientes zoom 125%](evidencias-escalabilidad/catalogos-zoom125-clientes-scroll.png).

Archivos de este ajuste: src/renderer/src/pages/Clientes.tsx, src/renderer/src/pages/Empleados.tsx, los dos scripts nuevos de catálogos, ambos documentos de Etapa 04/continuidad y evidencias. Otros cambios de Etapa 04 ya existentes se conservan sin commit; archivo ajeno how --stat bebcda3 preservado.

### Revisión humana final preparada

- [ ] Clientes: seleccionar 50, rueda/trackpad, encabezado, horizontal y acciones Editar/Eliminar-Inactivar; cancelar los diálogos si solo se revisa UX.
- [ ] Clientes: Anterior/Siguiente, cambiar límite, buscar desde página profunda, filtrar tipo/mostrar inactivos; scroll vuelve al inicio y pie queda fuera.
- [ ] Empleados: lista suficiente para scroll con sus páginas actuales de 15; búsqueda, Activos/Inactivos, ordenar columnas, navegar y abrir/cancelar Editar/Desactivar.
- [ ] Ambos: ventana reducida y zoom real 125%, PageDown, Tab/Shift+Tab y trackpad físico; sin barras sobre acciones ni scroll horizontal global.
- [ ] Completar la lista humana previa para los otros siete módulos y guardar PDF completo del periodo.

Etapa 04 lista para cierre visual humano. Siguiente paso: npm run dev, sesión existente, ejecutar y registrar ambas listas de revisión en el equipo final. La validación automatizada de Clientes/Empleados está confirmada; revisión humana de la app completa y dispositivos físicos pendiente.
