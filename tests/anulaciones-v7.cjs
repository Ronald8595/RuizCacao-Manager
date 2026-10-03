// Migración real v6->v7 y anulaciones: bases efímeras, nunca la base del cliente.
const { load, root } = require('./loader.cjs'),
  { Client } = require('pg'),
  fs = require('node:fs'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto')
const { BaseLocal, hoy } = load(root + '/src/main/database/base.ts'),
  { Respaldos } = load(root + '/src/main/database/respaldos.ts'),
  { hashSecreto } = load(root + '/src/main/database/seguridad.ts')
const { crearDominio } = load(root + '/src/shared/dominio.ts'),
  { estadoInicial } = load(root + '/src/shared/persistencia.ts'),
  { entidades } = load(root + '/src/main/database/relacional.ts')
const { resumirPeriodo } = load(root + '/src/renderer/src/utils/reportes.ts'),
  { documentoReporte } = load(root + '/src/renderer/src/utils/reportePdf.ts'),
  { construirComprobanteHtml } = load(root + '/src/renderer/src/utils/comprobantePdf.ts')
async function main() {
  const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')),
    admin = new Client(config)
  await admin.connect()
  const nombre = 'rcm_v7_' + randomUUID().replaceAll('-', '')
  await admin.query('CREATE DATABASE "' + nombre + '"')
  const connection = { ...config, database: nombre },
    sql = new Client(connection)
  await sql.connect()
  const clave = randomUUID() + randomUUID(),
    operadorClave = randomUUID() + randomUUID(),
    autor = randomUUID()
  let db,
    n = 0
  const test = async (nombre, fn) => {
    await fn()
    n++
    console.log('OK v7 ' + nombre)
  }
  const crear = () =>
    new BaseLocal(connection, {
      respaldos: new Respaldos(
        connection,
        process.env.RCM_TEST_BIN,
        process.env.RCM_TEST_ARTIFACTS + '/v7'
      )
    })
  try {
    await sql.query('BEGIN')
    for (let v = 1; v <= 6; v++) {
      const file = fs
        .readdirSync(root + '/database')
        .find((f) => f.startsWith(String(v).padStart(3, '0') + '-'))
      await sql.query(fs.readFileSync(root + '/database/' + file, 'utf8'))
      await sql.query('INSERT INTO ruizcacao.migraciones(version) VALUES($1)', [v])
    }
    // La migración 002 deja temporalmente las constraints en modo IMMEDIATE.
    // El fixture histórico contiene referencias circulares válidas entre
    // movimientos_stock y gastos, que en producción se resuelven como
    // DEFERRABLE INITIALLY DEFERRED dentro de una transacción normal.
    await sql.query('SET CONSTRAINTS ALL DEFERRED')
    const hash = await hashSecreto(clave)
    await sql.query(
      "INSERT INTO ruizcacao.administrador(id,nombre,password_hash) VALUES(1,'Titular',$1)",
      [hash]
    )
    await sql.query(
      "INSERT INTO ruizcacao.usuarios(id,nombre,password_hash,rol,activo,principal) VALUES($1,'Titular',$2,'administrador',true,true)",
      [autor, hash]
    )
    await sql.query('INSERT INTO ruizcacao.instalacion(id,installation_id) VALUES(1,$1)', [
      randomUUID()
    ])
    const ayer = (await sql.query('SELECT ($1::date-1)::text fecha', [hoy()])).rows[0].fecha
    const previo = estadoInicial()
    previo.jornada = { estado: 'activa', fecha: ayer, horaInicio: '08:00', horaFin: null }
    const d = crearDominio(previo),
      prov = d.value.crearProveedor({ nombre: 'Proveedor histórico', ciRuc: '', estado: true }),
      cli = d.value.crearCliente({
        nombreRazonSocial: 'Cliente histórico',
        identificacion: '',
        telefono: ''
      })
    const compra = d.value.registrarCompra({
      fecha: ayer,
      proveedorId: prov.id,
      producto: 'Cacao Seco',
      cantidadQq: 60,
      precioCompraQq: 10,
      impuestoPorcentaje: 0,
      montoPagado: 600,
      metodoPago: 'Efectivo',
      comprobante: 'COMPRA ORIGINAL'
    })
    const antigua = d.value.registrarCompra({
      fecha: ayer,
      proveedorId: prov.id,
      producto: 'Maracuyá',
      cantidadQq: 1,
      precioCompraQq: 5,
      impuestoPorcentaje: 0,
      montoPagado: 0,
      metodoPago: 'Efectivo'
    })
    const venta = d.value.registrarVenta({
      fechaVenta: ayer,
      clienteId: cli.id,
      producto: 'Cacao Seco',
      pesoBruto: 3,
      precioUnitario: 100,
      impuestoPorcentaje: 0,
      montoRecibido: 300,
      metodoPago: 'Efectivo'
    })
    const datos = d.snapshot()
    const cuentaAntigua = datos.cuentas.find((c) => c.compraId === antigua.id)
    cuentaAntigua.estado = 'anulado'
    cuentaAntigua.motivoAnulacion = 'Anulación realizada en 1.1.1'
    datos.stock.Maracuyá = 0
    for (const [key, e] of Object.entries(entidades)) {
      const columnas = new Set(
        (
          await sql.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='ruizcacao' AND table_name=$1",
            [e.tabla]
          )
        ).rows.map((r) => r.column_name)
      )
      const campos = e.campos.filter((c) => columnas.has(c.columna))
      for (const r of datos[key]) {
        if (
          [
            'compras',
            'ventas',
            'cuentas',
            'gastos',
            'movimientosCuenta',
            'movimientosStock'
          ].includes(key)
        ) {
          r.usuarioId = autor
          r.usuarioNombre = 'Titular'
        }
        const nombres = ['id', ...campos.map((c) => c.columna)],
          valores = [
            String(r.id),
            ...campos.map((c) =>
              r[c.propiedad] === undefined ||
              r[c.propiedad] === null ||
              (c.opcional && r[c.propiedad] === '')
                ? null
                : r[c.propiedad]
            )
          ]
        await sql.query(
          'INSERT INTO ruizcacao.' +
            e.tabla +
            '(' +
            nombres.join(',') +
            ') VALUES(' +
            nombres.map((_, i) => '$' + (i + 1)).join(',') +
            ')',
          valores
        )
      }
    }
    for (const [producto, cantidad] of Object.entries(datos.stock))
      await sql.query(
        'UPDATE ruizcacao.existencias SET cantidad_qq=$2,costo_unitario_promedio=$3 WHERE producto=$1',
        [producto, cantidad, datos.costoUnitarioPromedio[producto]]
      )
    await sql.query("INSERT INTO ruizcacao.jornadas(fecha,estado) VALUES($1,'finalizada')", [ayer])
    await sql.query('COMMIT')
    const tablas = [
      'usuarios',
      'existencias',
      'compras',
      'ventas',
      'cuentas',
      'movimientos_cuenta',
      'movimientos_stock',
      'gastos'
    ]
    const ordenTabla = {
      usuarios: 'id',
      existencias: 'producto',
      compras: 'id',
      ventas: 'id',
      cuentas: 'id',
      movimientos_cuenta: 'id',
      movimientos_stock: 'id',
      gastos: 'id'
    }
    const originales = {}
    for (const tabla of tablas)
      originales[tabla] = (
        await sql.query(
          'SELECT * FROM ruizcacao.' + tabla + ' ORDER BY ' + ordenTabla[tabla]
        )
      ).rows
    const numTablas = (
      await sql.query(
        "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='ruizcacao' AND table_type='BASE TABLE'"
      )
    ).rows[0].n
    await test('fallo durante migración revierte columnas y conserva versión 6', async () => {
      await sql.query(
        'CREATE FUNCTION ruizcacao.proteger_operacion_confirmada() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$'
      )
      db = crear()
      await assert.rejects(db.iniciar())
      await db.desconectar()
      db = null
      assert.equal(
        (await sql.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v,
        6
      )
      assert.equal(
        (
          await sql.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='ruizcacao' AND table_name='compras' AND column_name='estado'"
          )
        ).rowCount,
        0
      )
      await sql.query('DROP FUNCTION ruizcacao.proteger_operacion_confirmada()')
    })
    db = crear()
    await db.iniciar()
    await test('v6→v7→v8→v9 conserva datos, hashes, stock, fechas y comprobantes sin tablas nuevas', async () => {
      assert.equal(
        (await sql.query('SELECT max(version) v FROM ruizcacao.migraciones')).rows[0].v,
        10
      )
      assert.equal(
        (
          await sql.query(
            "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='ruizcacao' AND table_type='BASE TABLE'"
          )
        ).rows[0].n,
        numTablas
      )
      for (const tabla of tablas) {
        const rows = (
          await sql.query(
            'SELECT * FROM ruizcacao.' + tabla + ' ORDER BY ' + ordenTabla[tabla]
          )
        ).rows
        for (const row of rows)
          if (['compras', 'ventas'].includes(tabla))
            for (const c of [
              'estado',
              'anulada_en',
              'anulada_por_usuario_id',
              'anulada_por_nombre',
              'motivo_anulacion'
            ])
              delete row[c]
        assert.deepEqual(rows, originales[tabla], tabla)
      }
      const compras = (await sql.query('SELECT id,estado FROM ruizcacao.compras')).rows
      assert.equal(compras.find((c) => c.id === antigua.id).estado, 'anulada')
      assert.equal(compras.find((c) => c.id === compra.id).estado, 'vigente')
      assert.equal(
        (await sql.query('SELECT estado FROM ruizcacao.ventas')).rows[0].estado,
        'vigente'
      )
    })
    await db.login('Titular', clave)
    await db.jornada('abrir')
    const exec = async (comando, ...args) =>
      (await db.ejecutar(randomUUID(), comando, args)).resultado
    await db.crearUsuario('Operador', operadorClave)
    const resumen = (s, desde, hasta) =>
      resumirPeriodo(s.ventas, s.gastos, desde, hasta, s.movimientosCuenta, s.cuentas, s.compras)
    const htmlAntes = construirComprobanteHtml(
      (await db.cargar()).datos.ventas.find((v) => v.id === venta.id),
      cli
    )
    await test('anulación histórica conserva el historial y excluye la operación de reportes', async () => {
      await db.anularOperacion(randomUUID(), 'venta', venta.id, 'Anulación histórica', clave)
      await db.anularOperacion(randomUUID(), 'compra', compra.id, 'Anulación histórica', clave)
      const s = (await db.cargar()).datos,
        prev = resumen(s, ayer, ayer),
        ahora = resumen(s, hoy(), hoy())
      assert.equal(prev.totalIngresos, 0)
      assert.equal(prev.totalGastos, 0)
      assert.equal(ahora.totalIngresos, 0)
      assert.equal(ahora.totalGastos, 0)
      assert.equal(s.compras.find((c) => c.id === compra.id).fecha, ayer)
      assert.equal(s.ventas.find((v) => v.id === venta.id).fechaVenta, ayer)
      assert.equal(
        construirComprobanteHtml(
          s.ventas.find((v) => v.id === venta.id),
          cli
        ),
        htmlAntes
      )
      for (const fecha of [ayer, hoy()])
        assert.equal(
          Number(
            (
              await sql.query(
                'SELECT sum(monto) total FROM ruizcacao.v_flujo_caja WHERE fecha=$1',
                [fecha]
              )
            ).rows[0].total
          ),
          resumen(s, fecha, fecha).saldoPeriodo
        )
      assert.equal(
        (
          await sql.query(
            "SELECT * FROM ruizcacao.v_saldos WHERE id IN (SELECT id FROM ruizcacao.cuentas WHERE estado='anulado')"
          )
        ).rowCount,
        0
      )
      for (const tipo of ['diario', 'semanal', 'mensual']) {
        const r = resumen(s, ayer, hoy()),
          html = documentoReporte(r, tipo).html
        assert.ok(!html.includes('Anulación de compra'))
        assert.ok(!html.includes('Anulación de venta'))
        assert.ok(!html.includes('incluye anulaciones'))
      }
    })
    await test('inmutabilidad rechaza comandos antiguos, cambios SQL y eliminación física', async () => {
      for (const cmd of ['actualizarCompra', 'eliminarCompra', 'actualizarVenta', 'eliminarVenta'])
        await assert.rejects(exec(cmd, compra.id, {}), /Operación no válida/)
      for (const tabla of ['compras', 'ventas']) {
        await assert.rejects(
          sql.query('UPDATE ruizcacao.' + tabla + ' SET total=total+1'),
          /no se editan|ya fue anulada/
        )
        await assert.rejects(sql.query('DELETE FROM ruizcacao.' + tabla), /no se eliminan/)
      }
      await assert.rejects(
        db.anularOperacion(randomUUID(), 'compra', antigua.id, 'Otra vez', clave),
        /ya fue anulada/
      )
    })
    await exec('registrarCompra', {
      fecha: hoy(),
      proveedorId: prov.id,
      producto: 'Cacao Seco',
      cantidadQq: 50,
      precioCompraQq: 10,
      impuestoPorcentaje: 0,
      montoPagado: 0,
      metodoPago: 'Efectivo'
    })
    const operaciones = []
    for (const tipo of ['compra', 'venta'])
      for (const monto of [0, 5, 20]) {
        const input =
          tipo === 'compra'
            ? {
                fecha: hoy(),
                proveedorId: prov.id,
                producto: 'Cacao Seco',
                cantidadQq: 2,
                precioCompraQq: 10,
                impuestoPorcentaje: 0,
                montoPagado: monto,
                metodoPago: 'Efectivo'
              }
            : {
                fechaVenta: hoy(),
                clienteId: cli.id,
                producto: 'Cacao Seco',
                pesoBruto: 2,
                precioUnitario: 10,
                impuestoPorcentaje: 0,
                montoRecibido: monto,
                metodoPago: 'Efectivo'
              }
        const op = await exec(tipo === 'compra' ? 'registrarCompra' : 'registrarVenta', input)
        if (monto === 5) {
          const cuenta = (await db.cargar()).datos.cuentas.find((c) =>
            tipo === 'compra' ? c.compraId === op.id : c.ventaId === op.id
          )
          await exec('registrarAbono', {
            cuentaId: cuenta.id,
            fecha: hoy(),
            monto: 3,
            tipo: 'Abono',
            metodoPago: 'Transferencia',
            observacion: 'Abono posterior'
          })
        }
        operaciones.push({ tipo, op, pagado: monto === 5 ? 8 : monto })
      }
    await db.logout()
    await db.login('Operador', operadorClave)
    await db.jornada('reabrir', operadorClave)
    const operador = (await db.cargar()).usuarioActual
    await test('motivo obligatorio y contraseña del operador, no la del administrador', async () => {
      const x = operaciones[0],
        antes = (await db.cargar()).datos
      await assert.rejects(
        db.anularOperacion(randomUUID(), x.tipo, x.op.id, '  ', operadorClave),
        /Ingresa el motivo/
      )
      await assert.rejects(
        db.anularOperacion(randomUUID(), x.tipo, x.op.id, 'Prueba', clave),
        /La contraseña ingresada no es correcta/
      )
      assert.deepEqual((await db.cargar()).datos, antes)
    })
    for (const x of operaciones)
      await test(
        x.tipo + ' ' + x.pagado + ' pagado: anulación, autores e idempotencia',
        async () => {
          const antes = (await db.cargar()).datos,
            stock = antes.stock['Cacao Seco'],
            solicitud = randomUUID()
          await Promise.all([
            db.anularOperacion(solicitud, x.tipo, x.op.id, 'Anulación de prueba', operadorClave),
            db.anularOperacion(solicitud, x.tipo, x.op.id, 'Anulación de prueba', operadorClave)
          ])
          const s = (await db.cargar()).datos,
            op = (x.tipo === 'compra' ? s.compras : s.ventas).find((o) => o.id === x.op.id),
            cuenta = s.cuentas.find((c) =>
              x.tipo === 'compra' ? c.compraId === x.op.id : c.ventaId === x.op.id
            )
          assert.equal(op.estado, 'anulada')
          assert.equal(op.usuarioId, autor)
          assert.equal(op.anuladaPorUsuarioId, operador.id)
          assert.equal(op.anuladaPorNombre, 'Operador')
          assert.ok(op.anuladaEn)
          assert.equal(cuenta.estado, 'anulado')
          assert.equal(s.stock['Cacao Seco'], stock + (x.tipo === 'compra' ? -2 : 2))
          const ajustes = s.movimientosCuenta.filter(
            (m) => m.cuentaId === cuenta.id && m.tipo === 'Ajuste por devolución'
          )
          assert.equal(ajustes.length, 0)
          assert.equal(
            s.movimientosCuenta.filter((m) => m.cuentaId === cuenta.id).length,
            antes.movimientosCuenta.filter((m) => m.cuentaId === cuenta.id).length
          )
          await assert.rejects(
            db.anularOperacion(randomUUID(), x.tipo, x.op.id, 'Repetida', operadorClave),
            /ya fue anulada/
          )
          await assert.rejects(
            exec('registrarAbono', {
              cuentaId: cuenta.id,
              fecha: hoy(),
              monto: 1,
              tipo: 'Abono',
              metodoPago: 'Efectivo',
              observacion: 'No permitir'
            }),
            /no admite pagos/
          )
        }
      )
    const candidata = await exec('registrarCompra', {
      fecha: hoy(),
      proveedorId: prov.id,
      producto: 'Maracuyá',
      cantidadQq: 2,
      precioCompraQq: 10,
      impuestoPorcentaje: 0,
      montoPagado: 5,
      metodoPago: 'Efectivo'
    })
    await test('stock insuficiente impide toda la anulación', async () => {
      await exec('registrarAjusteStock', {
        fecha: hoy(),
        producto: 'Maracuyá',
        cantidadQq: -1,
        motivo: 'Consumo de prueba'
      })
      const antes = (await db.cargar()).datos
      await assert.rejects(
        db.anularOperacion(randomUUID(), 'compra', candidata.id, 'Prueba', operadorClave),
        /No hay suficiente inventario/
      )
      assert.deepEqual((await db.cargar()).datos, antes)
      await exec('registrarAjusteStock', {
        fecha: hoy(),
        producto: 'Maracuyá',
        cantidadQq: 1,
        motivo: 'Reposición de prueba'
      })
    })
    await test('fallo al guardar revierte compra, cuenta, dinero, stock y auditoría', async () => {
      const antes = (await db.cargar()).datos,
        solicitud = randomUUID()
      await sql.query(
        "CREATE FUNCTION ruizcacao.fallo_qa_v7() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo controlado'; END $$; CREATE TRIGGER fallo_qa_v7 BEFORE INSERT ON ruizcacao.movimientos_stock FOR EACH ROW EXECUTE FUNCTION ruizcacao.fallo_qa_v7()"
      )
      await assert.rejects(
        db.anularOperacion(solicitud, 'compra', candidata.id, 'Prueba', operadorClave)
      )
      assert.deepEqual((await db.cargar()).datos, antes)
      assert.equal(
        (await sql.query('SELECT id FROM ruizcacao.operaciones WHERE id=$1', [solicitud])).rowCount,
        0
      )
      await sql.query(
        'DROP TRIGGER fallo_qa_v7 ON ruizcacao.movimientos_stock; DROP FUNCTION ruizcacao.fallo_qa_v7()'
      )
    })
    await test('jornada cerrada o activa en fecha anterior bloquea anulación', async () => {
      await db.jornada('cerrar')
      await assert.rejects(
        db.anularOperacion(randomUUID(), 'compra', candidata.id, 'Prueba', operadorClave),
        /Inicia una jornada/
      )
      await sql.query("INSERT INTO ruizcacao.jornadas(fecha,estado) VALUES('2000-01-01','activa')")
      await assert.rejects(
        db.anularOperacion(randomUUID(), 'compra', candidata.id, 'Prueba', operadorClave),
        /Inicia una jornada/
      )
      await db.jornada('cerrar')
      await db.jornada('reabrir', operadorClave)
      await db.anularOperacion(randomUUID(), 'compra', candidata.id, 'Prueba', operadorClave)
    })
    await test('reinicio conserva anulaciones y no repite compensaciones', async () => {
      const antes = (await db.cargar()).datos
      await db.cerrar()
      db = crear()
      await db.iniciar()
      await db.login('Operador', operadorClave)
      const despues = (await db.cargar()).datos
      for (const key of [
        'compras',
        'ventas',
        'cuentas',
        'movimientosCuenta',
        'movimientosStock',
        'gastos',
        'stock'
      ])
        assert.deepEqual(despues[key], antes[key])
    })
    console.log(n + ' pruebas v7 satisfactorias')
  } finally {
    if (db) await db.cerrar().catch(() => db.desconectar().catch(() => {}))
    await sql.end()
    await admin.query('DROP DATABASE "' + nombre + '"')
    await admin.end()
  }
}
main().catch((e) => {
  console.error(e.stack)
  process.exitCode = 1
})
