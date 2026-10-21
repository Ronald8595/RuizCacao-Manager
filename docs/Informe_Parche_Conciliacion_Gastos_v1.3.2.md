# Parche de conciliación y fechas de Gastos — 1.3.2

Actualizado: 20/10/2026. Rama: `feature/respaldos-restauracion`. Continuación del árbol existente, sin reset ni descarte. El cambio previo de `package.json` a 1.3.2 y el informe del usuario se conservaron.

## Alcance y estado

**Ampliación posterior autorizada (20/10):** fechas independientes de compra/venta y pago/cobro, más trazabilidad en Reportes/PDF, documentadas en [Informe_Trazabilidad_Financiera_v1.3.2.md](Informe_Trazabilidad_Financiera_v1.3.2.md). Los resultados siguientes corresponden al parche de Gastos/reproducción ya cerrado; las afirmaciones de «sin cambios SQL/PDF» describen ese alcance anterior. La ampliación conserva importes y reglas, añade fechas y presentación, con evidencia nueva en `evidencias-fechas-independientes-1.3.2/`.

La fecha manual de nuevos gastos está corregida y probada. La conciliación general se verifica con fixtures aislados. **El origen real de los $3.271,36 del cliente NO está confirmado**. No se requieren datos privados para completar este parche: el usuario confirmó que el respaldo de producción no está disponible y pidió continuar sin solicitarlo de nuevo.

No se conectó la base comercial ni se reescribieron históricos. Sin cambios en consultas financieras, PDF, cálculos de compras/ventas/abonos, anulación, stock, restauración 1.3.1, migraciones 001–010 o migración 011. Sin nuevos Snapshot, timers, polling ni trabajo al arranque. No build, commit, push, tag ni release.

## Evidencia real disponible y sus límites

Se revisaron el informe original, las siete imágenes y cinco fotogramas del video original de 11,798 segundos (1280×720). Las imágenes y el video originales permanecen en `../evidencias/`, intactos. Los fotogramas derivados y los resultados están en `docs/evidencias-conciliacion-1.3.2/`.

La suma visual es consistente: $3.695,40 + $3.271,36 = $6.966,76; más $190,00 de gastos da salidas de $7.156,76 y resultado de caja de −$7.156,76 con ingresos cero. Esto demuestra la aritmética visible, **no** la procedencia o unicidad de los movimientos de producción.

| Etiqueta visible | Producto | Importe | ID compra/cuenta/movimiento y fecha de origen |
| --- | --- | ---: | --- |
| Compra 38 | Cacao Seco | 600,00 | No disponibles; no inferidos |
| Compra 39 | Cacao en Baba | 171,36 | No disponibles; no inferidos |
| Compra 20 | Cacao Seco | 1.500,00 | No disponibles; no inferidos |
| Compra 18 | Cacao Seco | 1.000,00 | No disponibles; no inferidos |
| Total adicional observado | | 3.271,36 | Conciliación real pendiente |

Los $190 visibles corresponden a cuatro líneas: Transporte $10, Transporte $60, Otros $100 y Otros $20. Sus observaciones se ven en el video; no se transcriben como identificadores. Sin IDs/fechas del origen no se certifica su conciliación individual ni se atribuyen a una jornada distinta.

Antes de recibir la aclaración sobre producción se verificó el `.back` local `../backups/RuizCacao_2026-10-19_22-37.back`: 3.094.778 bytes, SHA256 `2abb16f38a3aa34158fbf16776672cd1e5905d39479ad0c3f2b694ade35ed5b9`, idéntico antes/después. Se verificaron paquete/manifiesto/hash, se hizo una copia privada y se restauró sin normalización/migraciones en un motor temporal. Todas las consultas de diagnóstico se ejecutaron en `REPEATABLE READ READ ONLY`, confirmado `transaction_read_only=on`.

Ese archivo contiene 10.014 compras, 13.019 gastos y 16.695 movimientos, con fechas máximas 27/09/2026. No tiene operaciones del 19/10 y **no representa el caso de las capturas**. El `PASS` de `conciliacion-real.json` acredita únicamente la ejecución del diagnóstico y la integridad del archivo: no acredita una conciliación del cliente. No se harán nuevas consultas privadas. El motor quedó detenido; la carpeta temporal se registra en la evidencia.

