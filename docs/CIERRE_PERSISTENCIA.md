# Cierre técnico de persistencia PostgreSQL — versiones 3 y 4

## Alcance y situación real

Se conserva Electron Main → PostgreSQL y Renderer → IPC. Los comandos comerciales siguen usando transacciones, idempotencia y el dominio existente. No se reinicializó la base de uso ni se añadieron datos ficticios a ella. El trabajo se validó en clusters y bases efímeros separados.

La conexión real ya fue confirmada desde Windows en **versión 4, 24 tablas y 0 columnas de documentos comerciales**. Se conserva `postgres.enc` y el servidor existente; no se creó una segunda base ni se reemplazó la conexión protegida.

## Recuperación offline Ed25519

El payload canónico es un array JSON UTF-8 en este orden: [1, installation_id, request_id, nonce, "recovery_password"]. La solicitud es su Base64URL canónico; la autorización es solicitud + punto + firma Ed25519 Base64URL sobre esos mismos bytes. El nonce contiene 32 bytes aleatorios. La firma se verifica con node:crypto. La aplicación compara instalación, administrador, identificador, nonce, propósito y versión con la solicitud activa de PostgreSQL.

Solo puede existir una solicitud activa por administrador. Generar otra invalida la anterior. Consumir una autorización y reemplazar el hash scrypt forman una misma transacción. La recuperación revoca la sesión, cierra la jornada según el flujo previo y deja auditoría/aviso. Los intentos inválidos usan control_recuperacion (5 intentos, 5 minutos), separado del bloqueo normal del login (5 intentos, 15 minutos). No se almacenan firmas ni tokens completos en logs/auditoría.

**No existe todavía una clave pública de producción. La recuperación permanece deshabilitada.** Las pruebas generan pares efímeros en memoria; ninguna clave privada fue escrita dentro del proyecto.

### Preparación exclusiva del desarrollador

Crear una carpeta privada fuera del proyecto, por ejemplo %USERPROFILE%\RuizCacao-Seguridad. Restringir su acceso en Windows y mantener una copia offline segura. No adjuntarla al informe ni sincronizarla con el repositorio. La herramienta rechaza rutas privadas dentro del proyecto y nunca sobrescribe claves.

Desde PowerShell, en electron-app (la frase se introduce sin mostrarla ni escribirla en el historial):

~~~powershell
$secreto = Read-Host 'Frase privada de al menos 16 caracteres' -AsSecureString
$env:RUIZCACAO_KEY_PASSPHRASE = [Net.NetworkCredential]::new('', $secreto).Password
try {
  npm run recovery:keygen -- --private "$env:USERPROFILE\RuizCacao-Seguridad\recovery-private.pem" --public "$env:USERPROFILE\RuizCacao-Seguridad\recovery-public.pem"
} finally {
  Remove-Item Env:RUIZCACAO_KEY_PASSPHRASE -ErrorAction SilentlyContinue
  $secreto = $null
}
~~~

La clave privada queda cifrada PKCS#8/AES-256-CBC. Copiar **solo** recovery-public.pem a resources/security/recovery-public.pem y volver a construir el instalador. La app lee ese recurso; no lo modifica. Mantener la misma pública en actualizaciones salvo un procedimiento planificado de rotación. No perder la privada ni su frase.

Para autorizar una solicitud recibida, guardarla como texto en la carpeta técnica externa, establecer la misma variable privada mediante Read-Host como arriba y ejecutar:

~~~powershell
npm run recovery:sign -- --private "$env:USERPROFILE\RuizCacao-Seguridad\recovery-private.pem" --request "$env:USERPROFILE\RuizCacao-Seguridad\solicitud.txt" --out "$env:USERPROFILE\RuizCacao-Seguridad\autorizacion.txt"
~~~

Eliminar la variable de entorno en finally. Entregar el contenido de autorizacion.txt al administrador por el medio offline acordado. El desarrollador debe comprobar la identidad del solicitante antes de firmar; la firma autoriza el cambio de contraseña. No distribuir scripts técnicos, clave privada ni frase al cliente.

## Respaldos y consistencia

src/main/database/respaldos.ts ejecuta pg_dump oficial en formato custom (-Fc), de la misma versión mayor del servidor. Preferentemente utiliza los binarios distribuidos con la aplicación. La contraseña va solo al entorno del proceso hijo, nunca a sus argumentos o logs.

