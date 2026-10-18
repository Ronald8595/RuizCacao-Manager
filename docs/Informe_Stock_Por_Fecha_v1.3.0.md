# Stock por fecha — RuizCacao Manager 1.3.0

Fecha de trabajo: 2026-10-17, America/Guayaquil. Rama: `feature/respaldos-restauracion`. Checkpoint preliminar preservado: `6bc226fd7b8127c7ffee9a71081e0537965e585d`. Paquete 1.3.0, esquema 10. No build, commit, push ni tag.

## Resultado

**Implementado SÍ. Conciliación OK. Histórico certificado SÍ bajo la historia conciliada y la semántica de fecha operativa**, no como reconstrucción del inventario anterior a su incorporación ni de lo conocido en un instante real pasado. Conversiones y anulaciones compensatorias conservan sus reglas. Stock actual conserva su componente, estado, consultas, límites y operaciones; la nueva vista se monta solo al seleccionarla.

**Índice adoptado NO. Migración011 NO.** El candidato se probó únicamente en una copia aislada. La mejora pequeña del servicio completo no justifica adoptarlo con el volumen medido. No se modifican migraciones 001–010.

## Controles iniciales y preservación

Se leyeron el informe de auditoría y la continuidad. `git status --short`, rama y `git diff --check` ejecutados antes de implementar; rama correcta, sin errores de whitespace. Cambios preexistentes: `.eslintcache`, `NovedadesVersion.tsx`, continuidad y el informe de auditoría sin seguimiento. No se reseteó ninguno.

Se preserva byte por byte `.eslintcache` previo a lint (SHA-256 `912c7eabbe9529e7eee5b8463ca72b49b2923778b13bb3a85a5274c4a2cf99c3`) y `NovedadesVersion.tsx` (`acb53a23c609176f16c5ea40871cc6e022ed918f3c22d7330ae4dbfbe98e99a8`). El informe de auditoría anterior permanece como documento histórico; este informe registra la implementación autorizada posteriormente.

## Conciliación previa en SOLO LECTURA

Herramienta: `scripts/conciliar-stock-fecha.cjs`. Se descifra la conexión de desarrollo existente sin imprimir credenciales; Client con `default_transaction_read_only=on`, transacción `READ ONLY REPEATABLE READ`, zona America/Guayaquil y ROLLBACK. No llama iniciar, login, migrar ni comandos de aplicación. No inicia el motor comercial.

Evidencia: [conciliacion.json](evidencias-stock-fecha/conciliacion.json). 25.450 movimientos, esquema 10; cero movimientos futuros, cero conversiones con producto atípico y cero fechas distintas del día local de su hora registrada.

| Producto | Suma normalizada (qq) | Existencias (qq) | Diferencia |
|---|---:|---:|---:|
| Cacao en Baba | 72.576,23 | 72.576,23 | 0,00 |
| Cacao Seco | 76.459,65 | 76.459,65 | 0,00 |
| Maracuyá | 76.450,00 | 76.450,00 | 0,00 |

Tipos reales: Conversión (4), Entrada - Ajuste (252), Entrada - Compra (6.675), Entrada - Compra Seco (3.339), Salida - Ajuste (172), Salida - Venta (15.007), Stock inicial (1). No se encontró Salida - Merma en esta base; sí se cubre en pruebas. No hay Salida - Procesamiento ni conversion_id informado. No se inventaron movimientos, saldos o fechas para conciliar.

La base de desarrollo contiene el lote de rendimiento preexistente documentado en continuidad. No se añadió seed allí. La certificación se limita a esta historia observada y a los patrones verificados. Un legado distinto debe inventariarse/conciliarse antes de certificarlo. La suite incluye un patrón sintético legado de dos filas separadas enlazadas por conversion_id; se suma cada efecto de su propio producto, sin expandirlo de nuevo como Conversión.

## Arquitectura y fórmula implementadas

