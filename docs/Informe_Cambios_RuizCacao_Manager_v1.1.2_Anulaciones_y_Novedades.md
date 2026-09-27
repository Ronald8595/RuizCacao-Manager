# RuizCacao Manager 1.1.2: anulaciones y novedades

Fecha: 26 de septiembre de 2026. Organización: Grupo Ruiz.

| Elemento | Inicial | Final implementado |
| --- | --- | --- |
| Aplicación | 1.1.1 | 1.1.2 |
| Esquema PostgreSQL | 6 | 7 |
| Migración nueva | — | 007-anulaciones.sql |
| Tablas nuevas | — | Ninguna |

**Estado de entrega:** implementación terminada en el código. Typecheck, lint, preflight y pruebas independientes de PostgreSQL ejecutados. La ejecución de la suite PostgreSQL y la comprobación de interfaz quedan a cargo del usuario, según su última instrucción. No se afirma que la base real haya sido migrada ni que las pruebas de integración hayan pasado.

## 1. Alcance y conservación

Se implementaron exclusivamente anulaciones de compras/ventas y novedades posteriores al login, junto con su integración y pruebas. No se trabajó en mejoras de campanita, paginación, escalabilidad ni migración web. No se cambió autor ni copyright. No se actualizaron dependencias.

La carpeta no es un repositorio Git: git status devolvió «not a git repository». Para identificar los cambios se conservó una referencia previa de los archivos y se compararon sus contenidos. No se ejecutó reset, checkout ni clean.

No se ejecutaron migraciones sobre la base del cliente ni se borraron, reconstruyeron o sembraron datos reales. Las pruebas PostgreSQL están diseñadas para crear bases efímeras aisladas y eliminarlas al finalizar; no leen la conexión protegida de la aplicación.

## 2. Migración 007 y compatibilidad v6

Implementación: [src/main/database/migracion-siete.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/main/database/migracion-siete.ts>). Exportación SQL: [database/007-anulaciones.sql](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/database/007-anulaciones.sql>).

En **compras** y **ventas** se agregan:

| Columna | Tipo/regla |
| --- | --- |
| estado | text NOT NULL DEFAULT 'vigente'; admite vigente/anulada |
| anulada_en | timestamptz nullable |
| anulada_por_usuario_id | uuid nullable; referencia a usuarios(id) |
| anulada_por_nombre | text nullable |
| motivo_anulacion | text nullable |

Las compras que tienen una cuenta asociada ya anulada en 1.1.1 reciben estado anulada. Se recuperan el motivo y el instante conocido en la cuenta; **no se inventa el autor** de una anulación antigua. Tampoco se inventan devoluciones monetarias de operaciones antiguas: si no existían, la migración no agrega pagos ficticios. Las compras normales y ventas existentes quedan vigentes.

La migración no cambia importes, fechas comerciales, comprobantes, existencias, usuarios ni hashes de contraseña. Conserva las tablas y agrega dos triggers y una función para impedir UPDATE de los datos originales y DELETE físico de compras/ventas. Solo se permite completar los metadatos de anulación; una operación ya anulada no puede reactivarse ni cambiar sus datos.

El mecanismo de arranque aplica la versión 7 después del respaldo previo obligatorio y dentro de la transacción de migración existente. Un fallo revierte la migración y mantiene la versión anterior. Se actualizó también la verificación de versión de las herramientas pgAdmin/QA para que no rechacen el esquema nuevo. El exportador mantiene las migraciones históricas protegidas contra sobrescritura.

**Compatibilidad:** diseñada para actualizar una instalación existente en v6 sin reinicializarla. La prueba automatizada v6→v7 está implementada con datos previos y comprobaciones de preservación; su ejecución efectiva queda pendiente en la terminal del usuario. Esta compatibilidad no se presenta como validada sobre su base real.

## 3. Inmutabilidad de operaciones confirmadas

Se eliminaron el botón de edición, el estado/modo de edición del formulario, la función de dominio actualizarCompra y los comandos actualizarCompra/eliminarCompra. No existe comando de edición o borrado de ventas. Las solicitudes antiguas o manipuladas son rechazadas por la lista permitida de comandos en Main.

El guardado relacional ya no permite eliminar compras ni los registros asociados mediante las excepciones antiguas de corrección. Los triggers de la versión 7 ofrecen protección adicional en PostgreSQL.