## Revisión financiera

`registrarCompra` asigna `numeroCompra` por fecha. Dos compras de días distintos pueden compartir número; las relaciones usan `compras.id → cuentas.compra_id → movimientos_cuenta.cuenta_id`. La prueba crea dos números 1 con IDs distintos.

`fuenteFinanciera` en `src/main/database/listados.ts` obtiene cada pago una vez desde `movimientos_cuenta`, une su cuenta por PK y la compra/venta de origen por PK. Filtra `m.tipo='Abono'`, cuenta no anulada y **fecha del movimiento**, no fecha de compra. Los gastos automáticos asociados a compras no se suman nuevamente: la segunda rama del `UNION ALL` incluye solo gastos manuales. Agregado, detalle paginado y documento completo comparten esta fuente. Se conserva SQL keyset y exportación completa.

La vista canónica `v_flujo_caja` coincide con el reporte en los fixtures de abonos, gastos y anulaciones. La variante histórica admitida por restauración 1.3.1 tiene una semántica diferente ya documentada: incluye cuentas anuladas y movimientos `Ajuste por devolución` con signo inverso. El reporte actual los excluye. La regresión reproduce explícitamente esa diferencia en una transacción aislada y la revierte. **No se afirma que ambas variantes sean equivalentes ni se cambia una por otra**. Esta divergencia preexistente no prueba el origen de los $3.271,36; revisar cualquier cambio futuro de política financiera por separado con evidencia y autorización.

No se detectó doble contabilización en los escenarios probados. Sin el historial del cliente no puede descartarse ni demostrarse una anomalía particular en sus registros.

## Causa y corrección de fecha

1. El campo `Fecha` del modal estaba siempre `disabled`, sin `onChange`.
2. `crearGastoManual` reemplazaba `data.fecha` por `jornadaHoy.fecha`, incluso cuando Main recibía otra fecha válida.
3. El fallback de fecha de UI usaba UTC mediante `toISOString().slice(0,10)`, que podía adelantar el día respecto a Guayaquil.

El selector ahora se habilita **al crear** y transmite la fecha elegida. La jornada activa sigue siendo el valor inicial y sigue siendo obligatoria para registrar. La función compartida `errorFechaGasto` valida calendario, obligatoriedad y que no sea posterior a hoy en `America/Guayaquil` (el gasto representa dinero ya pagado). UI y dominio usan la misma regla; Main conserva su validación de argumentos. No hay nuevo canal IPC.

El recorrido es: `GastoFormModal → crearGastoManual del contexto → datos:ejecutar → validarArgumentos → dominio → guardarRegistro → gastos.fecha`. No se añade conversión de zona horaria al campo SQL `date`. `fecha_hora_registro` conserva el instante real UTC generado al registrar, aunque la fecha efectiva sea pasada. Los filtros y reportes existentes usan `gastos.fecha`.

La edición conserva su política previa: fecha original deshabilitada e inmutable en dominio; no se modifican fechas históricas indirectamente. Se mantiene el requisito de jornada, la validación de sesión y el bloqueo de jornada interrumpida. Un gasto retroactivo modifica los resultados consultados de su fecha efectiva; no reabre ni cambia el estado de esa jornada.

## Regresiones y evidencia

| Comprobación | Resultado |
| --- | --- |
| Reproducción previa `gastos-fecha-dominio.cjs` | FAIL esperado, código 1: solicitada 25/09, guardada 26/09 |
| Dominio corregido | PASS, código 0: fecha, instante real, inválidas, edición y jornada |
| Medianoche Guayaquil | PASS: 04:59:59.999Z y 05:00Z pertenecen a días consecutivos; bisiestos válidos/inválidos |
| `node tests/run.cjs --solo-conciliacion` | PASS, código 0; motor temporal `ruizcacao-tests-xjS4XC` detenido |
| `node tests/gastos-fecha-ui.cjs` | PASS, código 0; formulario real, StrictMode, cambio/submit, futuro bloqueado, edición protegida y desmontaje; sin capturas |
| `npm run typecheck` | PASS, código 0; `typecheck.txt` |
| `npm run lint -- --no-cache` | PASS, código 0; 0 errores, 863 advertencias previas; `lint.txt` |
| `npm run db:test` | Primer recorrido código 1 por expectativa histórica en v3 (27 frente a 20); tramos previos PASS |
| `npm run db:test -- --desde-suite=v3.cjs` | PASS, código 0: v3 (24 pruebas), rc (14) y postgres-local; `db-test-continuacion-resultado.json`. Suite previa completada por tramos |
| `git diff --check` | PASS, código 0; cierre en `diff-check.txt` |

