# Diagnóstico del rechazo entre cuentas Windows — objetivo 1.3.1

Fecha: 2026-10-18. Rama: `feature/respaldos-restauracion`. Base de paquete: 1.3.0; no se generó build ni se publicó una versión.

## Estado y límite de la evidencia

**Bug reproducido con el archivo real: SÍ. Corrección: NO aplicada.** `backups/RuizCacao_2026-10-19_01-11.back` (3.094.716 bytes, SHA256 `e659724d7a0c8af95b42e849a171bc33259548fc5f28fb5503121f381c474430`) se validó en workspace aislado. Pasó el contenedor y la integridad; falló en `BACKUP_SCHEMA_MISMATCH` / `firma_catalogo`. El hash coincidió antes y después; el archivo quedó intacto.

**Causa inmediata: tres diferencias de catálogo con la referencia 001–010.** Dos objetos `constraint` de `solicitudes_recuperacion` tienen fingerprints/estructuras diferentes (FK real frente a `NOT NULL` de referencia); la vista `v_flujo_caja` también difiere en movimientos de devolución y cuentas anuladas. El detalle por campos y huellas está en `docs/evidencias-fix-restore-1.3.1/archivo-real.json`. La causa de origen del drift y su clasificación como legado legítimo o incompatible siguen pendientes. Sí se confirmó y corrigió una carencia de diagnóstico: varios fallos independientes terminaban en `invalido`, y los errores de negocio de respaldo no se registraban en el log técnico. Esta instrumentación permite obtener la comprobación concreta sin quitar controles.

La evidencia anterior `archivo-real.json` pertenecía a otro backup (SHA256 `07074668f3f18cd5d3d6981427a7bd79fbe4a18616834a02448a3a4b5358f135`) y guardaba SQL en claro; fue sustituida por un registro seguro y no se usa para atribuir la causa del archivo actual. El arnés previo generaba y restauraba datos nuevos usando el mismo código, binarios, entorno y cuenta Windows, aunque con dos userData y credenciales independientes. No cubría SID distintos, ACL de transferencia, instalación empaquetada ni un catálogo procedente de la instalación real. Su resultado positivo no explica ni invalida el reporte del usuario.

## Orígenes del mensaje anterior

`errorRespaldo` daba prioridad a `ErrorRespaldo.codigo` y a `codigoRespaldo`. En ausencia de código explícito clasificaba mensajes mediante expresiones regulares. El patrón `producto|product_id|no corresponde|no es un respaldo|manifiesto.*inválido` producía `invalido`. Antes se evalúan versión futura, modo externo, espacio y acceso bloqueado.

Los productores concretos eran la extensión seleccionada, la estructura ZIP/manifiesto en `respaldo-paquete.ts` y la frase «La estructura del respaldo no corresponde a RuizCacao» de `restore-validacion.ts`. Las frases de `restore-destino.ts` y `restore-promocion.ts` que contienen «no corresponde» quedan antes clasificadas como modo externo o bloqueado. Los mensajes de cursores de historial pertenecen a otro IPC. Se conserva el clasificador anterior como compatibilidad; los puntos de validación ahora emiten códigos explícitos. Un error sin instrumentar queda registrado como `BACKUP_UNCLASSIFIED`, no se inventa su causa.

## Cambios de diagnóstico

| Comprobación | Código interno / fase |
|---|---|
| Extensión | `BACKUP_INVALID_EXTENSION` / seleccion |
| ZIP, cantidad, duplicados, encabezado local, entradas requeridas | `BACKUP_INVALID_CONTAINER`, con fase específica |
| JSON y campos del manifiesto | `BACKUP_INVALID_MANIFEST`, con nombre fijo de la comprobación, sin valor |
| Producto y formato/esquema futuro | `BACKUP_PRODUCT_MISMATCH`, `BACKUP_FORMAT_UNSUPPORTED` |
| CRC de manifiesto/dump | `BACKUP_CRC_MISMATCH` / crc_manifiesto o crc_dump |
| SHA256 del dump | `BACKUP_HASH_MISMATCH` / hash_dump |
| Tamaño o PGDMP | `BACKUP_DUMP_INVALID` / tamano_dump o cabecera_dump |
| Archivo/carpeta/copia privada | `BACKUP_PRIVATE_PREPARATION_FAILED`; código de sistema permitido como EACCES, EPERM, ENOENT o ENAMETOOLONG |
| Copia alterada | `BACKUP_COPY_MISMATCH` / copiar_seleccion o copia_preparada |
| Espacio | `BACKUP_INSUFFICIENT_SPACE` |
| Inicio del motor aislado | `BACKUP_STAGING_START_FAILED` |
| Referencia SQL confiable | `BACKUP_REFERENCE_FAILED` |
| Versiones de herramientas y TOC | `BACKUP_TOOL_VERSION_MISMATCH`, `BACKUP_INVENTORY_INVALID` |
| pg_restore en staging | `BACKUP_STAGING_RESTORE_FAILED`, salida numérica y categoría segura de stderr |
| Historial y firma estructural | `BACKUP_SCHEMA_HISTORY_MISMATCH`, `BACKUP_SCHEMA_MISMATCH` / firma_catalogo |
| Datos técnicos, usuarios y secuencias | `BACKUP_DATA_INVALID`, con comprobación específica |
| Migración, normalización, exportación y limpieza | códigos propios por fase |

