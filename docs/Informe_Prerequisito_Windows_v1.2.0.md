# Prerrequisito Windows — RuizCacao Manager 1.2.0

Fecha: 2026-10-03. Rama: feature/escalabilidad-postgresql. Esquema 10, 25 tablas.

## Hallazgo confirmado en VM

La prueba real comunicada por el usuario encontró PostgreSQL 18.6 correctamente incluido en resources/postgresql/bin. initdb.exe, postgres.exe, pg_ctl.exe y psql.exe terminaban con -1073741515 / 0xC0000135 (dependencia de ejecución ausente). Windows no tenía VCRUNTIME140.dll, VCRUNTIME140_1.dll, MSVCP140.dll ni CONCRT140.dll. Instalar Microsoft Visual C++ Redistributable x64 permitió ejecutar los cuatro binarios: la causa quedó confirmada por esa intervención.

El intento anterior dejó data-inicializando. Tras conservar/retirar manualmente ese intento incompleto y reiniciar, se creó data con PG_VERSION=18 y ruizcacao.conf, arrancó PostgreSQL y apareció Crear usuario. Este resultado corresponde al instalador anterior con el runtime incorporado manualmente; la solución NSIS nueva requiere repetir la VM.

## Distribución y verificación

- Redistribuible oficial: https://aka.ms/vc14/vc_redist.x64.exe.
- Versión aprobada: 14.51.36247.0; arquitectura x64; tamaño descargado: 18.731.856 bytes.
- SHA-256: 843068991daaa1f73ad9f6239bce4d0f6a07a51f18c37ea2a867e9beca71295c.
- Authenticode: Valid, CN=Microsoft Corporation, verificado en el equipo técnico.
- Manifiesto versionado: build/vcredist-manifest.json; versión NSIS: build/vcredist-version.nsh.
- Ejecutable en caché: vendor/vcredist/VC_redist.x64.exe, excluido de Git. NSIS lo incrusta en el instalador, fuera de app.asar y de extraResources de la aplicación.
- `npm run prepare:vcredist` usa la caché aprobada. Si falta, descarga únicamente del enlace oficial; alternativamente RUIZCACAO_VC_REDIST apunta a una copia offline del MISMO binario oficial aprobado. Hash, firma, editor, arquitectura y versión se comprueban antes de promover el archivo temporal a la caché. Un fallo de descarga no deja un ejecutable parcial como caché válida.
- El enlace oficial es mutable: un binario futuro con otro hash se rechaza. Conservar la copia aprobada para builds reproducibles; una actualización exige revisar la firma/arquitectura, aprobar un nuevo manifiesto y cambiar la versión NSIS conjuntamente. No cambiar hashes para eludir un rechazo.
- release:preflight y beforePack verifican el runtime. preflight comprueba además --version de postgres/initdb/pg_ctl/psql/pg_dump/pg_restore del motor a distribuir. Falta de runtime, firma no válida o hash diferente impiden empaquetar.
- La descarga y comprobación Authenticode pertenecen al equipo técnico. La instalación en el cliente funciona offline y la aplicación no descarga ni instala binarios.

## Instalador NSIS

El hook customInit se ejecuta antes de desinstalar la aplicación previa o extraer su reemplazo. Consulta Installed y Version del registro VC\Runtimes\x64 en vistas 64/32; acepta la misma versión aprobada o una posterior. Comprueba también la presencia de las cuatro DLL en System32 nativo, desactivando y restaurando únicamente la redirección de archivos de NSIS x86 durante esas lecturas.

Si hace falta, extrae el instalador Microsoft a PLUGINSDIR y ejecuta `/install /quiet /norestart` con el verbo runas de StdUtils (plugin ya incluido por electron-builder). Solo el prerrequisito pide UAC en la instalación por usuario. La app continúa sin privilegios elevados ni servicios nuevos. El asistente mantiene la opción existente de instalar para todos los usuarios, cuya elevación también se limita a instalación/desinstalación.

