// Formularios/contexto reales con transporte capturado; reporte recibe DTO SQL real del test PG.
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { root, load } = require('./loader.cjs')
const out = path.join(root, 'docs/evidencias-fechas-independientes-1.3.2')
if (!process.versions.electron) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = require('node:child_process').spawn(require('electron'), [__filename], {
    env,
    windowsHide: true,
    stdio: 'inherit'
  })
  child.on('exit', (code) => {
    process.exitCode = code ?? 1
  })
} else {
  const { app, BrowserWindow } = require('electron')
  const dir = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'rcm-fechas-ui-'))
  app.setPath('userData', dir)
  app.on('window-all-closed', () => {})
  async function main() {
    const { hoyOperacion } = load(root + '/src/shared/fechasOperaciones.ts')
    const hoy = hoyOperacion()
    const datos = load(root + '/src/shared/persistencia.ts').estadoInicial()
    datos.jornada = { estado: 'activa', fecha: hoy, horaInicio: '08:00', horaFin: null }
    datos.proveedores = [{ id: 'p-fixture', nombre: 'Proveedor UI', ciRuc: '', estado: true }]
    datos.clientes = [
      { id: 'c-fixture', nombreRazonSocial: 'Cliente UI', identificacion: '', estado: true }
    ]
    datos.stock = { 'Cacao en Baba': 100, 'Cacao Seco': 100, Maracuyá: 100 }
    const inicial = {
      datos,
      avisos: [],
      usuarios: [],
      usuarioActual: null,
      administrador: 'Fixture',
      umbralesStock: {},
      stockInicialRegistrado: true,
      stockInicialRegistradoEn: null
    }
    const results = JSON.parse(await fs.readFile(path.join(out, 'resultados.json'), 'utf8'))
    const { build } = require('esbuild')
    const bundle = await build({
      stdin: {
        resolveDir: root,
        loader: 'tsx',
        contents: `
        import {StrictMode} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
        import {AppDataProvider} from './src/renderer/src/store/AppDataContext';
        import {NotificacionProvider} from './src/renderer/src/store/NotificacionContext';
        import {CompraModal} from './src/renderer/src/pages/Compras';
        import {AbonoModal,CuentaManualModal} from './src/renderer/src/pages/Cuentas';
        import Ventas from './src/renderer/src/pages/Ventas';
        import Diario from './src/renderer/src/components/reportes/ReporteDiario';
        import Semanal from './src/renderer/src/components/reportes/ReporteSemanal';
        import Mensual from './src/renderer/src/components/reportes/ReporteMensual';
        const inicial=${JSON.stringify(inicial)},root=createRoot(document.getElementById('root'));
        window.guardados=[];window.api={datos:{
          ejecutar:async(id,comando,args)=>{window.guardados.push({comando,args});return {ok:true,valor:{estado:inicial,resultado:{id:'nuevo',numeroFactura:1,numeroCompra:1}}}},
          historialVentas:async()=>({ok:true,valor:{filas:[],total:0,siguiente:null}}),
          listarNotificaciones:async()=>({ok:true,valor:{avisos:[],noLeidas:0}})
        }};
        window.montar=(tipo,datos)=>{let elemento;
          if(tipo==='compra')elemento=<CompraModal onCerrar={()=>{}} onGuardado={()=>{}}/>;
          else if(tipo==='abono')elemento=<AbonoModal cuenta={{id:'cuenta-fixture',origen:'compra',categoria:'compra',fecha:'2026-10-17',numeroCompra:1,montoTotal:500,montoPagado:100,estado:'parcial'}} nombreCliente="Proveedor UI" comprobantesVenta={[]} onCancelar={()=>{}} onGuardar={v=>window.guardados.push({comando:'abono-ui',args:[v]})}/>;
          else if(tipo==='manual')elemento=<CuentaManualModal clientes={[{id:'c-fixture',nombre:'Cliente UI'}]} onCancelar={()=>{}} onGuardar={v=>window.guardados.push({comando:'manual-ui',args:[v]})}/>;
          else if(tipo==='venta')elemento=<Ventas/>;
          else {const Comp={diario:Diario,semanal:Semanal,mensual:Mensual}[tipo];elemento=<Comp resumen={datos.resumen} filas={datos.filas} reinicio={tipo}/>;}
          flushSync(()=>root.render(<StrictMode><AppDataProvider key={tipo} inicial={inicial} onSalir={()=>{}}><NotificacionProvider>{elemento}</NotificacionProvider></AppDataProvider></StrictMode>));
        };
        window.valor=(selector,valor)=>flushSync(()=>{const e=document.querySelector(selector);if(!e)throw Error('Control ausente '+selector);
          Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,valor);
          e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
        window.campo=(label,valor)=>{const e=[...document.querySelectorAll('label')].find(l=>l.firstElementChild?.textContent.trim().replace(/\\s*\\*$/,'')===label)?.querySelector('input,select');
          if(!e)throw Error('Campo ausente '+label);e.setAttribute('data-campo','activo');window.valor('[data-campo=activo]',valor);e.removeAttribute('data-campo');};
        window.boton=(texto)=>flushSync(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===texto);if(!b)throw Error('Botón ausente '+texto);b.click()});
        window.desmontar=()=>flushSync(()=>root.unmount());
      `
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"development"' },
      plugins: [
        {
          name: 'exportar-formularios-test',
          setup(b) {
            b.onLoad({ filter: /pages[\\/](Compras|Cuentas)\.tsx$/ }, async (a) => ({
              contents:
                (await fs.readFile(a.path, 'utf8')) +
                `\nexport { ${a.path.endsWith('Compras.tsx') ? 'CompraModal' : 'AbonoModal, CuentaManualModal'} };`,
              loader: 'tsx',
              resolveDir: path.dirname(a.path)
            }))
          }
        }
      ]
    })
    await fs.writeFile(path.join(dir, 'harness.js'), bundle.outputFiles[0].contents)
    await fs.writeFile(
      path.join(dir, 'index.html'),
      '<meta charset="utf-8"><div id="root"></div><script src="harness.js"></script>'
    )
    await app.whenReady()
    const w = new BrowserWindow({
      show: false,
      width: 1100,
      height: 800,
      webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false }
    })
    const js = (code) => w.webContents.executeJavaScript(code)
    const campo = (label, v) => js(`window.campo(${JSON.stringify(label)},${JSON.stringify(v)})`)
    const boton = (t) => js(`window.boton(${JSON.stringify(t)})`)
    const esperar = async (fn) => {
      for (let i = 0; i < 100; i++) {
        if (await fn()) return
        await new Promise((r) => setTimeout(r, 30))
      }
      throw Error('Espera agotada: ' + (await js('document.body.innerText')))
    }
    try {
      await w.loadFile(path.join(dir, 'index.html'))
      await js("window.montar('compra')")
      assert.equal(
        await js('document.querySelector(\'[aria-label="Fecha de compra"]\').value'),
        hoy
      )
      await campo('Proveedor', 'Proveedor UI')
      await campo('Cantidad (qq)', '1')
      await campo('Precio por qq (USD)', '162.12')
      await campo('Impuesto (%)', '0')
      assert.equal(
        await js(
          'document.querySelector(\'[aria-label="Fecha efectiva del pago inicial"]\').value'
        ),
        hoy
      )
      await campo('Fecha de compra', '2026-10-17')
      assert.equal(
        await js(
          'document.querySelector(\'[aria-label="Fecha efectiva del pago inicial"]\').value'
        ),
        hoy,
        'Cambiar origen no copia fecha al pago'
      )
      await campo('Fecha efectiva del pago inicial', '2026-10-19')
      await js("document.querySelector('form').requestSubmit()")
      assert.equal(await js('window.guardados.length'), 0, 'No guarda antes de confirmar')
      assert.match(await js('document.body.innerText'), /Fecha retroactiva/)
      await boton('Sí, confirmar compra')
      await esperar(() => js('window.guardados.length===1'))
      assert.equal(await js('window.guardados[0].args[0].fecha'), '2026-10-17')
      assert.equal(await js('window.guardados[0].args[0].fechaPagoInicial'), '2026-10-19')
      await js("window.montar('venta')")
      await boton('Nueva venta')
      assert.equal(await js('document.querySelector(\'[aria-label="Fecha de venta"]\').value'), hoy)
      await campo('Cliente', 'Cliente UI')
      await campo('Peso bruto (qq)', '1')
      await campo('Precio unitario (por qq)', '200')
      await campo('Impuesto (%)', '0')
      assert.equal(
        await js(
          'document.querySelector(\'[aria-label="Fecha efectiva del cobro inicial"]\').value'
        ),
        hoy
      )
      await campo('Fecha de venta', '2026-10-17')
      assert.equal(
        await js(
          'document.querySelector(\'[aria-label="Fecha efectiva del cobro inicial"]\').value'
        ),
        hoy
      )
      await campo('Fecha efectiva del cobro inicial', '2026-10-19')
      await boton('Guardar venta')
      assert.equal(await js('window.guardados.length'), 1)
      assert.match(await js('document.body.innerText'), /Fecha retroactiva/)
      await boton('Sí, confirmar venta')
      await esperar(() => js('window.guardados.length===2'))
      assert.equal(await js('window.guardados[1].args[0].fechaVenta'), '2026-10-17')
      assert.equal(await js('window.guardados[1].args[0].fechaCobroInicial'), '2026-10-19')
      await js("window.montar('abono')")
      await campo('Fecha', '2026-10-19')
      await campo('Monto ($)', '200')
      await campo('Observación', 'Cuota')
      await js("document.querySelector('form').requestSubmit()")
      assert.equal(await js('window.guardados.length'), 2)
      assert.match(await js('document.body.innerText'), /Confirma la fecha retroactiva/)
      await js("document.querySelector('input[type=checkbox]').click()")
      await js("document.querySelector('form').requestSubmit()")
      assert.equal(await js('window.guardados.length'), 3)
      await campo('Fecha', '2026-10-17')
      assert.equal(await js("document.querySelector('input[type=checkbox]').checked"), false)
      await js("window.montar('manual')")
      await campo('Fecha', '2026-10-17')
      await campo('Monto ($)', '50')
      await campo('Observación', 'Deuda anterior')
      await js("document.querySelector('form').requestSubmit()")
      assert.equal(await js('window.guardados.length'), 3)
      await js("document.querySelector('input[type=checkbox]').click()")
      await js("document.querySelector('form').requestSubmit()")
      assert.equal(await js('window.guardados.length'), 4)
      const renders = []
      for (const tipo of ['diario', 'semanal', 'mensual']) {
        const r = results.resultados.find(
          (r) => r.tipo === tipo && (tipo === 'mensual' || r.desde === '2026-10-19')
        )
        await js(`window.montar(${JSON.stringify(tipo)},${JSON.stringify(r)})`)
        const texto = await js('document.body.innerText')
        for (const f of r.filas) assert.ok(texto.includes(f.trazabilidad))
        renders.push({ tipo, texto, filas: r.filas.length })
      }
      await fs.writeFile(
        path.join(out, 'ui.json'),
        JSON.stringify(
          {
            estado: 'PASS',
            capturasIPC: await js('window.guardados'),
            renders,
            alcance:
              'Formularios/contexto reales, transporte de mutaciones capturado. DTO de reportes obtenido de PostgreSQL real.'
          },
          null,
          2
        )
      )
      await js('window.desmontar()')
      // Imprimir los documentos completos previamente obtenidos del generador real.
      const pdfs = []
      for (const n of (await fs.readdir(out)).filter((n) => n.endsWith('.html'))) {
        await w.loadFile(path.join(out, n))
        const bytes = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
        await fs.writeFile(path.join(out, n.replace('.html', '.pdf')), bytes)
        pdfs.push({ archivo: n.replace('.html', '.pdf'), bytes: bytes.length })
      }
      await fs.writeFile(path.join(out, 'pdf.json'), JSON.stringify(pdfs, null, 2))
      console.log(
        'PASS UI: fechas predeterminadas/independientes, confirmaciones, IPC capturado y reporte SQL/PDF'
      )
    } finally {
      w.destroy()
    }
  }
  main()
    .then(() => app.exit(0))
    .catch((e) => {
      console.error(e.stack)
      app.exit(1)
    })
}