La selección se lee por streaming para obtener tamaño y SHA256 antes de copiar. Se compara con `entrada.back` inmediatamente después de copiar y se verifica otra vez al finalizar la preparación. Una diferencia rechaza la operación. No se modifica el original ni se carga completo en memoria. El trabajo adicional ocurre solo al cargar un respaldo, no al arrancar ni en reposo.

`userData/logs/respaldos.jsonl` registra fecha, código, fase, códigos de sistema permitidos y categoría de herramienta. El evento `copia_privada` conserva exclusivamente tamaños y SHA256 del **archivo completo de respaldo**; no son hashes de contraseñas. Rotación a 2 MB, sin timers, y modo de archivo 0600 (en Windows rigen además las ACL heredadas de userData). Un error de escritura del log no cambia el resultado de la validación. Un fallo de limpieza se registra por separado y no oculta la causa primaria.

No se serializan errores completos, mensajes arbitrarios, rutas, argumentos, consultas, filas, credenciales, hashes de contraseñas ni stdout/stderr. El stderr real de la herramienta se clasifica en un buffer acotado y se descarta; solo quedan categorías fijas y código de salida. La respuesta IPC conserva mensajes amigables, sin detalles técnicos.

## Investigación de dependencias

- El lector del contenedor no consulta SID, safeStorage, installation_id ni rutas de origen. El manifiesto sigue teniendo exactamente doce campos, ninguno de credenciales técnicas.
- Staging crea su propio motor y configuración cifrada bajo userData de destino. No se copia conexion.enc, postgres.enc ni Local State de A.
- `PostgresLocal` inicia con locale C; herramientas se lanzan sin shell y con argumentos separados. En desarrollo la elección de binarios usa ProgramFiles; en una distribución se prefieren los recursos empaquetados. Esta diferencia no se certifica mediante el arnés de desarrollo.
- La firma SQL se mantiene idéntica: no se ignoran funciones, índices, triggers, constraints ni diferencias de estructura. Una diferencia real continúa bloqueando la carga y ahora identifica `firma_catalogo`.
- Las pruebas de rutas Unicode y copia no certifican todas las ACL, rutas largas, unidades remotas ni dos SID reales. No se alteran permisos del perfil del usuario para hacer pasar una prueba.

## Seguridad y alcance conservados

Formato `.back` modificado: NO. Validaciones debilitadas: NO. Nueva migración: NO. SQL001–010 y esquema10 intactos. Se conservan exactamente las entradas manifest.json + database.dump, STORE, rechazo de rutas/enlaces/ejecutables/cifrado/duplicados, límites, CRC, SHA256, PGDMP, versiones PostgreSQL, inventario y catálogo.

Staging, pre_restauracion, candidata, journal, rollback y promoción segura permanecen. Se conserva el onboarding anterior: dos acciones, carga especial solo si no existe ningún usuario, revalidación Main y administrador autenticado cuando hay usuarios. Sin creación automática de usuario, nuevo Snapshot, polling/timers/watchers ni trabajo nuevo al arranque normal. Los timeouts de herramientas ya existentes no se ampliaron.

No se modificaron Stock por fecha ni Reportes. No se ejecutaron build, seed, benchmark, db:test general, commit, push ni tag.

## Archivos de esta continuación

- `src/main/database/respaldo-diagnostico.ts`: códigos y proyección segura de diagnóstico.
- `src/main/database/errores.ts`: archivo de diagnóstico rotado usando la carpeta ya configurada.
- `src/main/database/respaldo-paquete.ts`: identificación específica del control que rechaza el contenedor.
- `src/main/database/restore-workspace.ts`: fases, comparación de copia y preservación del fallo primario.
- `src/main/database/restore-validacion.ts`: códigos de inventario, catálogo y datos sin alterar predicados SQL.
- `src/main/database/proceso-postgres.ts`: categoría acotada de stderr sin exponer contenido.
- `src/main/respaldos-servicio.ts` y `src/main/respaldos-ipc.ts`: extensión y registro antes de la respuesta segura.
- `tests/respaldo-diagnostico.cjs`: regresiones de códigos, privacidad, copia, Unicode y errores; no inicia PostgreSQL.
- `tests/recuperacion-perfil-limpio.cjs`: ruta temporal con Ñ/espacios y carpeta de evidencia configurable para preservar resultados anteriores.
- `tests/restore-seguro.cjs`: expectativas de rechazo por código estable en vez de texto; no cambia los escenarios ni ejecuta la suite general.
- `tests/run.cjs`: registro de la regresión nueva.
- Este informe, continuidad y `docs/evidencias-fix-restore-1.3.1/`.