Se espera la terminación del proceso. Código 0 requiere una comprobación posterior satisfactoria. Código 1638/0x80070666 solo se acepta si la comprobación confirma una versión igual/posterior y DLL presentes (posible instalación concurrente). Otros fallos, cancelación UAC o imposibilidad de esperar detienen la instalación con un mensaje comprensible. Códigos 3010/1641 solicitan reiniciar y volver a ejecutar el instalador; se detiene antes de reemplazar 1.1.2 o arrancar la aplicación. No se reinicia Windows automáticamente.

El log técnico de NSIS queda en LOCALAPPDATA/RuizCacao Manager/logs/instalacion-runtime.jsonl: módulo, operación, versión, resultado del lanzamiento y código. No incorpora rutas, argumentos, credenciales ni stdout/stderr. La interfaz no muestra códigos hexadecimales ni nombres de DLL. Desinstalar la app no desinstala el runtime compartido de Microsoft.

## Primer arranque y conservación

PostgresLocal comprueba --version de los cuatro ejecutables antes de crear la carpeta local, generar credenciales o iniciar initdb. Una dependencia ausente se registra con código numérico y operación en incidencias.jsonl sanitizado, y se muestra un mensaje para completar la instalación. No se exponen rutas, argumentos, contraseña, stderr ni nombres de DLL.

Un fallo de inicialización se registra de forma sanitizada y conserva data-inicializando. inicio.pw se retira en finally. Un intento previo interrumpido sigue requiriendo intervención de soporte; no se reintenta sobre él automáticamente. Un data existente sin PG_VERSION se rechaza expresamente, y una versión mayor incompatible conserva datos y credenciales. Las pruebas cubren datos existentes con/sin clave, intento incompleto y cambio de versión mayor. El reinicio de un clúster válido mantiene datos y conexión.

No cambian credenciales, puerto 55432–55442, loopback, SCRAM, ruizcacao_app, almacenamiento por usuario ni configuración de servicios. Migraciones SQL 001–010 conservan los hashes iniciales.

## Directorio y compatibilidad 1.1.2

La configuración anterior era oneClick por defecto y per-user. electron-builder 26.0.12 toma sanitizedName en ese caso: package.name=electron-app explica LOCALAPPDATA/Programs/electron-app, aunque productName ya fuese RuizCacao Manager.

Se activa el asistente NSIS (`oneClick: false`) manteniendo instalación por usuario como predeterminada, elevación permitida exclusivamente al instalador y sin selector de directorio. electron-builder toma productFilename para el directorio nuevo; AppInfo utiliza aquí executableName=RuizCacaoManager, por lo que la carpeta será LOCALAPPDATA/Programs/RuizCacaoManager, coherente con el nombre del producto y el ejecutable. La prueba instancia el AppInfo real con las opciones Windows para verificar este detalle.

Se conservan package.name=electron-app, appId=com.gruporuiz.ruizcacao-manager, productName, executableName=RuizCacaoManager y deleteAppDataOnUninstall=false. La GUID y claves de actualización derivan del mismo appId. multiUser.nsh reutiliza InstallLocation de HKCU/HKLM antes de calcular una carpeta nueva; una actualización sobre 1.1.2 conserva electron-app si esa era su ubicación registrada. No se mueve el almacenamiento APPDATA/RuizCacao Manager. La compatibilidad está sustentada por el código del builder instalado y prueba de identidad/nombre; la actualización real necesita validación en VM.

## Pruebas y evidencias

Controles finales completos. La instalación del nuevo instalador en VM permanece pendiente.

