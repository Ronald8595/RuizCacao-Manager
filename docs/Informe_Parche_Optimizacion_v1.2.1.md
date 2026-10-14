# Parche v1.2.1 — diagnóstico y fecha de Cuentas

Fecha: 13/10/2026, America/Guayaquil. Fuentes identificadas como 1.2.1; no se generó una distribución.

## Estado de cierre

Fecha de Cuentas implementada y pruebas automatizadas aprobadas. Diagnóstico de rendimiento parcialmente medido. **No hay una mejora de arranque demostrada ni una optimización de rendimiento aceptada.** No se declara terminada la solicitud completa: faltan el arranque de la aplicación real, login real, navegación, recursos de PostgreSQL y reposo de cinco minutos.

Se conservaron el Snapshot completo, transacciones, cálculos financieros, jornadas, anulaciones, reportes, PDFs y recuperación. No se ejecutaron build, db:seed:performance, commit, push ni tag. La suite db:test incluye pruebas del generador en bases efímeras; no ejecuta el comando prohibido sobre la base local.

## Método y alcance

`scripts/perfil-parche.cjs antes|despues` lee la conexión protegida existente y usa una transacción PostgreSQL REPEATABLE READ READ ONLY. No llama iniciar/login/ejecutar sobre esa base. Mide BaseLocal.estado sin sesión, conversiones DTO, JSON UTF-8, lectura de dominio y transferencia IPC real de un estado cacheado a una ventana vacía oculta.

La opción `--small` crea un clúster nuevo en Temp, inicia PostgreSQL, aplica el esquema y crea un administrador exclusivo de ese clúster para medir login. No inserta un dataset comercial. El motor se detiene al finalizar. Cada ejecución conserva su directorio temporal para inspección. El coste de initdb de una instalación nueva no equivale al arranque recurrente de una instalación existente.

Los informes JSON no contienen passwords, credenciales ni filas comerciales. Contienen nombres de consultas, tiempos, conteos, huellas y métricas de procesos. El tamaño JSON **no** es el número de bytes del protocolo IPC de Electron. El tiempo IPC incluye structured clone, transporte y entrega, no se separan esas fases. Ready incluye la carga del arnés TypeScript y no representa el bootstrap de producción.

RSS y Working Set pertenecen al arnés: retiene estado, JSON, filas cacheadas y muestras. No son memoria de una sesión comercial normal ni evidencia de fuga. Los porcentajes instantáneos de app.getAppMetrics al final del trabajo no representan CPU de arranque ni CPU en reposo; se informa CPU acumulada de Main al obtener el estado.

## Tabla antes / corte final: base grande existente

Medianas: cinco muestras de estado/IPC y nueve de conversión DTO. El corte final añade el cálculo puro consumido por Inicio, en Main, sin DOM; no es tiempo de Renderer. Hay variación importante entre ejecuciones; el código de lectura original fue restaurado. **Estas diferencias no se atribuyen a mejoras o regresiones de la aplicación.**

| Medición | Antes | Corte final | Interpretación |
| --- | ---: | ---: | --- |
| Obtención de estado | 888,49 ms | 1.720,64 ms | Lectura completa conservada |
| Conversión DTO sin SQL | 228,96 ms | 681,51 ms | Misma conversión final; variación del arnés |
| JSON.stringify de estado | 226,17 ms | 457,16 ms | Proxy de serialización, no structured clone |
| crearLecturaDominio | 5,15 ms | 9,97 ms | Vista existente, sin cambios |
| Cálculo puro de resumen de Inicio | No medido | 2,98 ms | Sin render de Inicio |
| IPC cacheado | 613,00 ms | 2.982,80 ms | Ventana vacía, sin cola real de login |
| Tamaño JSON estado | 65.339.663 bytes | 65.339.663 bytes | Sin reducción de payload |
| Consultas de estado sin sesión | 15 | 15 | No incluye login/arranque |
| RSS Main, mediana entre muestras | 832,37 MiB | 823,61 MiB | Memoria del arnés, sin promesa de reducción |
| CPU acumulada Main por estado | 1.031 ms | 1.875 ms | No es porcentaje de CPU |

