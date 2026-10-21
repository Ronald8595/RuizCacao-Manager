# Informe breve de conciliación — RuizCacao Manager

**Fecha revisada:** 19/10/2026  
**Evidencia:** 3 capturas de **Compras**, 1 captura de **Consultas y Reportes**, video corto del detalle de movimientos y 3 capturas ampliadas del desplazamiento de ese reporte.  
**Objetivo:** determinar por qué los importes mostrados en ambos módulos no coinciden, sin modificar los datos originales.

## 1. Datos observados

En **Compras** se muestran 20 registros del día (N.º 1–20), todos del proveedor **GALO RUIZ**, marcados como **Pagado** y con **Por pagar = $0,00**. Sumados de nuevo, sin repetir los registros que aparecen en dos capturas:

| Producto | Compras | Cantidad | Importe |
|---|---:|---:|---:|
| Cacao seco | 8 | 15,01 qq | $3.115,15 |
| Cacao en baba | 12 | 12,05 qq | $580,25 |
| **Total** | **20** | **27,06 qq** | **$3.695,40** |

**Corrección:** los cálculos comunicados anteriormente en el chat para cacao seco ($3.196,15 y 15,05 qq) eran erróneos. Los valores de esta tabla se recalcularon a partir de las 20 filas visibles.

En **Consultas y Reportes → Diario**, para el mismo 19/10/2026, se observan:

| Concepto | Valor |
|---|---:|
| Inversión por compras — cacao seco | $6.215,15 |
| Inversión por compras — cacao en baba | $751,61 |
| **Inversión total por compras** | **$6.966,76** |
| Gastos operativos | $190,00 |
| Ingresos por ventas | $0,00 |
| Resultado del período | **-$7.156,76** |

El propio reporte cuadra aritméticamente: $6.215,15 + $751,61 = $6.966,76; $0 − $6.966,76 − $190 = −$7.156,76.

## 2. Diferencia identificada

| Producto | Compras (20 filas) | Reporte diario | Diferencia |
|---|---:|---:|---:|
| Cacao seco | $3.115,15 | $6.215,15 | **+$3.100,00** |
| Cacao en baba | $580,25 | $751,61 | **+$171,36** |
| **Total** | **$3.695,40** | **$6.966,76** | **+$3.271,36** |

**Hallazgo clave en el video:** el detalle de movimientos del reporte muestra, entre otros, los siguientes pagos:

| Detalle visible en reporte | Importe pagado |
|---|---:|
| Compra N.º 38 — cacao seco | $600,00 |
| Compra N.º 39 — cacao en baba | $171,36 |
| Compra N.º 20 — cacao seco | $1.500,00 |
| Compra N.º 18 — cacao seco | $1.000,00 |
| **Suma de estos 4 movimientos** | **$3.271,36** |

**Coincidencia exacta:** $600 + $1.500 + $1.000 = $3.100 de cacao seco; $171,36 de cacao en baba. Estas cifras explican exactamente la diferencia matemática entre las dos pantallas.

En la lista de las 20 compras visibles, las filas N.º 20 y N.º 18 muestran totales de $109,00 y $122,00, respectivamente; en cambio, el video muestra movimientos con etiquetas N.º 20 y N.º 18 de $1.500,00 y $1.000,00. **No asumir que dichas etiquetas identifican las mismas entidades sin verificar sus IDs internos** (la numeración podría ser diaria, por jornada, por proveedor o tener otro alcance).

## 3. Interpretación pendiente de validar

**No está demostrado que exista un error de suma ni una doble contabilización.** El reporte indica expresamente que presenta los valores *efectivamente pagados/cobrados dentro del período*; por tanto, puede estar incluyendo abonos del 19/10 correspondientes a **compras de fechas anteriores**, mientras que la pantalla Compras filtra por **fecha de compra**. Si ese es el diseño, ambos importes pueden ser correctos aunque no coincidan.

Alternativamente, podría haber un error de filtrado, numeración, vinculación de movimientos o duplicación de pagos. Las imágenes por sí solas no resuelven cuál escenario ocurre.