Lint inicial falló únicamente por seis imports CommonJS del auxiliar de video ubicado bajo docs. Se movió a `tests/revisar-evidencia-video.cjs`, donde aplica la configuración existente para scripts de prueba. Se conserva `lint-inicial.txt`. `.eslintcache` fue retirado automáticamente por el `--no-cache` solicitado. La interacción Electron produjo mensajes de GPU al cerrar; las aserciones y el código de salida fueron 0.

El primer recorrido general terminó con código 1 en `v3.cjs`: otra aserción posterior todavía suponía que el gasto de $7 elegido para hoy se guardaba ayer. Se corrigió el oráculo a gastos $27 y saldo $63, incluidos sus importes PDF. No se cambió lógica de producción para hacer pasar la prueba. Los tramos anteriores ya aprobados se conservan; `--desde-suite=v3.cjs` ejecuta explícitamente las tres suites pendientes en un motor temporal nuevo, después de comprobar que el anterior cerró. El log de continuación se identifica como parcial, sin ocultar el primer resultado ni afirmar una ejecución completa única de código 0.

Fixture financiero: ayer se crean compras por $100 pendiente, $100 con pago inicial $20 y $100 pagada. Hoy se crea una compra pagada de $50 y se abonan $30 y $40 a las dos anteriores. Pagos de ayer $120; pagos de hoy $120, frente a compras registradas hoy $50. Cada pago inicial y cada abono aparece una sola vez. Gastos efectivos ayer $10 y hoy $20, con timestamp real de hoy. Se comparan SQL, vista canónica y HTML del generador de PDF diario/semanal/mensual. Anular la compra parcial excluye $20 de ayer y $40 de hoy, sin tocar gastos. Una devolución de $2 confirma la diferencia histórica de vista descrita arriba. Un proceso Node nuevo inicia BaseLocal, hace Login y recupera fechas, importes e instantes idénticos. No se certifica aquí el aspecto visual de un PDF impreso.

## Archivos y efectos secundarios

- Producción: `src/renderer/src/pages/Gastos.tsx`, `src/shared/dominio.ts`, nuevo `src/shared/fechaGasto.ts`.
- Regresiones: `tests/gastos-fecha-dominio.cjs`, `tests/conciliacion-gastos.cjs`, `tests/gastos-fecha-ui.cjs`; `tests/run.cjs` incorpora las dos primeras, la opción focalizada y la continuación explícita por suite; `tests/v3.cjs` actualiza la expectativa antigua que forzaba la jornada y sus totales posteriores, conservando la aserción del estado de jornada. Nuevos `tests/reproduccion-cliente.cjs` y `tests/reproduccion-cliente-ui.cjs`, ejecutables mediante las opciones explícitas `--reproduccion-cliente` y `--reproduccion-solo-b`; no se añaden a cada ejecución general ni al arranque.
- Auxiliares manuales: `tests/conciliar-respaldo.cjs` (no se ejecuta por db:test ni arranque), `tests/revisar-evidencia-video.cjs`.
- Documentación: este informe, `docs/ESTADO_CONTINUIDAD_ESCALABILIDAD.md` y evidencias 1.3.2. El informe original recibido no se modifica.
- Preexistente: `package.json` 1.3.2. Se sincronizaron únicamente las dos versiones del paquete raíz en `package-lock.json` a 1.3.2; dependencias y hashes intactos. Esto no genera ni publica una release.

## Reproducción observada en PostgreSQL y Electron — 20/10/2026

