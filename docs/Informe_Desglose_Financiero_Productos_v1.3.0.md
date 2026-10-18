# Desglose financiero por producto — v1.3.0

Fecha: 2026-10-17. Rama: `feature/respaldos-restauracion`.

**Implementado: SÍ. Totales equivalentes: SÍ. Snapshot modificado: NO. Migración011: NO.**

Se añadió a Consultas y Reportes una tabla compacta con Ingresos y Pagos de compras para Cacao en Baba, Cacao Seco y Maracuyá. Se conservan las cuatro tarjetas actuales: Ingresos, Pagos de compras, Egresos y Saldo del periodo. El detalle añade Producto; cuando no existe compra/venta origen muestra «—». La misma tabla de desglose y columna Producto se incluyen en los PDF diario, semanal y mensual.

## Cálculo y equivalencia

La fuente financiera existente en PostgreSQL sigue seleccionando exclusivamente movimientos de cuenta `tipo='Abono'`, por fecha del movimiento, con cuenta no anulada. El pago inicial ya es un movimiento; los abonos posteriores se incluyen en sus propias fechas. La categoría de la cuenta sigue determinando si se trata de cobro de venta o pago de compra, como antes.

Se proyecta `compras.producto` o `ventas.producto` desde las uniones que ya existían. No se busca el producto en stock ni conversiones. Una compra de baba mantiene su clasificación aunque su stock se convierta después; una venta de seco se clasifica como seco.

Los subtotales se resuelven con `SUM(...) FILTER(...)` en la misma consulta agregada:

- Ingresos de cada producto: suma de los montos positivos cuyo producto de origen coincide.
- Pagos de compras de cada producto: negativo de la suma de montos de las filas «Pago de compra» cuyo producto coincide, manteniendo importes positivos para mostrarlos.
- Gastos operativos: mantienen su fuente y tratamiento anterior, sin producto.
- Los cuatro totales y `totalGastosManuales` conservan sus expresiones SQL anteriores. Saldo del periodo conserva exactamente `Math.round((ingresos - egresos) * 100) / 100`.

Se detectó que los cobros de cuentas manuales ya formaban parte del total, aunque no tienen venta de origen. **El usuario aprobó mostrar «Sin producto de origen» solo cuando tenga importe.** No se asignan esos cobros arbitrariamente a un producto ni se excluyen del total. También se conserva en ese grupo un pago de compra sin referencia de origen, si existiera.

Invariantes definitivas aprobadas:

1. Ingreso Baba + Seco + Maracuyá + Sin producto de origen = Total ingresos anterior.
2. Pago Baba + Seco + Maracuyá + Sin producto de origen = Total pagos de compras anterior.
3. Sin importes sin origen, las tres categorías suman exactamente el total anterior.
4. Egresos, gastos operativos y saldo del periodo siguen siendo los mismos para los mismos datos y fechas.
5. Las cuentas anuladas siguen excluidas, tanto en pagos iniciales como en abonos; no se cambió la lógica de anulación.

Las comparaciones de sumas se prueban en centavos para evitar diferencias de representación binaria de JavaScript. La suma financiera se mantiene en `numeric` de PostgreSQL; se conserva la conversión final a número que ya utilizaba el contrato.

## Rendimiento y límites de alcance

No se añade ninguna consulta nueva: el agregado existente devuelve ocho importes escalares adicionales (dos por cada uno de los cuatro grupos). Main construye el objeto pequeño `desgloseProductos`; Renderer representa tres o cuatro filas ya agregadas. No recibe todas las operaciones para agruparlas.

El detalle conserva el cursor, cortes, orden, límites y paginación SQL existentes. El PDF continúa consultando todos los movimientos del periodo en Main, sin limitarse a la página visible. Los tres formatos usan la misma fuente y el mismo desglose.