- `npm run typecheck`: 0 en el corte implementado; también incluido en release:preflight.
- `npm run lint -- --no-cache`: 0, cero errores y 726 advertencias de formato previas.
- `npm run db:test`: 0, suite completa final en clúster temporal ruizcacao-tests-gCYnb4, incluyendo prueba de runtime y conservación (primer corte también 0 en ruizcacao-tests-90Gp0d).
- `npm run db:sql`: 0; SHA-256 de 001–010 idénticos antes/después.
- `npm run release:preflight`: 0, runtime firmado/hash verificado y seis ejecutables PostgreSQL 18.6 responden.
- `node tests/distribucion-windows.cjs`: 0; archivos ausentes/alterados rechazados, identidad y nombre coherentes. Requiere dist/builder-effective-config.yaml del paquete previo para la comparación.
- `node scripts/probar-instalador-runtime.cjs`: 0 final; incluye instalador y desinstalador, compara runtime ausente/antiguo/igual/posterior en un arnés NSIS temporal sin instalar Microsoft VC++ ni construir la aplicación. La advertencia 6010 corresponde al hook que se compila pero deliberadamente no se llama en este arnés. No se probaron automáticamente UAC ni los códigos devueltos por una instalación real de Microsoft: quedan en la lista VM.
- Esquema de configuración de electron-builder 26.0.12: validación 0, sin construir la app.
- Los cuatro ejecutables de dist/win-unpacked/resources/postgresql/bin responden --version con PostgreSQL 18.6 y código 0. Es el paquete preexistente, no un nuevo build 1.2.0.
- `git diff --check`: 0 en el corte revisado.

Logs: docs/evidencias-escalabilidad/{db-test,lint,preflight,nsis}-prerrequisito-windows-2026-10-03.txt. Códigos, hashes y límites de validación en verificaciones-prerrequisito-windows-2026-10-03.json del mismo directorio. El primer intento restringido de db:test no pudo arrancar su servidor; repetir fuera del sandbox pasó. Un intento de preflight coincidió con los ejecutables abiertos por la suite y falló por archivos en uso; se repitió correctamente al finalizar. Ejecutar estas dos operaciones secuencialmente.

## Archivos de esta tarea

Modificados: .gitignore, electron-builder.yml, package.json (scripts; versión 1.2.0 ya fijada por el usuario), scripts/verificar-distribucion.cjs, src/main/database/postgres-local.ts, src/main/database/errores.ts, tests/run.cjs, docs/WINDOWS_LIMPIA.md, docs/ESTADO_CONTINUIDAD_ESCALABILIDAD.md.

Nuevos: build/installer.nsh, build/vcredist-manifest.json, build/vcredist-version.nsh, scripts/preparar-vcredist.cjs, scripts/verificar-vcredist.ps1, scripts/preparar-distribucion.cjs, scripts/probar-instalador-runtime.cjs, tests/postgres-prerrequisito.cjs, tests/distribucion-windows.cjs, este informe y evidencias. Caché binaria ignorada: vendor/vcredist/VC_redist.x64.exe. Se preservan los cambios previos de Etapa 05 y Novedades.

## Siguiente paso exacto

Con autorización de build, ejecutar `npm run build:win` después de terminar cualquier db:test, revisar el paquete final y conservar el instalador/hash. Ejecutar la lista de [Windows limpia](WINDOWS_LIMPIA.md) offline en Windows 10/11 x64 sin VC++ previo. Confirmar UAC solo en instalación, --version de los cuatro binarios, Crear usuario, PG_VERSION=18 y esquema 10/25 tablas; repetir cancelación UAC y actualización real desde 1.1.2 con copia de seguridad. Registrar reinicio requerido si ocurre. No declarar la nueva instalación validada en VM antes de esa prueba. No se ejecutó build de aplicación, seed, publicación Git ni se modificaron migraciones.

Fuentes primarias: [Microsoft: runtime v14 x64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170), [Microsoft: detección/instalación del redistribuible](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files?view=msvc-170), [electron-builder: NSIS](https://www.electron.build/v26/docs/nsis/), [StdUtils: plugin incorporado](https://nsis.sourceforge.io/StdUtils_plug-in). Decisiones de carpeta/identidad contrastadas también con NsisTarget.js, targetUtil.js y multiUser.nsh de app-builder-lib 26.0.12 instalado.
