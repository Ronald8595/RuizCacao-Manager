# Recuperación en instalación sin usuarios — v1.3.0

Fecha: 2026-10-18. Rama: `feature/respaldos-restauracion`.

## Estado de los dos bloqueadores

1. **Onboarding sin usuarios: corregido.** Se muestran exactamente dos acciones principales: Crear usuario nuevo y Cargar respaldo. La carga no crea un administrador provisional ni requiere una contraseña de una cuenta inexistente.
2. **Rechazo del archivo del usuario: pendiente de diagnóstico con ese archivo.** Se solicitó la ruta del `.back` rechazado y, si existe una copia transferida, ambas rutas. No se han recibido. No se atribuye el rechazo a corrupción, al SID o a credenciales de origen sin comprobarlo. Una copia nueva generada por el código actual sí completa la recuperación A→B en la regresión aislada.

El release no queda certificado por este informe: faltan el diagnóstico del archivo reportado y la aceptación en dos cuentas reales de Windows. La regresión automatizada utiliza dos directorios userData y configuraciones técnicas independientes dentro de una misma cuenta Windows; no se presenta como una prueba bajo dos SID distintos.

## Causa raíz del onboarding y corrección

`Acceso.tsx` mostraba directamente el formulario de creación cuando `administradorExiste` era falso. No ofrecía recuperar una instalación. Además, todas las operaciones del servicio de respaldos exigían la sesión de un administrador y el contrato IPC rechazaba una contraseña vacía. Mostrar un botón por sí solo no resolvía el bloqueo de Main.

Ahora:

- Acceso presenta las dos acciones y carga diferidamente el componente de respaldos existente solo en una instalación sin usuarios. Crear usuario nuevo abre el formulario anterior y permite regresar a las opciones iniciales.
- Cargar respaldo reutiliza selector nativo, preparación privada, resumen, confirmación explícita, progreso, cancelación, fase crítica y reinicio existentes. En ese contexto omite únicamente el formulario de contraseña del administrador local.
- Main consulta si existe **cualquier usuario**, incluidos inactivos. Solo cuando no existe ninguno autoriza la carga inicial. Generar respaldos sigue exigiendo administrador autenticado.
- La autorización inicial queda vinculada a la operación. Se comprueba después del diálogo, después de validar, antes de cargar y nuevamente dentro del caso seguro, después de entrar en mantenimiento y antes de promocionar.
- Si aparece un usuario durante el proceso, la autorización inicial deja de servir. La prueba de permisos verifica el rechazo y la liberación de la preparación.
- Una instalación con usuarios mantiene el control de administrador y la contraseña; enviar una contraseña vacía desde Renderer no elude esas comprobaciones.
- Tras restaurar, se conserva el bloqueo hasta reiniciar y se llega a Login con los usuarios restaurados.

No se agregó consulta ni carga del módulo de respaldos al arranque normal con usuarios. Las consultas de autorización nuevas ocurren solamente al solicitar una carga. No se añadieron Snapshot, polling ni timers de producto. Las esperas acotadas del arnés pertenecen exclusivamente a pruebas.

## Investigación del rechazo portable

El texto «El archivo seleccionado no corresponde a un respaldo válido de RuizCacao Manager» proviene del código visible `invalido` en `respaldos-servicio.ts`. Puede proceder de diferentes comprobaciones, por lo que no identifica por sí solo la causa:

| Punto | Comprobación |
|---|---|
| Selección | Extensión `.back`. |
| `PaqueteRespaldoZip` | ZIP con exactamente manifest.json y database.dump, nombres y encabezados coherentes, STORE, sin cifrado, ejecutables, enlaces, rutas ni duplicados; límites de tamaño. |
| Manifiesto | Campos exactos, product_id `com.gruporuiz.ruizcacao-manager`, format_version 1, UUID, fecha, versión, esquema y versiones PostgreSQL válidos. |
| Integridad | CRC, tamaño, cabecera PGDMP y SHA256 del dump. Sus fallos se clasifican como archivo dañado, salvo errores anteriores de estructura. |
| Staging SQL | La frase «La estructura del respaldo no corresponde a RuizCacao» también se transforma en `invalido`: se compara la estructura del catálogo restaurado con la referencia de migraciones. |