## 4. Acciones de diagnóstico para el agente desarrollador

1. En una **consulta de solo lectura** a PostgreSQL, obtener las 20 compras filtradas por su fecha de creación/compra, proveedor, producto, importe, estado e **ID real**.
2. Extraer todos los **movimientos de pago** fechados el 19/10/2026 con importe, producto, tipo, fecha, referencia/ID de compra, proveedor, fecha original de compra y estado de anulación. Identificar concretamente los cuatro pagos de $600, $171,36, $1.500 y $1.000.
3. Verificar si son **pagos de compras anteriores** o pagos adicionales de compras del mismo día. Comparar los IDs reales, **no solo la etiqueta “N.º X”**.
4. Revisar la consulta del reporte: fecha usada (fecha del movimiento frente a fecha de compra), zona horaria **America/Guayaquil**, condiciones de estado/anulación, `JOIN` que multipliquen filas y tratamiento de pagos iniciales/abonos posteriores.
5. Decidir la regla contable esperada: **compras registradas durante el día** frente a **efectivo desembolsado durante el día**. Si ambas métricas son necesarias, mostrar ambas claramente etiquetadas, sin forzar su igualdad.
6. Crear una prueba de regresión usando esos movimientos; comparar SQL, vista y PDF. **Antes de modificar nada, respaldar la base y ejecutar el diagnóstico sin escrituras.** No usar seeds de rendimiento sobre datos reales.

## 5. Criterio de resolución

El reporte de flujo de caja debe sumar **cada pago efectivo exactamente una vez en la fecha en que se realizó**; las compras del día deben sumar **cada compra creada en ese día exactamente una vez**. Solo deben coincidir cuando el alcance y las fechas de ambas poblaciones sean los mismos. La investigación debe concluir a qué compras pertenecen los **$3.271,36** adicionales y si su inclusión en el reporte del 19/10 es correcta.

## 6. Alcance de la revisión del video y límites de evidencia (ampliación)

- Se revisó el video adjunto de **aprox. 11,8 segundos**, 1280×720, con desplazamientos del detalle de movimientos del reporte diario.
- **No es un volcado completo y auditable** de todas las transacciones. No se ven simultáneamente todos los movimientos ni sus identificadores técnicos, relación con compras, historial de abonos, estados anteriores o saldos remanentes. No puede certificarse que el video represente todas las compras realizadas ni todos los pagos/gastos aplicados en la fecha.
- Las **20 filas de Compras** sí son visibles entre las capturas de ambas páginas del listado, con etiqueta **Pagado** y **Por pagar = $0,00**, pero ese estado actual no demuestra si cada compra fue liquidada íntegramente el día de su creación, a través de un solo pago o mediante varios abonos. Tampoco prueba que no existan otras compras de jornadas distintas cuyos pagos se aplicaron el 19/10.
- Los cuatro importes destacados en el apartado 2 son **pistas de conciliación**, no prueba de doble contabilización. Confirmar su concepto, origen e ID mediante base de datos y código; las etiquetas de número pueden repetirse según la jornada/alcance.
- No están visibles los importes y fechas de **todos los gastos individuales** que componen los $190,00; solo puede verificarse la aritmética del total publicado, no su composición ni fecha contable.

## 7. Pruebas indispensables: pagos totales, abonos y saldos pendientes

La conciliación debe diferenciar **operaciones de compra** de **movimientos efectivos de dinero**:

