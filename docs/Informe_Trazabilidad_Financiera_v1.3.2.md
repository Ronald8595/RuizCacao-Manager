# Trazabilidad de fechas financieras — 1.3.2

## Auditoría previa a los cambios

Fuente real: `fuenteFinanciera` en `src/main/database/listados.ts`. Su CTE alimenta agregados, conteo, detalle keyset y PDF completo. Las relaciones existentes son movimiento.cuenta_id → cuenta.id → compra_id/venta_id → PK de operación. No se relacionan por números visibles.

| Movimiento | Incluido | Fecha efectiva | Origen persistido | Registro disponible / fiabilidad |
| --- | --- | --- | --- | --- |
| Pago inicial de compra | Sí, `Abono` | movimientos_cuenta.fecha | compras.fecha | timestamp operativo; no es instante real garantizado |
| Abono posterior de compra | Sí, `Abono` | movimientos_cuenta.fecha | compras.fecha | timestamp operativo; no mostrar como creación real |
| Cobro inicial de venta | Sí, `Abono` | movimientos_cuenta.fecha | ventas.fecha_venta | timestamp operativo |
| Cobro posterior de venta | Sí, `Abono` | movimientos_cuenta.fecha | ventas.fecha_venta | timestamp operativo |
| Cobro de cuenta manual | Sí, `Abono` | movimientos_cuenta.fecha | cuentas.fecha, cuando origen=manual | timestamp operativo |
| Gasto manual, incluida mano de obra | Sí | gastos.fecha | no existe otra operación de origen aplicable | gastos.fecha_hora_registro se genera con new Date().toISOString(); edición lo conserva |
| Gasto automático generado por compra | No | gastos.fecha | compra_id / referencia_stock_id | no se añade al reporte: duplicaría desembolso |
| Ajuste a favor / por devolución | No | movimientos_cuenta.fecha | cuenta y operación si existe | reducen saldo; no son dinero efectivo según política actual |
| Movimientos de cuenta anulada | No | fecha histórica conservada | relación conservada | no se cambia exclusión |
| Venta/compra pendiente sin pago | No | fecha de operación | operación | no existe movimiento efectivo |

`fecha_hora_registro` de compras, ventas, cuentas y abonos usa `timestampParaFecha`: combina fecha operativa con hora y no certifica cuándo se capturó. No se expondrá como fecha real. Gastos manuales usa un instante real antes y después del parche; migración relacional copia el valor persistido, sin fabricarlo. Un valor ausente/inválido no tendrá alternativa inventada.

La categoría contable SQL sigue siendo `Abono`; no existe columna de subtipo. La ampliación de etiquetas descrita al cierre reconstruye el saldo anterior por orden de inserción persistido y usa el importe inicial de la operación. No reescribe observaciones históricas ni clasifica por saldo actual, fecha efectiva, número diario u orden visual.

La cuenta puede existir sin relación de operación en datos históricos. Si su origen es manual, se usa exclusivamente su propia fecha. Si declara origen compra/venta pero falta operación, se indicará origen no disponible; no se sustituirá por fecha efectiva ni por otra compra con el mismo número. Una cuenta inexistente ya queda excluida por el INNER JOIN actual; no se alterará.

## Diseño

Contrato aditivo `FilaFinanciera.trazabilidad?: string`, calculado en Main al convertir el DTO y compartido con la función histórica de resumen para mantener equivalencia de representación. SQL proyecta fecha/origen/registro mediante los JOIN ya existentes; importes, condiciones, orden, cursores y agregados permanecen intactos. La interfaz y el PDF muestran una segunda línea compacta en Detalle. La columna Fecha sigue siendo efectiva.

## Ampliación autorizada: auditoría de fechas independientes (antes de editar)

| Flujo | Existía | Faltaba |
| --- | --- | --- |
| Compra | UI fecha editable; dominio conserva fecha, numeración diaria y stock por fecha | fecha inicial de pago independiente; límite futuro/calendario consistente en dominio; advertencia retroactiva |
| Venta | dominio acepta fechaVenta y conserva numeración diaria | UI enviaba jornada activa, sin selector; fecha de cobro inicial independiente |
| Abono compra/venta/manual | UI fecha editable inicial hoy; dominio exige origen ≤ pago ≤ hoy; cada abono tiene su movimiento | Guayaquil independiente de huso del equipo, calendario estricto en dominio, aviso/confirmación retroactiva |
| Cuenta manual | fecha editable, tipos Deuda manual / Saldo a favor | validar calendario/futuro de forma consistente; no convertir ajuste inicial en cobro |
| Gasto | fecha efectiva editable y registro real ya corregidos/probados | solo trazabilidad cuando día registrado difiere |