El lector del contenedor no usa safeStorage, postgres.enc, installation_id, ruta de origen, SID ni nombre de usuario Windows. El manifiesto no contiene credenciales técnicas. Staging utiliza credenciales propias del destino. La identidad de instalación restaurada se normaliza con un UUID nuevo, no se exige que coincida con la instalación origen.

**No se modificó ni debilitó ninguna de estas validaciones.** Sin el archivo reportado no se puede afirmar qué condición concreta lo rechazó ni corregir una condición hipotética. Las validaciones del contenedor siguen pasando sus 22 casos de regresión, incluidos rechazos de ZIP malformado, rutas, enlaces, ejecutables, duplicados, CRC/hash y tamaños incorrectos.

## Regresión A→B y nuevo proceso

`node tests/recuperacion-perfil-limpio.cjs` crea un directorio temporal nuevo y ejecuta secuencialmente tres procesos Electron:

1. A inicia un motor privado nuevo, crea un usuario de prueba y unos pocos registros por APIs normales (cliente, proveedor y compra parcial), y genera `.back` 1.3.0 por el IPC real.
2. El coordinador copia únicamente A.back, compara ambos archivos byte a byte y registra SHA256. Retira el directorio A de su ruta original antes de iniciar B.
3. B inicia en su propio userData sin usuarios, con nuevas credenciales técnicas. Se compara una huella de credenciales, sin imprimir secretos. No se copia AppData ni configuración de A a B.
4. Chromium monta Acceso de producción. La prueba comprueba las dos acciones exactas, la apertura y retorno del formulario Crear usuario nuevo y el rechazo de generar respaldos sin administrador.
5. Cargar respaldo selecciona la copia exacta de A; valida el archivo, confirma que siguen existiendo cero usuarios locales y que no hay formulario de contraseña, y ejecuta la restauración completa con staging, copia pre_restauracion, journal y promoción.
6. Continuar cierra la persistencia de B mediante el callback de reinicio. El coordinador inicia otro proceso con el mismo userData B, comprueba Login sin sesión, rechaza una carga sin autenticar y acepta el usuario/contraseña originales. Comprueba datos comerciales de A.
7. Cada proceso cierra persistencia y herramientas en finally. El arnés sustituye el relanzamiento de producción por un proceso explícito observable; no prueba un instalador empaquetado.

Durante el desarrollo del arnés se corrigieron: la eliminación real de ELECTRON_RUN_AS_NODE, el uso de la API de comandos para crear registros y una espera DOM que no finalizaba. Se detuvieron explícitamente los dos motores temporales de ese intento antes de continuar; no se tocó el servicio PostgreSQL preexistente. La continuación con el mismo archivo A pasó B y Login. El cierre adicional con A/B completamente nuevos también pasó y dejó evidencia del recorrido íntegro.

## Archivos modificados

- `src/renderer/src/components/Acceso.tsx`: elección inicial y conservación del formulario anterior.
- `src/renderer/src/pages/Respaldos.tsx`: modalidad inicial reutilizando el flujo existente.
- `src/main/database/base.ts`: autorización de carga inicial y verificación de credencial según existencia de usuarios.
- `src/main/respaldos-servicio.ts`: autorización asíncrona ligada al tipo e identidad de la operación.
- `src/main/respaldos-ipc.ts`: validación Main, credencial inicial y revalidación antes de promocionar.
- `tests/respaldos-inicial-permisos.cjs`: permisos, confirmación, ausencia de creación automática y revocación.
- `tests/recuperacion-perfil-limpio.cjs` y `tests/recuperacion-perfil-limpio-electron.cjs`: regresión aislada A/B/Login.
- `tests/run.cjs`: registra la prueba de permisos para futuras suites; no se ejecutó la suite general.
- Este informe y `docs/evidencias-recuperacion-perfil-limpio/`: resultados.