1. Por cada compra identificar `id_compra`, fecha efectiva de compra, proveedor, producto, importe total, importe de pago inicial, abonos posteriores con fecha/hora, importe acumulado pagado y saldo actual. Mostrar estado **pendiente / parcialmente pagado / pagado / anulado** y comprobar que el estado refleje el saldo de verdad.
2. Determinar si el pago inicial se guarda como movimiento de caja y si los abonos posteriores generan movimientos independientes: **contar cada desembolso una sola vez**, con una referencia única, sin duplicarlo al sumar el campo `pagado` de la compra y su historial de movimientos.
3. Buscar compras de **fechas anteriores al 19/10** con abonos o pagos finales hechos el 19/10: legítimamente pueden aparecer en el reporte de *flujo de caja del día*, aunque no en el listado de *compras creadas ese día*.
4. Examinar compras del 19/10 que se pagaron en otra fecha: pueden figurar en Compras del día sin entrar íntegramente en el flujo de caja del 19/10.
5. Verificar que el saldo por pagar de cada compra sea `MAX(total - suma de pagos efectivos no anulados, 0)` según reglas reales del dominio; comprobar consistencia entre saldos, estados, cuentas por pagar y reportes. No concluir que no hay deuda global solo porque las 20 filas muestran saldo cero.
6. Exigir una conciliación por ID de movimiento y por ID de compra, no por números visibles como «Compra N.º 20». Marcar explícitamente si el movimiento es **pago inicial, abono, liquidación total, reverso o anulación**.

**Criterio de aceptación:** `inversión por compras en reporte de caja(19/10) = SUM(pagos efectivos aplicados el 19/10, no anulados)` separados por cacao seco/baba, independientemente de la fecha de la compra original. `saldos pendientes a una fecha` es una métrica diferente y no debe incluirse como egreso efectivo hasta que se pague.

## 8. Incidencia adicional: fecha de gastos operativos

**Reporte del usuario:** RuizCacao Manager **no permite registrar gastos operativos con otra fecha**, a pesar de que esa opción supuestamente había quedado habilitada en una actualización anterior. **No está demostrado en las capturas/video por qué falla**, por lo que no atribuirlo todavía a una validación, UI o consulta SQL específica.

Verificaciones para el agente:

1. Localizar la funcionalidad previamente implementada y el código actual del formulario de **Gastos**: ¿existe selector de fecha?, ¿está deshabilitado?, ¿fuerza la fecha de jornada/hoy?, ¿rechaza fechas pasadas o futuras?, ¿hay reglas de permisos o jornada cerrada?
2. Seguir la fecha seleccionada por toda la ruta **UI → validación → IPC/API → dominio → PostgreSQL → lectura/reportes/PDF**. Diferenciar `fecha_gasto` o `fecha_contable` de `created_at` / `fecha_registro` y de la fecha en que efectivamente se desembolsó el dinero; acordar regla de negocio antes de tocar consultas.
3. Verificar el tratamiento de zona horaria **America/Guayaquil** y el filtro por día (límites inclusivo/exclusivo). Probar fechas distintas al día actual, cierre de jornada y reinicio de la aplicación.
4. Determinar si los **$190,00** del reporte del 19/10 corresponden a gastos efectivamente pagados/contabilizados el 19/10 o a gastos que el usuario quiso registrar con otra fecha y que el sistema asignó forzosamente al 19/10.
5. Mantener trazabilidad al permitir fechas manuales: fecha efectiva vs. fecha de creación y usuario que registró, sin reescribir movimientos históricos ni fechas sin autorización.

## 9. Comprobación del saldo del período y gastos

La **aritmética mostrada en la vista es coherente**: ingresos $0,00 − pagos por compras $6.966,76 − gastos operativos $190,00 = **−$7.156,76**. **Esto no garantiza la integridad contable**: deben extraerse todos los movimientos reales del día (pagos iniciales, abonos, liquidaciones, anulaciones, devoluciones y gastos) con sus fechas efectivas para demostrar la procedencia de los $6.966,76 y $190,00 y el total de caja.

**Instrucción de seguridad:** diagnóstico inicial con SQL `READ ONLY`, respaldo verificado y pruebas sobre una copia. No ejecutar seeds ni alterar tablas, importes, fechas, pagos o históricos en la base operativa. Elaborar primero una tabla de conciliación por identificadores únicos con columnas compra, fecha compra, tipo movimiento, fecha movimiento, producto, importe, anulado, saldo anterior, saldo posterior e inclusión/exclusión en el reporte.

## 10. Nueva evidencia: tres capturas ampliadas del historial visible

