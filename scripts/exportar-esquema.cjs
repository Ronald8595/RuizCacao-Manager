const fs = require('node:fs'),
  path = require('node:path')
const { load, root } = require('../tests/loader.cjs')
const { esquema, migracionUno } = load(path.join(root, 'src/main/database/schema.ts'))
const { sqlNormalizacion } = load(path.join(root, 'src/main/database/relacional.ts'))
function exportar(ruta, contenido) {
  if (fs.existsSync(ruta) && /00[1-8]-/.test(path.basename(ruta))) {
    if (fs.readFileSync(ruta, 'utf8') !== contenido)
      throw Error('La migración histórica cambió: no se sobrescribió.')
    return
  }
  fs.writeFileSync(ruta, contenido)
}
const carpeta = path.join(root, 'database')
fs.mkdirSync(carpeta, { recursive: true })
exportar(
  path.join(carpeta, '001-base.sql'),
  '-- Referencia de la migración histórica 1; la aplicación controla su ejecución.\n' +
    esquema +
    migracionUno
)
exportar(
  path.join(carpeta, '002-relacional.sql'),
  '-- Referencia de la migración 2. No ejecutar aisladamente sobre una base vacía.\n' +
    sqlNormalizacion()
)
console.log('Migraciones SQL exportadas a database/.')

const { migracionTres } = load(path.join(root, 'src/main/database/migracion-tres.ts'))
exportar(
  path.join(carpeta, '003-seguridad-respaldos.sql'),
  '-- Migración 3; ejecutada transaccionalmente por la aplicación después de un respaldo.\n' +
    migracionTres
)

const { migracionCuatro } = load(path.join(root, 'src/main/database/migracion-cuatro.ts'))
exportar(
  path.join(carpeta, '004-interrupciones-umbrales.sql'),
  '-- Migración 4: recuperación autorizada de jornada y umbrales opcionales.\n' + migracionCuatro
)

const { migracionCinco } = load(path.join(root, 'src/main/database/migracion-cinco.ts'))
exportar(
  path.join(carpeta, '005-multiusuario.sql'),
  '-- Migración 5: multiusuario y trazabilidad por operador.\n' + migracionCinco
)

const { migracionSeis } = load(path.join(root, 'src/main/database/migracion-seis.ts'))
exportar(
  path.join(carpeta, '006-stock-inicial.sql'),
  '-- Migración 6: control de carga única de stock inicial sin compra, gasto ni cuenta.\n' +
    migracionSeis
)

const { migracionSiete } = load(path.join(root, 'src/main/database/migracion-siete.ts'))
exportar(
  path.join(carpeta, '007-anulaciones.sql'),
  '-- Migración 7: anulaciones y operaciones confirmadas inmutables.\n' + migracionSiete
)

const { migracionOcho } = load(path.join(root, 'src/main/database/migracion-ocho.ts'))
exportar(
  path.join(carpeta, '008-rendimiento-paginacion.sql'),
  '-- Migración 8: índice de orden y desempate para historial Stock paginado.\n' + migracionOcho
)

const { migracionNueve } = load(path.join(root, 'src/main/database/migracion-nueve.ts'))
exportar(
  path.join(carpeta, '009-rendimiento-paginacion-compras-ventas.sql'),
  '-- Migración 9: índices medidos para historiales paginados de Compras y Ventas.\n' +
    migracionNueve
)
