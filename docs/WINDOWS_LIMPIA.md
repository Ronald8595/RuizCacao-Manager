# Checklist reproducible — Windows limpia, sin internet

Registrar fecha, versión de Windows, arquitectura, versión de app y PostgreSQL, y resultado/evidencia de cada paso. La VM del instalador anterior confirmó la ausencia de VC++ x64 como causa de 0xC0000135 y funcionó tras instalarlo manualmente. La solución NSIS 1.2.0 todavía requiere repetir esta lista: [informe del prerrequisito](Informe_Prerequisito_Windows_v1.2.0.md).

## Preparar el instalador en el equipo técnico

- [ ] Incorporar únicamente la clave pública Ed25519 de producción. Custodiar la privada fuera del proyecto/equipo cliente.
- [ ] Ejecutar npm run prepare:vcredist, npm run typecheck, npm run lint, npm run db:test y npm run db:sql. Terminar db:test ANTES de release:preflight/build:win: la preparación copia binarios que Windows no permite sobrescribir mientras están ejecutándose.
- [ ] Ejecutar npm run release:preflight y, cuando se autorice construir, npm run build:win. Confirmar versión 1.2.0. Guardar códigos/hash del instalador sin secretos.
- [ ] Conservar la copia oficial aprobada de VC_redist.x64.exe. El manifiesto exige SHA-256, firma Microsoft válida, arquitectura x64 y versión aprobada; un fichero del enlace mutable con otro hash se rechaza. Para preparación offline, RUIZCACAO_VC_REDIST apunta a esa copia. Nunca copiar DLL sueltas.
- [ ] Confirmar que NSIS incluye el redistribuible y que el paquete de la app no depende de una descarga posterior. El runtime no debe ir dentro de app.asar ni resources/postgresql.
- [ ] Confirmar que resources/postgresql incluye bin, lib, share, pg_dump.exe y pg_restore.exe. Confirmar ausencia de data, pgpass.conf, archivos .enc y claves privadas dentro del paquete final, incluyendo app.asar.
- [ ] Mantener la versión mayor del motor utilizada por instalaciones existentes. Copiar el instalador al equipo de prueba y desconectar internet.

## Primer inicio offline

- [ ] Windows 10/11 x64 limpio: sin PostgreSQL, pgAdmin ni Microsoft Visual C++ v14 Redistributable x64. Registrar ausencia del runtime como condición inicial y desconectar internet ANTES de instalar.
- [ ] Instalar con un usuario normal de Windows y credenciales de administrador disponibles SOLO para el prerrequisito. Aceptar UAC de Microsoft; confirmar instalación silenciosa offline. Si necesita reinicio, reiniciar y volver a ejecutar el instalador.
- [ ] Confirmar directorio nuevo LOCALAPPDATA/Programs/RuizCacaoManager (derivado del executableName del producto). La aplicación debe ejecutarse como usuario normal y sin UAC diario ni un servicio PostgreSQL nuevo.
- [ ] Ejecutar --version desde una consola técnica sobre resources/postgresql/bin/initdb.exe, postgres.exe, pg_ctl.exe y psql.exe; los cuatro deben responder PostgreSQL 18.6 con código 0.
- [ ] Ver únicamente Crear usuario (campo vacío) / Iniciar sesión; nunca credenciales técnicas ni pantalla de configuración PostgreSQL.
- [ ] Verificar desde una herramienta técnica que el cluster está en %APPDATA%/RuizCacao Manager/postgres/data y no en Program Files.
- [ ] Verificar listen_addresses=127.0.0.1, puerto entre 55432 y 55442, password_encryption=scram-sha-256 y pg_hba sin trust/escucha externa.
- [ ] Verificar ruizcacao_app con rolsuper=false, rolcreatedb=false, rolcreaterole=false; la credencial de bootstrap permanece cifrada y fuera del renderer.
- [ ] Verificar PG_VERSION=18, ruizcacao.conf, esquema 10 y 25 tablas. No insertar registros ficticios en la base de uso.

## Casos del prerrequisito (snapshots independientes de VM)

- [ ] Cancelar UAC: mensaje comprensible, ninguna aplicación anterior reemplazada, no mostrar códigos hexadecimales, DLL, rutas ni stderr.
- [ ] Runtime existente igual/posterior y DLL presentes: no lanzar su instalador ni solicitar UAC por ese componente.
- [ ] Runtime antiguo: actualización del prerrequisito; código 0 y comprobación posterior satisfactoria. Probar registro residual/DLL ausente en una VM descartable: no aceptarlo como componente preparado.
- [ ] Código de reinicio 3010/1641 si ocurre: conservar app previa, no arrancar PostgreSQL, solicitar reiniciar y repetir instalador. No reinicio automático.
- [ ] Comprobar log sanitizado LOCALAPPDATA/RuizCacao Manager/logs/instalacion-runtime.jsonl. Para fallos de arranque, incidencias.jsonl en los logs del usuario, sin contraseñas/rutas/stderr.
- [ ] Simular el intento incompleto únicamente en copia aislada: mensaje de soporte, data-inicializando conservado e inicio.pw retirado. Soporte conserva ese intento fuera del nombre provisional antes de reintentar; nunca retirar un data válido.

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
- [ ] Instalar 1.2.0 sobre 1.1.2 registrada bajo LOCALAPPDATA/Programs/electron-app: confirmar que utiliza ESA ruta, no crea una segunda instalación y mantiene appId, accesos y APPDATA/RuizCacao Manager. Repetir como mismo usuario; si existía instalación para todos, conservar ese modo.
- [ ] Cancelar prerrequisito durante actualización: 1.1.2 y sus datos siguen utilizables. La verificación de compatibilidad en código no sustituye esta prueba real.
- [ ] Desinstalar/reinstalar en la VM: confirmar que los datos del usuario NO se borran silenciosamente y la app los reutiliza.
- [ ] Repetir con la conexión PostgreSQL previa (postgres.enc): no crear otra base, cambiar puerto ni tocar su servicio.
- [ ] Conservar evidencias de comandos/ERD sin contraseñas, hashes, tokens ni archivos privados.

- [ ] Configurar un umbral de stock por producto, cruzarlo y comprobar un único aviso; reiniciar, comprobar persistencia y desactivarlo sin modificar existencias.
