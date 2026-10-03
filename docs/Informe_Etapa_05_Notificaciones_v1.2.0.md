# Etapa 05 — Gestión de notificaciones

Corte 2026-10-03 (America/Guayaquil). Rama feature/escalabilidad-postgresql; HEAD inicial dd558d86e54c0c845cc098f703e2abfeb987ccc0a, árbol limpio. Aplicación 1.1.2; objetivo 1.2.0. Implementación y pruebas automáticas completas; lista para revisión visual humana. No se ha congelado ni publicado 1.2.0.

## Inspección terminada antes de modificar

Tabla notificaciones con id UUID, titulo, mensaje, fecha timestamptz, leida boolean, evento_clave UNIQUE y destino opcional. No tenía usuario_id ni tipo independiente. Todos los usuarios veían los mismos avisos y compartían el estado leído. Se generaban desde BaseLocal.aviso y el respaldo manual fallido de mantenimiento. Header tenía badge, apertura sin marcar automáticamente y marcado individual vía leerAviso, cuya respuesta recargaba EstadoAplicacion completo. No existía borrado ni limpieza.

## Cambios implementados

Migración 010 necesaria por aislamiento: ALTER de notificaciones, usuario_id con FK a usuarios y unicidad de evento por destinatario. Sin nuevas tablas. Avisos históricos se conservan, incluyendo ID original para el primer usuario (principal primero), contenido, fecha, leído y destino; se copian para los demás usuarios existentes. Cada usuario puede leer/borrar su copia sin afectar las otras. Si una instalación antigua no tiene usuarios, se conservan los originales pendientes de asignación hasta la primera carga autenticada. Nuevos eventos generales siguen entregándose a todos los usuarios existentes, incluidos inactivos. Usuarios creados posteriormente reciben eventos futuros; no heredan las copias privadas del historial de otros usuarios.

Seis operaciones IPC/preload tipadas devuelven solo avisos y noLeidas. El usuario se toma exclusivamente de la sesión Main; UUID validado y todas las mutaciones incluyen usuario_id. El contrato legado leerAviso se mantiene por compatibilidad y queda también protegido; Header ya no lo utiliza. Limpieza real SQL por usuario: leida=true AND fecha <= CURRENT_TIMESTAMP - interval '48 hours'. Antigüedad desde fecha de creación, no desde el momento de lectura. Se ejecuta al listar/inicializar y al abrir la campana; sin timers. Los no leídos se conservan indefinidamente.

Renderer mantiene estado de avisos separado; cola local ordena lecturas/mutaciones y descarta respuestas y errores tras desmontar sesión. Cambios de negocio disparan una lectura compacta y nunca restauran avisos desde un Snapshot anterior. Menú compartido por tres puntos/clic derecho, flechas/Home/End, Escape, cierre por clic fuera y foco. Leídos muestran únicamente Eliminar. Eliminar individual mantiene el panel abierto y pasa el foco a otra fila o al título. Marcar todas actualiza badge, sin marcar automáticamente al abrir. Eliminar todas usa ModalAccesible, con foco inicial en Cancelar, Escape y confirmación; el diálogo no cierra accidentalmente el panel. Estado vacío y acciones deshabilitadas con guardas durante las solicitudes. El panel mantiene scroll nativo, cabecera/acciones visibles y contención de palabras largas.

## Verificación final

| Prueba | Código | Resultado |
| --- | --- | --- |
| npm run typecheck | 0 | Node y Renderer |
| npm run lint | 0 | 0 errores, 727 advertencias heredadas de formato |
| npm run db:test | 0 | Suite completa; clúster temporal ruizcacao-tests-zvN1Zn |
| npm run db:sql | 0 | Exporta 010 y verifica históricas sin sobrescribir 001–009 |
| git diff --check | 0 | Sin errores de espacios |
| Migraciones 001–009 y dependencias vs HEAD | 0 | SQL/TS, schema/relacional, package.json y lockfile sin diff |
| Chromium con CSS real, escritorio/reducida/zoom 125 % | 0 | Tres escenarios completos; StrictMode; nueve capturas |

La nueva suite tests/notificaciones.cjs comprueba v9→v10 con dos usuarios, mismo ID original para el principal, contenido/fecha/leído/destino conservados en las copias, 25 tablas, instalación histórica sin usuarios y asignación posterior. Fallo de respaldo impide DDL; fallo posterior al copiado y antes de registrar versión 10 revierte columnas, filas y versión a 9. Respaldos pre_migracion custom verificados con esquema 9. Hashes de las nueve migraciones históricos iguales antes/después del ensayo.

Las seis acciones rechazan sesiones anónimas; las individuales rechazan UUID inválidos. Listado/badge correctos y avisos privados del segundo usuario ausentes del primero; leer/borrar individual y todas no alteran al otro usuario. Limpieza elimina registros reales leídos de 49h y 48h, conserva leído de 47h y no leído de 99h; repetir es idempotente. Evento general deduplicado por destinatario. Lecturas/borrados y estado vacío persisten al reiniciar BaseLocal y cambiar de usuario. Las operaciones compactas pasan aun cuando se prohíbe llamar a datos/Snapshot en Main. Cola probada con lectura anterior pendiente, eliminación posterior, desmontaje, respuesta/error viejo y recuperación tras fallo.

