const { load, root } = require('./loader.cjs')
const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  { join } = require('node:path')
const { randomUUID, generateKeyPairSync, sign, createHash } = require('node:crypto'),
  { Client } = require('pg')
const { BaseLocal, hoy } = load(root + '/src/main/database/base.ts')
const { Respaldos, verificarRespaldo } = load(root + '/src/main/database/respaldos.ts')
const { nuevaSolicitud, tokenSolicitud, leerSolicitud } = load(
  root + '/src/main/database/recuperacion.ts'
)
const { traducirError, detalleSeguro, configurarLogs } = load(
  root + '/src/main/database/errores.ts'
)
const { ErrorNegocio } = load(root + '/src/shared/errorNegocio.ts')
const { resumirPeriodo } = load(root + '/src/renderer/src/utils/reportes.ts')
const { documentoReporte } = load(root + '/src/renderer/src/utils/reportePdf.ts')
async function main() {
  const cfg = JSON.parse(await fs.readFile(process.argv[2], 'utf8')),
    admin = new Client(cfg)
  await admin.connect()
  const nombre = 'rcm_v3_' + randomUUID().replaceAll('-', '')
  await admin.query('CREATE DATABASE "' + nombre + '"')
  const config = { ...cfg, database: nombre },
    keys = generateKeyPairSync('ed25519'),
    publica = keys.publicKey.export({ format: 'pem', type: 'spki' })
  const firmar = (t) =>
    t + '.' + sign(null, Buffer.from(t, 'base64url'), keys.privateKey).toString('base64url')
  const carpeta = join(process.env.RCM_TEST_ARTIFACTS, 'respaldos'),
    backup = new Respaldos(config, process.env.RCM_TEST_BIN, carpeta)
  const crear = () => new BaseLocal(config, { publica, respaldos: backup })
  let db = crear(),
    n = 0
  const clave = 'Prueba-v3-segura-2026',
    otra = 'Nueva-prueba-v3-2026'
  const test = async (nombre, fn) => {
    await fn()
    n++
    console.log('OK v3 ' + nombre)
  }
  const exec = async (c, ...args) => db.ejecutar(randomUUID(), c, args)
  try {
    await db.iniciar()
    await db.crearAdministrador('admin', clave)
    await db.login('admin', clave)
    const a = (await db.solicitarRecuperacion('admin')).solicitud
    await test('firma alterada y otra instalación rechazadas sin bloquear login', async () => {
      await assert.rejects(db.recuperar('admin', a + '.' + 'a'.repeat(86), otra))
      await assert.rejects(
        db.recuperar('admin', firmar(tokenSolicitud(nuevaSolicitud(randomUUID()))), otra)
      )
      const b = leerSolicitud(a)
      b.nonce = nuevaSolicitud(b.installation_id).nonce
      await assert.rejects(db.recuperar('admin', firmar(tokenSolicitud(b)), otra))
      assert.equal(
        (await db.pool.query('SELECT fallos FROM ruizcacao.administrador')).rows[0].fallos,
        0
      )
      await db.login('admin', clave)
    })
    const b = (await db.solicitarRecuperacion('admin')).solicitud
    await test('nueva solicitud invalida anterior', () =>
      assert.rejects(db.recuperar('admin', firmar(a), otra)))
    await db.recuperar('admin', firmar(b), otra)
    await test('firma válida cambia contraseña y no se reutiliza', async () => {
      await assert.rejects(db.login('admin', clave))
      await db.login('admin', otra)
      await assert.rejects(db.recuperar('admin', firmar(b), clave))
    })
    await db.cerrar()
    db = crear()
    await db.iniciar()
    await db.login('admin', otra)
    await test('reinicio no permite reutilizar autorización', () =>
      assert.rejects(db.recuperar('admin', firmar(b), clave)))
    await test('request_id y propósito alterados se rechazan aun con firma válida', async () => {
      const solicitud = (await db.solicitarRecuperacion('admin')).solicitud,
        payload = leerSolicitud(solicitud)
      payload.request_id = randomUUID()
      await assert.rejects(db.recuperar('admin', firmar(tokenSolicitud(payload)), clave))
      const arreglo = JSON.parse(Buffer.from(solicitud, 'base64url'))
      arreglo[4] = 'otro_proposito'
      const token = Buffer.from(JSON.stringify(arreglo)).toString('base64url')
      await assert.rejects(db.recuperar('admin', firmar(token), clave))
    })
    await db.jornada('abrir', otra)
    const cli = (
      await exec('crearCliente', {
        nombreRazonSocial: 'Cliente Test',
        identificacion: '1234567890',
        telefono: '0999999999'
      })
    ).resultado
    const prov = (
      await exec('crearProveedor', { nombre: 'Proveedor Test', ciRuc: '0987654321', estado: true })
    ).resultado
    await exec('registrarCompra', {
      fecha: hoy(),
      proveedorId: prov.id,
      producto: 'Cacao Seco',
      cantidadQq: 20,
      precioCompraQq: 10,
      impuestoPorcentaje: 0,
      montoPagado: 0,
      metodoPago: 'Efectivo'
    })
    await exec('registrarVenta', {
      fechaVenta: hoy(),
      clienteId: cli.id,
      producto: 'Cacao Seco',
      pesoBruto: 5,
      precioUnitario: 20,
      impuestoPorcentaje: 0,
      montoRecibido: 20,
      metodoPago: 'Efectivo'
    })
    const saldo = () =>
      db.cargar().then((s) =>
        s.datos.cuentas.map((c) => ({
          id: c.id,
          estado: c.estado,
          pagado: c.montoPagado,
          total: c.montoTotal
        }))
      )
    const original = await saldo()
    await test('cerrar jornada conserva cuentas y publica resumen', async () => {
      await db.jornada('cerrar', otra)
      assert.deepEqual(await saldo(), original)
      assert.ok(
        (await db.cargar()).avisos.some((a) => a.titulo === 'Resumen de jornada disponible')
      )
    })
    const antes = (await fs.readdir(carpeta)).filter((n) => n.endsWith('.dump')).length
    await db.jornada('reabrir', otra)
    await db.jornada('cerrar', otra)
    await test('cierre equivalente no duplica respaldo ni aviso de cuentas pendientes', async () => {
      assert.equal((await fs.readdir(carpeta)).filter((n) => n.endsWith('.dump')).length, antes)
      assert.equal(
        (await db.cargar()).avisos.filter((a) => a.titulo === 'Cuentas con saldo pendiente').length,
        1
      )
    })
    await db.jornada('reabrir', otra)
    await db.logout()
    await db.login('admin', otra)
    await test('cerrar sesión no modifica cuentas', async () =>
      assert.deepEqual(await saldo(), original))
    const noLeida = (await db.cargar()).avisos.find((n) => !n.leida),
      leida = (await db.cargar()).avisos.find((n) => n.id !== noLeida.id)
    await db.leerAviso(leida.id)
    await db.cerrar()
    db = crear()
    await db.iniciar()
    await db.login('admin', otra)
    await test('cierre normal y estados de lectura persisten', async () => {
      assert.deepEqual(await saldo(), original)
      const s = await db.cargar()
      assert.equal(s.avisos.find((n) => n.id === leida.id).leida, true)
      assert.equal(s.avisos.find((n) => n.id === noLeida.id).leida, false)
    })
    await db.jornada('reabrir', otra)
    await db.desconectar()
    db = crear()
    await db.iniciar()
    await db.login('admin', otra)
    await test('AutoRecover no altera cuentas y genera aviso', async () => {
      assert.deepEqual(await saldo(), original)
      assert.ok((await db.cargar()).avisos.some((n) => n.titulo === 'AutoRecover'))
    })
    await db.jornada('reabrir', otra)
    const cuenta = (await db.cargar()).datos.cuentas.find((c) => c.categoria === 'venta')
    await exec('registrarAbono', {
      cuentaId: cuenta.id,
      fecha: hoy(),
      monto: 30,
      tipo: 'Abono',
      metodoPago: 'Efectivo',
      observacion: 'Continuación'
    })
    await test('abono posterior continúa desde el saldo anterior', async () =>
      assert.equal(
        (await db.cargar()).datos.cuentas.find((c) => c.id === cuenta.id).montoPagado,
        50
      ))
    const m = await backup.crear(db.pool, 'manual'),
      ruta = join(carpeta, m.archivo)
    await test('dump íntegro y pg_restore --list', async () => {
      assert.ok(m.tamano > 0)
      assert.deepEqual(await verificarRespaldo(ruta), m)
      assert.ok((await backup.herramienta('pg_restore', ['--list', ruta])).includes('ruizcacao'))
    })
    await test('alteración SHA-256 detectada', async () => {
      const datos = await fs.readFile(ruta)
      await fs.appendFile(ruta, 'alterado')
      await assert.rejects(verificarRespaldo(ruta))
      await fs.writeFile(ruta, datos)
    })
    await test('retención conserva 14 automáticos y el manual', async () => {
      for (let i = 0; i < 16; i++) {
        const archivo = 'retencion_' + i + '.dump',
          data = Buffer.from('prueba' + i)
        await fs.writeFile(join(carpeta, archivo), data)
        await fs.writeFile(
          join(carpeta, archivo) + '.json',
          JSON.stringify({
            ...m,
            id: randomUUID(),
            archivo,
            tipo: 'automatico',
            fecha: new Date(2000, 0, i + 1).toISOString(),
            tamano: data.length,
            sha256: createHash('sha256').update(data).digest('hex')
          })
        )
      }
      await backup.retencion(db.pool)
      assert.ok(await fs.stat(ruta))
      const manifests = await Promise.all(
        (await fs.readdir(carpeta))
          .filter((f) => f.endsWith('.dump.json'))
          .map(async (f) => JSON.parse(await fs.readFile(join(carpeta, f), 'utf8')))
      )
      assert.equal(manifests.filter((m) => m.tipo === 'automatico').length, 14)
    })
    const crearBackup = backup.crear.bind(backup)
    backup.crear = async () => {
      throw Error('secreto-que-no-debe-filtrarse')
    }
    await db.jornada('cerrar', otra)
    backup.crear = crearBackup
    await test('fallo de respaldo mantiene datos y deja aviso', async () => {
      assert.ok((await db.cargar()).avisos.some((n) => n.titulo === 'Respaldo pendiente'))
      assert.equal((await db.cargar()).datos.jornada.estado, 'finalizada')
    })
    configurarLogs(join(process.env.RCM_TEST_ARTIFACTS, 'logs'))
    await test('SQLSTATE y TypeError se traducen sin filtrar secretos', async () => {
      for (const code of [
        '23505',
        '23503',
        '23502',
        '23514',
        '22001',
        '22P02',
        '22003',
        '22007',
        '40001',
        '40P01',
        '08006'
      ]) {
        const e = Object.assign(Error('password=supersecreto token=autorizacion'), {
          code,
          constraint: 'cliente_identificacion'
        })
        const mensaje = traducirError(e, { modulo: 'test', operacion: 'error' })
        assert.ok(
          !mensaje.includes(code) &&
            !mensaje.includes('supersecreto') &&
            !mensaje.includes('cliente_identificacion')
        )
      }
      const mensaje = traducirError(
        new TypeError('undefined is not a function token=supersecreto'),
        { modulo: 'test', operacion: 'fallo' }
      )
      assert.ok(!mensaje.includes('TypeError') && !mensaje.includes('undefined'))
      assert.equal(
        traducirError(new ErrorNegocio('No hay stock suficiente para esta venta.'), {
          modulo: 'test',
          operacion: 'venta'
        }),
        'No hay stock suficiente para esta venta.'
      )
      assert.ok(
        !JSON.stringify(
          detalleSeguro(Error('secreto'), { modulo: 'test', operacion: 'x' }, 'AAA')
        ).includes('secreto')
      )
      assert.ok(
        !(
          await fs.readFile(
            join(process.env.RCM_TEST_ARTIFACTS, 'logs', 'incidencias.jsonl'),
            'utf8'
          )
        ).includes('supersecreto')
      )
    })
    await test('PDF reutiliza totales del mismo resumen para todos los formatos y rango manual', async () => {
      const s = (await db.cargar()).datos
      const r = resumirPeriodo(
        s.ventas,
        s.gastos,
        '2000-01-01',
        '2099-12-31',
        s.movimientosCuenta,
        s.cuentas,
        s.compras
      )
      for (const tipo of ['diario', 'semanal', 'mensual']) {
        const d = documentoReporte(r, tipo)
        assert.ok(d.html.includes('$50.00'))
        assert.ok(d.html.includes('2000-01-01') && d.html.includes('2099-12-31'))
        assert.equal(r.totalComprasPagadas, 0)
        await fs.writeFile(
          join(process.env.RCM_TEST_ARTIFACTS, 'reporte-' + tipo + '.html'),
          d.html
        )
      }
      const vacio = documentoReporte({ ...r, filas: [] }, 'diario')
      assert.ok(vacio.html.includes('No hay movimientos efectivos'))
    })
    await test('jornada de ayer continúa activa tras medianoche y conserva fecha comercial', async () => {
      const ayer = (await db.pool.query('SELECT ($1::date-1)::text fecha', [hoy()])).rows[0].fecha
      await db.pool.query(
        "INSERT INTO ruizcacao.jornadas(fecha,estado,apertura) VALUES($1,'activa',now()-interval '1 day')",
        [ayer]
      )
      assert.equal((await db.cargar()).datos.jornada.fecha, ayer)
      await exec('crearGastoManual', {
        fecha: hoy(),
        categoria: 'Otros',
        concepto: '',
        monto: 7,
        observacion: 'Gasto en jornada anterior'
      })
      assert.equal((await db.cargar()).datos.gastos.find((g) => g.tipo === 'manual').fecha, ayer)
      await db.jornada('cerrar', otra)
      assert.equal(
        (await db.pool.query('SELECT estado FROM ruizcacao.jornadas WHERE fecha=$1', [ayer]))
          .rows[0].estado,
        'finalizada'
      )
      await db.jornada('reabrir', otra)
      assert.equal((await db.cargar()).datos.jornada.fecha, hoy())
      const previo = (await db.cargar()).datos.cuentas.find((c) => c.id === cuenta.id).montoPagado
      await exec('registrarAbono', {
        cuentaId: cuenta.id,
        fecha: hoy(),
        monto: 10,
        tipo: 'Abono',
        metodoPago: 'Efectivo',
        observacion: 'Jornada posterior'
      })
      assert.equal(
        (await db.cargar()).datos.cuentas.find((c) => c.id === cuenta.id).montoPagado,
        previo + 10
      )
    })
    await test('cancelar guardado PDF no escribe ningún archivo', async () => {
      const { guardarDocumento } = load(root + '/src/main/documentos.ts')
      let escrituras = 0
      const antes = await saldo()
      assert.deepEqual(
        await guardarDocumento(
          Buffer.from('pdf'),
          async () => ({ canceled: true }),
          async () => {
            escrituras++
          }
        ),
        { canceled: true }
      )
      assert.equal(escrituras, 0)
      assert.deepEqual(await saldo(), antes)
    })
    await test('cliente editado y compra pagada conservan relaciones y efectivo', async () => {
      await exec('actualizarCliente', cli.id, {
        nombreRazonSocial: 'Cliente Editado',
        identificacion: cli.identificacion,
        telefono: '0999999999'
      })
      assert.equal(
        (await db.cargar()).datos.clientes.find((c) => c.id === cli.id).nombreRazonSocial,
        'Cliente Editado'
      )
      await exec('registrarCompra', {
        fecha: hoy(),
        proveedorId: prov.id,
        producto: 'Cacao Seco',
        cantidadQq: 3,
        precioCompraQq: 10,
        impuestoPorcentaje: 0,
        montoPagado: 30,
        metodoPago: 'Efectivo'
      })
      assert.equal((await db.cargar()).datos.stock['Cacao Seco'], 18)
    })
    await test('pago completo y adelanto de empleado aceptan montos manuales', async () => {
      const empleado = (await exec('crearEmpleado', { nombre: 'Empleado de prueba', estado: true }))
        .resultado
      for (const [tipo, monto] of [
        ['pago', 12],
        ['adelanto', 8]
      ])
        await exec('crearGastoManual', {
          fecha: hoy(),
          categoria: 'Mano de obra',
          concepto: '',
          monto,
          observacion: 'Monto acordado',
          empleado_id: empleado.id,
          tipo_pago: tipo
        })
      const gastos = (await db.cargar()).datos.gastos.filter((g) => g.empleado_id === empleado.id)
      assert.deepEqual(
        gastos.map((g) => g.monto).sort((a, b) => a - b),
        [8, 12]
      )
    })
    await test('múltiples abonos saldan cuenta y mantienen consecutivo oficial único', async () => {
      const numeros = []
      for (const monto of [15, 25]) {
        const r = await exec('registrarAbono', {
          cuentaId: cuenta.id,
          fecha: hoy(),
          monto,
          tipo: 'Abono',
          metodoPago: 'Efectivo',
          observacion: 'Liquidación',
          generarComprobante: true
        })
        numeros.push(Number(r.resultado.movimiento.numeroComprobante))
      }
      assert.ok(numeros[1] > numeros[0])
      assert.equal(
        (await db.cargar()).datos.cuentas.find((c) => c.id === cuenta.id).estado,
        'cerrado'
      )
      await exec('registrarVenta', {
        fechaVenta: hoy(),
        clienteId: cli.id,
        producto: 'Cacao Seco',
        pesoBruto: 1,
        precioUnitario: 20,
        impuestoPorcentaje: 0,
        montoRecibido: 0,
        metodoPago: 'Efectivo'
      })
      const venta = (
        await exec('registrarVenta', {
          fechaVenta: hoy(),
          clienteId: cli.id,
          producto: 'Cacao Seco',
          pesoBruto: 1,
          precioUnitario: 20,
          impuestoPorcentaje: 0,
          montoRecibido: 20,
          metodoPago: 'Efectivo'
        })
      ).resultado
      assert.ok(venta.numeroComprobante > numeros[1])
      assert.equal((await db.cargar()).datos.stock['Cacao Seco'], 16)
    })
    await test('reportes y HTML diario semanal mensual excluyen pendientes y evitan doble egreso', async () => {
      const s = (await db.cargar()).datos,
        r = resumirPeriodo(
          s.ventas,
          s.gastos,
          hoy(),
          hoy(),
          s.movimientosCuenta,
          s.cuentas,
          s.compras
        )
      assert.equal(r.totalIngresos, 120)
      assert.equal(r.totalComprasPagadas, 30)
      assert.equal(r.totalGastosManuales, 20)
      assert.equal(r.saldoPeriodo, 70)
      for (const tipo of ['diario', 'semanal', 'mensual']) {
        const html = documentoReporte(r, tipo).html
        for (const importe of ['$120.00', '$30.00', '$20.00', '$70.00'])
          assert.ok(html.includes(importe))
      }
    })
    await test('constraint revierte compra cuenta gasto e inventario completos', async () => {
      const antes = (await db.cargar()).datos
      await db.pool.query(
        'ALTER TABLE ruizcacao.movimientos_stock ADD CONSTRAINT bloqueo_test CHECK (false) NOT VALID'
      )
      try {
        await assert.rejects(
          exec('registrarCompra', {
            fecha: hoy(),
            proveedorId: prov.id,
            producto: 'Cacao Seco',
            cantidadQq: 1,
            precioCompraQq: 10,
            impuestoPorcentaje: 0,
            montoPagado: 10,
            metodoPago: 'Efectivo'
          }),
          (e) => e.code === '23514'
        )
      } finally {
        await db.pool.query('ALTER TABLE ruizcacao.movimientos_stock DROP CONSTRAINT bloqueo_test')
      }
      const despues = (await db.cargar()).datos
      for (const campo of [
        'compras',
        'cuentas',
        'gastos',
        'stock',
        'movimientosStock',
        'movimientosCuenta'
      ])
        assert.deepEqual(despues[campo], antes[campo])
    })
    console.log(n + ' pruebas v3 satisfactorias')
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