Se conservan los cambios anteriores de Consultas y Reportes. No se modificaron migraciones 001–010, formato `.back`, exportador, verificador del contenedor, staging, journal/rollback ni generación de pre_restauracion. No se ejecutaron build, commit, push, tag ni seed de rendimiento.

## Resultados de cierre

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | 0, Main y Renderer. |
| `npm run lint -- --no-cache` | 0; 0 errores y 855 advertencias del repositorio. Sin advertencias en los archivos afectados en el cierre. |
| `node tests/respaldos-ipc.cjs` | 0; permisos, concurrencia, cancelación, reinicio y listeners. |
| `node tests/respaldos-inicial-permisos.cjs` | 0; controles de carga inicial y revocación. |
| `node tests/respaldo-portable.cjs` | 0; 22 casos. |
| `node tests/recuperacion-perfil-limpio.cjs` | 0; A, B y Login con salida 0 en tres procesos. |
| `git diff --check` | 0. |
| Consulta Windows de procesos | 0 procesos propios residuales; servicio preexistente conservado. |

Fixture final: `C:\Users\LENOVO\AppData\Local\Temp\rcm-perfil-limpio-4GQwff`.

SHA256 del `.back` de prueba (idéntico en A y en la copia transferida): `3bc0b58726250dca0941ab2ec0ae03af7c7dd411957ee35d833685d531067db5`.

Evidencias: `docs/evidencias-recuperacion-perfil-limpio/resultado.json`, `integracion.txt`, `portable.txt`, `lint-final.txt`, `procesos-final.json` y `validacion-final.json`. Typecheck y contratos se ejecutaron con salida observada en la sesión; el JSON de cierre registra sus códigos. Los logs anteriores de lint reflejan el formato previo a la corrección del arnés; el resultado definitivo es `lint-final.txt`.

## Prueba manual exacta pendiente

1. Usar una versión de la aplicación que incluya esta corrección (este trabajo no genera build). En el perfil Windows A, iniciar sesión con un usuario conocido y generar un nuevo `.back`; anotar usuario, contraseña y algunos registros/saldos existentes.
2. Registrar el SHA256 con `Get-FileHash -Algorithm SHA256 -LiteralPath 'ruta-del-respaldo.back'`.
3. Copiar únicamente ese archivo a una ubicación accesible por el perfil B. Calcular de nuevo SHA256 desde B y comprobar que coincide. No transferir AppData, postgres.enc, conexion.enc, Local State ni secretos técnicos.
4. Abrir la aplicación en B, una cuenta Windows distinta con instalación sin usuarios. Debe mostrar exactamente Crear usuario nuevo y Cargar respaldo. No crear un administrador previo.
5. Elegir Cargar respaldo y seleccionar la copia verificada. Revisar fecha/versión y confirmar. No debe pedir contraseña de administrador local inexistente.
6. Esperar la carga y pulsar Continuar. La aplicación debe reiniciarse y mostrar Login, sin iniciar sesión automáticamente.
7. Ingresar con el usuario y contraseña originales de A. Comprobar los registros y saldos anotados; revisar que compras/ventas/cuentas/stock estén presentes.
8. Con usuarios ya restaurados, verificar que la restauración vuelve a exigir administrador autenticado y contraseña. Los archivos inválidos deben seguir rechazándose.
9. Si se repite el rechazo original, conservar el archivo sin reempaquetarlo y proporcionar las rutas originales/copia y sus hashes. La aceptación de otro archivo nuevo no cierra el diagnóstico del que falló.

Siguiente paso obligatorio: recibir el `.back` rechazado para identificar la comprobación exacta y realizar la aceptación A→B bajo dos cuentas reales de Windows. No declarar resueltos ambos bloqueadores hasta completar esa evidencia.
