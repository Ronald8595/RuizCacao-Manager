# Corrección de restore Windows — candidato 1.3.1

Fecha: 2026-10-19. Rama feature/respaldos-restauracion; HEAD inicial 9db6073. Cambios anteriores conservados. Package y metadatos raíz del lockfile sincronizados a 1.3.1, sin cambios de dependencias. Sin build, commit, push, tag ni publicación.

## Estado comprobado

- BACKUP_SCHEMA_MISMATCH del archivo real: **resuelto**, reproducción antes y restauración/promoción aislada después, código0.
- Electron A→B: **PASS**. B vacío muestra exactamente Crear usuario nuevo / Cargar respaldo; restaura sin administrador provisional; proceso nuevo llega a Login; contraseña original, registros/saldos y segunda reapertura válidos.
- BACKUP_STAGING_START_FAILED histórico: **no reproducido; causa anterior no determinada**. Staging actual arranca y se limpia. El defecto ACP reproducible descrito abajo es independiente y no explica causalmente aquel initdb.
- Comprobaciones automáticas completas: typecheck, lint, db:test y diff-check, código 0; cero procesos propios residuales.
- **1.3.1 todavía no certificada ni publicada**: aceptación final en otro SID/VM obligatoria.

## Catálogo: causa exacta y rectificación

Archivo exacto RuizCacao_2026-10-19_01-11.back, 3.094.716 bytes, SHA256 e659724d7a0c8af95b42e849a171bc33259548fc5f28fb5503121f381c474430. Solo se lee el archivo y se restaura en motores temporales, nunca se abre la conexión comercial original. Hash antes/después idéntico.

De 701 objetos con nombres completos, solo difiere v_flujo_caja. Las dos supuestas diferencias FK/NOT NULL de solicitudes_recuperacion eran un error del diagnóstico: el UNION comenzaba con relname de tipo name, limitando identidades compuestas a63 bytes; el Map sobreescribía entradas coincidentes. relname::text conserva nombres completos. Las constraints coinciden y no se modifican. La firma anterior incluía filas, pero el diagnóstico por objeto interpretaba mal sus nombres.

La vista real coincide con la variante documentada en Informe_Cambios_RuizCacao_Manager_v1.1.2_Anulaciones_y_Novedades.md, sección7: Abono y Ajuste por devolución, signo inverso en devolución, cuentas anuladas conservadas y gastos manuales. La referencia actual 001–010 contiene solo Abono y excluye cuentas anuladas. **No son financieramente equivalentes**. El historial disponible no registra la transición: no se inventa un commit o fecha.

restore-compatibilidad.ts compara primero la referencia actual. Solo ante discrepancia y esquema10 construye una segunda referencia completa con DDL histórico constante en la BD efímera. Exige igualdad de firma de TODOS los objetos; cualquier diferencia adicional revierte y rechaza. Nunca copia SQL del backup para construir la referencia. Esta referencia acompaña staging, normalización, candidata y promoción.

La vista restaurada permanece intacta: no se cambia su semántica. Fixture demuestra pago -200 y devolución +200 de compra anulada conservados. Tablas y vistas del archivo real se comparan antes/después de staging/promoción. Compras, ventas, cuentas, stock y consultas actuales de Reportes no cambian. No se necesita migración011: no se migra el esquema histórico, se reconoce una referencia completa. SQL001–010 intactos.

Decisión previa a editar validaciones: evidencias-fix-restore-1.3.1/decision-catalogo.md. Diagnóstico antiguo preservado en archivo-real-diagnostico-previo.json e informe-diagnostico-previo.md, **rectificado** por catalogo-corregido-antes.json, catalogo-corregido-despues.json y archivo-real.json. No volver a tratar las dos constraints falsas como pendientes.

## Ruta Windows y fallo histórico initdb

El nuevo Electron con Ñ/espacios inició staging, pero falló BACKUP_REFERENCE_FAILED/crear_referencia/ENOENT. Experimento mínimo: server/client_encoding UTF8; textsend(data_directory) contiene byte0xD1 para Ñ. Node lo decodifica U+FFFD; realpath no encuentra la ruta. Tras corregirlo surgió el mismo defecto en el otro SHOW data_directory usado para comprobar espacio de candidata; ambos consumidores corregidos.

postgres-ruta.ts obtiene bytes, intenta UTF8 estricto y, ante bytes inválidos en Windows, lee ACP del registro local y usa ese decoder estricto. No adivina rutas, no elimina pertenencia: realpath real debe seguir igual al esperado. Regresión Unicode y rechazo de directorio ajeno pasan. Páginas no soportadas fallan cerradas. Lectura de registro solo durante ese restore y memoizada: sin trabajo nuevo al arranque, timers/polling/watchers o procesos permanentes. Los binarios initdb/postgres de vendor y ProgramFiles tienen hashes idénticos; no se atribuye a distintas versiones.

