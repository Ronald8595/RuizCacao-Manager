const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { load, root } = require('./loader.cjs')
const { ServicioRespaldos, ErrorRespaldo, errorRespaldo } = load(
  root + '/src/main/respaldos-servicio.ts'
)
const { despacharRespaldo } = load(root + '/src/main/respaldos-ipc.ts')
const { apiRespaldos } = load(root + '/src/preload/respaldos.ts')
const uuid = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const pausa = () => new Promise((r) => setImmediate(r))
async function main() {
  let admin = true,
    dialogo = null,
    genera = 0,
    prepara = 0,
    carga = 0,
    limpio = 0,
    reinicio = 0,
    bloqueado = false,
    fallo = null
  const eventos = []
  const preparado = {
    manifest: { created_at_utc: '2026-10-16T12:00:00.000Z', app_version: '1.2.1' },
    limpiar: async () => {
      limpio++
    }
  }
  const puertos = {
    autorizar: () => {
      if (!admin) throw new ErrorRespaldo('permiso')
      return 'admin-id'
    },
    credencial: async (p) => {
      if (p !== 'correcta') throw new ErrorRespaldo('password')
    },
    seleccionar: async () => dialogo,
    tamano: async () => 1234,
    preparar: async (_, ctx) => {
      prepara++
      ctx.fase('validando_contenedor')
      if (fallo) throw fallo
      return preparado
    },
    generar: async (ruta, ctx) => {
      genera++
      ctx.fase('exportando')
      await pausa()
      ctx.signal.throwIfAborted()
      ctx.fase('publicando')
      return ruta
    },
    cargar: async (p, ctx) => {
      assert.equal(p, preparado)
      carga++
      ctx.fase('antes_promocion')
      assert.equal(await servicio.cancelar(id), false)
      await pausa()
      await p.limpiar()
    },
    bloquearHastaReinicio: () => {
      bloqueado = true
    },
    reiniciar: async () => {
      assert.ok(bloqueado)
      reinicio++
    },
    progreso: (p) => eventos.push(p)
  }
  const servicio = new ServicioRespaldos(puertos)
  const call = (c, ...args) => despacharRespaldo(servicio, c, args)
  let id
  admin = false
  assert.equal((await call('seleccionarDestinoRespaldo')).codigo, 'permiso')
  admin = true
  assert.deepEqual(await call('seleccionarDestinoRespaldo'), { ok: true, valor: null })
  assert.equal(genera, 0)
  for (const [c, args] of [
    ['exec', ['pg_restore']],
    ['generarRespaldo', ['C:/arbitrario']],
    ['seleccionarRespaldo', ['C:/ruta']],
    ['cargarRespaldo', [uuid, uuid, false, 'correcta']],
    ['cargarRespaldo', [uuid, uuid, true, 'x'.repeat(129)]],
    ['generarRespaldo', [uuid, 'comando']]
  ])
    assert.equal((await call(c, ...args)).codigo, 'solicitud')
  dialogo = 'C:/privado/Elegido.back'
  id = (await call('seleccionarDestinoRespaldo')).valor.operacionId
  assert.equal((await call('seleccionarRespaldo')).codigo, 'ocupado')
  const activo = call('generarRespaldo', id)
  assert.equal((await call('generarRespaldo', id)).codigo, 'solicitud')
  assert.equal((await call('cancelarOperacionRespaldo', id)).valor, true)
  assert.equal((await activo).valor.estado, 'cancelado')
  id = (await call('seleccionarDestinoRespaldo')).valor.operacionId
  assert.equal((await call('generarRespaldo', id)).valor.estado, 'completado')
  assert.ok(eventos.some((e) => e.fase === 'finalizando' && !e.cancelable))
  for (const [mensaje, codigo] of [
    ['Este respaldo necesita una versión más reciente', 'futuro'],
    ['No hay espacio suficiente', 'espacio'],
    ['Modo de PostgreSQL externo', 'externo'],
    ['integridad SHA hash incorrecta', 'danado'],
    ['El archivo no es un respaldo portable v1 válido', 'invalido'],
    ['Acceso bloqueado', 'bloqueado'],
    ['SELECT secreto password=oculto C:/datos', 'general']
  ]) {
    fallo = Error(mensaje)
    id = (await call('seleccionarRespaldo')).valor.operacionId
    assert.equal((await call('validarRespaldoSeleccionado', id)).codigo, codigo)
  }
  fallo = null
  id = (await call('seleccionarRespaldo')).valor.operacionId
  const r = (await call('validarRespaldoSeleccionado', id)).valor
  assert.deepEqual(
    Object.keys(r).sort(),
    ['operacionId', 'preparacionId', 'nombre', 'bytes', 'fecha', 'version'].sort()
  )
  assert.equal((await call('cargarRespaldo', id, uuid, true, 'correcta')).codigo, 'solicitud')
  assert.equal(
    (await call('cargarRespaldo', id, r.preparacionId, true, 'incorrecta')).codigo,
    'password'
  )
  assert.equal(carga, 0)
  assert.equal(
    (await call('cargarRespaldo', id, r.preparacionId, true, 'correcta')).valor.reiniciar,
    true
  )
  assert.equal(carga, 1)
  const reinicios = await Promise.all([
    call('reiniciarDespuesDeRestauracion', id),
    call('reiniciarDespuesDeRestauracion', id)
  ])
  assert.ok(reinicios.every((r) => r.ok))
  assert.ok((await call('reiniciarDespuesDeRestauracion', id)).ok)
  assert.equal(reinicio, 1)
  assert.equal(limpio, 1)
  const ee = new EventEmitter()
  ee.invoke = async (c, ...args) => ({ ok: true, valor: { c, args } })
  const api = apiRespaldos(ee)
  let recibidos = 0
  assert.equal(ee.listenerCount('respaldos:progreso'), 0)
  const quitar = api.alProgreso(id, () => recibidos++)
  ee.emit('respaldos:progreso', {}, { operacionId: uuid })
  assert.equal(recibidos, 0)
  ee.emit('respaldos:progreso', {}, { operacionId: id })
  assert.equal(recibidos, 1)
  quitar()
  quitar()
  assert.equal(ee.listenerCount('respaldos:progreso'), 0)
  assert.ok(!('invoke' in api) && !('fs' in api))
  assert.equal(
    JSON.stringify(errorRespaldo(Error('password=secreto SQL C:/x'))).includes('secreto'),
    false
  )
  const cancelServicio = new ServicioRespaldos({
    ...puertos,
    cargar: async () => {
      throw Error('no debe cargar')
    }
  })
  const seleccionado = await cancelServicio.seleccionar('cargar')
  await cancelServicio.validar(seleccionado.operacionId)
  await cancelServicio.cerrar()
  assert.equal(limpio, 2)
  // Cancelación repetida/cierre concurrente comparten una sola limpieza.
  const concurrente = new ServicioRespaldos(puertos)
  const c = await concurrente.seleccionar('cargar')
  await concurrente.validar(c.operacionId)
  await Promise.all([
    concurrente.cancelar(c.operacionId),
    concurrente.cancelar(c.operacionId),
    concurrente.cerrar()
  ])
  assert.equal(limpio, 3)
  // Revocar permisos durante la revisión libera la copia privada antes de responder.
  const revocado = new ServicioRespaldos(puertos)
  const s = await revocado.seleccionar('cargar')
  const resumen = await revocado.validar(s.operacionId)
  admin = false
  await assert.rejects(
    revocado.cargar(s.operacionId, resumen.preparacionId, 'correcta'),
    (e) => e.codigo === 'permiso'
  )
  assert.equal(limpio, 4)
  assert.equal(carga, 1)
  admin = true
  await revocado.seleccionar('generar')
  await revocado.cerrar()
  // También se revisa la sesión al terminar una preparación asíncrona.
  const duranteValidacion = new ServicioRespaldos({
    ...puertos,
    preparar: async () => {
      admin = false
      return preparado
    }
  })
  const v = await duranteValidacion.seleccionar('cargar')
  await assert.rejects(duranteValidacion.validar(v.operacionId), (e) => e.codigo === 'permiso')
  assert.equal(limpio, 5)
  admin = true
  await duranteValidacion.cerrar()
  assert.equal(
    errorRespaldo(Object.assign(Error('detalle interno'), { codigoRespaldo: 'danado' })).codigo,
    'danado'
  )
  assert.equal(errorRespaldo(Error('End of central directory not found')).codigo, 'danado')
  assert.ok(prepara > 0)
  console.log(
    'OK IPC: permisos, canales/payload/IDs, rutas opacas, concurrencia, contraseña, cancelación real, fase crítica, reinicio, limpieza y preload sin listeners residuales; cero datos binarios/Snapshot'
  )
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
