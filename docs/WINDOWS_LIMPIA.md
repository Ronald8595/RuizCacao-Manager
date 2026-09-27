# Checklist reproducible — Windows limpia, sin internet

Registrar fecha, versión de Windows, arquitectura, versión de app y PostgreSQL, y resultado/evidencia de cada paso. Esta lista NO representa una prueba ya realizada en una VM.

## Preparar el instalador en el equipo técnico

- [ ] Incorporar únicamente la clave pública Ed25519 de producción. Custodiar la privada fuera del proyecto/equipo cliente.
- [ ] Ejecutar npm run prepare:postgres, npm run typecheck, npm run db:test y npm run build:win desde Windows normal; guardar resultados sin secretos.
- [ ] Confirmar que resources/postgresql incluye bin, lib, share, pg_dump.exe y pg_restore.exe. Confirmar ausencia de data, pgpass.conf, archivos .enc y claves privadas dentro del paquete final, incluyendo app.asar.
- [ ] Mantener la versión mayor del motor utilizada por instalaciones existentes. Copiar el instalador al equipo de prueba y desconectar internet.

## Primer inicio offline

- [ ] Instalar con un usuario normal de Windows, sin PostgreSQL ni pgAdmin previos.
- [ ] Ver únicamente Crear usuario (campo vacío) / Iniciar sesión; nunca credenciales técnicas ni pantalla de configuración PostgreSQL.
- [ ] Verificar desde una herramienta técnica que el cluster está en %APPDATA%/RuizCacao Manager/postgres/data y no en Program Files.
- [ ] Verificar listen_addresses=127.0.0.1, puerto entre 55432 y 55442, password_encryption=scram-sha-256 y pg_hba sin trust/escucha externa.
- [ ] Verificar ruizcacao_app con rolsuper=false, rolcreatedb=false, rolcreaterole=false; la credencial de bootstrap permanece cifrada y fuera del renderer.
- [ ] Verificar versión 4, 24 tablas y cero columnas datos comerciales. No insertar registros ficticios en la base de uso.

## Persistencia y reglas (solo base de pruebas)

- [ ] Ejecutar `npm run db:qa` en la terminal habitual de Windows para crear el conjunto QA controlado; confirmar que solicita autorización explícita y que no duplica datos al repetir.
- [ ] Crear cliente/proveedor/empleado; compra/venta completa, parcial y pendiente; abonos; conversión baba/seco y pesaje; gastos pago/adelanto.
- [ ] Cerrar jornada, sesión y app con cuentas abiertas; confirmar mismos saldos. Reabrir una jornada cerrada sí requiere contraseña.
- [ ] Terminar abruptamente únicamente el proceso de la app de prueba; iniciar, comprobar AutoRecover, jornada interrumpida SIN hora de cierre, aviso y cuentas intactas. Verificar bloqueo de operaciones y recuperación de hoy solo con contraseña; una jornada interrumpida de una fecha anterior solo admite finalizarse antes de continuar y ese cierre no solicita una contraseña adicional. No apagar el servidor de producción.
- [ ] Comprobar cambio de medianoche, abonos en jornada posterior y que solo hoy puede reabrirse.
- [ ] Reiniciar Windows: comprobar datos, conexión protegida y arranque del motor privado.
- [ ] Recuperar acceso con autorización firmada; rechazar firma alterada/reutilizada. Confirmar login normal y ausencia de códigos reutilizables.
- [ ] Marcar avisos leídos, reiniciar y confirmar lectura/no lectura y destinos.

## Respaldo y restauración

- [ ] Cerrar jornada: encontrar .dump y .dump.json fuera de data; verificar SHA-256 y pg_restore --list.
- [ ] Reabrir/cerrar sin operaciones: no duplicar copia equivalente. Cambiar datos y cerrar: nueva copia.
- [ ] Crear respaldo manual; probar restauración en una instalación desechable con la app cerrada y confirmación CLI. Confirmar copia previa.
- [ ] Alterar una copia duplicada de pruebas: la restauración debe rechazarla antes de reemplazar datos.
- [ ] Simular carpeta de respaldo no disponible: la jornada sigue cerrada y aparece aviso, sin alterar cuentas.

## PDF e interfaz

- [ ] Exportar diario, semanal y mensual y un rango manual. Contrastar todos los totales con Consultas.
- [ ] Verificar gastos, abonos por su fecha, pendientes excluidos y ausencia de doble egreso por compra.
- [ ] Abrir PDF corto, sin movimientos y de varias páginas: revisar logo, acentos, márgenes, cabeceras repetidas, filas completas y columnas monetarias sin recortes.
- [ ] Cancelar diálogo de guardado: no error ni archivo ni cambios de saldos.
- [ ] Verificar comprobante de venta parcial y de pago posterior con consecutivo global.

## Actualización y reinstalación

- [ ] Actualizar sobre versión anterior con datos y copia previa: confirmar migración y conservación de login, cuentas, jornadas e inventario.
- [ ] Desinstalar/reinstalar en la VM: confirmar que los datos del usuario NO se borran silenciosamente y la app los reutiliza.
- [ ] Repetir con la conexión PostgreSQL previa (postgres.enc): no crear otra base, cambiar puerto ni tocar su servicio.
- [ ] Conservar evidencias de comandos/ERD sin contraseñas, hashes, tokens ni archivos privados.

- [ ] Configurar un umbral de stock por producto, cruzarlo y comprobar un único aviso; reiniciar, comprobar persistencia y desactivarlo sin modificar existencias.
