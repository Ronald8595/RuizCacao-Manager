const assert = require('node:assert/strict')
const { load, root } = require('./loader.cjs')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
const { ServicioRespaldos, ErrorRespaldo } = load(root + '/src/main/respaldos-servicio.ts')
const { despacharRespaldo } = load(root + '/src/main/respaldos-ipc.ts')
async function main() {
  let usuarios = 0,
    cargas = 0,
    limpiezas = 0
  const base = Object.create(BaseLocal.prototype)
  base.pool = {
    query: async (sql) => {
      assert.equal(sql, 'SELECT id FROM ruizcacao.usuarios LIMIT 1')
      return { rowCount: usuarios }
    }
  }
  base.cerrando = false
  base.usuario = null
  assert.equal(await base.autorizarCargaRespaldo(), 'instalacion-sin-usuarios')
  assert.equal(await base.confirmarCargaRespaldo(''), true)
  assert.equal(await base.confirmarCargaRespaldo('inventada'), false)
  const servicio = new ServicioRespaldos({
    autorizar: async (tipo) => {
      try {
        return tipo === 'cargar' ? await base.autorizarCargaRespaldo() : base.autorizarRespaldos()
      } catch {
        throw new ErrorRespaldo('permiso')
      }
    },
    credencial: async (p) => {
      if (!(await base.confirmarCargaRespaldo(p))) throw new ErrorRespaldo('password')
    },
    seleccionar: async () => 'respaldo.back',
    tamano: async () => 123,
    preparar: async () => ({
      manifest: { created_at_utc: '2026-10-18T12:00:00.000Z', app_version: '1.3.0' },
      limpiar: async () => {
        limpiezas++
      }
    }),
    cargar: async (p, _, autorizacion) => {
      assert.equal(autorizacion, 'instalacion-sin-usuarios')
      cargas++
      await p.limpiar()
    },
    generar: async () => {
      throw Error('Nunca generar sin administrador')
    },
    bloquearHastaReinicio: () => {},
    reiniciar: async () => {},
    progreso: () => {}
  })
  const call = (canal, ...args) => despacharRespaldo(servicio, canal, args)
  assert.equal((await call('seleccionarDestinoRespaldo')).codigo, 'permiso')
  let s = (await call('seleccionarRespaldo')).valor
  let r = (await call('validarRespaldoSeleccionado', s.operacionId)).valor
  usuarios = 1
  assert.equal(
    (await call('cargarRespaldo', s.operacionId, r.preparacionId, true, '')).codigo,
    'permiso'
  )
  assert.equal(cargas, 0)
  assert.equal(limpiezas, 1)
  assert.equal((await call('seleccionarRespaldo')).codigo, 'permiso')
  usuarios = 0
  s = (await call('seleccionarRespaldo')).valor
  r = (await call('validarRespaldoSeleccionado', s.operacionId)).valor
  assert.equal(
    (await call('cargarRespaldo', s.operacionId, r.preparacionId, false, '')).codigo,
    'solicitud'
  )
  assert.equal(
    (await call('cargarRespaldo', s.operacionId, r.preparacionId, true, '')).valor.reiniciar,
    true
  )
  assert.equal(cargas, 1)
  await servicio.cerrar()
  base.cerrando = true
  await assert.rejects(base.autorizarCargaRespaldo())
  console.log(
    'OK recuperación inicial: sin creación automática, solo carga, confirmación obligatoria y revocación si aparece un usuario.'
  )
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
