# Ajuste UX de Consultas y Reportes — v1.3.0

Fecha: 2026-10-17. Rama: `feature/respaldos-restauracion`.

## Alcance y criterio aprobado

Se ajusta exclusivamente la presentación de Consultas y Reportes y su plantilla PDF común a los formatos diario, semanal y mensual. Se preserva el desglose por producto implementado anteriormente, incluida la fila condicional «Sin producto de origen».

Antes de cambiar las etiquetas se comprobó que `totalGastos` (antes «Egresos») incluye compras pagadas y gastos operativos. El usuario aprobó mostrar el subtotal existente `totalGastosManuales` como «Gastos operativos». En el ajuste posterior de tarjetas solicitó retirar «Salidas totales» y todos los párrafos internos: las cuatro tarjetas contienen ahora exclusivamente etiqueta y valor monetario.

La ayuda se presenta una sola vez debajo de las cuatro tarjetas, con el texto solicitado: «Resultado del período = ingresos cobrados - inversión en compras - gastos operativos. Positivo indica superávit de caja y negativo, déficit. Representa flujo de caja, no utilidad contable.»

## Textos anteriores y nuevos

| Antes | Ahora | Importe o alcance |
|---|---|---|
| Ingresos | Ingresos cobrados | `totalIngresos`, sin cambios. |
| Pagos de compras | Inversión en compras | `totalComprasPagadas`, sin cambios. |
| Egresos / Salidas totales | Retirado de la presentación de tarjetas | `totalGastos` permanece intacto en el cálculo; no se elimina ningún movimiento. |
| Gastos operativos sin tarjeta propia | Gastos operativos (tercera tarjeta) | Muestra `totalGastosManuales`, ya calculado anteriormente. |
| Saldo del periodo | Resultado del período | `saldoPeriodo`, sin cambios. |
| Total ingresos (etiqueta accesible) | Total ingresos cobrados (visible) | Pie del desglose, mismo importe. |
| Total pagos de compras (etiqueta accesible) | Total invertido en compras (visible) | Pie del desglose, mismo importe; recoge la intención de «Total pagado». |
| Ingreso / Egreso en detalle | Cobrado / Pagado | Mismos movimientos e importes, incluidos pagos de compras y gastos. |
| Ayuda breve sobre movimientos efectivos | Solo se muestran valores efectivamente cobrados o pagados dentro del período seleccionado. Los pendientes no se suman hasta que sean abonados. | Pantalla y PDF. |

«Ingresos por ventas» y «Total pagado» no eran rótulos literales presentes en los componentes actuales de este módulo. No se hicieron sustituciones globales en otros módulos. Se mantiene «Ingresos cobrados» como encabezado general, ya que también incluye cobros de cuentas manuales sin venta de origen, conforme a la clasificación previamente aprobada.

## Jerarquía visual

- Los filtros pasan de un panel alto y un botón separado a una barra compacta con fondo tenue, menor relleno y menor separación respecto al reporte.
- Diario, Semanal y Mensual conservan su comportamiento y cuentan con estado accesible `aria-pressed` y foco de teclado visible.
- Desde y Hasta permanecen en una misma fila de dos columnas. En espacios reducidos los grupos de controles se distribuyen en varias líneas sin separar las fechas en filas distintas.
- Generar PDF permanece visible dentro de la barra, con estilo secundario de borde y fondo blanco. Conserva los estados de espera, deshabilitado y error.
- El reporte sube al eliminar espacios y bloques separados. Su título pasa de 17 a 22 píxeles y comparte línea con el período cuando hay espacio; el contenedor blanco tiene borde y sombra suaves.
- Se conservan cuatro tarjetas uniformes, solo con etiqueta e importe. Comparten borde, fondo, relleno vertical de 8 píxeles y filas de igual altura (`auto-rows-fr`), también al distribuirse en dos filas en pantallas pequeñas. En escritorio mantienen una sola fila de cuatro columnas. No se fija una altura que pueda recortar texto al ampliar el zoom.
- Los importes destacan con 20 píxeles y cifras tabulares. Resultado positivo usa verde, negativo rojo y cero color neutro; el signo monetario y la ayuda exterior permiten interpretarlo sin depender solo del color. La menor altura libera espacio para Desglose por producto.
- El desglose presenta los nombres completos de los totales; el detalle sigue en su contenedor desplazable y paginado.
- Las mismas cuatro tarjetas del PDF reciben la adaptación visual equivalente: etiqueta e importe, igual altura mediante flex, relleno vertical de 6 píxeles y ayuda exterior. No se cambian sus datos, selección de movimientos ni nombres de archivo.