El intento previo del18 de octubre registró inicializar_cluster, BACKUP_STAGING_START_FAILED y limpieza EBUSY. Su log no conservó código de salida/sistema. Duración compatible con el timeout existente de60s, **sin prueba concluyente de causa**. El defecto ACP sucede después del arranque y no explica aquel evento. No se ampliaron timeouts ni se borraron intentos. Los staging actuales pasan, incluso ruta Unicode. Si reaparece bajo otro SID, conservar evento initdb/entorno antes de atribuirle esta solución.

## Seguridad, onboarding y alcance

Onboarding previo conservado: dos acciones; Main autoriza restore sin sesión solo cuando no hay usuarios y revalida antes de promover; con usuarios exige administrador/contraseña. Nunca crea administrador provisional. Nuevo proceso llega a Login.

Formato .back, manifest/product_id/versiones, ZIP/CRC/SHA256/PGDMP, inventario, historial, catálogo, datos, secuencias, staging, pre_restauracion, journal, rollback y promoción segura permanecen. Contraseñas restauradas no se reemplazan. Sin AppData, postgres.enc, conexion.enc, Local State ni secretos de A en B.

Diagnóstico previo por códigos/fases, copia streaming y comparación tamaño/SHA conservados. Log seguro solo con campos permitidos, sin SQL, filas, contraseñas, hashes de contraseñas, rutas ni stderr. Sin Snapshot nuevo, timers/polling/watchers, trabajo de arranque o cambios a otros módulos.

## Evidencias y resultados

Carpeta docs/evidencias-fix-restore-1.3.1/. Suites PostgreSQL secuenciales sobre motores aislados.

| Prueba | Código / resultado |
|---|---|
| Diagnóstico real antes | 1 esperado, firma_catalogo; solo vista diferente |
| Diagnóstico real después | 0; staging completo, 701 objetos iguales en tres comparaciones |
| restore-catalogo.cjs --archivo-real | 0; 15 casos, fixture y real promovidos, SHA intacto, tablas/vistas/usuarios iguales |
| Mutaciones incompatibles | Rechaza FK, NOT NULL, índice, trigger ausentes; tabla extra; vista incompatible; variante fuera de versión10 |
| Ruta Unicode antes | 1, ENOENT; bytes ACP y U+FFFD comprobados |
| postgres-ruta-windows.cjs después | 0; Unicode válida y directorio ajeno rechazado |
| Electron A | 0; nuevo .back1.3.1 por IPC |
| Electron B / Login / reabrir | 0 / 0 / 0; contraseña original por formulario UI, registros/saldos iguales |
| typecheck final | 0 |
| lint --no-cache final | 0; 0 errores y 863 advertencias |
| db:test general | 0; suite completa, incluye rollback/recuperación, portable, portabilidad y regresiones comerciales |
| git diff --check final | 0 |
| Procesos propios residuales | 0 PostgreSQL y 0 arneses; consulta Windows de solo lectura |

La suite completa terminó sin fallos. Todos sus hijos, incluidos respaldo-portable.cjs (22 casos), respaldo-portabilidad.cjs (fixtures pequeño/grande), restore-seguro.cjs y restore-startup.cjs, salieron con código 0. Los tests de seed/dataset pertenecen a bases temporales de la suite: no se ejecutó db:seed:performance ni se modificó la base comercial. El servicio ajeno preexistente postgresql-x64-18 y sus procesos permanecen intactos; no se cuentan como procesos de esta tarea. Evidencia: db-test-final.txt/json y procesos-final.json.

Fixture A transferido: SHA256 6736942eb5cfc279c3d4357b1e16b24c23360fe449ea03e19026014c1a278c51. A=0 preservado en perfil-limpio-final/antes-ruta-acp.json. Se reutilizó ese archivo ya válido para B/Login/reabrir=0, en resultado.json. B seguía sin usuarios, compras, ventas ni cuentas. Credenciales técnicas distintas; A retirado de su ruta antes de iniciar B. Transferencia exclusiva del .back, byte a byte idéntica.

No se ocultan fallos: el arnés nuevo necesitó corregir typmod de vista, inserción identity y campos obligatorios antes de pasar; errores del fixture. El experimento convert_to del GUC rechazó bytes inválidos; se usa textsend. Los B fallidos en referencia/espacio se conservan en antes-ruta-acp.json y antes-ruta-espacio.json.