Main tipa y limpia argumentos; actualmente no permite `fechaPagoInicial`/`fechaCobroInicial`. Las dos propiedades serán entradas opcionales, almacenadas en la **fecha del movimiento existente**, sin columna ni migración. La UI siempre enviará su selección independiente, inicialmente hoy en Guayaquil. Para consumidores previos que omitan la nueva propiedad se conserva el comportamiento de pago inicial en fecha de operación; esto no afecta los abonos posteriores, cuya fecha es obligatoria e independiente.

Jornadas: compra/venta exigen jornada activa, aunque la fecha operativa sea anterior; Main bloquea cualquier escritura en jornada interrumpida. Abonos mantienen su política actual (sesión requerida, sin añadir requisito de jornada activa). No se reabre ni modifica una jornada histórica. Los pagos anteriores al origen o futuros se rechazan; no se autorizan anticipos previos a la compra/venta.

Auditoría auténtica ya disponible: `operaciones.creado_en` y `auditoria.fecha` generados por PostgreSQL al insertar, correlacionados mediante ID de operación. `actualizado_en` cambia en modificaciones y no demuestra fecha original. No se reutilizan timestamps operativos como hora real ni se alteran registros históricos.

## Implementación completada

- Compras conserva su fecha editable; añade **Fecha efectiva del pago inicial**. Ambas se inicializan por separado con hoy en Guayaquil. Cambiar la operación no modifica el pago.
- Ventas añade **Fecha de venta** y **Fecha efectiva del cobro inicial**; deja de imponer la fecha de jornada al enviar. La confirmación muestra las dos fechas. Las fórmulas de precio, retención, importe, stock y saldo permanecen intactas.
- Compra/venta pendiente omite la fecha del movimiento y no crea caja. Sus vistas previas dicen expresamente «Pendiente: no se registrará movimiento de caja».
- Los diálogos de confirmación de compra/venta advierten sobre fechas retroactivas. Abonos y creación de cuentas manuales exigen marcar confirmación retroactiva; cambiar la fecha invalida la aceptación.
- Main acepta las dos propiedades nuevas; dominio valida calendario, no futuro y operación ≤ pago/cobro. Cada fecha inicial se guarda en el único movimiento ya existente. Las propiedades de entrada se retiran antes de formar las entidades: no aumentan Snapshot ni requieren columnas.
- Los abonos posteriores siguen conservando su fecha obligatoria seleccionada. No se copian fechas de compra/venta. Las cuentas manuales mantienen su semántica de deuda/saldo a favor; crearlas no registra un cobro.
- Cuenta.fecha sigue siendo la de origen. FechaUltimoMovimiento inicial usa la fecha efectiva seleccionada, sin presentarla como instante real de registro.
- Reportes/SQL/PDF añaden la segunda línea `Fecha de compra/venta/cuenta: dd/mm/aaaa`. Se retiró el prefijo genérico Abono. El concepto específico se calcula según el historial verificable (véase ampliación de cierre). Los cobros manuales se rotulan «Cobro de cuenta manual».
- Gastos retroactivos muestran `Registrado: dd/mm/aaaa HH:mm:ss (Guayaquil)` cuando el día del timestamp fiable difiere de la fecha efectiva. Si coincide, no añade texto redundante; si no existe timestamp válido, lo omite.
- Cuentas muestra «Fecha efectiva» en el historial, sin la hora operativa sintética, y «Saldo actual» en el detalle. No se intenta calcular un saldo histórico.

Ejemplos: una compra del17 con pago150 del19 se lista el19, con `Fecha de compra: 17/10/2026`; su cuenta actual conserva saldo12,12 sobre total162,12. Una venta del17 con cobro100 del19 se lista el19, con `Fecha de venta: 17/10/2026`. Un gasto efectivo del17 registrado el20 se lista el17 y muestra aparte el instante real del20. Los IDs se usan internamente y no se imprimen.

### Matriz de compatibilidad final