**A PASS / B PASS / C PASS.** No se encontró doble contabilización en los fixtures. No fue necesario cambiar código financiero, consultas ni PDF. Se conserva la corrección anterior de fecha de Gastos. La reproducción ejecuta `BaseLocal.ejecutar`, el dominio real, validación, persistencia y SQL en bases nuevas de un motor temporal. Antes de conectar se verifica por `realpath` que `data_directory` pertenezca al motor de `tests/run.cjs`. No se consulta la base habitual.

Se volvieron a revisar las siete capturas originales y los fotogramas extraídos del video. Las veinte filas legibles se transcribieron sin sustituir cantidades o totales:

| N.º del 19/10 | Producto | qq | Total |
| --- | --- | ---: | ---: |
| 1 | Baba | 0,67 | 40,70 |
| 2 | Baba | 0,43 | 26,66 |
| 3 | Baba | 1,38 | 84,00 |
| 4 | Baba | 3,96 | 71,00 |
| 5 | Baba | 0,45 | 27,78 |
| 6 | Baba | 1,90 | 117,29 |
| 7 | Baba | 0,53 | 33,00 |
| 8 | Baba | 1,08 | 68,04 |
| 9 | Baba | 0,29 | 23,20 |
| 10 | Baba | 0,60 | 41,58 |
| 11 | Baba | 0,32 | 20,00 |
| 12 | Baba | 0,44 | 27,00 |
| 13 | Seco | 0,24 | 51,00 |
| 14 | Seco | 7,05 | 1.519,98 |
| 15 | Seco | 0,84 | 180,60 |
| 16 | Seco | 2,74 | 522,57 |
| 17 | Seco | 2,74 | 589,00 |
| 18 | Seco | 0,58 | 122,00 |
| 19 | Seco | 0,30 | 21,00 |
| 20 | Seco | 0,52 | 109,00 |
| **Baba: 12** | | **12,05** | **580,25** |
| **Seco: 8** | | **15,01** | **3.115,15** |
| **Total: 20** | | **27,06** | **3.695,40** |

Proveedor observado: GALO RUIZ. Las capturas muestran esas compras pagadas. Para el escenario A se pagan íntegramente al registrar; esa distribución como pago inicial es una hipótesis de reproducción, no una reconstrucción del historial original. Precio unitario `total/qq` e impuesto 0 son auxiliares sintéticos porque no se ven en las capturas. Se verificó el total persistido por operación; no se atribuyen al cliente esos precios/retenciones. Administrador de prueba `Fixture`, IDs, timestamps y observaciones son sintéticos.

### A: cuatro compras anteriores hipotéticas

Se crean cuatro compras pendientes el **18/10/2026**, de 1 qq cada una y por los siguientes importes. Fecha, cantidad, total de origen, numeración y relación con el abono son hipótesis explícitas. Se aplica un único abono el 19/10 a cada una:

| Etiqueta observada del pago | Producto / pago observado | Compra hipotética del 18/10 |
| --- | --- | --- |
| Compra N.º 38 | Seco / 600,00 | N.º 1, total 600,00 |
| Compra N.º 39 | Baba / 171,36 | N.º 2, total 171,36 |
| Compra N.º 20 | Seco / 1.500,00 | N.º 3, total 1.500,00 |
| Compra N.º 18 | Seco / 1.000,00 | N.º 4, total 1.000,00 |

No se inventaron otras 35 compras para forzar numeraciones no conocidas. Las etiquetas originales se conservan separadas en `datos-observados.json`; el PDF del fixture muestra sus números de prueba. No se afirma que el pago «20» corresponda a la compra «20» del día, ni que pertenezca a la hipotética «3» en producción.

Las veinte compras nuevas más los cuatro abonos producen **24 movimientos SQL con IDs únicos**. `movimientos-A.json` registra movimiento, cuenta, compra, fecha, producto, cantidad, importes y estado. `conciliacion-por-id.json` coteja las 24 compras con sus movimientos: una aplicación por importe, saldos cero, cero diferencias en centavos. Las veinte compras del día se recuperan desde `historialCompras` y la pantalla real, con cantidades y subtotales exactos.

