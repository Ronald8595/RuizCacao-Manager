RuizCacao Manager
Aplicación de escritorio para la gestión operativa y comercial de Grupo Ruiz, desarrollada con Electron, React, TypeScript y PostgreSQL.
Estado actual
- Versión de aplicación: 1.1.2
- Esquema PostgreSQL: 7
- Tablas: 25
- Plataforma objetivo: Windows
- Modo de operación: local / offline
- Autor del software: boloneitor
La versión 1.1.2 es el punto estable actual y debe conservarse mediante el tag Git v1.1.2.
Funcionalidades principales
- Inicio y control de jornada.
- Clientes y proveedores.
- Compras y ventas.
- Stock e inventario.
- Conversión de cacao en baba a cacao seco.
- Cuentas por cobrar y por pagar.
- Gastos y pagos de mano de obra.
- Consultas y reportes.
- Comprobantes y PDF.
- Usuarios y roles.
- Notificaciones.
- Respaldos.
- Recuperación de contraseña mediante autorización firmada.
- Auditoría y trazabilidad.
Versión 1.1.2
Entre los cambios principales:
- Compras y ventas confirmadas son inmutables.
- Se elimina la edición y el borrado físico de operaciones confirmadas.
- Se incorpora anulación trazable de compras y ventas.
- Se pueden anular operaciones históricas con una jornada actual activa.
- La anulación exige motivo y contraseña del usuario autenticado.
- Se conserva el autor original y se registra por separado quién anuló.
- Se generan compensaciones de inventario.
- Las operaciones anuladas permanecen en historial.
- Las operaciones anuladas no participan en saldos ni reportes financieros.
- Se incorpora una ventana de novedades después del login.
- El esquema PostgreSQL pasa de versión 6 a 7 mediante 007-anulaciones.sql.
Arquitectura
React Renderer
      |
      v
Preload / contextBridge
      |
      v
Electron Main
      |
      +-- reglas de negocio
      +-- autenticación
      +-- auditoría
      +-- migraciones
      +-- respaldos
      +-- generación PDF
      |
      v
PostgreSQL privado local
El Renderer no se conecta directamente a PostgreSQL. El acceso a datos y funciones sensibles se realiza desde Electron Main mediante IPC controlado.
Tecnologías
- Electron
- React
- TypeScript
- Vite / electron-vite
- PostgreSQL
- Node.js
- Tailwind CSS
- electron-builder
PostgreSQL
Base: ruizcacao_manager
Esquema: ruizcacao
Versión actual del esquema: 7
Tablas: 25
Migraciones:
001-base.sql
002-relacional.sql
003-seguridad-respaldos.sql
004-interrupciones-umbrales.sql
005-multiusuario.sql
006-stock-inicial.sql
007-anulaciones.sql
Las migraciones publicadas no deben modificarse. Todo cambio futuro debe agregarse como una migración nueva (008-..., 009-..., etc.).
Actualizaciones y conservación de datos
Una actualización normal no debe reinicializar la base existente.
Para actualizar:
1. Usar el mismo perfil de Windows donde se instaló originalmente la aplicación.
2. Cerrar RuizCacao Manager.
3. Conservar un respaldo verificable.
4. Instalar la nueva versión sobre la existente.
5. Permitir que la aplicación aplique las migraciones pendientes.
6. Verificar los datos después de actualizar.
La actualización 1.1.1 -> 1.1.2 está diseñada para conservar clientes, proveedores, usuarios, compras, ventas, cuentas, gastos, stock, jornadas y comprobantes existentes.
Seguridad
El proyecto utiliza:
- Hash seguro de contraseñas.
- PostgreSQL accesible únicamente de forma local.
- Credenciales técnicas protegidas.
- Auditoría.
- Migraciones transaccionales.
- Respaldos antes de migraciones críticas.
- Recuperación offline mediante firmas Ed25519.
Nunca subir a Git
recovery-private.pem
*.key
postgres.enc
conexion*.enc
pgpass.conf
*.dump
*.dump.json
postgres/data/
backups/
.env
.env.*
La aplicación distribuida contiene únicamente la clave pública necesaria para verificar autorizaciones de recuperación.
Desarrollo
Instalar dependencias:
npm install
Ejecutar:
npm run dev
Pruebas
Antes de una entrega:
npm run typecheck
npm run lint
npm run db:test
npm run release:preflight
Todos deben finalizar con código 0.
Build de Windows
npm run build:win
El instalador se genera en dist/.
Formato de la versión actual:
RuizCacaoManager-1.1.2-Setup.exe
Flujo Git recomendado
Rama estable:
main
Integración:
develop
Ramas de trabajo:
feature/escalabilidad
feature/notificaciones
feature/paginacion
feature/rendimiento
Tags:
v1.1.2
v1.2.0
Ejemplo:
git tag -a v1.1.2 -m "RuizCacao Manager 1.1.2"
git push origin v1.1.2
Estructura principal
electron-app/
├── build/
├── database/
├── docs/
├── resources/
├── scripts/
├── src/
│   ├── main/
│   ├── preload/
│   ├── renderer/
│   └── shared/
├── tests/
├── electron-builder.yml
├── electron.vite.config.ts
├── package.json
└── README.md
Próxima etapa
La siguiente actualización se enfocará en:
- escalabilidad;
- índices PostgreSQL;
- consultas paginadas;
- optimización de IPC;
- rendimiento con grandes volúmenes;
- mejoras de notificaciones;
- mensajes de usuario más simples;
- preparación arquitectónica para una futura versión web;
- reducción de deuda técnica;
- pruebas de actualización y regresión.
Documentación
La documentación técnica y los informes de versión se encuentran en docs/.
RuizCacao Manager
Grupo Ruiz
