// Ejecutar con una configuración PostgreSQL DE PRUEBAS: node tests/integration.cjs ruta-config.json
// Crea una base aislada con nombre aleatorio; nunca utiliza tablas de la base indicada.
const { load, root } = require('./loader.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { randomUUID, generateKeyPairSync, sign } = require('node:crypto')
const keys = generateKeyPairSync('ed25519')
const publica = keys.publicKey.export({ type: 'spki', format: 'pem' })
const firmar = (token) =>
  token + '.' + sign(null, Buffer.from(token, 'base64url'), keys.privateKey).toString('base64url')
const { Client } = require('pg')
const { BaseLocal, hoy } = load(root + '/src/main/database/base.ts')
const { resumirPeriodo } = load(root + '/src/renderer/src/utils/reportes.ts')
async function main() {
  if (!process.argv[2]) throw new Error('Indica el archivo de conexión de PRUEBAS.')
  const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  const nombreBase = 'rcm_test_' + randomUUID().replaceAll('-', '')
  const admin = new Client(config)
  await admin.connect()
  await admin.query('CREATE DATABASE "' + nombreBase + '"')
  const connection = { ...config, database: nombreBase }
  let db = new BaseLocal(connection, { publica })
  let pruebas = 0
  const check = async (nombre, fn) => {
    await fn()
    pruebas++
    console.log('OK ' + nombre)
  }
  const clave = 'Solo-para-prueba-2026'
  const nuevaClave = 'Nueva-clave-prueba-2026'
  const exec = async (comando, ...args) => db.ejecutar(randomUUID(), comando, args)
  try {
    await db.iniciar()
    await check('Sin sesión no se puede leer ni modificar datos', async () => {
      await assert.rejects(db.cargar())
      await assert.rejects(exec('crearCliente', {}))
    })
    await db.crearAdministrador('admin', clave)
    await check(
      'Un único administrador; contraseñas y recuperación almacenadas como hash',
      async () => {
        await assert.rejects(db.crearAdministrador('otro', clave))
        const row = (
          await db.pool.query('SELECT password_hash,recovery_hash FROM ruizcacao.administrador')
        ).rows[0]
        assert.notEqual(row.password_hash, clave)
        assert.equal(row.recovery_hash, null)
      }
    )
    await check('Login inválido rechazado', () => assert.rejects(db.login('admin', 'incorrecta')))
    await db.login('admin', clave)
    await check('Abrir sin contraseña con sesión autenticada', async () => {
      assert.equal((await db.jornada('abrir')).datos.jornada.estado, 'activa')
    })
    const prov = (
      await exec('crearProveedor', {
        nombre: 'Proveedor Prueba',
        ciRuc: '1234567890',
        estado: true
      })
    ).resultado
    const compraInput = {
      fecha: hoy(),
      proveedorId: prov.id,
      producto: 'Cacao en Baba',
      cantidadQq: 200,
      precioCompraQq: 10,
      impuestoPorcentaje: 0,
      montoPagado: 100,
      metodoPago: 'Efectivo'
    }
    const id = randomUUID()
    const compra = await db.ejecutar(id, 'registrarCompra', [compraInput])
    await check('Compra, stock, cuenta e inversión confirmadas juntas', async () => {
      assert.equal(compra.estado.datos.stock['Cacao en Baba'], 200)
      assert.equal(compra.estado.datos.cuentas[0].montoTotal, 2000)
      assert.equal(compra.estado.datos.gastos.length, 1)
    })
    await check('Reintento de misma operación no duplica compra ni inventario', async () => {
      const r = await db.ejecutar(id, 'registrarCompra', [compraInput])
      assert.equal(r.estado.datos.compras.length, 1)
      assert.equal(r.estado.datos.stock['Cacao en Baba'], 200)
      await assert.rejects(db.ejecutar(id, 'registrarCompra', [{ ...compraInput, cantidadQq: 1 }]))
    })
    await check('Rollback total cuando falla la escritura de inventario', async () => {
      await db.pool.query(
        "CREATE FUNCTION ruizcacao.fallo_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo de prueba'; END $$; CREATE TRIGGER fallo_test BEFORE INSERT ON ruizcacao.movimientos_stock FOR EACH ROW EXECUTE FUNCTION ruizcacao.fallo_test()"
      )
      await assert.rejects(exec('registrarCompra', compraInput))
      await db.pool.query(
        'DROP TRIGGER fallo_test ON ruizcacao.movimientos_stock; DROP FUNCTION ruizcacao.fallo_test()'
      )
      const s = (await db.cargar()).datos
      assert.equal(s.compras.length, 1)
      assert.equal(s.gastos.length, 1)
      assert.equal(s.stock['Cacao en Baba'], 200)
    })
    await exec('registrarConversionCacao', {
      fecha: hoy(),
      cacaoBabaUtilizadoQq: 100,
      factorConversion: 3.3
    })
    const movimiento = (await db.cargar()).datos.movimientosStock.find(
      (m) => m.tipo === 'Conversión'
    )
    await exec('registrarDiferenciaConversion', {
      movimientoId: movimiento.id,
      cantidadObtenidaQq: 35
    })
    await check('Se conserva la regla actual de pesaje informativo del cliente', async () => {
      const s = (await db.cargar()).datos
      assert.equal(s.stock['Cacao Seco'], 30.3)
      assert.equal(s.movimientosStock.find((m) => m.id === movimiento.id).diferenciaQq, 4.7)
    })
    await check('Reporte cuenta efectivo y no el total pendiente', async () => {
      const s = (await db.cargar()).datos
      const r = resumirPeriodo(
        s.ventas,
        s.gastos,
        hoy(),
        hoy(),
        s.movimientosCuenta,
        s.cuentas,
        s.compras
      )
      assert.equal(r.totalGastos, 100)
    })
    const cuenta = (await db.cargar()).datos.cuentas[0]
    await exec('registrarAbono', {
      cuentaId: cuenta.id,
      fecha: hoy(),
      monto: 1900,
      metodoPago: 'Efectivo',
      tipo: 'Abono',
      observacion: 'Saldo'
    })
    await check('Cuenta saldada genera notificación persistente', async () => {
      const s = await db.cargar()
      assert.equal(s.datos.cuentas[0].estado, 'cerrado')
      assert.ok(s.avisos.some((n) => n.titulo === 'Cuenta saldada'))
      const n = s.avisos[0]
      await db.leerAviso(n.id)
      assert.ok((await db.cargar()).avisos.find((x) => x.id === n.id).leida)
    })
    await db.cerrar()
    db = new BaseLocal(connection, { publica })
    await db.iniciar()
    await db.login('admin', clave)
    await check('Reinicio conserva datos y cierra jornada normalmente', async () => {
      const s = await db.cargar()
      assert.equal(s.datos.compras.length, 1)
      assert.equal(s.datos.jornada.estado, 'finalizada')
      assert.ok(!s.avisos.some((n) => n.titulo === 'AutoRecover'))
    })
    await db.jornada('reabrir', clave)
    await check('Reapertura conserva auditoría de cierre anterior', async () => {
      const r = await db.pool.query('SELECT accion FROM ruizcacao.eventos_jornada')
      assert.ok(r.rows.some((x) => x.accion === 'reabrir'))
      assert.ok(r.rows.some((x) => x.accion === 'cierre_aplicacion'))
    })
    await check('Esquema comercial con columnas explícitas y relaciones SQL', async () => {
      const r = await db.pool.query(
        "SELECT table_name FROM information_schema.columns WHERE table_schema='ruizcacao' AND column_name='datos'"
      )
      assert.equal(r.rowCount, 0)
      await assert.rejects(
        db.pool.query(
          "INSERT INTO ruizcacao.existencias(producto,cantidad_qq,costo_unitario_promedio) VALUES('Producto inexistente',1,1)"
        )
      )
    })
    const cliente = (
      await exec('crearCliente', {
        nombreRazonSocial: 'Cliente Prueba',
        identificacion: '0987654321',
        telefono: '0999999999'
      })
    ).resultado
    const empleado = (await exec('crearEmpleado', { nombre: 'Empleado Prueba', estado: true }))
      .resultado
    await check('Mano de obra persiste relación e historial del empleado', async () => {
      await exec('crearGastoManual', {
        fecha: hoy(),
        categoria: 'Mano de obra',
        concepto: '',
        monto: 15,
        observacion: 'Jornal',
        empleado_id: empleado.id,
        tipo_pago: 'pago'
      })
      const g = (await db.cargar()).datos.gastos.find((g) => g.tipo === 'manual')
      assert.equal(g.empleado_id, empleado.id)
      assert.equal(g.empleado_nombre, 'Empleado Prueba')
      await exec('actualizarGastoManual', g.id, { ...g, monto: 20 })
      assert.equal((await db.cargar()).datos.gastos.find((x) => x.id === g.id).monto, 20)
    })
    const venta = (
      await exec('registrarVenta', {
        fechaVenta: hoy(),
        clienteId: cliente.id,
        producto: 'Cacao Seco',
        pesoBruto: 10,
        precioUnitario: 30,
        impuestoPorcentaje: 0,
        metodoPago: 'Efectivo',
        montoRecibido: 50
      })
    ).resultado
    await check('Venta parcial, abono y comprobantes comparten una secuencia', async () => {
      let s = (await db.cargar()).datos
      assert.equal(s.stock['Cacao Seco'], 20.3)
      const cuenta = s.cuentas.find((c) => c.ventaId === venta.id)
      assert.equal(cuenta.montoPagado, 50)
      const pago = await exec('registrarAbono', {
        cuentaId: cuenta.id,
        fecha: hoy(),
        monto: 250,
        metodoPago: 'Efectivo',
        tipo: 'Abono',
        observacion: 'Saldo',
        generarComprobante: true
      })
      const segunda = (
        await exec('registrarVenta', {
          fechaVenta: hoy(),
          clienteId: cliente.id,
          producto: 'Cacao Seco',
          pesoBruto: 1,
          precioUnitario: 30,
          impuestoPorcentaje: 0,
          metodoPago: 'Efectivo',
          montoRecibido: 30
        })
      ).resultado
      assert.ok(segunda.numeroComprobante > Number(pago.resultado.movimiento.numeroComprobante))
      s = (await db.cargar()).datos
      const r = resumirPeriodo(
        s.ventas,
        s.gastos,
        hoy(),
        hoy(),
        s.movimientosCuenta,
        s.cuentas,
        s.compras
      )
      assert.equal(r.totalIngresos, 330)
      assert.equal(r.totalGastos, 2020)
    })
    await db.desconectar()
    db = new BaseLocal(connection, { publica })
    await db.iniciar()
    await db.login('admin', clave)
    await check('AutoRecover detecta interrupción y exige reapertura', async () => {
      const s = await db.cargar()
      assert.equal(s.datos.jornada.estado, 'interrumpida')
      assert.equal(s.datos.compras.length, 1)
      assert.ok(s.avisos.some((n) => n.titulo === 'AutoRecover'))
    })
    // Fixture independiente de ayer, sin tocar la jornada auditada de hoy.
    await db.pool.query(
      "INSERT INTO ruizcacao.jornadas(fecha,estado,cierre) VALUES($1::date-2,'finalizada',now()) ON CONFLICT DO NOTHING",
      [hoy()]
    )
    await check('Reabrir no recibe ni permite elegir fechas históricas', async () => {
      await db.jornada('reabrir', clave)
      const s = (await db.cargar()).datos
      assert.equal(s.jornada.fecha, hoy())
      const r = await db.pool.query(
        'SELECT estado FROM ruizcacao.jornadas WHERE fecha=$1::date-2',
        [hoy()]
      )
      assert.equal(r.rows[0].estado, 'finalizada')
    })
    const solicitud = await db.solicitarRecuperacion('admin'),
      autorizacion = firmar(solicitud.solicitud)
    await db.recuperar('admin', autorizacion, nuevaClave)
    await check('Recuperación firmada offline de un solo uso y revocación de sesión', async () => {
      await assert.rejects(db.cargar())
      await assert.rejects(db.login('admin', clave))
      await assert.rejects(db.recuperar('admin', autorizacion, clave))
      await db.login('admin', nuevaClave)
    })
    await check('Bloqueo de intentos se conserva en base de datos', async () => {
      for (let i = 0; i < 5; i++) await assert.rejects(db.login('admin', 'incorrecta'))
      await assert.rejects(db.login('admin', nuevaClave), /15 minutos/)
      assert.ok(
        (
          await db.pool.query(
            'SELECT bloqueado_hasta FROM ruizcacao.usuarios WHERE principal=true'
          )
        ).rows[0].bloqueado_hasta
      )
    })
    console.log(pruebas + ' pruebas de PostgreSQL satisfactorias')
  } finally {
    await db.cerrar().catch(() => db.desconectar().catch(() => {}))
    await admin.query('DROP DATABASE "' + nombreBase + '"')
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
