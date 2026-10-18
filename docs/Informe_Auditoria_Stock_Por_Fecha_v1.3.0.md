# Auditoría rápida: Stock por fecha — v1.3.0 oficial

Fecha: 2026-10-17, America/Guayaquil. Alcance: inspección estática de código, SQL versionado y contratos; sin conexión a bases reales ni ejecución de pruebas, seed o build. Los tipos descritos son los implementados/declarados, no un inventario DISTINCT de datos de producción.

## Dictamen

Auditoría completada: **SÍ**. Stock histórico reconstruible: **SÍ para el saldo por fecha operativa de una historia completa y conciliada; NO como garantía universal de inventario real de cualquier día**. El modelo permite calcular cantidades sin snapshots diarios ni duplicar registros. No acredita por sí solo saldos anteriores a la incorporación al sistema, integridad de datos heredados ni lo que el sistema conocía en un instante pasado.

La conversión debe descomponerse lógicamente en SQL: una fila contiene entrada de Seco y salida de Baba. No sumar `entrada_qq - salida_qq` agrupando directamente por `producto`. No usar el último `stock_resultante` como cierre histórico.

## Estado inicial y preservación

- El directorio de trabajo contenedor no es repositorio Git; se repitieron los tres controles en `electron-app`, raíz real.
- Rama: `feature/respaldos-restauracion`. HEAD: `6bc226fd7b8127c7ffee9a71081e0537965e585d`, `release: preparar RuizCacao Manager 1.3. preliminar`.
- `package.json`: 1.3.0. Esquema del código: 10. Esto no certifica una publicación oficial nueva.
- `git status --short` inicial: modificaciones previas en `.eslintcache` y `src/renderer/src/components/NovedadesVersion.tsx`.
- `git diff --check`: sin errores; advertencia de conversión LF/CRLF en NovedadesVersion. Se preservan los cambios previos y el checkpoint; no reset, commit ni push.
- Únicas escrituras de esta auditoría: este informe y `docs/ESTADO_CONTINUIDAD_ESCALABILIDAD.md`.

## Respuestas obligatorias

| Pregunta | Respuesta | Condición o explicación |
|---|---|---|
| ¿Stock inicial de D sumando movimientos anteriores? | SÍ | Sumar efectos normalizados con `fecha < D`; requiere base inicial completa, conciliada y sin cantidades fuera del historial. |
| ¿Separar entradas y salidas de D? | SÍ | Usar cantidades, tratando Conversión como dos productos. |
| ¿Stock final determinista? | SÍ | SUM NUMERIC en SQL bajo la misma historia y semántica temporal; no garantiza que esa historia represente todo el inventario real. |
| ¿Conversiones identifican salida Baba/entrada Seco? | SÍ | `tipo='Conversión'`, salida_qq=Baba, entrada_qq=Seco; una operación, dos efectos virtuales. |
| ¿Stock inicial tiene fecha histórica útil? | SÍ | Fecha de incorporación y hora real; NO fecha de adquisición ni reconstrucción anterior a la carga. |
| ¿Anulaciones como compensaciones fechadas? | SÍ | Flujo actual de compra/venta, con fecha de registro de anulación. NO garantizado para anulaciones legadas anteriores a v7. |
| ¿Información para detalle por hora? | SÍ | Hora almacenada disponible, pero NO siempre instante real de creación; ver semántica temporal. El DTO actual no la envía. |
| ¿Migración 011 necesaria? | NO para corrección funcional | Los campos bastan. SÍ se deberá versionar como 011 si se adopta el índice candidato tras medirlo; no crear campos ni backfill por esta auditoría. |
| ¿Índice nuevo necesario? | NO para obtener resultados correctos | Recomendado para el acceso cronológico acotado propuesto; necesidad de rendimiento aún no demostrada con EXPLAIN/medición. Los existentes no cubren filtro de día de todos los productos + orden temporal. |

## Evidencia del modelo y flujos