- Contrato dedicado: `src/shared/stockPorFecha.ts`. IPC `datos:stockPorFecha`, preload tipado y método `BaseLocal.stockPorFecha` que exige sesión.
- Servicio `src/main/database/stock-por-fecha.ts`: techo de ingreso, agregado, COUNT y página dentro de la misma transacción `READ ONLY REPEATABLE READ` del Main. Primera solicitud: cuatro SELECT; siguientes: tres SELECT. No llama `datos`, `estado` ni Snapshot.
- Producto normal: efecto entrada_qq/salida_qq sobre producto. Conversión: entrada_qq sobre Seco y salida_qq sobre Baba mediante UNION ALL virtual, sin persistir filas nuevas. Una sola fila de detalle.
- Inicial(D)=SUM(entrada-salida) con fecha<D; entradas y salidas con fecha=D; final calculado íntegramente en NUMERIC como inicial+entradas-salidas. Se convierten los resultados pequeños a números del DTO, nunca se suman movimientos en React.
- Fecha operativa=`fecha`. No se usa stock_resultante ni actualizado_en. Las operaciones anuladas conservan el efecto original y su compensación en el día de registro. El stock inicial solo cuenta desde la carga.

SQL exacto exportado como `SQL_RESUMEN_STOCK_FECHA` y guardado también con sus planes en benchmark-indice.json:

```sql
WITH efectos AS (
  SELECT m.fecha,
    CASE WHEN m.tipo='Conversión' THEN 'Cacao Seco' ELSE m.producto END producto,
    m.entrada_qq entrada,
    CASE WHEN m.tipo='Conversión' THEN 0::numeric ELSE m.salida_qq END salida
  FROM ruizcacao.movimientos_stock m
  WHERE m.fecha <= $1::date AND (m.orden,m.id)<=($2::bigint,$3::text)
  UNION ALL
  SELECT m.fecha,'Cacao en Baba',0::numeric,m.salida_qq
  FROM ruizcacao.movimientos_stock m
  WHERE m.fecha <= $1::date AND (m.orden,m.id)<=($2::bigint,$3::text)
    AND m.tipo='Conversión'
), resumen AS (
  SELECT producto,
    coalesce(sum(entrada-salida) FILTER(WHERE fecha<$1::date),0) inicial,
    coalesce(sum(entrada) FILTER(WHERE fecha=$1::date),0) entradas,
    coalesce(sum(salida) FILTER(WHERE fecha=$1::date),0) salidas
  FROM efectos GROUP BY producto
)
SELECT p.nombre producto,coalesce(r.inicial,0) inicial,
  coalesce(r.entradas,0) entradas,coalesce(r.salidas,0) salidas,
  coalesce(r.inicial,0)+coalesce(r.entradas,0)-coalesce(r.salidas,0) final
FROM ruizcacao.productos p LEFT JOIN resumen r ON r.producto=p.nombre
WHERE p.nombre IN ('Cacao en Baba','Cacao Seco','Maracuyá')
ORDER BY CASE p.nombre WHEN 'Cacao en Baba' THEN 1 WHEN 'Cacao Seco' THEN 2 ELSE 3 END;
```

$1=fecha, $2/$3=techo de ingreso orden/id de toda la historia. Sin registros se usa techo cero y se devuelven los tres productos con cantidades cero. La variante UNION ALL evita la expansión lateral por cada fila que se había propuesto en auditoría; mantiene el mismo resultado comprobado contra la conciliación independiente.

## Detalle SQL y navegación

`WHERE fecha=$1 AND (orden,id)<=techo`, comparación estricta `(fecha_hora_registro,orden,id)<cursor`, `ORDER BY fecha_hora_registro DESC,orden DESC,id DESC`, `LIMIT tamaño+1`. Primera página sin comparación de avance. COUNT con fecha/techo, independiente del cursor. No OFFSET. Se conserva una sola fila original por conversión; entrada etiquetada Cacao Seco y salida Cacao en Baba.