Ruta: %APPDATA%\RuizCacao Manager\backups, fuera de postgres/data. Cada archivo .dump tiene .dump.json con UUID, fecha, tipo, fecha comercial, revisión, versión de esquema, versión mayor del motor, base, nombre, tamaño y SHA-256. Se comprueban tamaño, hash y lectura con pg_restore --list al crear. Se escriben archivos temporales antes de publicar la pareja final.

El respaldo toma el mismo advisory lock que los comandos comerciales, comienza una transacción REPEATABLE READ y exporta su snapshot a pg_dump. Así no captura operaciones a medio confirmar. El cierre de jornada se confirma primero; la copia se hace después. También se atienden cierres por logout, salida normal y recuperación de contraseña. AutoRecover ahora deja la jornada interrumpida: no genera un cierre ni su respaldo automático hasta la resolución autorizada.

Una copia automática equivalente por fecha/revisión se reutiliza. Abrir/cerrar sin nuevas operaciones no duplica copias. Se conservan 14 automáticas con integridad verificada; manuales y pre-migración/pre-restauración no se eliminan. Los manifiestos son necesarios: una copia sin manifiesto no se restaura con esta herramienta. La tabla respaldos registra las copias creadas desde v3; las previas a migrar v2 se localizan mediante sus manifiestos. Una copia no contiene su propio registro, que se inserta después de completarla.

~~~powershell
npm run db:backup
~~~

Una copia fallida no revierte el cierre confirmado ni modifica cuentas. Deja incidencia técnica, auditoría y aviso persistente cuando PostgreSQL sigue disponible. Si el almacenamiento no responde tampoco puede persistirse un aviso: se conserva el diagnóstico local. Las copias están en el mismo equipo; la retención no protege contra pérdida física del disco. Copiar respaldos verificados a un soporte externo forma parte del mantenimiento técnico.

## Restauración técnica

1. Cerrar RuizCacao Manager normalmente. No restaurar desde la interfaz ni desde Query Tool.
2. Conservar archivo .dump y su .dump.json juntos. La herramienta comprueba hash y pg_restore --list.
3. Ejecutar en la sesión Windows propietaria de la configuración:

~~~powershell
npm run db:restore -- --file "C:\Ruta-de-respaldos\manual_FECHA_ID.dump"
~~~

4. Comprobar el nombre de la base y escribir exactamente RESTAURAR seguido de ese nombre cuando la CLI lo pida. Cancelar antes de esa confirmación no reemplaza datos.
5. Se toma el candado de aplicación cerrada y se crea una copia pre_restauracion. Si esta falla, no se reemplazan datos.
6. pg_restore usa --clean --if-exists --single-transaction --exit-on-error --no-owner --no-privileges y limita la restauración al esquema ruizcacao ya existente. Un fallo SQL revierte la restauración. No se sustituyen otros esquemas ni roles del servidor.
7. Se invalidan solicitudes de recuperación activas restauradas, se audita el proceso y se retira el marcador restauracion-pendiente. Si se interrumpe entre restauración y finalización, el arranque normal queda bloqueado hasta que soporte complete nuevamente el procedimiento. No borrar ese marcador manualmente para saltar la validación.
8. Abrir la aplicación, verificar movimientos y cuentas, ejecutar database/verificacion.sql y comprobar la campanita.

Se exige misma base, versión de esquema y versión mayor de PostgreSQL. Para recuperar una copia v2 con una app de versión actual, restaurar primero en una base aislada de versión compatible y planificar su migración; no forzar el reemplazo directo. En el servidor PostgreSQL previamente instalado, la herramienta conserva la conexión cifrada, exige binarios de la misma versión mayor y permisos del usuario sobre ruizcacao. No detiene ni reconfigura el servicio existente. Los advisory locks coordinan esta app y sus herramientas; no impiden escrituras directas de terceros desde pgAdmin, que deben suspenderse durante mantenimiento. Los respaldos son de la base, no incluyen roles globales ni configuración completa del servidor.

## Migración protegida

Se adquiere el candado de sesión; se lee la versión; una base existente anterior a la versión actual requiere copia pre_migracion íntegra. Solo después se abre la transacción de migración. Si falla respaldo o DDL, no se registra la versión nueva ni se elimina información. Una base vacía no necesita respaldo previo. 001, 002 y 003 permanecen intactas respecto de lo ya exportado; 004 incorpora la decisión posterior de recuperación autorizada de jornada y los umbrales. El registro migraciones impide repetirlas. Una base más nueva que la app se rechaza.