| Flujo | Operación | Movimiento | Inserción real | Confirmación |
| --- | --- | --- | --- | --- |
| Compra / venta | Editable, hoy Guayaquil por defecto | Inicial editable e independiente; hoy por defecto | operaciones.creado_en / auditoria.fecha | Diálogo con fechas y advertencia retroactiva |
| Abono compra / venta / manual | Inmutable desde la cuenta | Editable entre origen y hoy; hoy por defecto | Auditoría existente | Casilla si retroactivo |
| Alta de cuenta manual | Editable, hoy por defecto | No genera cobro | Auditoría existente | Casilla si retroactiva |
| Gasto manual | Fecha efectiva editable, parche previo preservado | Usa esa misma fecha efectiva de gasto | gastos.fecha_hora_registro real | Flujo de Gastos previo preservado |

No se mueve el reloj de Windows, no se modifica una base comercial ni se reescriben fechas existentes. El esquema sigue en010; respaldos/restauración1.3.1 intactos. No migraciones, polling, timers de aplicación nuevos ni consultas al arranque. Sin build, commit, push, tag ni publicación.

## Evidencia y regresiones

Directorio: `docs/evidencias-fechas-independientes-1.3.2/`.

1. `fechas-independientes-reloj.cjs` usa un reloj **simulado solo en su proceso**: el19 se registran compras del17 con pago17, pago19 y sin pago; las cuotas100/200/200 tienen fechas17/19/20. Mientras el reloj indica19, el pago20 se rechaza; al avanzar a20 se acepta. No se presenta este reloj como auditoría real.
2. `fechas-independientes.cjs` ejecuta comandos reales de Main/dominio en PostgreSQL temporal: pago inicial100 el17, compra162,12 del17 con pago150 el19 (saldo12,12), pendiente300 sin movimiento, compra500 con cuotas100/200/200, compra de otro día con igual número/ID distinto. Las ventas prueban cobro inicial100 el19 de venta400 del17, cobro posterior300 el20 y otra venta20 con igual N.º diario y distinto ID. Cuenta manual50 recibe10 y ajuste por devolución2: este último reduce saldo, sin sumar ingreso efectivo.
3. Cada rango diario/semanal/mensual se contrasta con `listados.ts` de HEAD, cargado en memoria mediante `git show`, sin checkout. **Resumen financiero idéntico, mismas filas monetarias/IDs/fechas/orden y cero diferencia de importes**; solo se agregan trazabilidad y rótulo de cuenta manual. Se recorre keyset10 frente a100 sin duplicar IDs y se comprueba PDF completo.
4. Gastos automáticos quedan excluidos. Dos manuales de7/3 tienen fechas17/hoy e instante real; solo el retroactivo muestra registro. La anulación excluye150 sin borrar movimientos; ajustes por devolución conservan la política. Una relación ausente simulada solo en fixture da «no disponible», sin buscar otra operación por número.
5. Se cierra BaseLocal y un **proceso Node nuevo**, con login, compara compras, ventas, cuentas, movimientos y gastos persistidos contra el JSON previo. Idénticos. Auditoría `operaciones.creado_en` conserva el tiempo real de ejecución PostgreSQL, actualmente20/10, no una fecha de inserción19 ficticia.
6. UI Electron: formularios y AppDataProvider reales, transporte de mutaciones capturado para comprobar exactamente los argumentos enviados; no simula éxitos SQL. Compras/Ventas comprueban valores por defecto, independencia, vista previa y confirmación; abonos y cuenta manual prueban bloqueo antes de aceptar y reinicio de confirmación al cambiar fecha. Reportes diario/semanal/mensual renderizan DTO obtenidos del PostgreSQL real.
7. Se generan seis PDF reales con Chromium a partir del generador de producción. Extracción independiente verifica fechas/importes y ausencia de IDs; se revisan visualmente las dos páginas del mensual. Son documentos completos, no la página visible. No se ejecuta batería de capturas UI.
8. Límite Guayaquil: `04:59:59Z` aún pertenece al día anterior; `05:00:00Z` inicia el siguiente. Calendario inválido, futuro, pago anterior al origen, sesión ausente, jornada no activa y sobrepago de compra son rechazados. Permisos/jornadas/interrupciones conservan su código existente.

### Importes del fixture PostgreSQL (antes de anular)