Cursor opaco base64url validado con versión, fecha y tamaño. `orden` permanece BIGINT al ordenar en SQL y string al viajar. Hora del cursor emitida en UTC con seis decimales, preservando microsegundos; hora visible en Guayaquil. Fechas inválidas, tamaños no permitidos, cursores corruptos/cruzados, fechas imposibles y bigint fuera de rango son rechazados.

Hook nuevo sin timers/polling/watchers de datos: tamaño inicial25 y opciones10/25/50/100; pila de cursores para Anterior; fecha/tamaño/reintento reinician página. Descarta respuestas obsoletas y desmontadas, reutiliza la promesa al repetir efectos StrictMode. Consulta solo al abrir, cambiar fecha/página/tamaño o reintentar un error. No trabaja al arrancar la aplicación.

UI: botones Stock actual / Stock por fecha dentro de Stock; selector compacto, ayuda plegable y tabla de tres productos protagonista. Módulo nuevo con lazy/Suspense, cargado al abrirlo. Detalle con scroll nativo y encabezado fijo debajo; cambio de página reinicia su contenedor. No se añadieron ResizeObserver ni timers. Stock actual permanece montado para conservar sus filtros y estado; su código funcional no cambia.

El techo excluye nuevas inserciones posteriores al iniciar navegación, incluso retroactivas, del resumen/COUNT/detalle de esas páginas. No constituye una transacción abierta entre clics: modificaciones de registros existentes o commits tardíos pueden cambiar la historia entre solicitudes. Volver a abrir/seleccionar fecha inicia una lectura nueva. Las invariantes entre días presuponen la misma historia.

## Medición del índice y decisión

Herramienta: `scripts/benchmark-stock-fecha.cjs`. SELECT del origen en READ ONLY, copia de columnas requeridas de los 25.450 movimientos a clúster nuevo, identidad de data_directory verificada antes de escrituras. Existencias copiadas para volver a conciliar. Sin vínculos/usuarios copiados; no es restore integral. Copia final `ruizcacao-stock-fecha-IbWN92`; conciliación de la implementación con existencias **OK**.

Candidato `(fecha,fecha_hora_registro DESC,orden DESC,id DESC)`, 2.899.968 bytes. Comparación ABBA sin/con/con/sin en la misma copia, siete muestras por consulta y EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON); huellas de resultados idénticas. 270 fechas; día más denso 2026-01-01 con141 movimientos; fecha reciente2026-09-27; página profunda desde posición112 del día denso. No se extrapola esta profundidad a millones de filas por día.

| Consulta | Sin índice: medianas de ambas rondas (ms) | Con índice (ms) |
|---|---|---|
| Día vacío | 0,452 / 0,438 | 0,485 / 0,517 |
| Día denso | 0,662 / 0,760 | 0,525 / 0,536 |
| Fecha antigua | 0,670 / 0,780 | 0,503 / 0,576 |
| Fecha reciente | 0,684 / 0,587 | 0,483 / 0,632 |
| Página profunda | 0,529 / 0,538 | 0,578 / 0,701 |
| Resumen acumulado reciente | 43,36 / 39,13 | 38,05 / 41,91 |
| Servicio completo reciente, transacción incluida | 41,78 / 42,12 | 40,04 / 39,97 |

El candidato sustituye ordenación por Index Scan y reduce bloques del detalle denso de107 a29 (reciente101 a27, profundo107 a28). **Sí hay mejora del plan**, pero el ahorro neto del servicio es aproximadamente2ms/5%, la página profunda no mejora en tiempo observado y domina el agregado acumulado. Se decide **NO adoptarlo** para este volumen; no justifica un tercer índice de unos2,77MiB y mantenimiento adicional. Esquema10 conservado, sin011. Reconsiderar si nuevas mediciones de volumen/latencia lo justifican.