| Fuente | Hallazgo |
|---|---|
| `database/001-base.sql:20`, `database/002-relacional.sql:275` | `id text PRIMARY KEY`; `orden bigint GENERATED ALWAYS AS IDENTITY`; `actualizado_en timestamptz`. `fecha date`, `fecha_hora_registro timestamptz`, tipo/producto/cantidades obligatorios tras normalización. |
| `src/main/database/relacional.ts:73`, `src/renderer/src/types.ts:294` | Mapeo de MovimientoStock; cantidades NUMERIC(18,2), factor NUMERIC(18,6). Identidad bigint debe viajar como string en cursores. |
| `database/001-base.sql:29`, `database/002-relacional.sql:394`, `database/005-multiusuario.sql:27` | FK a producto, compra, venta, conversión (otro movimiento), gasto, proveedor y usuario; autor opcional en legado. `conversion_id` existe, pero no es necesario para reconocer la conversión actual. No hay FK de movimiento a `operaciones.id`. |
| `src/shared/dominio.ts:757`, `:1060` | Compra genera entrada vinculada con compraId; venta genera salida con ventaId. Conservan fecha operativa de origen y actualizan existencias junto al movimiento. |
| `src/main/database/base.ts:713`, `:752`, `:780` | Stock inicial de una sola carga, cantidades positivas, fecha=hoy de Guayaquil y hora=now(). Añade al saldo existente; no obliga a que el inventario previo sea cero. No genera compra/gasto/cuenta. |
| `src/shared/dominio.ts:808`, `:839`, `:857` | Conversión actual: producto=Cacao Seco, salida Baba y entrada Seco en la misma fila. Peso físico/diferencia posteriores son informativos, no modifican cantidades ni generan movimiento adicional. |
| `src/shared/dominio.ts:890`, `:934` | Ajuste positivo/negativo fechado en jornada activa y merma como salida. |
| `src/shared/anulaciones.ts:6`, `src/main/database/base.ts:914` | Anular compra añade Salida - Ajuste; anular venta añade Entrada - Ajuste. Preserva original, enlaza compraId/ventaId, agrega motivo/autor y usa hoy()+instante ISO real. Repetición rechazada. |
| `database/007-anulaciones.sql:9`, `src/shared/dominio.ts:1309` | Migración de anulaciones antiguas conserva lo conocido sin inventar devoluciones. `anularCuenta` es legado financiero y no equivale a compensar stock. No excluir del agregado el movimiento original porque su operación figure anulada. |
| `database/002-relacional.sql:378`, `src/shared/persistencia.ts:38` | Instalación nueva comienza en cero, pero migración relacional copia existencias desde configuración sin demostrar igualdad con la suma de movimientos. Conciliación de legado pendiente. |
| `src/main/database/base.ts:815`, `src/main/database/relacional.ts:139` | Persistencia impide borrar movimientos por el flujo normal, pero realiza UPSERT; no hay trigger de inmutabilidad de cantidades en movimientos. `actualizado_en` cambia al editar información de conversión: no es fecha original confiable. |

Tipos emitidos por los flujos actuales: **Stock inicial, Entrada - Compra, Entrada - Compra Seco, Entrada - Ajuste, Salida - Ajuste, Conversión, Salida - Merma, Salida - Venta**. **Salida - Procesamiento** permanece declarado como tipo legado; no se encontró emisor en el código actual. Antes de certificar una base heredada, inventariar tipos y patrones con conversion_id: no inferir ni duplicar una salida de procesamiento vinculada sin comprobar cómo fue guardada.

## Semántica de fecha y hora

El día de la vista debe ser `fecha`, la fecha operativa, y no `DATE(fecha_hora_registro)` ni `actualizado_en`. `timestampParaFecha` (`src/shared/dominio.ts:172`) concatena la fecha elegida con la hora local actual del equipo, con segundos, sin offset. PostgreSQL interpreta ese texto en la transacción configurada a America/Guayaquil (`base.ts:102`). Si el equipo tiene otra zona, la hora puede no representar el instante real. Una operación retroactiva puede cambiar el saldo histórico por fecha operativa; una futura ya afecta existencias actuales aunque no entre en el cierre de hoy.

Stock inicial usa `now()` y anulaciones usan ISO con zona, con mejor trazabilidad temporal. No es posible reconstruir universalmente «lo conocido al cierre de aquel día» con estas marcas mixtas. La hora se puede mostrar como **hora registrada**, sin prometer auditoría del instante real. Mantener fecha operativa y hora como datos distintos.

`stock_resultante` es saldo al aplicar la operación, con el orden de registro de entonces; no necesariamente saldo cronológico por fecha operativa. En conversión solo conserva el saldo resultante de Seco. No utilizarlo para reconstruir Baba, ni MAX, ni último valor como saldo de cierre.

## Resumen SQL propuesto (diseño, no implementado)

Una consulta parametrizada en Main devuelve solo tres filas. Esta formulación expande únicamente los efectos durante la consulta y deja la persistencia intacta:

```sql
WITH efectos AS (
  SELECT m.fecha, e.producto, e.entrada, e.salida
  FROM ruizcacao.movimientos_stock m
  CROSS JOIN LATERAL (
    SELECT m.producto, m.entrada_qq, m.salida_qq
    WHERE m.tipo <> 'Conversión'
    UNION ALL
    SELECT 'Cacao Seco', m.entrada_qq, 0::numeric
    WHERE m.tipo = 'Conversión'
    UNION ALL
    SELECT 'Cacao en Baba', 0::numeric, m.salida_qq
    WHERE m.tipo = 'Conversión'
  ) AS e(producto, entrada, salida)
  WHERE m.fecha <= $1::date
), resumen AS (
  SELECT producto,
    COALESCE(SUM(entrada-salida) FILTER (WHERE fecha < $1::date),0) inicial,
    COALESCE(SUM(entrada) FILTER (WHERE fecha = $1::date),0) entradas,
    COALESCE(SUM(salida) FILTER (WHERE fecha = $1::date),0) salidas
  FROM efectos GROUP BY producto
)
SELECT p.nombre AS producto,
  COALESCE(r.inicial,0) AS stock_inicial,
  COALESCE(r.entradas,0) AS entradas,
  COALESCE(r.salidas,0) AS salidas,
  COALESCE(r.inicial,0)+COALESCE(r.entradas,0)-COALESCE(r.salidas,0) AS stock_final
FROM ruizcacao.productos p
LEFT JOIN resumen r ON r.producto=p.nombre
WHERE p.nombre IN ('Cacao en Baba','Cacao Seco','Maracuyá')
ORDER BY CASE p.nombre WHEN 'Cacao en Baba' THEN 1 WHEN 'Cacao Seco' THEN 2 ELSE 3 END;
```

Aplicable a los patrones verificados del modelo; los patrones legados requieren comprobación previa. No filtrar por vigencia de compras/ventas ni sumar diferencia_qq. Mantener cálculo NUMERIC en PostgreSQL; no sumar en React. La lectura del detalle y resumen de cada solicitud debe compartir transacción READ ONLY REPEATABLE READ, como el servicio actual. Esto es aislamiento SQL, no Snapshot global de aplicación.

La suma acumulada tiene costo proporcional a la historia anterior consultada; un índice de detalle no vuelve constante ese costo. Medirlo antes de prometer latencia en bases grandes. Sin snapshots ni agregados persistidos duplicados en este alcance.

## Detalle, paginación e índices

Situación actual: `historial-stock.ts:119` usa filtros fecha/producto/búsqueda, keyset `(orden,id)` descendente, techo inicial, LIMIT+1 y COUNT sin cursor de avance. `base.ts:704` exige sesión y transacción de lectura. El DTO es compacto, omite hora, detalle y vínculos de origen. `usePaginaSQL.ts` conserva cursores, descarta respuestas obsoletas y arranca en 15, con opciones actuales 10/15/25/50. Tiene debounce setTimeout de 150 ms: **no reutilizarlo sin adaptar su contrato para la nueva vista sin timers**. No cambiar la conducta actual de Stock en esta etapa.

Detalle nuevo: una fila por movimiento original (incluida conversión, mostrando expresamente ambos productos/cantidades), COUNT por movimientos, paginado desde la primera solicitud. Evitar paginar los efectos expandidos, que partiría una conversión entre páginas. DTO con id, fecha, hora, tipo, producto/efectos, cantidades, detalle, autor y vínculos opcionales. Renderizar solo página actual.

Consulta prevista, con proyección explícita de esos campos:

```sql
SELECT id, orden, fecha::text, fecha_hora_registro::text,
       tipo, producto, entrada_qq, salida_qq, detalle,
       compra_id, venta_id, conversion_id, usuario_nombre
FROM ruizcacao.movimientos_stock
WHERE fecha = $1::date
  AND (fecha_hora_registro,orden,id) < ($2::timestamptz,$3::bigint,$4::text)
ORDER BY fecha_hora_registro DESC, orden DESC, id DESC
LIMIT $5;
```

Primera página omite comparación con cursor; $5=tamaño+1. Tamaños 10/25/50/100, inicial 25. Anterior mediante pila de cursores; fecha/tamaño reinician navegación. Cursor opaco validado y ligado a fecha/tamaño/versión, con hora exacta SQL y orden como string (no truncar microsegundos al convertir a Date de JS). Empates resueltos con orden e id; id no es una fecha ni un consecutivo comercial.