No se modificaron Snapshot, sus campos/payload, las reglas de compras/ventas/cuentas/stock/jornadas/conversión/anulación, SQL001–010, índices ni migraciones. `resumirPeriodo`, que también usa Inicio, conserva su implementación anterior: solo se extendió el tipo de fila para representar Producto. El oráculo que agrupa en memoria existe únicamente en pruebas y no se importa desde la aplicación.

No se agregó trabajo al arranque, polling ni timers. `Consultas.tsx` ya tenía un sincronizador de fechas de 60 segundos; se conserva sin modificación. No se ejecutaron perfiles pesados, suite PostgreSQL general, pruebas visuales completas, screenshots, build, commit, push ni seed. La prueba focalizada usa unas pocas operaciones creadas por APIs reales en un clúster temporal nuevo, nunca la base comercial.

## Archivos modificados por esta tarea

| Archivo | Cambio |
|---|---|
| `src/main/database/listados.ts` | Producto de origen en fuente/detalle/PDF y agregados SQL por producto; fórmulas anteriores intactas. |
| `src/shared/listados.ts` | Contrato del desglose y etiquetas comunes. |
| `src/renderer/src/utils/reportes.ts` | Campo opcional Producto en el tipo de fila; función histórica sin cambios. |
| `src/renderer/src/components/reportes/ReporteDiario.tsx` | Componente compartido diario/semanal/mensual: tabla compacta y columna Producto. |
| `src/renderer/src/utils/reportePdf.ts` | Tabla por producto y detalle con Producto en los tres formatos. Mantiene compatibilidad con llamadores históricos de pruebas sin desglose. |
| `scripts/verificar-etapa04.cjs` | Adapta el verificador existente de listados a los campos nuevos, conservando la comparación con el cálculo histórico. No ejecuta ni implementa Etapa04 de Respaldos. |
| `tests/finanzas-oraculo.cjs` (nuevo) | Oráculo independiente de pruebas, construido sobre los totales históricos y la compra/venta de cada movimiento. |
| `tests/desglose-financiero.cjs` (nuevo) | Prueba focalizada PostgreSQL, APIs reales, anulaciones, fechas, paginación y HTML PDF completo. |
| Este informe y `docs/evidencias-desglose-financiero/` | Resultados y pasos de aceptación manual. |

Se preservaron los cambios previos de Respaldos y los cambios ya presentes en package.json, NovedadesVersion y continuidad. La versión1.3.0 de package.json ya estaba en el árbol al iniciar esta tarea y no fue editada. `.eslintcache` es un artefacto afectado por el comando solicitado `lint --no-cache`.

## Verificación automática

| Comando | Resultado |
|---|---|
| `node tests/desglose-financiero.cjs` | Código0; cinco grupos de comprobaciones completos. |
| `npm run typecheck` | Código0. |
| `npm run lint -- --no-cache` | Código0; 0 errores, 850 advertencias. |
| `git diff --check` | Código0. |

Evidencias: `docs/evidencias-desglose-financiero/prueba.txt`, `prueba-salida.json`, `resultado.json`, `typecheck.txt`, `lint.txt`, `lint-salida.json`, `diff-check.txt` y `validacion-final.json`.

El fixture prueba los tres productos, crédito parcial, pagos iniciales de ayer y abonos de hoy, gasto operativo, conversión de baba a seco, anulación real de compra/venta con abonos y una cuenta manual sin venta. Recorre más de una página y compara filas, conteos y todos los totales con el cálculo anterior. Los PDF se verifican como HTML completo en los tres formatos, incluyendo todas las filas, columnas, escape de texto y aparición condicional de «Sin producto de origen». También comprueba periodo vacío y que consultar no modifica el estado comercial.

El primer intento detectó un error del arnés al esperar un retorno de `crearCuentaManual`, que devuelve void. Se corrigió únicamente el arnés para consultar la cuenta creada; el segundo intento pasó. Log anterior conservado en `prueba-intento1.txt`. El clúster final `ruizcacao-desglose-XgbYBB` quedó detenido y se verificó la desaparición de su `postmaster.pid` (`motorCerrado=true`). No se tocaron motores ajenos.