| Concepto | Diario 19/10 | Semana 19–25/10 | Octubre |
| --- | ---: | ---: | ---: |
| Compras **registradas el 19/10** (referencia distinta de pagos) | 3.695,40 | — | — |
| Pagos efectivos Baba | 751,61 | 751,61 | 751,61 |
| Pagos efectivos Seco | 6.215,15 | 6.215,15 | 6.215,15 |
| Total pagos efectivos | 6.966,76 | 6.966,76 | 6.966,76 |
| Gastos operativos | 190,00 | 190,00 | 190,00 |
| Ingresos | 0,00 | 0,00 | 0,00 |
| Resultado de caja | **−7.156,76** | **−7.156,76** | **−7.156,76** |

Los cuatro gastos son Transporte 10/60 y Otros 100/20, creados por la UI real con PostgreSQL, fecha 19/10 y observaciones `Fixture UI …`. Se comprueban Reportes SQL con páginas 10/15/25/50/100: cada recorrido devuelve 28 IDs distintos (24 pagos + 4 gastos), los mismos agregados y PDF completo. No se multiplica ningún movimiento al hacer JOIN ni UNION ALL. No se cambia la paginación ni se agrega agrupación al Renderer.

### B: límites e inconsistencias

Base separada: compra de 100 con pago inicial 20, abonos 30 y 50. Estados parcial (pagado 50/saldo 50) y cerrado (100/0); el intento adicional de 1 es rechazado y quedan exactamente tres movimientos, suma 100. Otra compra pendiente de 200 comparte N.º 1 en una fecha diferente con ID distinto; permanece pendiente y sin pagos.

Anular la primera conserva los tres movimientos como trazabilidad, cambia la cuenta a `anulado` y excluye sus 100 del reporte. La compra pendiente no admite `Ajuste por devolución`. En una cuenta manual de deuda 10, un ajuste por devolución 2 reduce el saldo a 8 y deja estado parcial, sin sumar dinero efectivo en Reportes. Es la política actual; no se modela como reembolso de efectivo ni se altera la vista histórica. Evidencia por IDs antes/después en `escenario-B.json`.

### C: interfaz, cierre y reapertura

Se ejecutan en Electron las páginas reales **Gastos, Compras y Consultas**, `AppDataProvider`, validadores y SQL, con un transporte IPC de prueba que invoca `BaseLocal`. No son mocks de filas. Se crean los cuatro gastos desde el modal, seleccionando 19/10, se filtran y se verifica su registro SQL. El timestamp queda dentro del tiempo real de creación del 20/10, no se convierte en el 19/10. Se bloquea una fecha futura sin insertar la quinta fila.

Después se cierra el proceso Electron y su sesión/base; un proceso nuevo con perfil temporal nuevo inicia sesión en esa misma base temporal. Se comparan los cuatro IDs, fechas, categorías, montos, observaciones y timestamps byte a byte en JSON: idénticos. Se vuelven a consultar las pantallas y generar los tres PDF. Evidencia: `gastos-antes-reinicio.json`, `ui-crear.json`, `ui-reabrir.json` (PIDs diferentes).

Los seis PDF binarios se generaron mediante Chromium desde el HTML de producción, usando el botón real de Consultas. La extracción independiente confirma **24 pagos y cuatro gastos en dos páginas** y los totales anteriores en todos. Las dos páginas del diario fueron renderizadas e inspeccionadas: legibles y sin filas cortadas/omitidas. `pdf-verificacion.json`, HTML, PDF, texto y dos PNG están en `docs/evidencias-conciliacion-1.3.2/reproduccion/`. El PDF conserva su formato monetario previo `6,966.76`; la UI usa `6.966,76`; los valores coinciden.

Límite: el arnés monta páginas/contexto de producción, no el instalador ni todo el shell, y no certifica diseño responsive/zoom (no se repitió esa batería). La sesión se autentica por `BaseLocal.login`; esta prueba no sustituye la aceptación del formulario Login del instalador. Esbuild transpila solo el arnés de pruebas temporal; no se ejecutó build de aplicación.

### Códigos y cierre recuperable