El usuario aclara que **estas tres imágenes corresponden a tramos del desplazamiento mostrado en el video**, no a tres informes independientes. Las capturas permiten leer con mayor claridad diversos renglones, **pero no certifican por sí solas continuidad sin saltos entre tramos ni la totalidad de registros subyacentes**. Evitar reconstruir un listado completo por extrapolación.

![Tramo superior del historial: pagos señalados y transporte](evidencias/05_detalle_tramo_superior.png)

*Tramo superior: aparecen pagos de $600,00, $171,36, $1.500,00, $1.000,00 y transporte de $10,00 (leer su relación real en la base).* 

![Tramo intermedio del historial: gastos y primeros pagos iniciales](evidencias/06_detalle_tramo_intermedio.png)

*Tramo intermedio: son visibles gastos etiquetados como Transporte y Otros, y pagos iniciales de las compras N.º 1 y 2; la nitidez no sustituye los IDs y fechas de los movimientos.*

![Tramo inferior del historial: pagos iniciales](evidencias/07_detalle_tramo_inferior.png)

*Tramo inferior: se observan los pagos iniciales de las compras N.º 3, 4, 5, 6 y 7.*

### Evidencias adicionales incluidas en el paquete

- [Compras, primera página — tramo superior](evidencias/01_compras_pagina1_superior.jpg)
- [Compras, primera página — tramo inferior](evidencias/02_compras_pagina1_inferior.jpg)
- [Compras, segunda página (N.º 1–5)](evidencias/03_compras_pagina2.jpg)
- [Consultas y Reportes, totales del día](evidencias/04_reporte_diario.jpg)
- [Video original de desplazamiento](evidencias/08_video_original.mp4)

### Matriz de investigación revisada

| Pregunta | Evidencia actual | Verificación técnica requerida |
|---|---|---|
| ¿Los $3.271,36 son desembolsos adicionales legítimos? | Coinciden exactamente con cuatro renglones visibles | Fecha efectiva, ID de movimiento, ID de compra, estado y duplicados |
| ¿Un «pago inicial» también está contado en la suma de la compra? | El detalle muestra etiquetas «Pago inicial de compra» | Comprobar modelo financiero: la compra es obligación; el pago es flujo real |
| ¿Se registraron abonos / liquidaciones de fechas anteriores? | Posible, no demostrado | Relacionar cada pago con fecha original de compra y saldo anterior/posterior |
| ¿Los $190 de gastos operativos pertenecen al 19/10? | Total del reporte visible; aparecen varios gastos en el detalle | Obtener todos los gastos con IDs, importe y fechas efectiva/registro, y reconciliar $190 |
| ¿Por qué no permite poner otra fecha al registrar gastos? | Incidencia declarada por el usuario | Reproducir en UI; comparar versión instalada con código, validación, fecha de jornada y persistencia |
| ¿Están incluidos *todos* los movimientos? | Capturas parciales del scroll de un reporte | Consulta de todos los movimientos para el intervalo local del 19/10 y comparación con PDF y UI |

### Reglas para interpretar el resultado

- **Compras del día:** agregación por fecha de la *operación de compra*; no equivale automáticamente a dinero pagado ese día.
- **Egresos por compras del día:** agregación de **pagos efectivos** con fecha pertinente y sin anulación, incluyendo abonos/liquidaciones de compras previas cuando corresponda.
- **Saldo por pagar:** deuda restante a un corte; no se suma a egresos hasta hacerse efectiva.
- **Gastos operativos:** conciliar el detalle con $190,00 y verificar qué fecha define su inclusión; registrar con fecha retroactiva no debe falsificar la fecha real de creación/auditoría.
- **Resultado −$7.156,76:** correcto *como operación aritmética mostrada*, no confirmado como salida de caja correcta hasta conciliar cada movimiento.

**Entrega al otro agente:** utilizar las imágenes y el video del directorio `evidencias/`, generar una tabla única de movimientos reales y documentar por qué cada renglón entra o no entra en el reporte. **No modificar datos de producción durante el diagnóstico.**