Huella de Snapshot antes/final: `58409b1f759808106ccd0bb6ef1d9a07439d9d29022f28288b03133b28d08aa7`.

Antes de añadir el cálculo puro de Inicio hubo otro corte con el lector restaurado: estado 757,65 ms, conversión 203,52 ms, JSON 190,43 ms, IPC 580,60 ms. Es un control de variación, tampoco una optimización. Su salida quedó registrada en la sesión; el JSON `parche-despues` corresponde al corte final de la tabla.

Working Set Renderer de la ventana vacía al terminar los IPC está en `memoriaProcesos` (tipo Tab) de ambos JSON. No se compara como consumo de Inicio porque la ventana no monta la aplicación.

## Base pequeña aislada nueva

| Fase | Antes | Después |
| --- | ---: | ---: |
| Proceso del arnés hasta ready | 429,08 ms | 817,73 ms |
| Localización de binarios | 0,50 ms | 0,45 ms |
| PostgresLocal.iniciar, incluyendo initdb/verificación/arranque | 42.192,00 ms | 41.549,84 ms |
| BaseLocal.iniciar, incluyendo conexión inicial y migraciones nuevas | 467,54 ms | 525,59 ms |
| Consulta de existencia de administrador | 10,54 ms | 7,38 ms |
| Login con usuario exclusivo de prueba | 170,60 ms | 171,73 ms |

No se cambiaron estas fases. La conexión auxiliar usada después por el lector proviene del pool ya iniciado; no debe confundirse con la primera conexión. Los JSON incluyen sus restantes muestras de estado, CPU, RSS y procesos. No se contabilizaron todas las consultas de bootstrap/login: el contador detallado comienza con la lectura de estado.

## Causa medida y diagnóstico de código

El cuello medido en la base grande es la lectura y transmisión del estado global completo de 65,34 MB, no la creación de la vista de dominio ni el cálculo puro del resumen diario. `BaseLocal.datos` lee las nueve entidades mediante `leerEntidades`; `estado` añade existencias, jornada, usuarios, configuración y avisos. Cada solicitud viaja por la cola IPC serial, que se conserva por consistencia.

El arranque de `src/main/index.ts` espera iniciarPersistencia antes de crear la ventana. PostgresLocal verifica cuatro ejecutables secuencialmente; en instalación nueva inicializa el clúster. No se separaron sus subfases con este arnés. La persistencia no carga el Snapshot comercial antes de autenticar: Acceso consulta estadoAcceso; login devuelve el primer estado comercial.

App.tsx importa las páginas de forma eager. Solo monta ActivePage; no hay prueba de que páginas ocultas permanezcan montadas. AppDataContext ya memoiza crearLecturaDominio por estado.datos y comparte arrays; se conserva. Inicio ya memoiza el resumen por sus datos/día. Cuentas conserva sus índices, filtros y rango de filas virtuales. Header retira sus listeners y useFechaActual retira intervalo/listeners al desmontar; no se ha demostrado crecimiento continuo. No hay polling de notificaciones por temporizador en useNotificaciones.

La causa principal del **arranque completo hasta Inicio interactivo** todavía no está determinada: el arnés no mide el login de la sesión real ni montaje/render/layout de Acceso, Sidebar, Header e Inicio.

## Optimizaciones evaluadas y descartadas

- Preclasificar tipos de columnas DTO: dos variantes probadas. Primer corte de conversión alrededor de 749 ms; segunda variante, mediana 729,35 ms, frente a 228,96 ms iniciales. El control con lector restaurado volvió a 203,52 ms, pero otro corte final también mostró costes altos. No se demostró ventaja fiable; ambas variantes retiradas. relacional.ts conserva el algoritmo original.
- Eliminar la consulta de notificaciones al montar: en el clúster pequeño una llamada devuelve los mismos avisos que el estado, tarda 35,26 ms y ejecuta tres consultas funcionales (sin contar BEGIN/SET/COMMIT). **También asigna avisos históricos y elimina leídos de más de 48 horas.** No es una lectura redundante pura; se conserva el hook y mantenimiento actual.
- Reducir Snapshot / diferir historiales: requiere garantizar todos los consumidores y contratos de comandos; no se altera a ciegas. No se implementó carga parcial.
- Cambiar secuencias por paralelismo: transacciones y cola IPC mantienen su orden. No se justificó romperlo con estas mediciones.
- Lazy loading: encontrado eager, pero sin comparación de módulos/carga/render no se aplica por intuición.
- Índices y migración 011: no hay EXPLAIN/benchmark que los justifique. No se crean.