Los abonos posteriores actualizan la cuenta y sus movimientos; **ya no reescriben la venta confirmada**. La tabla de Ventas obtiene su estado de cobro actual desde la cuenta. Los valores originales de la venta y su comprobante permanecen estables.

Se añadieron vistas de consulta mediante el botón Ver para compras/ventas, incluyendo datos originales y, cuando corresponda, fecha, responsable y motivo de anulación.

## 4. Flujo de anulación de compra

1. Seleccionar una compra del historial, incluso de una fecha anterior.
2. Pulsar Anular compra.
3. Mostrar «¿Está seguro de anular esta compra?» y la referencia de la operación.
4. Pedir motivo obligatorio y contraseña del usuario conectado.
5. Cancelar no envía ninguna solicitud. Confirmar invoca el canal específico de anulación.
6. Main comprueba identidad, contraseña, operación y jornada activa con fecha del día actual.
7. Verificar que el inventario disponible cubra toda la cantidad originalmente comprada.
8. En una sola transacción: marcar compra y cuenta como anuladas; agregar salida compensatoria de stock; registrar devolución de lo realmente pagado, si corresponde; guardar auditoría e idempotencia.
9. Mostrar «Compra anulada correctamente.».

Se retiró el antiguo mecanismo de «inventario ya corregido»: nunca se omite la compensación de stock mediante una casilla. Si el stock es insuficiente, se rechaza toda la anulación. No se exige que la compra sea el último movimiento del producto.

## 5. Flujo de anulación de venta

El flujo es equivalente, con «¿Está seguro de anular esta venta?» y «Sí, anular venta». La cantidad originalmente vendida se devuelve al stock mediante una entrada compensatoria. La cuenta queda anulada. Si hubo cobros, se agrega una devolución financiera por el importe efectivamente recibido que todavía no haya sido devuelto.

La fecha, el autor, la numeración y los importes de la venta original se conservan. El responsable de la anulación se guarda por separado. El resultado exitoso muestra «Venta anulada correctamente.».

## 6. Stock, cuentas y gastos

**Stock:** cada anulación agrega un movimiento nuevo vinculado a la compra/venta y fechado en el día de la anulación. La compra produce salida; la venta, entrada. Se conserva el historial anterior y se evita stock negativo. Las operaciones y sus compensaciones se guardan bajo el bloqueo transaccional ya usado por el sistema.

El costo unitario promedio vigente se conserva: esta funcionalidad compensa cantidades y no introduce costeo por lotes ni reconstruye costos históricos que el sistema no almacena por venta.

**Cuentas:** la cuenta asociada pasa a anulado, conserva sus importes y movimientos históricos, y deja de representar deuda. v_saldos excluye cuentas anuladas y el saldo mostrado en la aplicación es cero para ellas. Se rechazan nuevos abonos sobre cuentas anuladas. No se borran pagos ni cobros.

**Gastos/inversión:** el gasto automático original no se elimina ni se reescribe. En Gastos se identifica su compra como anulada y se muestra pendiente cero. El resumen calcula pagos netos de compras descontando devoluciones según la fecha de cada movimiento; permite mostrar un importe negativo en un período con devoluciones de compras antiguas. Los gastos operativos siguen su flujo existente.

## 7. Pagos, cobros, devoluciones y reportes

Se registra un movimiento de tipo Ajuste por devolución por el efectivo neto de la operación: suma de Abonos menos devoluciones anteriores. Los ajustes a favor, que no representan dinero recibido/pagado, no se convierten en devoluciones de efectivo. Una operación totalmente pendiente no genera devolución monetaria.

La devolución usa la fecha/hora real de anulación. Se conserva el historial de los medios de pago para distribuir el importe de la compensación. No se reutilizan ni modifican comprobantes originales.

Se modificó **v_flujo_caja** para conservar Abonos aunque la cuenta esté anulada e incluir Ajuste por devolución con signo contrario. **v_saldos** mantiene la exclusión de cuentas anuladas.

| Ejemplo | Día original | Día de anulación |
| --- | --- | --- |
| Compra pagada | Pago proveedor -600 | Devolución proveedor +600 |
| Venta cobrada | Cobro cliente +300 | Devolución cliente -300 |