- Suite previa general: primer código **1** en el oráculo antiguo de v3; continuación v3/rc/postgres-local **0**. Todos sus tramos completados, sin repetir suites aprobadas.
- Nueva reproducción, intento 1: **1**, selector erróneo del arnés (100 en Compras, que ofrece hasta 50). Corregido a 25; log preservado.
- Nueva reproducción, intento 2: **A y C PASS**, luego código **1** porque la aserción del sobrepago esperaba otro texto. La aplicación sí rechazó correctamente el sobrepago. Log `reproduccion-prueba.txt` preservado.
- Continuación exclusiva **B código 0**, `npm run db:test -- --reproduccion-solo-b`; no se repitieron A/C. `reproduccion-b-resultado.json`. No se presenta el intento anterior como una ejecución única de código 0.
- Typecheck **0 reutilizado**: SHA256 de las tres fuentes productivas idéntico a la ejecución válida anterior; `typecheck-reutilizado.json`.
- Lint final **0**, **0 errores / 863 advertencias preexistentes**, `lint-cierre-resultado.json` y `lint-cierre.txt`. Los nuevos arneses se formatearon.
- Procesos propios residuales **0** tras cierre; consulta Windows de solo lectura en `procesos-reproduccion.json`. Solo permanece el servicio PostgreSQL ajeno, con los mismos PIDs anteriores, que no se detuvo.

Las bases de fixture se eliminaron mediante sus nombres generados/verificados y los motores temporales se detuvieron en `finally`; los artefactos de diagnóstico temporales se conservaron. Sin procesos activos de la reproducción. Las evidencias de A/C se mantienen sin sobrescribir al continuar B.

**Dictamen:** escenario legítimo demostrado en fixture; importes observados reproducidos; no se demuestra la identidad, procedencia ni integridad de los movimientos originales. Origen real de **$3.271,36: NO CONFIRMADO**. Los registros del cliente siguen fuera del alcance y no se solicitan de nuevo. 1.3.2 queda preparada para revisión y aceptación manual, no publicada.

## Aceptación manual del candidato, antes de publicar

Usar exclusivamente una instalación/perfil de prueba y datos sintéticos; no realizar estas operaciones en producción.

1. Abrir jornada y crear gasto de Transporte $10 con fecha de ayer. Verificar que el selector permita cambiarla y que el valor se guarde.
2. Crear gasto de hoy por $20. Confirmar que fecha vacía, inválida o futura no se acepte y que no se registre un gasto sin jornada activa.
3. Filtrar Gastos por ayer y hoy: deben aparecer $10 y $20 respectivamente. Abrir edición y comprobar que se conserve la fecha original.
4. Consultar reportes diarios de ambos días y los intervalos semanales/mensuales correspondientes. Comprobar mismos importes en PDF completo y que no dependan de la página visible.
5. Cerrar y reabrir la aplicación de prueba, entrar con el usuario de prueba y comprobar fechas/valores persistidos. Para el instante real, contrastar el registro de prueba con su creación, no con la fecha efectiva pasada.
6. Reproducir las cuatro compras y dos abonos descritos en el fixture. Hoy debe mostrar pagos $120 aunque las compras nuevas sumen $50. Revisar operaciones por fecha e ID, nunca solo por número diario.
   Para la reproducción ampliada, usar los veinte importes de la tabla y las cuatro compras anteriores hipotéticas: el 19/10 debe mostrar compras registradas $3.695,40, pagos efectivos $6.966,76, gastos $190 y resultado −$7.156,76. No importar estos datos en producción ni tratar sus IDs como originales.
7. Anular en la instalación de prueba la compra parcial y comprobar pagos de ayer $100 y hoy $80; los gastos siguen $10/$20. Conservar el historial de abonos como hace la aplicación actual.
8. Comprobar el modal en la ventana habitual y zoom 125% y el PDF generado/impreso. Esta aceptación visual no sustituye las pruebas automáticas ya aprobadas ni requiere repetir una batería de capturas.

Pendiente del caso del cliente: identificar mediante evidencia autorizada sus cuatro movimientos/compra/cuenta/fecha/saldos y los cuatro gastos. Se mantiene **NO CONFIRMADO**, sin nueva solicitud de respaldo o credenciales. Este pendiente no bloquea la revisión y aceptación del parche de fechas. Publicación requiere aprobación humana y un ciclo de build/pruebas manuales autorizado posteriormente.