Índices actuales: PK(id), `movimientos_stock_producto_fecha(producto,fecha)` de 002, `movimientos_stock_orden_id(orden DESC,id DESC)` de 008. El primero ayuda a producto+fecha; el segundo sostiene el historial actual. Ninguno cubre directamente día de todos los productos + orden cronológico propuesto.

Índice candidato para medir: **(fecha, fecha_hora_registro DESC, orden DESC, id DESC)**. El prefijo fecha permite ubicar el día y el resto coincide con cursor/ORDER BY/LIMIT; podría ayudar a rangos de resumen, sin eliminar su costo acumulado. Mantener ambos índices existentes. No añadir INCLUDE ni segundo índice por intuición. Comparar EXPLAIN (ANALYZE, BUFFERS) con/sin candidato en copia aislada, días vacíos/densos/antiguos/recientes y páginas profundas. Si se adopta, el cambio se versionará en **011**, sin modificar 001–010. Aquí no se creó índice ni migración.

Concurrencia: el techo cronológico por sí solo no excluye inserciones retroactivas. Para una sesión de navegación se puede añadir un techo de ingreso `(orden,id)` obtenido de toda la historia, aplicado tanto a resumen como detalle y COUNT. No usar el orden de la primera fila cronológica como máximo de ingreso. Ese techo no congela actualizaciones ni commits tardíos; ante cambios conocidos o restore se invalidan cursores y se vuelve a primera página. No mantener transacciones abiertas entre clics ni afirmar una vista inmutable entre solicitudes sin un mecanismo adicional. La exactitud se garantiza por solicitud y bajo la misma historia para invariantes entre fechas.

## UX y restricciones

Vista nueva dentro de Stock: **Stock actual / Stock por fecha**, selector compacto, tabla Baba/Seco/Maracuyá con Stock inicial, Entradas, Salidas, Stock final; debajo, detalle del día y paginador 10/25/50/100. Diferenciar fecha operativa de hora registrada; antes de la carga inicial no presentar cero como inventario físico históricamente acreditado.

Endpoint de lectura dedicado a resumen pequeño + página; no llamar estado/datos/Snapshot global. Consultar solo al abrir la vista o cambiar fecha/página/tamaño (reintento explícito ante error). Sin timers/polling, sin consultas nuevas al arrancar, sin cálculo histórico React ni descarga completa. Preservar Stock actual y sus optimizaciones. La propuesta no elimina usos preexistentes de Snapshot fuera del módulo nuevo.

## Invariantes y riesgos a validar después

1. Final(D)=Inicial(D)+Entradas(D)-Salidas(D) para cada producto, con NUMERIC.
2. Final(D)=Inicial(D+1) bajo la misma historia, sin cambios concurrentes entre lecturas.
3. Final(hoy)=existencias actuales si no hay efectos futuros y la historia está conciliada. En general, existencias = Final(hoy) + efectos posteriores a hoy + diferencia de conciliación. Una diferencia no explicada bloquea certificar reconstrucción.
4. La anulación actual conserva el original y afecta solo el día en que se registra la compensación. No aplicar el estado actual de la operación para borrar efectos pasados.
5. Conversión: Baba disminuye salida_qq y Seco aumenta entrada_qq; peso físico posterior no modifica ninguno.
6. Conciliar suma normalizada de TODA la historia contra existencias, inventariar tipos reales/conversion_id y revisar fechas fuera de rango. La migración v2 no acredita esa igualdad. No corregir diferencias con movimientos o fechas inventados.
7. Probar carga inicial, día vacío, límites de medianoche Guayaquil, horas empatadas, bigint grande, operación retroactiva/futura, anulaciones otro día y paginación sin duplicados/omisiones. Distinguir legado de flujos actuales.

No se certificaron datos reales, planes de ejecución, latencias ni exactitud contable de una instalación concreta. Tampoco se reconstruye costo promedio histórico. Código permite fechas elegidas y metadatos mutables; la historia de cantidades no equivale a una bitácora inmutable de todo lo visto antes.

## Siguiente paso exacto

Revisar este dictamen y autorizar una etapa de validación/implementación de Stock por fecha con semántica de fecha operativa. Primero conciliar en solo lectura una base representativa y clasificar legado; medir en copia aislada la consulta propuesta y el índice candidato. Con esos resultados, resolver adopción de 011 y desarrollar endpoint SQL + DTO + vista paginada, conservando los flujos actuales. **No iniciar implementación bajo la autorización de esta auditoría.**

Control final: revisión de los dos documentos y `git diff --check`; sin pruebas de aplicación porque no se cambió código. Sin migración, índice, seed, build, commit ni push.