Consultas y los reportes diario, semanal, mensual y por rango usan el mismo resumen financiero. Las devoluciones tienen etiquetas propias. El PDF consume ese mismo resumen, evitando otro cálculo independiente. Los indicadores de ingreso/egreso aclaran que incluyen devoluciones. Los pagos históricos no desaparecen por cambiar el estado de la cuenta y los importes pendientes no entran en el flujo de caja.

## 8. Contraseña, auditoría y mensajes

La API específica es datos:anularOperacion, expuesta por Preload con argumentos tipados. Main obtiene el usuario de la sesión: el renderer no puede elegir al responsable. Se verifica su contraseña con el mecanismo seguro y el control de intentos existentes. Un operador debe usar su propia contraseña; la del administrador no lo sustituye.

La contraseña no se guarda en auditoría ni en la firma de idempotencia. Esta firma considera operación, motivo y usuario. Reintentar la misma solicitud confirmada no duplica stock ni dinero. Una solicitud distinta contra una operación ya anulada se rechaza.

La auditoría registra compra_anulada o venta_anulada, referencia, motivo, solicitud y usuario. Todos los cambios comerciales se confirman juntos. Los fallos de autenticación conservan el registro de intentos del mecanismo existente.

Mensajes implementados:

- La contraseña ingresada no es correcta.
- Ingresa el motivo de la anulación.
- Inicia una jornada para realizar esta anulación.
- No hay suficiente inventario para anular esta compra. Revisa el stock antes de continuar.
- Esta compra ya fue anulada. / Esta venta ya fue anulada.
- Compra anulada correctamente. / Venta anulada correctamente.
- No se pudo completar la anulación. Vuelve a intentarlo.

Los errores inesperados de este canal se registran mediante el tratamiento existente, pero el usuario no recibe SQL ni identificadores técnicos.

## 9. Novedades posteriores al login

La ventana se monta dentro de la sesión autenticada, después de un login exitoso. Presenta el título, mensaje, cuatro puntos y botón Entendido solicitados.

La clave es **ruizcacao:novedades:UUID-USUARIO:1.1.2**. Solo al pulsar Entendido se guarda visto. Otra sesión del mismo usuario no la vuelve a mostrar; otro UUID tiene su propio registro. Una versión futura utiliza una clave distinta. La versión se obtiene de package.json mediante src/shared/version.ts.

Si localStorage no está disponible o no permite escribir, la ventana puede cerrarse con Entendido y se usa una marca en memoria durante la ejecución actual. No se bloquea permanentemente la aplicación. Si el almacenamiento falla, se borra o se usa otro perfil local, no es posible garantizar la marca entre reinicios: podría mostrarse otra vez. No se agregó ninguna tabla ni columna para novedades.

## 10. Pruebas y resultados

| Comprobación | Resultado |
| --- | --- |
| npm run typecheck | Aprobado: Main/Preload y renderer sin errores |
| npm run lint | Código de salida 0; 0 errores y 894 advertencias; 0 advertencias en los archivos de este cambio |
| node tests/anulaciones-dominio.cjs | Aprobado: 6 escenarios compra/venta × pendiente/parcial/completo y sus validaciones |
| node tests/novedades.cjs | Aprobado: usuario/versión, persistencia, próxima versión y fallo de almacenamiento |
| npm run db:sql | Aprobado; exportación 007 y conservación exacta de 001–006 |
| npm run db:test | No llegó a ejecutar la suite: arranque del motor temporal bloqueado por Windows |
| npm run release:preflight | Aprobado con advertencias de lint; verifica pública, motor, tipos, lint y distribución |
| Prueba visual de modales, PDF y aplicación actualizada | Pendiente de ejecución por el usuario |
| Migración sobre la base real del cliente | No ejecutada desde este entorno |

El preflight registró 895 advertencias en su ejecución; después del ajuste final de formato de una prueba, lint dejó 894. Las restantes corresponden a archivos ajenos a esta entrega y no se modificaron para ampliar artificialmente el alcance.

El error del entorno PostgreSQL fue **pg_ctl: could not create restricted token: error code 87**. No es un resultado de las pruebas de negocio: el servidor temporal no arrancó. El usuario indicó que ejecutará los comandos en su terminal habitual. No se eliminaron pruebas ni se ocultó este bloqueo.

### Pruebas PostgreSQL preparadas

[tests/anulaciones-v7.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/tests/anulaciones-v7.cjs>) construye un esquema v6 con registros históricos y comprueba:

- Fallo durante migración: rollback de columnas y conservación de versión 6.
- v6→v7 sin pérdida de datos, stock, usuarios/hashes, fechas o comprobantes; sin tablas nuevas.
- Reconocimiento de compras ya anuladas en 1.1.1.
- Anulación histórica de compra y venta, conservación de caja del día anterior y comparación entre vista SQL y reportes.
- Rechazo de edición, comandos antiguos y eliminación física.
- Motivo obligatorio y contraseña del operador; rechazo de la contraseña del administrador.
- Compras y ventas pendientes, con abono posterior y pagadas completamente.
- Autor original y autor de anulación distintos.
- Reintentos concurrentes sin duplicación y rechazo de una segunda anulación.
- Stock insuficiente; rechazo sin cambios parciales.
- Fallo forzado de escritura que revierte operación, cuenta, dinero e inventario.
- Jornada cerrada o jornada activa de una fecha anterior.
- Persistencia al reiniciar.

La suite existente conserva sus pruebas de stock inicial, ajustes, conversión, abonos, usuarios, reportes, respaldos y migraciones anteriores. Se actualizó la prueba antigua de edición de compras para exigir ahora su rechazo y comprobar la anulación compensatoria; no se suprimió el escenario comercial.

## 11. Pasos de validación a cargo del usuario

Desde electron-app:

~~~powershell
npm run typecheck
npm run lint
npm run db:test
npm run release:preflight
~~~

Después de aprobar la suite aislada, comprobar la aplicación actualizada con una copia de seguridad disponible. El arranque conserva el mecanismo de respaldo previo a migración. No ejecutar 007 manualmente de forma aislada ni modificar el historial de versiones desde pgAdmin.

En pgAdmin, [database/verificacion.sql](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/database/verificacion.sql>) permite revisar versión, columnas, estados y vistas. Comprobar además los ejemplos de -600/+600 y +300/-300 en días separados, el rechazo de contraseña incorrecta y la ventana de novedades entrando con dos usuarios. Cancelar una anulación debe conservar todo; pulsar Entendido debe persistir la lectura de novedades.

No se generó ni se declara validado un instalador 1.1.2 en esta entrega. El preflight no sustituye la prueba de instalación ni la prueba de la aplicación empaquetada.

## 12. Problemas encontrados y soluciones

| Hallazgo | Solución |
| --- | --- |
| Existía edición de compras confirmadas | Retiro de UI, función y comando; protección relacional |
| La anulación anterior exigía la misma jornada y podía omitir stock | Compensación obligatoria con stock suficiente y jornada actual |
| Reportes borraban del cálculo pagos de cuentas anuladas | Preservar Abonos y agregar devoluciones por fecha |
| Abonos reescribían el estado/saldo de la venta original | Derivar el estado vigente desde la cuenta sin editar la venta |
| Riesgo de doble clic o reintento tras una respuesta perdida | Solicitud idempotente, bloqueo transaccional y comprobación de estado |
| Herramientas técnicas esperaban esquema 6 | Adaptadas a versión 7 |
| Motor temporal bloqueado por restricciones de Windows | Documentado; ejecución de integración delegada al usuario por su instrucción |

## 13. Archivos modificados

- [database/verificacion.sql](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/database/verificacion.sql>)
- [package-lock.json](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/package-lock.json>)
- [package.json](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/package.json>)
- [scripts/exportar-esquema.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/scripts/exportar-esquema.cjs>)
- [scripts/pgadmin.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/scripts/pgadmin.cjs>)
- [scripts/qa-local.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/scripts/qa-local.cjs>)
- [src/main/database/base.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/main/database/base.ts>)
- [src/main/database/ipc.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/main/database/ipc.ts>)
- [src/main/database/relacional.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/main/database/relacional.ts>)
- [src/main/database/validacion.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/main/database/validacion.ts>)
- [src/preload/index.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/preload/index.ts>)
- [src/renderer/src/App.tsx](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/renderer/src/App.tsx>)
- [src/renderer/src/components/reportes/ReporteDiario.tsx](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/renderer/src/components/reportes/ReporteDiario.tsx>)
- [src/renderer/src/pages/Compras.tsx](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/renderer/src/pages/Compras.tsx>)
- [src/renderer/src/pages/Gastos.tsx](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/renderer/src/pages/Gastos.tsx>)
- [src/renderer/src/pages/Ventas.tsx](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/renderer/src/pages/Ventas.tsx>)
- [src/renderer/src/store/AppDataContext.tsx](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/renderer/src/store/AppDataContext.tsx>)
- [src/renderer/src/types.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/renderer/src/types.ts>)
- [src/renderer/src/utils/reportePdf.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/renderer/src/utils/reportePdf.ts>)
- [src/renderer/src/utils/reportes.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/renderer/src/utils/reportes.ts>)
- [src/shared/dominio.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/shared/dominio.ts>)
- [src/shared/persistencia.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/shared/persistencia.ts>)
- [tests/loader.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/tests/loader.cjs>)
- [tests/migracion-v2.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/tests/migracion-v2.cjs>)
- [tests/migracion-v3.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/tests/migracion-v3.cjs>)
- [tests/migracion-v5.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/tests/migracion-v5.cjs>)
- [tests/migracion-v6.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/tests/migracion-v6.cjs>)
- [tests/migracion.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/tests/migracion.cjs>)
- [tests/rc.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/tests/rc.cjs>)
- [tests/run.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/tests/run.cjs>)