La suite completa conserva equivalencia financiera de filas/resúmenes y HTML de PDF diario/semanal/mensual, cursores/COUNT/Unicode, CRUD, mano de obra, anulaciones, jornadas, autenticación y recuperación. Se adaptaron únicamente las expectativas de versión final de las pruebas antiguas; sus escenarios siguen activos. La guarda del generador de fixtures aislados admite esquema 10 y el benchmark sintético mantiene propietario en sus avisos; no se ejecutó db:seed:performance ni db:benchmark, ni hubo seed en desarrollo. Los fixtures de db:test viven exclusivamente en el clúster temporal verificado.

El arnés Chromium comprueba menú de leído/no leído, clic derecho, flecha abajo/Escape y retorno de foco, marcado uno/todos, borrar individual sin cerrar, cancelar/confirmar todas, Escape del modal, vacío, cierre/reapertura, lectura atrasada y Snapshot anterior de otra acción. Cero consultas de Snapshot para acciones de avisos. Viewports reales: escritorio 1443×778, reducida 803×603, zoom real 1,25 con viewport 1026×622. Panel contenido sin overflow horizontal global. PNG revisados: panel reducido y confirmación a 125 %. Es un arnés con datos en memoria; la revisión humana de la aplicación completa sigue pendiente.

Durante desarrollo hubo salidas 1 por lint inicial (tipado/variables y setters síncronos en effect, corregidos), expectativas antiguas de esquema 9, guarda de fixtures 8/9 y foco tras borrar. Intentos restringidos de PostgreSQL/Chromium fallaron al iniciar procesos; se repitieron con permiso fuera del sandbox, siempre usando entornos temporales. Las ejecuciones finales indicadas arriba pasan.

Evidencias: docs/evidencias-escalabilidad/db-test-etapa05-2026-10-03.txt, typecheck-etapa05-2026-10-03.txt, lint-etapa05-2026-10-03.json, notificaciones-etapa05-2026-10-03.json, nueve notificaciones-*.png y verificaciones-etapa05-2026-10-03.json (códigos, hashes y archivos).

## Archivos modificados

- database/010-notificaciones.sql; src/main/database/migracion-diez.ts y notificaciones.ts (nuevos).
- src/main/database/base.ts e ipc.ts; src/preload/index.ts; src/shared/persistencia.ts.
- src/renderer/src/components/Header.tsx y nuevo PanelNotificaciones.tsx; store/AppDataContext.tsx; nuevos hooks/useNotificaciones.ts y utils/colaNotificaciones.ts.
- scripts/exportar-esquema.cjs, mantenimiento.cjs (solo generación de aviso de respaldo, resto funcional intacto), benchmark-postgres.cjs (compatibilidad de fixture con esquema 10), seed-rendimiento-core.cjs (guarda del fixture aislado; no ejecuta seed por sí solo).
- tests/notificaciones.cjs y tests/run.cjs; expectativas de migración final en tests/migracion.cjs, migracion-v2/v3/v5/v6/v8/v9.cjs y anulaciones-v7.cjs.
- scripts/probar-notificaciones-etapa05.cjs y perfil-notificaciones-etapa05.tsx (nuevos; reutilizan preload de pruebas existente).
- Este informe, ESTADO_CONTINUIDAD_ESCALABILIDAD.md y las evidencias indicadas.

No cambios comerciales, de paginación, reportes, lógica de autenticación/recuperación, dependencias ni migraciones históricas. No Snapshot refactorizado: únicamente la lectura de avisos se restringe al propietario y el Renderer usa respuestas compactas. Sin pull/merge/commit/push/tag/build. No se ha iniciado ni migrado la base local real.

## Revisión humana preparada

Campana con varios avisos y badge; abrir sin lectura automática; marcar uno/todos; menú tres puntos y clic derecho en leído/no leído; Escape/flechas/Tab/foco; eliminar uno sin cerrar panel; cancelar/confirmar todas; vacío; cerrar/reabrir panel y aplicación; persistencia; ventana reducida y zoom 125 %. Verificar aislamiento con dos usuarios y retención de no leídos antiguos en una base de pruebas.

Siguiente paso exacto: desde electron-app ejecutar npm run dev en el entorno local de desarrollo, verificar el respaldo automático pre_migracion y la actualización v9→v10, iniciar sesión existente y ejecutar la lista humana anterior, con dos usuarios cuando corresponda. Registrar resultados y persistencia tras cerrar/reabrir aplicación antes de congelar 1.2.0. No ejecutar seed ni usar base cliente. Esquema final de código y suite: 10, 25 tablas; migración 010 sí. La base local real permanece sin migrar en esta intervención; no se debe confundir el esquema probado con una actualización ya aplicada allí.