## Campanita, cuentas, reportes y errores

Los avisos conservan lectura y destino. Cierre genera resumen disponible; las cuentas pendientes generan aviso sin cambiar estado ni saldo. evento_clave evita duplicados del mismo evento. Se incluyen avisos de respaldo fallido y se mantienen AutoRecover, cuentas saldadas y producto sin stock. **Los umbrales de stock bajo son opcionales y configurables por producto desde Stock**. Inicialmente están desactivados (NULL). Se notifica al cruzar el umbral o configurarlo cuando el stock ya está por debajo, sin repetir por una operación que permanece en ese nivel; cero conserva el aviso de Producto sin stock.

Cerrar jornada/sesión/app no salda ni anula cuentas. Los abonos siguen su propio flujo y fecha. La conversión baba/seco y el pesaje informativo, los consecutivos globales de comprobantes y los pagos manuales de empleados mantienen sus reglas.

Consultas agrega Generar PDF para diario/semanal/mensual, respetando Desde/Hasta. documentoReporte consume directamente ResumenFinanciero producido por resumirPeriodo; no recalcula caja. Incluye identidad de EMPRESA, rango, generación, totales y filas; los pendientes no cuentan y las inversiones de compra no duplican egreso. Se utiliza printToPDF y diálogo de guardado; cancelar no escribe ni modifica el negocio. El canal general documento:generar-pdf convive con comprobante:generar-pdf. No se guardan PDF en PostgreSQL.

El traductor de Main cubre SQLSTATE 23505/23503/23502/23514/22001/22P02/22003/22007/22008/40001/40P01/08xxx y desconexiones frecuentes. ErrorNegocio preserva mensajes deliberados; las excepciones inesperadas reciben un código breve. El renderer solo muestra directamente errores marcados como seguros. Los logs rotan en userData/logs/incidencias.jsonl (~2 MB más un archivo anterior), con fecha, módulo, operación, referencia, código/identificadores y ubicaciones de stack reducidas; no message/detail/query, parámetros, stdout, stderr, credenciales ni tokens.

## Validación y límites

- npm run typecheck: correcto.
- npm run db:test: suite aislada de negocio, migración histórica, migración 2→3, recuperación, respaldos, campanita, cuentas y reportes; véase el registro final del trabajo para cantidad de escenarios.
- npm run prepare:postgres: correcto; bin/lib/share y ejecutables oficiales presentes, sin data.
- npm run build:win: no completado en este entorno. electron-vite/esbuild falla con Cannot read directory "../../../..": Access is denied al cargar electron.vite.config.ts. No se generó ni se validó un instalador de esta fase.
- Impresión Electron de prueba: bloqueada por salida inesperada del proceso gráfico (exit_code=-1073741515); no se afirma validación visual del PDF impreso. Sí se comprueban HTML, importes, rango y cancelación de guardado en pruebas.
- No se ejecutó una instalación en Windows limpia ni un reinicio físico. Seguir WINDOWS_LIMPIA.md.
- Recuperación de producción pendiente de generar/custodiar el par fuera del proyecto e incorporar solo la pública.
- Base real pendiente de confirmar v4 desde Windows con npm run db:pgadmin, con la app cerrada. Antes de migrar se creará automáticamente su copia crítica; no ejecutar 003 manualmente.

Consultar ARCHIVOS_MODIFICADOS.md para el inventario exacto comparado con la copia inicial de esta fase. git status se intentó al comenzar: esta carpeta no contiene un repositorio Git; no se creó ni se reinicializó uno.

## Cambio confirmado de AutoRecover y acceso

La decisión posterior del usuario exige **interrumpida hasta validar contraseña**. Una interrupción no genera cierre normal ni hora de cierre. Se conservan saldos, movimientos y fecha comercial; tampoco se cierra por logout o salida sin resolver. Hoy se recupera con contraseña; una fecha anterior se finaliza con contraseña y luego se abre hoy. La recuperación firmada de contraseña también puede resolver el cierre de forma autorizada.

La UI usa Crear usuario / Usuario / Ingresar y no precarga admin. El modelo de un único administrador, las tablas y el IPC conservan sus nombres internos. Se retiró la exposición genérica ipcRenderer del toolkit; preload publica métodos explícitos y versiones inertes para el componente de diagnóstico. DevTools están deshabilitadas en producción.

Los resultados definitivos y los bloqueantes se encuentran en RELEASE_CANDIDATE.md.
