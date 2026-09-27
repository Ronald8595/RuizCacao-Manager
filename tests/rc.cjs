const { load, root } = require('./loader.cjs'),
  { Client } = require('pg'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  { randomUUID } = require('node:crypto')
const { BaseLocal, hoy } = load(root + '/src/main/database/base.ts'),
  { validarAcceso } = load(root + '/src/shared/validacionAcceso.ts'),
  { construirComprobanteHtml } = load(root + '/src/renderer/src/utils/comprobantePdf.ts')
async function main() {
  const c = JSON.parse(await fs.readFile(process.argv[2], 'utf8')),
    admin = new Client(c)
  await admin.connect()
  const nombre = 'rcm_rc_' + randomUUID().replaceAll('-', '')
  await admin.query('CREATE DATABASE "' + nombre + '"')
  const config = { ...c, database: nombre },
    crear = () => new BaseLocal(config)
  let db = crear(),
    n = 0
  const clave = 'Usuario-prueba-2026',
    claveOperador = 'Operador-prueba-2026',
    test = async (nom, fn) => {
      await fn()
      n++
      console.log('OK RC ' + nom)
    },
    exec = (comando, ...args) => db.ejecutar(randomUUID(), comando, args)
  try {
    await db.iniciar()
    await test('validaciones por campo de usuario contraseña y confirmación', async () => {
      let e = validarAcceso({
        nombre: '',
        password: 'corta',
        confirmar: 'distinta',
        codigo: '',
        modo: 'crear'
      })
      assert.ok(e.nombre && e.password && e.confirmar)
      assert.deepEqual(
        validarAcceso({
          nombre: 'usuario',
          password: clave,
          confirmar: clave,
          codigo: '',
          modo: 'crear'
        }),
        {}
      )
      await assert.rejects(db.crearAdministrador('usuario', 'corta'), /12 y 128/)
      await db.crearAdministrador('usuario', clave)
      await assert.rejects(db.crearAdministrador('usuario', clave), /Ya existe un usuario/)
      await db.login('usuario', clave)
      assert.equal((await db.cargar()).administrador, 'usuario')
      assert.equal((await db.pool.query('SELECT id FROM ruizcacao.administrador')).rows[0].id, 1)
    })
    await test('multiusuario conserva principal y permite operadores independientes', async () => {
      await db.crearUsuario('operador', claveOperador)
      let estado = await db.cargar()
      assert.equal(estado.usuarios.length, 2)
      assert.equal(estado.usuarioActual.nombre, 'usuario')
      assert.equal(estado.usuarioActual.rol, 'administrador')
      await db.logout()
      await db.login('operador', claveOperador)
      estado = await db.cargar()
      assert.equal(estado.usuarioActual.nombre, 'operador')
      assert.equal(estado.usuarioActual.rol, 'operador')
      await assert.rejects(db.crearUsuario('otro', claveOperador), /administrador/)
      await db.logout()
      await db.login('usuario', clave)
    })
    await test('recuperación deshabilitada sin pública de producción', () =>
      assert.rejects(db.solicitarRecuperacion('usuario'), /no está habilitada/))
    await db.pool.query(
      "INSERT INTO ruizcacao.jornadas(fecha,estado,apertura) VALUES($1::date-1,'activa',now()-interval '1 day')",
      [hoy()]
    )
    await db.desconectar()
    db = crear()
    await db.iniciar()
    await db.login('usuario', clave)
    await test('AutoRecover deja interrupción sin cierre normal y bloquea operaciones', async () => {
      const s = await db.cargar()
      assert.equal(s.datos.jornada.estado, 'interrumpida')
      assert.equal(s.datos.jornada.horaFin, null)
      assert.equal(
        (
          await db.pool.query(
            "SELECT count(*)::int n FROM ruizcacao.eventos_jornada WHERE accion='interrupcion_detectada'"
          )
        ).rows[0].n,
        1
      )
      assert.equal(
        (
          await db.pool.query(
            "SELECT count(*)::int n FROM ruizcacao.eventos_jornada WHERE accion LIKE 'cierre_%'"
          )
        ).rows[0].n,
        0
      )
      await assert.rejects(
        exec('crearCliente', {
          nombreRazonSocial: 'No guardar',
          identificacion: '1234567890',
          telefono: '0999999999'
        }),
        /interrumpida/
      )
      await assert.rejects(db.jornada('reabrir', clave), /interrumpida/)
      assert.equal((await db.cargar()).datos.jornada.estado, 'interrumpida')
    })
    await test('salir y reiniciar no convierten interrupción pendiente en cierre normal', async () => {
      await db.logout()
      await db.cerrar()
      db = crear()
      await db.iniciar()
      await db.login('usuario', clave)
      assert.equal((await db.cargar()).datos.jornada.estado, 'interrumpida')
      await db.jornada('cerrar')
      await db.jornada('abrir')
      assert.ok(
        (
          await db.pool.query(
            "SELECT id FROM ruizcacao.eventos_jornada WHERE accion='cierre_interrupcion_autorizado'"
          )
        ).rowCount
      )
    })
    await db.desconectar()
    db = crear()
    await db.iniciar()
    await db.login('usuario', clave)
    await test('jornada interrumpida de hoy se recupera solo con contraseña', async () => {
      await assert.rejects(db.jornada('reabrir', 'incorrecta'))
      assert.equal((await db.cargar()).datos.jornada.estado, 'interrumpida')
      await db.jornada('reabrir', clave)
      assert.equal((await db.cargar()).datos.jornada.estado, 'activa')
      assert.ok(
        (
          await db.pool.query(
            "SELECT id FROM ruizcacao.eventos_jornada WHERE accion='recuperacion_autorizada'"
          )
        ).rowCount
      )
    })
    let cliente, proveedor, empleado
    await test('crear editar y desactivar contrapartes y trabajador sin sueldo fijo', async () => {
      cliente = (
        await exec('crearCliente', {
          nombreRazonSocial: 'Cliente RC',
          identificacion: '1234567890',
          telefono: '0999999999'
        })
      ).resultado
      proveedor = (
        await exec('crearProveedor', { nombre: 'Proveedor RC', ciRuc: '0987654321', estado: true })
      ).resultado
      empleado = (await exec('crearEmpleado', { nombre: 'Trabajador RC', estado: true })).resultado
      await exec('actualizarCliente', cliente.id, {
        nombreRazonSocial: 'Cliente editado',
        identificacion: '1234567890',
        telefono: '0999999999'
      })
      await exec('actualizarProveedor', proveedor.id, {
        nombre: 'Proveedor editado',
        ciRuc: '0987654321',
        estado: true
      })
      await exec('actualizarEmpleado', empleado.id, { nombre: 'Trabajador editado', estado: true })
      await exec('desactivarCliente', cliente.id)
      await exec('desactivarProveedor', proveedor.id)
      await exec('desactivarEmpleado', empleado.id)
      let s = (await db.cargar()).datos
      assert.equal(s.clientes[0].estado, false)
      assert.equal(s.proveedores[0].estado, false)
      assert.equal(s.empleados[0].estado, false)
      // Contrapartes nuevas para las operaciones; los registros desactivados permanecen en historial.
      cliente = (
        await exec('crearCliente', {
          nombreRazonSocial: 'Cliente vigente',
          identificacion: '1234567891',
          telefono: '0999999999'
        })
      ).resultado
      proveedor = (
        await exec('crearProveedor', {
          nombre: 'Proveedor vigente',
          ciRuc: '0987654322',
          estado: true
        })
      ).resultado
      const clienteSinId = (
        await exec('crearCliente', {
          nombreRazonSocial: 'Cliente sin identificación',
          identificacion: '',
          telefono: ''
        })
      ).resultado
      const proveedorSinId = (
        await exec('crearProveedor', {
          nombre: 'Proveedor sin identificación',
          ciRuc: '',
          estado: true
        })
      ).resultado
      assert.equal(clienteSinId.identificacion, '')
      assert.equal(proveedorSinId.ciRuc, '')
    })
    await test('compra confirmada rechaza edición y anula con devolución conservando historial', async () => {
      const stockAntes = (await db.cargar()).datos.stock.Maracuyá
      const input = {
        fecha: hoy(),
        proveedorId: proveedor.id,
        producto: 'Maracuyá',
        cantidadQq: 2,
        precioCompraQq: 10,
        impuestoPorcentaje: 0,
        montoPagado: 5,
        metodoPago: 'Efectivo'
      }
      const temporal = (await exec('registrarCompra', input)).resultado
      await assert.rejects(
        exec('actualizarCompra', temporal.id, { ...input, cantidadQq: 3 }),
        /Operación no válida/
      )
      await assert.rejects(
        exec('eliminarCompra', temporal.id, 'Prueba', false),
        /Operación no válida/
      )
      await db.anularOperacion(
        randomUUID(),
        'compra',
        temporal.id,
        'Compra anulada por prueba de regresión',
        clave
      )
      const s = (await db.cargar()).datos,
        cuenta = s.cuentas.find((c) => c.compraId === temporal.id)
      assert.equal(s.compras.find((c) => c.id === temporal.id).estado, 'anulada')
      assert.equal(s.compras.find((c) => c.id === temporal.id).totalCompra, 20)
      assert.equal(cuenta.estado, 'anulado')
      assert.equal(
        s.movimientosCuenta.filter((m) => m.cuentaId === cuenta.id && m.tipo === 'Abono')[0].monto,
        5
      )
      assert.equal(
        s.movimientosCuenta.filter(
          (m) => m.cuentaId === cuenta.id && m.tipo === 'Ajuste por devolución'
        ).length,
        0
      )
      assert.equal(s.stock.Maracuyá, stockAntes)
      assert.equal(s.gastos.find((g) => g.compra_id === temporal.id).monto, 20)
    })
    const compra = (
      await exec('registrarCompra', {
        fecha: hoy(),
        proveedorId: proveedor.id,
        producto: 'Cacao Seco',
        cantidadQq: 10,
        precioCompraQq: 10,
        impuestoPorcentaje: 0,
        montoPagado: 20,
        metodoPago: 'Efectivo'
      })
    ).resultado
    await test('varios abonos de proveedor saldan exactamente su cuenta', async () => {
      const cuenta = (await db.cargar()).datos.cuentas.find((c) => c.compraId === compra.id)
      for (const monto of [30, 50])
        await exec('registrarAbono', {
          cuentaId: cuenta.id,
          fecha: hoy(),
          monto,
          tipo: 'Abono',
          metodoPago: 'Efectivo',
          observacion: 'Pago proveedor'
        })
      const s = (await db.cargar()).datos
      assert.equal(s.cuentas.find((c) => c.id === cuenta.id).estado, 'cerrado')
      assert.equal(
        s.movimientosCuenta
          .filter((m) => m.cuentaId === cuenta.id)
          .reduce((a, m) => a + m.monto, 0),
        100
      )
    })
    await test('umbral opcional persistido y aviso únicamente al cruzarlo', async () => {
      assert.ok(Object.values((await db.cargar()).umbralesStock).every((v) => v === null))
      await db.configurarUmbralStock('Cacao Seco', 8)
      const venta = (
        await exec('registrarVenta', {
          fechaVenta: hoy(),
          clienteId: cliente.id,
          producto: 'Cacao Seco',
          pesoBruto: 2,
          precioUnitario: 20,
          impuestoPorcentaje: 0,
          montoRecibido: 10,
          metodoPago: 'Efectivo'
        })
      ).resultado
      const html = construirComprobanteHtml(venta, cliente)
      for (const t of ['Abono recibido:', 'Saldo pendiente:', '$40.00', '$10.00', '$30.00'])
        assert.ok(html.includes(t))
      const avisos = (await db.cargar()).avisos.filter((a) => a.titulo === 'Stock bajo')
      assert.equal(avisos.length, 1)
      await db.configurarUmbralStock('Cacao Seco', 8)
      assert.equal((await db.cargar()).avisos.filter((a) => a.titulo === 'Stock bajo').length, 1)
      await db.cerrar()
      db = crear()
      await db.iniciar()
      await db.login('usuario', clave)
      assert.equal((await db.cargar()).umbralesStock['Cacao Seco'], 8)
      await db.configurarUmbralStock('Cacao Seco', null)
      assert.equal((await db.cargar()).umbralesStock['Cacao Seco'], null)
    })
    await test('cierre sin contraseña bloquea compras y ventas y conserva cuentas', async () => {
      await db.jornada('reabrir', clave)
      const cuentas = (await db.cargar()).datos.cuentas
      await db.jornada('cerrar')
      assert.deepEqual((await db.cargar()).datos.cuentas, cuentas)
      await assert.rejects(
        exec('registrarCompra', {
          fecha: hoy(),
          proveedorId: proveedor.id,
          producto: 'Cacao Seco',
          cantidadQq: 1,
          precioCompraQq: 10,
          impuestoPorcentaje: 0,
          montoPagado: 10,
          metodoPago: 'Efectivo'
        }),
        /jornada/
      )
      await assert.rejects(
        exec('registrarVenta', {
          fechaVenta: hoy(),
          clienteId: cliente.id,
          producto: 'Cacao Seco',
          pesoBruto: 1,
          precioUnitario: 20,
          impuestoPorcentaje: 0,
          montoRecibido: 20,
          metodoPago: 'Efectivo'
        }),
        /jornada/
      )
      await assert.rejects(db.jornada('reabrir', 'incorrecta'), /incorrecta/)
      await db.jornada('reabrir', clave)
    })
    await test('operador puede reabrir y deja autor en operaciones nuevas', async () => {
      await db.logout()
      await db.login('operador', claveOperador)
      await db.jornada('reabrir', claveOperador)
      await exec('crearGastoManual', {
        fecha: hoy(),
        categoria: 'Otros',
        concepto: 'Prueba operador',
        monto: 1,
        observacion: 'Trazabilidad multiusuario'
      })
      const gasto = (await db.cargar()).datos.gastos.find(
        (g) => g.observacion === 'Trazabilidad multiusuario'
      )
      assert.ok(gasto)
      assert.equal(gasto.usuarioNombre, 'operador')
      assert.ok(gasto.usuarioId)
      const evento = (
        await db.pool.query(
          "SELECT responsable,usuario_id FROM ruizcacao.eventos_jornada WHERE accion='reabrir' ORDER BY id DESC LIMIT 1"
        )
      ).rows[0]
      assert.equal(evento.responsable, 'operador')
      assert.ok(evento.usuario_id)
      await db.logout()
      await db.login('usuario', clave)
      await db.jornada('reabrir', clave)
    })
    await test('dataset QA usa servicios reales, conserva stock y no duplica al repetir', async () => {
      const { crearDataset } = require('../scripts/dataset-qa.cjs')
      const antes = (await db.cargar()).datos
      await crearDataset(db, hoy())
      const despues = (await db.cargar()).datos
      assert.equal(despues.clientes.length - antes.clientes.length, 2)
      assert.equal(despues.proveedores.length - antes.proveedores.length, 2)
      assert.equal(despues.empleados.length - antes.empleados.length, 2)
      assert.equal(despues.compras.length - antes.compras.length, 2)
      assert.equal(despues.ventas.length - antes.ventas.length, 2)
      assert.equal(
        Number((despues.stock['Cacao en Baba'] - antes.stock['Cacao en Baba']).toFixed(2)),
        13.4
      )
      assert.equal(despues.stock['Cacao Seco'] - antes.stock['Cacao Seco'], 9)
      await crearDataset(db, hoy())
      assert.deepEqual((await db.cargar()).datos, despues)
      await db.cerrar()
      db = crear()
      await db.iniciar()
      await db.login('usuario', clave)
      const reinicio = (await db.cargar()).datos
      for (const campo of [
        'clientes',
        'proveedores',
        'empleados',
        'compras',
        'ventas',
        'cuentas',
        'stock',
        'gastos'
      ])
        assert.deepEqual(reinicio[campo], despues[campo])
    })
    await test('cambio autenticado valida contraseña actual, audita y persiste al reiniciar', async () => {
      const nueva = randomUUID() + randomUUID()
      await assert.rejects(db.cambiarPassword('incorrecta', nueva), /correcta/)
      await assert.rejects(db.cambiarPassword(clave, 'corta'), /12 y 128/)
      const antes = (await db.cargar()).datos
      await db.cambiarPassword(clave, nueva)
      assert.deepEqual((await db.cargar()).datos, antes)
      assert.ok(
        (await db.pool.query("SELECT id FROM ruizcacao.auditoria WHERE accion='password_cambiada'"))
          .rowCount
      )
      await db.cerrar()
      db = crear()
      await db.iniciar()
      await assert.rejects(db.login('usuario', clave))
      await db.login('usuario', nueva)
      await db.cambiarPassword(nueva, clave)
    })
    console.log(n + ' pruebas RC satisfactorias')
  } finally {
    await db.cerrar().catch(() => db.desconectar().catch(() => {}))
    await admin.query('DROP DATABASE "' + nombre + '"')
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