| Fecha efectiva | Pagos de compras | Cobros | Gastos | Resultado |
| --- | ---: | ---: | ---: | ---: |
| 17/10 | 200,00 | 0,00 | 7,00 | −207,00 |
| 19/10 | 400,00 | 130,00 | 0,00 | −270,00 |
| 20/10 | 200,00 | 300,00 | 3,00 | 97,00 |
| Mes | **800,00** | **430,00** | **10,00** | **−380,00** |

Las tres cuotas de la compra500 están incluidas una sola vez:17→100;19→200;20→200. Los otros pagos100/150/50 explican el total800. Compra300 totalmente pendiente aporta0 a caja. No confundir estos datos sintéticos con los importes reales del cliente ni con el fixture anterior6.966,76.

### Validación y alcance

- `npm run typecheck`: código0.
- `npm run db:test -- --fechas-independientes`: código0. Incluye nueva regresión, cuentas-fecha, reporte-paginacion-validacion, anulaciones-dominio y24 pruebas de v3. No se repite la suite completa ni benchmarks.
- `npm run db:test -- --solo-fechas-independientes`: comprobación reforzada del proceso nuevo; resultado en `db-reinicio-resultado.json`.
- `node tests/fechas-independientes-reloj.cjs`: código0.
- `node tests/fechas-independientes-ui.cjs`: código0.
- Lint inicial: código1 por tres variables sin usar del nuevo test; corregidas sin tocar producción. Cierre anterior código0, 0 errores/863 avisos, en `lint-resultado.json`; log inicial conservado. El cierre vigente se encuentra en las evidencias de pagos efectuados.
- Diff y procesos: resultados de cierre vigentes en `../docs/evidencias-pagos-efectuados-1.3.2/validacion-final.json`. Motores/bases temporales se cierran en finally; el servicio PostgreSQL ajeno permanece intacto.

Límites: UI prueba los formularios/contexto y sus argumentos; la validación PostgreSQL es complementaria, no una ejecución del instalador completo. No se afirma que se insertó realmente el19 cuando hoy es20; ese escenario temporal se reproduce con reloj de dominio controlado y se distingue de la auditoría auténtica de PG. No se confirma el origen de3.271,36 del cliente. Aceptación visual final de ventanas reducidas/zoom y del flujo completo en un perfil de prueba permanece manual.

## Archivos de esta ampliación

Producción:
`src/shared/fechasOperaciones.ts`, `src/shared/trazabilidadFinanciera.ts`, `src/shared/dominio.ts`, `src/main/database/validacion.ts`, `src/main/database/listados.ts`, `src/renderer/src/types.ts`, `src/renderer/src/pages/Compras.tsx`, `src/renderer/src/pages/Ventas.tsx`, `src/renderer/src/pages/Cuentas.tsx`, `src/renderer/src/components/ResumenFechasOperacion.tsx`, `src/renderer/src/components/DetalleCuenta.tsx`, `src/renderer/src/components/reportes/ReporteDiario.tsx`, `src/renderer/src/utils/reportes.ts`, `src/renderer/src/utils/reportePdf.ts`.

Pruebas:
`tests/fechas-independientes.cjs`, `tests/fechas-independientes-reloj.cjs`, `tests/fechas-independientes-ui.cjs`, `tests/run.cjs` (opciones focalizadas).

Documentación: este informe, informe del parche de Gastos, continuidad y evidencias nuevas. Cambios previos de Gastos, versión, respaldo y fixtures conservados. No se modifican SQL001–010.

## Aceptación manual antes de publicar

Solo en perfil/base de prueba:

1. Abrir jornada. Crear compra anterior con pago inicial hoy. Confirmar que cambiar origen no arrastra pago; comprobar ambas fechas y advertencia antes de confirmar.
2. Crear compra del17 con pago17 y otra del17 pendiente. La primera solo afecta caja17; la pendiente no crea movimiento.
3. Crear compra500 del17 y pagar100/200/200 con fechas17/19/20. Verificar casilla retroactiva, saldo actual0 y rechazo de sobrepago.
4. Crear venta anterior con cobro hoy; añadir un cobro de otra fecha. Revisar origen y cada cuota en Cuentas, reportes y PDF.
5. Comprobar deuda manual y abono retroactivo; ajuste/devolución no debe convertirse en cobro efectivo.
6. Revisar gasto anterior: columna efectiva distinta de «Registrado» cuando corresponde. Verificar cambios de día de Guayaquil.
7. Cerrar y reabrir la app, comprobar datos/saldos y exportar PDF diario/semanal/mensual desde una página de detalle intermedia.
8. Revisar formularios/confirmaciones y segunda línea de detalle en ventana reducida y zoom125%. No construir ni publicar hasta la aceptación/autorización correspondiente.