Los cambios anteriores de onboarding, sus pruebas y su informe se conservaron. `.eslintcache` y el archivo temporal de configuración Vite ya presentes al recibir esta continuación no se descartaron.

## Pruebas de esta continuación

Las evidencias conservan códigos individuales y logs, incluido el primer portable bloqueado por rename en el sandbox. La regresión nueva prueba fallos inyectados de diagnósticos; **no constituye una regresión de la causa raíz real**, todavía desconocida.

| Prueba | Resultado |
|---|---|
| `respaldo-diagnostico.cjs` | 0; códigos/fases, campos, CRC/SHA/PGDMP, copia alterada, privacidad, cancelación y rutas Unicode. |
| `respaldos-ipc.cjs` | 0. |
| `respaldos-inicial-permisos.cjs` | 0. |
| `restore-contratos.cjs` | 0. |
| `respaldo-portable.cjs` | 0, 22 casos; primer intento sandbox 1 por rename, repetición autorizada 0. |
| `recuperacion-perfil-limpio.cjs` | **1** en la nueva ruta con Ñ/espacios: A=0, B=1. No certifica restore/Login con estos cambios. |
| Typecheck final / lint / diff-check | Pendientes de incorporar al cierre. |

El primer intento de integración creó `rcm-perfil-limpio-Ñ espacio-MY7ZQt`, generó un archivo de 80.348 bytes y comprobó copia idéntica, SHA256 `4d2940d04ec4d86125f322cfd1190b435940ffbc33ba7662fb0683d9171c8c41`. B mostró las dos acciones. El log de carga señala `BACKUP_STAGING_START_FAILED` / iniciar_staging; `incidencias.jsonl` identifica inicializar_cluster. El comando initdb tiene un límite existente de 60 s; no se conservó un código de sistema en ese evento y no se afirma una causa concreta. La limpieza registró EBUSY. No es el rechazo `invalido` reportado por el usuario: el archivo pasó el contenedor. Una consulta Windows posterior confirmó que los motores propios terminaron; no se detuvo el servicio ajeno.

Se conservó el intento original y se retomó B/Login con el mismo archivo A tras comprobar ausencia de motores propios. Esa repetición terminó con código 1 antes de disponer de base local, sin llegar a Login. No se ampliaron timeouts ni se atribuyó el fallo a Unicode solo por aparecer en esa ruta. No se sustituye este resultado por el PASS histórico del arnés anterior. La integración actual queda pendiente y no debe publicarse este trabajo como una corrección certificada.

La suite general `db:test` no se ejecutó por instrucción expresa. Sus cuatro expectativas antiguas basadas en texto se adaptaron a códigos técnicos conservando los escenarios; su ejecución queda pendiente junto con el cierre general después de localizar la causa real.

## Prueba manual exacta A → B

1. Usar una aplicación que incorpore estos cambios en ambas cuentas reales de Windows. Esta tarea no produce build; no confundir una instalación previa con el código de trabajo.
2. En A, generar un `.back` nuevo y anotar usuario, contraseña original y algunos registros/saldos que se comprobarán después. No compartir la contraseña con soporte.
3. Ejecutar `Get-FileHash -Algorithm SHA256 -LiteralPath 'ruta-del-archivo.back'` en A. Copiar únicamente el `.back` a una carpeta accesible por B, sin AppData ni secretos técnicos.
4. En B ejecutar el mismo comando sobre la copia. Tamaños y SHA256 deben coincidir con A. Si difieren, conservar ambos archivos; no reempaquetarlos ni continuar atribuyendo el fallo a SQL.
5. Abrir B sin usuarios. Deben aparecer exactamente Crear usuario nuevo / Cargar respaldo. Elegir Cargar respaldo, sin crear administrador ni contraseña local provisional.
6. Seleccionar el archivo y confirmar. Si falla, anotar la hora y conservar `respaldos.jsonl` y, si existe, `respaldos.jsonl.anterior` en la carpeta logs del userData de B (normalmente `%APPDATA%\RuizCacao Manager\logs`). También conservar el `.back` original sin alterarlo. El evento `fallo` identifica código/fase; `copia_privada` permite comparar los hashes. Facilitar el log y las rutas del archivo para continuar el diagnóstico; no enviar conexion.enc, postgres.enc ni Local State.
7. Si completa, pulsar Continuar; debe reiniciar y mostrar Login. Entrar con usuario y contraseña originales de A y comprobar los registros/saldos anotados.
8. Verificar que una instalación ya restaurada exige nuevamente administrador/contraseña y que archivos inválidos continúan rechazados.

**Siguiente paso exacto:** volver a ejecutar el harness con un Electron que arranque, comparar el backup exacto por objeto/fingerprint frente a la referencia de esquema 10, corregir únicamente la causa demostrada y añadir su regresión. El registro seguro está en `docs/evidencias-fix-restore-1.3.1/continuacion-2026-10-19.md`. Después repetir la aceptación con dos cuentas reales. Solo entonces corresponde ejecutar `npm run db:test` para el cierre general 1.3.1. No declarar release corregido a partir del arnés local.