## Lógica financiera y rendimiento

No se modifica SQL, agregación, contrato IPC, cálculo de importes ni fuente de datos. La UI y el PDF muestran los valores ya recibidos; no recalculan totales ni agrupan movimientos en Renderer.

La fórmula permanece: `saldoPeriodo = totalIngresos - totalGastos`, con el redondeo existente en Main. `totalGastos` sigue incluyendo compras pagadas y gastos operativos. La tercera tarjeta muestra el subtotal de gastos por autorización expresa; retirar el texto Salidas totales no modifica el resultado. No debe compararse la antigua tarjeta Egresos con la nueva tarjeta Gastos operativos como si fueran el mismo concepto.

Ejemplo explicativo, no fixture ejecutado: ingresos 100, compras 40 y gastos operativos 10 mantienen resultado 50. Las cuatro tarjetas muestran 100, 40, 10 y 50 respectivamente.

Sin modificaciones en Snapshot, consultas, hooks, paginación SQL, carga inicial ni generación completa del PDF. No se agregan timers, polling ni procesos. Se conserva el sincronizador de fechas automático de 60 segundos que ya existía en Consultas. No se modifican otros módulos, migraciones ni reglas comerciales.

## Archivos de esta tarea

1. `src/renderer/src/pages/Consultas.tsx`: exclusivamente estructura visual, estilos y atributos accesibles de los controles.
2. `src/renderer/src/components/reportes/ReporteDiario.tsx`: presentación compartida de los tres formatos, textos, tarjetas y títulos de tablas.
3. `src/renderer/src/utils/reportePdf.ts`: etiquetas, ayudas y estilos de la plantilla de reportes.
4. `docs/Informe_Ajuste_UX_Consultas_Reportes_v1.3.0.md`: este informe.

Se preservan los cambios previos de Respaldos, desglose financiero y versión. Este inventario no pretende describir todo el árbol de trabajo que ya estaba modificado al empezar.

El ajuste posterior de tarjetas solo edita `ReporteDiario.tsx`, `reportePdf.ts` y este informe; conserva los filtros ya compactados en `Consultas.tsx`.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | Código 0; comprobaciones de Main y Renderer completas. |
| `npm run lint -- --no-cache` | Código 0; 0 errores y 850 advertencias, mismo total que antes del ajuste. |
| `git diff --check` | Código 0; sin errores de whitespace. Git avisa sobre normalización LF/CRLF. |
| Revisión de alcance | Solo tres archivos de presentación y este informe editados en esta tarea. |

Logs del ajuste inicial en `%TEMP%`: `ruizcacao-ux-typecheck.txt`, `ruizcacao-ux-lint.txt` y `ruizcacao-ux-diff-check.txt`. Los checks se vuelven a ejecutar para las tarjetas compactas, con prefijo `ruizcacao-cards-`. No se crean nuevas pruebas automatizadas para estos cambios de presentación; se conservan las verificaciones financieras previas documentadas en `Informe_Desglose_Financiero_Productos_v1.3.0.md`.

No se repiten la suite PostgreSQL, restauraciones, perfiles pesados ni baterías visuales: esta tarea no altera sus componentes de cálculo o persistencia. No se ejecutan build, seed, commit, push, merge ni tag.

## Pruebas manuales sugeridas y riesgos pendientes

La revisión visual en la aplicación y del PDF impreso queda pendiente del usuario; los checks estáticos no certifican ajuste de textos ni saltos de página.