Respuesta reciente: tres filas resumen +25 movimientos, 6.801 bytes JSON. No mide transporte IPC real ni render en la app completa. Resultados con caché caliente; resumen sigue teniendo costo proporcional a la historia anterior. Sin promesa de tiempo constante ni snapshots diarios. Evidencia completa: [benchmark-indice.json](evidencias-stock-fecha/benchmark-indice.json).

## Pruebas automáticas y controles

- `node tests/run.cjs --solo-stock-fecha`: código0 en clúster efímero; incorporada también a `npm run db:test`. Invariantes diario/siguiente día/hoy, stock inicial, compra, venta, compra+venta, conversión, ajustes, merma, compensaciones posteriores, vacío, retroactiva/futura y legado sintético. Páginas10/25/50/100 sin duplicados/omisiones, precisión bigint>2^53 y microsegundos empatados, validación y cero llamadas Snapshot.
- `npm run typecheck`: código0, Node y Web. [typecheck.txt](evidencias-stock-fecha/typecheck.txt).
- `npm run lint -- --no-cache`: código0, cero errores/854 advertencias en el árbol existente; fuentes nuevas sin advertencias. Caché preexistente restaurada desde copia exacta, sin reset Git. [lint.txt](evidencias-stock-fecha/lint.txt).
- Prueba acotada de interacción `electron scripts/probar-stock-fecha-interaccion.cjs`: código0, una ventana oculta,11 solicitudes simuladas, cero datos reales/capturas. StrictMode una solicitud inicial; cero antes de abrir; conversión en una fila; anterior/siguiente, tamaños, reinicio, descarte de respuesta vieja, error/reintento y desmontaje. No reemplaza aceptación visual. [interaccion.json](evidencias-stock-fecha/interaccion.json).
- `npm run db:test`: en curso al redactar este bloque; resultado final se registrará antes de entregar.
- `git diff --check`: control final pendiente de cierre documental.

Incidencias resueltas: primer Electron bloqueado por sandbox, repetición autorizada; primer ensayo aislado encontró ordenación textual del techo, corregida manteniendo BIGINT en SQL y cubierta con prueba de órdenes cortos/grandes. El cierre inicial del arnés retenía una conexión técnica; se cerró solo ese proceso/motor identificado y se corrigió a `desconectar`. La copia final concilia. Primera prueba SQL restringida no pudo crear su conexión temporal; corrida autorizada pasó. No se corrigió ni reescribió historia real.

## Pruebas manuales pendientes para el usuario

1. Abrir Stock: Stock actual conserva tarjetas, filtros, acciones y paginación. Seleccionar Stock por fecha y comprobar fecha de hoy, tres productos y tamaño25.
2. Revisar escritorio, ventana reducida y zoom125%: legibilidad, ayuda compacta, scroll horizontal/vertical, encabezados y paginador accesibles por teclado.
3. Elegir un día conocido y contrastar inicial/entradas/salidas/final con compras y ventas reales. Comprobar que Final(D)=Inicial(D+1) bajo la misma historia.
4. Validar una conversión: una fila, salida Baba y entrada Seco; peso físico/diferencia informativos no alteran cantidades.
5. Validar una anulación posterior: el día original conserva su movimiento; la compensación aparece el día registrado.
6. Validar carga inicial y día sin movimientos: fecha de incorporación respetada y saldo arrastrado; no interpretar días previos como inventario físico acreditado.
7. Recorrer10/25/50/100 y Anterior/Siguiente, incluida última página; cambiar fecha/tamaño desde página avanzada y confirmar reinicio.
8. Si existe operación futura/retroactiva, comprobar la fecha operativa y explicar la diferencia con stock actual. Si aparece diferencia no explicada, detener certificación de esa base sin inventar ajustes.

Siguiente paso exacto: ejecutar esta aceptación manual en la app de desarrollo con días conocidos y registrar resultados. Sin build/publicación bajo esta autorización.