## Riesgos y aceptación pendiente

- Los cobros sin origen impiden que solamente los tres productos sumen el total. Se resuelve con la cuarta fila condicional autorizada; no hay pérdida de dinero ni clasificación inventada.
- Los productos admitidos siguen siendo los tres del dominio actual. Introducir un producto nuevo requerirá ampliar explícitamente este contrato y los agregados.
- La columna adicional reduce el ancho disponible del detalle PDF. El HTML y contenido están probados; el aspecto del PDF realmente impreso, saltos de página, ventana reducida y zoom deben revisarse manualmente. No se generaron capturas ni una batería visual.
- Se mantienen las850 advertencias de lint y las optimizaciones existentes. No se hizo un perfil de rendimiento pesado ni se certifican aquí volúmenes distintos de los fixtures acotados.

## Pruebas manuales paso a paso para el usuario

Realizar altas, abonos y anulaciones únicamente en una copia o instalación de pruebas. En la base comercial limitarse a consultar/exportar información existente.

1. Abrir Consultas y Reportes y seleccionar un periodo conocido. Comparar Ingresos, Pagos de compras, Egresos y Saldo del periodo con los valores anotados antes del cambio; deben ser idénticos.
2. Comprobar las tres filas Cacao en Baba, Cacao Seco y Maracuyá, los dos totales de columna y la conservación de las cuatro tarjetas. Verificar que no aparece «Sin producto de origen» cuando no hay importes sin referencia.
3. En la copia de pruebas, registrar una compra y una venta parcialmente pagadas por cada producto, con fecha D. Consultar solo D: deben aparecer únicamente los pagos/cobros iniciales, no el total a crédito pendiente.
4. Registrar abonos para esas seis cuentas con fecha D+1. Consultar D y D+1 por separado: cada movimiento debe aparecer solo en su fecha. No debe existir un selector nuevo de producto en el formulario de abono.
5. Convertir parte del stock comprado en baba a seco. Volver al reporte: los pagos de la compra original deben seguir en Baba. Registrar una venta de seco y comprobar que su cobro aparece en Seco.
6. Registrar un gasto operativo de prueba. Confirmar que no se atribuye a los productos, que se muestra Producto «—» y que Egresos y Saldo siguen la fórmula anterior.
7. Anular una venta con abonos y una compra con abonos mediante el flujo normal autorizado. Consultar las fechas iniciales y de abonos: los importes anulados deben desaparecer tanto del desglose como de los totales; las reglas comerciales de anulación siguen vigentes.
8. Crear una cuenta manual de deuda y cobrar un abono. Confirmar que su importe se muestra en «Sin producto de origen», que Producto es «—» en el detalle y que la suma de cuatro filas cuadra con el total. Consultar un periodo que no incluya ese abono: la fila adicional debe ocultarse.
9. Usar un periodo con más movimientos que el límite visible y cambiar entre páginas y límites10/15/25/50. El desglose y los totales deben permanecer iguales; no deben faltar ni duplicarse filas al navegar.
10. Exportar PDF diario, semanal y mensual con ese periodo. Abrir cada archivo y comprobar desglose, columna Producto, importes y presencia de movimientos de la última página, aunque se haya exportado desde la primera página de la UI.
11. Revisar el PDF con nombres/observaciones largos y varias páginas: texto legible, importes completos y encabezados/saltos sin superposición. Probar ventana reducida y zoom125% en la UI: tablas desplazables y controles accesibles con teclado.
12. Seleccionar un periodo vacío: categorías y totales en cero, sin NaN, sin fila sin origen innecesaria y con mensaje de ausencia de movimientos. Consultar también un periodo con un solo producto para confirmar que los otros dos muestran cero.

Siguiente paso: ejecutar esta aceptación manual. No se inicia otra etapa de Respaldos ni se publica una versión desde esta tarea.