1. Abrir Consultas y Reportes. Comprobar que los filtros ocupan menos altura, las fechas están juntas y Generar PDF es visible. Verificar que el título y los importes del reporte destacan sobre la barra.
2. Cambiar Diario, Semanal y Mensual, y después editar ambas fechas. Confirmar que se conserva la selección y la actualización del reporte habitual. Recorrer controles con Tab y comprobar foco visible y activación de botones con teclado.
3. Consultar un período conocido con compras y gastos operativos. Comparar Ingresos cobrados e Inversión en compras con los valores anteriores y Saldo del periodo con Resultado del período: deben ser idénticos.
4. Confirmar que Gastos operativos contiene solamente los gastos manuales. Verificar que las cuatro tarjetas tienen igual altura, únicamente etiqueta y valor, y que la ayuda completa aparece debajo sin repetirse dentro.
5. Consultar períodos con resultado positivo, negativo y cero. Revisar verde, rojo y neutro respectivamente, sin cambios de tamaño. Comprobar que ingresos menos inversión menos gastos coincide con el resultado; cero debe mostrarse como 0.00.
6. Comprobar las tres filas de productos y la cuarta fila condicional sin origen. Los subtotales y totales deben coincidir con el desglose anterior. Los pendientes siguen excluidos hasta su abono.
7. Cambiar de página y límite en un período con varios movimientos. Los totales del período deben permanecer iguales y el detalle debe conservar Producto, Cobrado y Pagado.
8. Exportar un PDF diario, semanal y mensual. Comprobar las cuatro tarjetas compactas sin párrafos internos, la ayuda debajo y todos los movimientos del período, incluidos los de páginas no visibles al exportar.
9. Revisar escritorio, ventana estrecha y zoom 125 %: una fila de cuatro tarjetas en escritorio, dos columnas cuando disminuya el ancho disponible, igual altura y cifras completas sin recortes. Confirmar más espacio para el desglose y desplazamiento horizontal de tablas. Revisar PDF con importes grandes, textos largos y varias páginas: sin solapamientos.
10. Consultar un período vacío y comprobar ceros y mensaje habitual. Al exportar, verificar que sigue apareciendo el mensaje de ausencia de movimientos.

Siguiente paso: aceptación visual manual de estos ajustes. No se inicia otra etapa ni se publica una versión.

## Ampliación posterior: 100 registros por página

Consultas y Reportes ofrece ahora 10, 15, 25, 50 y 100 registros. `LIMITES_PAGINA_REPORTE` añade 100 sin modificar las opciones por defecto de los demás módulos. El tipo compartido admite este tamaño, pero el backend lo autoriza exclusivamente para `reportePeriodo`; Stock, Historial y Gastos conservan su validación anterior.

Se parametriza la lista de tamaños permitidos del validador reutilizado, conservando su valor por defecto. No se modifica ninguna sentencia SQL: la consulta keyset existente utiliza `LIMIT limite + 1` (101 para detectar si hay otra página) y devuelve como máximo 100 filas a Renderer. No se introduce OFFSET ni carga completa del período en la pantalla.

Revisión del reinicio: `usePaginaSQL` ya incluye `limite` en la identidad del grupo. Cambiarlo deja el índice en 0, los cursores en `[null]` y descarta las respuestas del grupo anterior. No fue necesario editar el hook. La firma del cursor también incluye el tamaño; el backend rechaza reutilizar un cursor de 100 con 50. El flujo de PDF completo permanece sin modificaciones.

Archivos de esta ampliación:

- `src/shared/listados.ts`: opciones específicas y tipo del límite.
- `src/renderer/src/pages/Consultas.tsx`: pasa las cinco opciones al selector existente.
- `src/main/database/historial-stock.ts`: parámetro interno de límites permitidos, con valor por defecto sin cambios.
- `src/main/database/listados.ts`: autoriza las opciones ampliadas solo en Reportes.
- `tests/reporte-paginacion-validacion.cjs`: prueba focalizada del contrato con conexión SQL simulada.
- `tests/run.cjs`: registra la nueva prueba para futuras ejecuciones de la suite.
- Este informe: evidencia y aceptación manual.

Pruebas focalizadas ejecutadas, ambas código 0: `node tests/reporte-paginacion-validacion.cjs` y `node tests/paginacion-stock-validacion.cjs`. Se comprueban tamaños válidos, límite SQL n+1, máximo de filas devueltas, generación del cursor desde la última fila visible, predicado keyset, última página y rechazo de tamaños/cursor incompatibles antes de ejecutar SQL. La prueba utiliza respuestas simuladas; no constituye una nueva ejecución de integración PostgreSQL. No se ejecutó la suite general ni se inició un motor.

Comprobaciones estáticas de esta ampliación: resultados pendientes de recoger. Logs en `%TEMP%` con prefijo `ruizcacao-reporte100-`.

Aceptación manual: seleccionar un período con más de 100 movimientos, avanzar de página con 15, elegir 100 y comprobar regreso a Página 1 y Anterior inactivo. Avanzar y retroceder con 100, luego cambiar a 50: debe reiniciar nuevamente sin duplicar filas ni conservar cursores anteriores. Los totales deben permanecer iguales. Exportar desde cualquier página y comprobar que el PDF sigue incluyendo todo el período.
