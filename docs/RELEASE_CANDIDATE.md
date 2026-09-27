# Candidato de implementación — RuizCacao Manager

Fecha de verificación: 22 de septiembre de 2026. Versión de esquema preparada: **4**; **24 tablas**. Estado: código candidato a validación física, **no liberado como producción verificada**.

## Estado inicial y cierre realizado

Ya existían persistencia relacional en Main, IPC, transacciones, idempotencia, auditoría, login scrypt, jornadas, sesiones, campanita y preparación del motor privado. La base real fue confirmada posteriormente en v4/24 tablas, sin columnas de documentos comerciales. Durante esta tarea se completaron:

- Recuperación Ed25519 de un solo uso, challenge persistente y control de abuso separado; herramienta externa de generación/firma sin clave privada en el proyecto.
- Respaldos pg_dump custom, manifiesto SHA-256, snapshot consistente, retención de 14 automáticos, copia previa a migrar y restaurar, CLI de mantenimiento con confirmación.
- Reportes PDF desde el mismo ResumenFinanciero de Consultas; cancelación segura.
- Traductor central de errores, logs sanitizados con rotación y eliminación de mensajes técnicos directos en UI.
- Avisos persistentes de resumen, respaldo fallido y cuentas pendientes; destino de navegación.
- Crear usuario / Usuario / Ingresar, sin admin prellenado, validaciones por campo. Permisos internos de administrador intactos.
- AutoRecover con jornada interrumpida hasta validar contraseña, según la aclaración final del usuario. Una interrupción nunca genera automáticamente finalización normal. Hoy admite recuperar con contraseña; una fecha anterior debe finalizarse antes de abrir hoy, sin solicitar una contraseña adicional para el cierre.
- Umbrales opcionales por producto desde Stock, inicialmente desactivados, sin inventar valores fijos.
- Preload con API explícita y metadatos de versión, sin acceso genérico a ipcRenderer. contextIsolation y sandbox activos, nodeIntegration desactivado y DevTools deshabilitadas al empaquetar.
- Compras y ventas quedan bloqueadas fuera de una jornada activa. Iniciar/finalizar jornada no solicitan contraseña; reabrir sí la solicita.
- El saludo de Inicio utiliza el usuario autenticado y los reportes notifican generación y guardado por separado.
- La campanita y el menú de usuario se muestran como paneles compactos anclados al encabezado.

## Migraciones

| Archivo | Cambio |
|---|---|
| database/003-seguridad-respaldos.sql | Instalación, solicitudes/abuso de recuperación, respaldos y claves/destinos de avisos. recovery_hash deprecado y nullable. |
| database/004-interrupciones-umbrales.sql | Jornada interrumpida, exclusión de jornadas pendientes simultáneas y umbral opcional por producto. |

001 y 002 no se editaron; 004 se añadió después de confirmar el nuevo comportamiento de AutoRecover. El exportador comprueba también que 003 no se sobrescriba con otro contenido. La aplicación ejecuta las migraciones en orden dentro de una transacción y verifica primero una copia crítica para instalaciones existentes. Las pruebas incluyen instalaciones anteriores v1, v2 y v3.

## Resultados reproducibles