Archivo real: igualdad de todas las tablas salvo las cuatro técnicas normalizadas por diseño (instalacion, solicitudes_recuperacion, control_recuperacion, sesiones), y de v_saldos/v_flujo_caja. Incluye usuarios/administrador, auditoría, jornadas y comerciales, sin guardar huellas de sus filas en logs. Login original probado corresponde al fixture; no se conoce ni pidió la contraseña comercial. Sus filas de usuario/hash sí se conservan exactamente.

## Archivos modificados

- Corrección: src/main/database/restore-compatibilidad.ts, restore-validacion.ts, restore-workspace.ts, postgres-ruta.ts, postgres-local.ts, restore-destino.ts; package.json y package-lock.json.
- Previos preservados: base.ts, errores.ts, proceso-postgres.ts, respaldo-paquete.ts, respaldo-diagnostico.ts; src/main/respaldos-ipc.ts y respaldos-servicio.ts; src/renderer/src/components/Acceso.tsx y pages/Respaldos.tsx.
- Pruebas: tests/restore-catalogo.cjs, postgres-ruta-windows.cjs, diagnosticar-respaldo-archivo.cjs, recuperacion-perfil-limpio.cjs, recuperacion-perfil-limpio-electron.cjs, run.cjs. Previas: restore-seguro.cjs, electron-node-bridge.cjs, respaldo-diagnostico.cjs, respaldos-inicial-permisos.cjs.
- Este informe, continuidad, evidencias1.3.1 y docs/evidencias-pgctl/regresion-1792443911372.json generado por la suite. Informe/evidencias anteriores de recuperación y temporal Vite preexistentes conservados.

El comando requerido lint --no-cache eliminó automáticamente .eslintcache (caché derivada, ya modificada al inicio). Comportamiento confirmado en node_modules/eslint/lib/eslint/eslint.js:998–1004. No se hizo reset ni se sustituyó por la versión de Git; no se descartaron cambios de código.

## Limitaciones y aceptación final

Dos userData bajo el mismo SID NO certifican dos cuentas Windows. No hay credenciales de otro SID ni VM accesible; no se detectaron comandos Hyper-V/VirtualBox/VMware disponibles. No se crearon cuentas ni instaló software. Sin build final conforme a la última instrucción. El arnés usa Electron/componentes/IPC reales con selección de archivos controlada; su padre lanza el proceso nuevo tras el callback de reinicio. No certifica NSIS ni lanzador instalado.

La regresión Windows de ruta cubre la página ACP 1252 del entorno y Ñ/espacios; otras páginas regionales no se certificaron en sistemas reales. Una página no soportada o una ruta que no coincide con el directorio esperado sigue bloqueada, sin omitir el control de seguridad.

1. Conservar el respaldo real intacto. Cerrar la app antes de compilar.
2. Revisar resultados y ejecutar preflight/build siguientes; no suites PostgreSQL simultáneas ni seeds.
3. Instalar candidato1.3.1 en otra cuenta Windows con SID distinto o VM limpia; registrar versión instalada.
4. Probar el backup real con SHA terminado en c474430 y otro nuevo generado en A. Copiar SOLO .back y comprobar tamaño/SHA con Get-FileHash en A/B.
5. B debe mostrar Crear usuario nuevo / Cargar respaldo. Cargar sin crear administrador; confirmar, esperar, Continuar y reinicio a Login.
6. Entrar con usuario/contraseña originales. Cotejar compras, ventas, cuentas, abonos, stock y reportes/saldos previamente anotados. No enviar contraseñas a soporte.
7. Cerrar/reabrir; Login original y persistencia; ausencia de procesos PostgreSQL temporales propios al cerrar.
8. Si reaparece initdb/staging: conservar hora/código/fase/logs seguros y el intento fallido, sin copiar secretos de A.
9. Registrar aceptación humana antes de decidir commit/tag/release. Este informe no autoriza publicación.

## Comandos exactos de preflight y build1.3.1

PowerShell; ejecutar cada comando solo si el anterior termina con código0. build:win incluye preflight; el paso separado permite revisar prerrequisitos antes de compilar.

~~~powershell
Set-Location -LiteralPath 'C:\Users\LENOVO\Documents\VS_Proyects\RuizCacao Manager\electron-app'
node -p "require('./package.json').version"
npm run typecheck
npm run lint -- --no-cache
npm run db:test
git diff --check
npm run release:preflight
npm run build:win
~~~

Versión esperada1.3.1. Instalador esperado: dist/RuizCacaoManager-1.3.1-Setup.exe. No generado en esta tarea. Preflight verifica/prepara recursos; requiere acceso a artefactos configurados si faltan. Detenerse ante cualquier error. No publicar antes de aceptación final.