## 14. Archivos nuevos

- [database/007-anulaciones.sql](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/database/007-anulaciones.sql>)
- [docs/Informe_Cambios_RuizCacao_Manager_v1.1.2_Anulaciones_y_Novedades.md](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/docs/Informe_Cambios_RuizCacao_Manager_v1.1.2_Anulaciones_y_Novedades.md>)
- [src/main/database/migracion-siete.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/main/database/migracion-siete.ts>)
- [src/renderer/src/components/AnularOperacion.tsx](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/renderer/src/components/AnularOperacion.tsx>)
- [src/renderer/src/components/DetalleOperacion.tsx](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/renderer/src/components/DetalleOperacion.tsx>)
- [src/renderer/src/components/NovedadesVersion.tsx](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/renderer/src/components/NovedadesVersion.tsx>)
- [src/renderer/src/utils/novedades.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/renderer/src/utils/novedades.ts>)
- [src/shared/anulaciones.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/shared/anulaciones.ts>)
- [src/shared/version.ts](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/src/shared/version.ts>)
- [tests/anulaciones-dominio.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/tests/anulaciones-dominio.cjs>)
- [tests/anulaciones-v7.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/tests/anulaciones-v7.cjs>)
- [tests/novedades.cjs](<C:/Users/LENOVO/Documents/VS_Proyects/RuizCacao Manager/electron-app/tests/novedades.cjs>)

No se eliminaron archivos. Las rutas de las listas corresponden al proyecto actual, no a copias de prueba ni a artefactos temporales de validación.

## 15. Integridad de migraciones históricas

**Confirmado mediante SHA-256: las migraciones 001–006 no fueron modificadas.** El exportador también comprobó que el SQL generado de las migraciones históricas coincide con sus archivos existentes.

| Archivo | SHA-256 conservado |
| --- | --- |
| 001-base.sql | ca081cc7d8de55e9a275c0412e7fc0953aac829574100ff1fe4e97c3c92dc795 |
| 002-relacional.sql | db3ea22f0af0a6f1d82289901bed2c232dd89dd964b8a97beb3e1767197e3803 |
| 003-seguridad-respaldos.sql | fbed523cce1169e1e343f66ebd051231cb636fc9eada5fbe7015f4d32787e708 |
| 004-interrupciones-umbrales.sql | 2b1af167a0e389511384475b18fb5ac43d8dddd7fe0f9498e2451c660495616a |
| 005-multiusuario.sql | b5119dcd85a6b65ff6d66743da0bdb1ca63295e74cfa7ec01307bc5a0ff4ac1a |
| 006-stock-inicial.sql | 240f8829447f4194e5d204105e7c0f305a55dd5a8687f2986105d10babaaf226 |

## 16. Pendientes conocidos

1. Ejecutar npm run db:test desde Windows sin la restricción de este entorno y revisar su resultado, especialmente v6→v7 y rollback.
2. Validar visualmente las anulaciones y la ventana de novedades tras login, logout y reinicio.
3. Comprobar los PDF de reportes con devoluciones y los comprobantes originales conservados.
4. Aprobar la actualización sobre una copia representativa de la instalación v6 antes de distribuir 1.1.2.

La implementación y este informe están entregados. La validación final de PostgreSQL y de uso real permanece explícitamente pendiente, conforme a la instrucción del usuario.