| Verificación | Resultado |
|---|---|
| git status --short | La carpeta no es un repositorio Git. Se comparó con una copia inicial; sin reset ni reinicialización. |
| npm run typecheck | Correcto en Node y Renderer. |
| npm run db:test | 19 escenarios originales + 24 de seguridad/persistencia/reportes + 8 de cierre RC; además migración histórica, 4 comprobaciones de migración/restauración, migración 3→4 y motor privado. |
| Restauración real aislada | Correcta: pg_restore conserva registros y versión; nunca se restauró encima de la base real del usuario. |
| Migraciones con fallo | Respaldo crítico fallido impide migración; fallo DDL revierte; registros comerciales conservados. |
| Recuperación | Firma válida, firma alterada, otra instalación, request_id/nonce/propósito incorrectos, solicitud reemplazada y reutilización tras reiniciar comprobados. Pares de prueba solo en memoria. |
| SQLSTATE / errores | Traducciones mínimas, TypeError oculto, logs sin secretos y rollback de compra/cuenta/gasto/stock ante constraint comprobados. |
| Motor distribuible | bin/lib/share y pg_dump/pg_restore presentes; sin data; pruebas con los binarios copiados a vendor. SCRAM, loopback, rango de puertos y rol sin superuser/CREATEDB/CREATEROLE verificados. |
| Reinicio del motor privado | Conserva conexión y datos en prueba automatizada; cifrado de prueba AES-GCM inyectado, sin afirmar validación física de safeStorage/DPAPI. |
| UI Crear usuario | Vista renderizada en navegador con bridge simulado sin PostgreSQL: título/etiqueta correctos, usuario vacío y mensajes por campo al enviar vacío. Creación/login real comprobados por integración DB. |
| PDF | HTML y totales diario/semanal/mensual, rango manual, flujo efectivo, no doble conteo y cancelación comprobados. Impresión/render final en Windows pendiente. |
| Compilación directa Vite | Main, Preload y Renderer compilados como comprobación complementaria. No equivale a generar un instalador. |
| npm run prepare:postgres | Correcto. Comprobación adicional de ausencia de claves privadas PEM en código/recursos y motor. |
| npm run build:win | Bloqueado por esbuild/electron-vite: Cannot read directory "../../../..": Access is denied al cargar electron.vite.config.ts. No se afirma que exista un instalador validado. |
| Impresión Electron real de prueba | El proceso gráfico termina con exit_code=-1073741515; no se pudo verificar el PDF visualmente en este entorno. |

La suite aislada no lee postgres.enc ni escribe datos comerciales en la base de uso. Sus credenciales efímeras se retiran al finalizar y sus motores se detienen. Las copias y artefactos de prueba permanecen en carpetas temporales separadas para diagnóstico. Los comandos pueden mostrar advertencias previas de npm sobre electron_mirror; no se actualizaron dependencias para ocultarlas.

## Bloqueantes para producción

1. Generar y custodiar el par Ed25519 de producción fuera del proyecto e incorporar únicamente la pública antes de distribuir. El usuario confirmó que todavía no existe; mientras tanto la recuperación permanece deshabilitada deliberadamente.
2. Ejecutar build:win desde Windows sin las restricciones del entorno y revisar contenido final del instalador/app.asar: ausencia de secretos/dumps/data y presencia del motor. Sin artefacto final no puede certificarse su contenido.
3. Completar instalación offline en Windows limpia, reinicio físico, actualización y reinstalación con conservación de datos y validación real de safeStorage. No se ejecutó una VM limpia.
4. Comprobar visualmente los PDF impresos, incluidos reportes vacíos, largos y comprobantes. La verificación automática de HTML no sustituye esta prueba.
5. La base de uso ya fue confirmada en versión 4, con 24 tablas y 0 columnas de documentos comerciales. Mantener esta comprobación dentro del test final previo a entrega y no ejecutar SQL manualmente para forzar migraciones.

## Mejoras posteriores

- Copias verificadas fuera del equipo para pérdida de disco y procedimiento de custodia/rotación de claves de soporte.
- Planificar actualización mayor de PostgreSQL; la herramienta actual exige versiones compatibles y nunca reinicializa el cluster.
- Firma de código del instalador y distribución/actualización formal: no se configuraron certificados ni publicación automática.

## Procedimientos y evidencias

- BASE_DATOS.md: estructura, relaciones y generación de ERD desde pgAdmin sin crear tablas manualmente.
- CIERRE_PERSISTENCIA.md: claves externas, backup/restore, migraciones y limitaciones del PostgreSQL preexistente.
- WINDOWS_LIMPIA.md: checklist de instalación, actualización/reinstalación, backup/restore y revisión PDF.
- ARCHIVOS_MODIFICADOS.md: lista exacta de archivos de aplicación/documentación comparados con la copia inicial de esta fase. Incluye los cambios posteriores de cierre RC.
- INVENTARIO_POSTGRESQL.txt: listado de archivos preparados en vendor/postgresql para inspeccionar el contenido distribuible; no acredita por sí solo el contenido de un instalador todavía no generado.

No se creó un ZIP del proyecto. No se modificaron ni reemplazaron las credenciales protegidas o los datos reales del usuario.