## Fecha de Cuentas

DTO existente: Cuenta.fecha (DATE), fechaHoraRegistro y fechaUltimoMovimiento. registrarCompra asigna fecha de compra, registrarVenta asigna fechaVenta y crearCuentaManual asigna input.fecha. registrarAbono actualiza fechaUltimoMovimiento y monto/estado, conservando fecha. Se usa **Cuenta.fecha**, no fecha del último abono. No se escribe ni recalcula historia.

Se agregó Fecha de operación en el listado, DD/MM/YYYY mediante formatoFecha existente; los tres colSpan pasan de ocho a nueve. El detalle muestra la misma fecha y se añadió Ver detalle de cuenta para todas las filas, incluidas ventas, manuales y cerradas. El detalle por cliente ya mostraba fecha y se conserva. Se mantienen filtros, paginación 10/25/50/100, altura de fila 56 y virtualización.

tests/cuentas-fecha.cjs verifica relación de fechas de compra/venta, estados pendientes/parciales/cerrados, abonos posteriores, cierre de cuenta, creación manual y formato. Usa fixture pequeño en memoria y comandos reales del dominio. No es una prueba de interacción visual ni sustituye revisar páginas/filtros y detalle en Electron.

## Archivos modificados

- package.json, package-lock.json: versión raíz 1.2.1, sin cambio de dependencias. El lock tenía versión raíz antigua 1.1.2; solo se sincronizaron las dos entradas del proyecto.
- src/renderer/src/pages/Cuentas.tsx, components/DetalleCuenta.tsx.
- tests/cuentas-fecha.cjs, tests/run.cjs.
- scripts/perfil-parche.cjs.
- Este informe, ESTADO_CONTINUIDAD_ESCALABILIDAD.md y evidencias parche-*.json / logs de verificaciones.

## Verificaciones

- npm run typecheck: código 0, Node/Web.
- npm run lint -- --no-cache: código 0, cero errores, 725 advertencias de formato en el corte final.
- npm run db:test: código 0, suite completa incluida cuentas-fecha, clúster aislado ruizcacao-tests-4b7xoY. El cambio posterior de versión se verificó además con tests/novedades.cjs; formatter no cambió lógica.
- node tests/cuentas-fecha.cjs y node tests/novedades.cjs: código 0.
- git diff --check: código 0.
- Esquema final: **10, 25 tablas**. Migraciones 001–010 y fuentes de database sin cambios finales. Migración 011: **NO**.

## Mediciones y pruebas humanas pendientes

No se fabrican valores para las siguientes fases: proceso de producción hasta app.whenReady; verificación vs inicio PostgreSQL recurrente; primera conexión aislada de migraciones; tiempo real hasta mostrar Acceso; login real y obtención separada del estado; structured clone Main; transferencia aislada; procesamiento Renderer; Inicio interactivo.

Faltan escenarios completos sin login, login→Inicio, Inicio→Cuentas, Inicio→Compra/Venta y vuelta a Inicio. Faltan memoria/CPU de esos puntos, suma de memoria privada de procesos PostgreSQL y cinco minutos de reposo con control de crecimiento/polling.

Revisar manualmente Cuentas: compra/venta pendientes y parciales, abonos posteriores, saldadas, manuales; fecha idéntica en tabla y detalle; filtros y páginas 10/25/50/100; scroll virtual al inicio/medio/final; ventana estrecha/zoom; acceso al nuevo botón con teclado. No se declara revisión visual completada.

Siguiente paso: perfilar la aplicación completa en desarrollo con sesión existente y el motor ya configurado, separando marcas de Main/preload/Renderer y tomando métricas de todos los procesos. No publicar 1.2.1 como optimización de arranque verificada hasta cerrar esas mediciones y demostrar un cambio seguro.