## Cierre ampliado: conceptos y Pagos efectuados — 20/10/2026

Este apartado sustituye la presentación provisional con el prefijo genérico Abono. Las evidencias anteriores se conservan como historial; los PDF vigentes de esta ampliación están en **docs/evidencias-pagos-efectuados-1.3.2/**.

### Causa y corrección mínima

La lista original de Gastos lee gastos manuales y el gasto automático de cada compra. Este último conserva la fecha de compra y se actualiza con el total aplicado/saldo actual. Un pago posterior no crea otro gasto automático: por eso un pago del20 de una compra del19 no aparecía como fila del20. No era un pago perdido. Se conserva esa lista, sus filtros, edición/eliminación manual y detalle automático. El Resumen previo también se conserva con su política existente.

La pestaña compacta **Pagos efectuados** se monta únicamente al seleccionarla. Usa el IPC de reportePeriodo y la misma fuente financiera SQL con el filtro validado categoria=pagos: solo pagos de compras más gastos manuales, excluyendo cobros, compras sin movimiento, gastos automáticos y cuentas anuladas. Fecha sigue siendo fecha efectiva. Cada fila usa ID real del movimiento/gasto; la relación con compra/venta se resuelve por PK, nunca por número diario. Muestra referencia, fecha original, concepto e importe. La inversión y el gasto operativo tienen subtotales separados; 150 de proveedor nunca se suma a gastos operativos.

Se conserva COUNT, límite SQL, keyset y firma del cursor; cambiar fechas o tamaño reinicia a página1. Límites10/15/25/50/100. No OFFSET, descarga íntegra del período al Renderer, nueva llamada de Snapshot, consulta de pagos en vista inactiva ni trabajo nuevo al arranque. Se reutiliza el debounce existente de usePaginaSQL; el módulo ya tenía un temporizador de fecha, que no se modificó. **No se añadieron timers ni polling**; no se afirma que todo el módulo carecía previamente de temporizadores.

### Clasificación verificable

| Condición | Compra | Venta |
| --- | --- | --- |
| Primer movimiento, importe inicial original positivo y cubre saldo previo | Pago total de compra | Cobro total de venta |
| Primer movimiento inicial parcial | Abono inicial de compra | Abono inicial de venta |
| Movimiento posterior que no liquida | Abono a compra | Abono a venta |
| Movimiento posterior que cubre saldo previo positivo | Liquidación de compra | Liquidación de venta |
| Cuenta manual | No aplica según dominio | Cobro de cuenta manual |

Para la página solicitada, Main obtiene solo los IDs y SQL reconstruye las cuentas relacionadas con sumas de ventana por **orden de inserción**. El saldo previo es el total original menos todos los importes aplicados antes de ese movimiento, incluidos ajustes que reducen deuda aunque no sean caja. La fecha efectiva puede ser retroactiva y no determina el orden de registro. La fecha y el orden del reporte no cambian. No hay consulta por cada fila ni agrupación del período en Renderer. Cuentas reutiliza únicamente su historial ya disponible, sin añadir carga de movimientos al Snapshot.

Antes de afirmar un subtipo, se exige operación existente, historial aplicado que coincida con el acumulado y coherencia del primer movimiento con el importe inicial persistido. El acumulado actual solo verifica integridad, nunca decide si una cuota antigua fue parcial o final. Si falta referencia/historial o existe incoherencia se muestra **Pago de compra / Cobro de venta (historial no verificable)**, sin asumir pago total ni liquidación. Las cuentas manuales mantienen etiqueta neutral.

El tipo contable Abono permanece igual. Las nuevas observaciones automáticas iniciales usan la etiqueta correcta. Las observaciones históricas se conservan byte a byte en PostgreSQL: únicamente los dos textos automáticos antiguos reconocidos se sustituyen al presentar el detalle; notas libres se conservan. PDF y Cuentas comparten las etiquetas. No columna, migración ni cambios de restauración.

### Caso solicitado, reproducido con fixtures

| Dato | Resultado demostrado |
| --- | --- |
| Compra N.º1 del19/10, Cacao en Baba | Total162,12, fecha original intacta |
| Abono del20/10 | 150,00, concepto Abono a compra, una fila en Pagos efectuados20 |
| Saldo actual | 12,12 |
| Otra compra N.º1 del20/10 | ID distinto, 501,22 pagado completamente, una fila Pago total de compra |
| Inversión del20 antes de los demás escenarios del test | 651,22 = 150 + 501,22 |
| Gasto operativo del20 | 20,00; no170,00 |
| Salidas totales / resultado en ese fixture sin ingresos | 671,22 / −671,22 |

La compra del19 continúa en Lista de gastos19 y no se mueve a Lista20. La captura UI y caso-150.pdf corresponden a este fixture acotado. Los otros PDF incluyen además cuotas, ventas y cuenta manual; por ello sus totales son distintos del caso acotado. No representan datos del cliente y no confirman el origen real de3.271,36.

### Pruebas y evidencia de cierre

- **PostgreSQL afectado PASS por tramos**. Primera ejecución falló por una expectativa del nuevo test que comparaba jornada activa con finalizada tras cierre normal: se corrigió el test, sin modificar jornadas. Segunda ejecución: pagos-efectuados, fechas-independientes y cuentas-fecha PASS; después falló el mock de paginación que no contemplaba la consulta de etiquetas. Mock corregido para verificar que se consultan como máximo100 IDs de la página. Se continuó únicamente desde reporte-paginacion-validacion: código0, también anulaciones-dominio y24 pruebas v3 PASS. Los códigos1 intermedios se conservan en logs; no se presentan como una ejecución completa con código0.
- Comando de continuación: npm run db:test -- --pagos-efectuados --desde-suite=reporte-paginacion-validacion.cjs. No suites de rendimiento/seed ni bases comerciales. Resultado combinado y códigos en validacion-final.json.
- Fixtures comparan todos los agregados contra el SQL anterior de HEAD, con idénticos IDs/fechas/orden/importes/productos. Diario, semanal y mensual equivalentes. El filtro pagos coincide con las salidas del reporte. Sin doble contabilización; las cuotas antiguas conservan concepto después de liquidar; un abono retroactivo posterior se clasifica según saldo de inserción. Cuentas y SQL dan las mismas etiquetas. Notas históricas intactas, manuales/devoluciones/anulaciones y referencia incompleta cubiertas.
- Regresión adicional conceptos-pagos.cjs PASS0: dominio permite sobrepago posterior de venta y saldo a favor; la cuota que cubre deuda se rotula Liquidación, y un cobro posterior sin deuda se rotula Cobro de venta (saldo a favor). Solo cambia etiqueta, no permisos, saldo, importes ni fecha. Esta rama se verificó de forma focalizada, sin repetir PostgreSQL/PDF cuyos escenarios no la usan.
- Reinicio en proceso nuevo: datos comerciales sintéticos, saldos y DTO de pagos idénticos. Se verifica por separado la finalización normal de jornada.
- UI Electron aislada PASS0: Gastos real, CSS real y DTO de PostgreSQL; transporte de consulta simulado, sin base comercial. Comprueba que la pestaña inactiva no llama reportePeriodo, filtros/tamaño100 reinician cursores, tres filas del caso, etiquetas en reportes. Una captura125%; no batería visual ni auditoría completa.
- Cuatro PDF reales (caso acotado, diario, semanal y mensual), extracción independiente PASS. Mensual13 filas en2 páginas, semanal12 en2, diario7 en2, caso3 en1. Totales/etiquetas/trazabilidad presentes; revisión visual del mensual sin cortes o solapamientos. PDF completo independiente de la página visible.
- Typecheck0. Lint0, sin errores; advertencias de formato preexistentes del repositorio (conteo final en validacion-final.json). Diff-check0. Comprobación Windows de procesos propios de prueba al cierre en procesos.json. La app dev del usuario y servicio PostgreSQL externo permanecen intactos.

### Archivos adicionales de esta corrección

- Nuevo src/shared/conceptoPago.ts y src/renderer/src/components/PagosEfectuados.tsx.
- Ajustados src/main/database/listados.ts, src/shared/dominio.ts, src/shared/trazabilidadFinanciera.ts, src/renderer/src/pages/Gastos.tsx, src/renderer/src/pages/Cuentas.tsx, src/renderer/src/components/DetalleCuenta.tsx, src/renderer/src/components/reportes/ReporteDiario.tsx, src/renderer/src/utils/reportes.ts y src/renderer/src/utils/reportePdf.ts.
- Nuevos tests/pagos-efectuados.cjs, tests/pagos-efectuados-ui.cjs y tests/conceptos-pagos.cjs; adaptados tests/run.cjs, tests/fechas-independientes.cjs y tests/reporte-paginacion-validacion.cjs. Cambios previos conservados.

### Aceptación manual adicional antes de publicar

1. En perfil de prueba, crear compra del19 por162,12 pendiente y pagar150 con fecha20. Verificar compra19, saldo12,12 y una sola fila150 en Gastos → Pagos efectuados20.
2. Crear compra501,22 pagada el20 y gasto manual20. La inversión debe ser651,22 y gastos operativos20. Revisar que ambas compras N.º1 de días distintos no se mezclen.
3. Probar compra y venta totalmente pagadas/cobradas al registrar: Pago total / Cobro total. Probar inicial parcial, cuota intermedia y final: Abono inicial / Abono a / Liquidación. Verificar que liquidar no cambia la etiqueta de cuotas anteriores.
4. Cambiar fechas/tamaños, navegar con más de100 movimientos en una base de prueba ya preparada (sin seed de producción), y exportar PDF diario/semanal/mensual desde página intermedia. El PDF debe incluir todo el rango.
5. Verificar notas propias, cuentas manuales, devolución y anulación con la política vigente; cerrar/reabrir y comprobar saldos/fechas. Revisar foco, tabla con desplazamiento y ventana reducida/zoom125% en el shell real.

**Estado:** preparado para revisión y aceptación manual. No build, commit, push, tag ni release. Pendientes reales: aceptación humana del flujo completo/instalador y evidencia del cliente para el descuadre original; no se solicita nuevamente su respaldo ni se bloquea este parche por ello.


## Ajuste UX: proveedor desde Nueva compra — 21/10/2026

Cambio exclusivamente visual en ProveedorCompraModal.tsx y su integración en Compras.tsx. Tras validar los campos, el envío activa inmediatamente «Guardando proveedor...», aria-busy y anuncio accesible. Una referencia síncrona bloquea clic/Enter y submits repetidos antes del siguiente render. Formulario y cancelación quedan bloqueados mientras se espera; al fallar se conservan todos los campos, aparece el error y se habilita reintento. No cambian validaciones, persistencia, IPC ni idempotencia existente.

Solo después de resolver crearProveedor correctamente se conserva la autoselección existente y se cierra el modal del proveedor. Se reutiliza NotificacionProvider en el diálogo de Compra, montado fuera de la condición del modal hijo: «Proveedor registrado correctamente» permanece visible hasta Aceptar, por encima del contenido de Compra. Esto evita que la notificación global quede debajo de la capa nativa del dialog. No se modifica el proveedor global de notificaciones.

Prueba focalizada tests/proveedor-compra-ux.cjs: componentes y contextos reales en Electron aislado, respuesta IPC diferida/simulada. PASS: estado inmediato, botón deshabilitado, una sola llamada ante tres submits/clic/Enter, ausencia de éxito anticipado, éxito visible y botón Aceptar accesible tras desmontar el modal hijo, autoselección, error sin perder los seis campos, reintento y conservación de la clave idempotente. No se registra ninguna compra durante estos envíos. Evidencias y códigos: docs/evidencias-proveedor-compra-ux-1.3.2/. No acceso a PostgreSQL ni base comercial; no suites de rendimiento.

Archivos de este ajuste: los dos componentes indicados, tests/proveedor-compra-ux.cjs, este informe, ESTADO_CONTINUIDAD_ESCALABILIDAD.md y evidencias. Cambios previos de1.3.2 conservados. Ver validacion-final.json para typecheck, lint y diff-check.

Pendiente para candidata1.3.2: aceptación manual del flujo en perfil de prueba (éxito, espera perceptible, selección y fallo/reintento si reproducible), más la aceptación global ya documentada. No se ejecuta build ni publicación.

**Futura1.3.5:** investigar y optimizar la latencia del alta de proveedores con medición autorizada de extremo a extremo. Solo queda anotado: no se implementan optimizaciones PostgreSQL, Snapshot, IPC, persistencia, jornadas ni trabajo de arranque en este ajuste.
