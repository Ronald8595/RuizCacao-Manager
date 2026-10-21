// Electron con páginas/contexto reales y transporte IPC de prueba hacia BaseLocal.
// Sin mocks de datos ni conexión de la instalación habitual.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { Client } = require('pg')
const { app, BrowserWindow, ipcMain } = require('electron')
const { root, load } = require('./loader.cjs')
const { BaseLocal } = load(root + '/src/main/database/base.ts')
const { leerDirectorioPostgres } = load(root + '/src/main/database/postgres-ruta.ts')
const salida = path.join(root, 'docs/evidencias-conciliacion-1.3.2/reproduccion')
const fase = process.argv[4]
const perfil = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'rcm-repro-ui-'))
app.setPath('userData', perfil)
app.on('window-all-closed', () => {})
async function main() {
  assert.ok(['crear', 'reabrir'].includes(fase))
  const archivo = path.resolve(process.argv[2])
  const carpeta = path.dirname(archivo)
  assert.match(path.basename(carpeta), /^ruizcacao-tests-/)
  assert.match(process.argv[3], /^rcm_repro_[a-f0-9]{32}$/)
  const config = JSON.parse(await fs.readFile(archivo, 'utf8'))
  const admin = new Client(config)
  await admin.connect()
  try {
    assert.equal(
      (await fs.realpath(await leerDirectorioPostgres(admin))).toLowerCase(),
      (await fs.realpath(path.join(carpeta, 'motor/data'))).toLowerCase()
    )
  } finally {
    await admin.end()
  }
  const base = new BaseLocal({ ...config, database: process.argv[3] })
  let w
  const solicitudes = []
  const pdfs = []
  const guardar = (nombre, valor) =>
    fs.writeFile(path.join(salida, nombre), JSON.stringify(valor, null, 2) + '\n')
  try {
    await base.iniciar()
    await base.login('Fixture', 'Fixture-aislado-2026!')
    if (fase === 'crear') await base.jornada('reabrir', 'Fixture-aislado-2026!')
    const permitidos = [
      'ejecutar',
      'listadoGastos',
      'resumenGastos',
      'reportePeriodo',
      'historialCompras',
      'listarNotificaciones',
      'documentoReporte'
    ]
    ipcMain.handle('fixture:datos', async (_e, metodo, args) => {
      assert.ok(permitidos.includes(metodo))
      try {
        const valor = await base[metodo](...args)
        solicitudes.push({ metodo, args: metodo === 'ejecutar' ? [args[1], args[2]] : args })
        return { ok: true, valor }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    })
    ipcMain.handle('fixture:pdf', async (_e, html, nombre) => {
      const ventana = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
      try {
        const prefijo = 'pdf-' + fase + '-' + (pdfs.length + 1)
        const htmlPath = path.join(salida, prefijo + '.html')
        const filePath = path.join(salida, prefijo + '.pdf')
        await fs.writeFile(htmlPath, html)
        await ventana.loadFile(htmlPath)
        const bytes = await ventana.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4'
        })
        assert.ok(bytes.subarray(0, 5).toString() === '%PDF-')
        await fs.writeFile(filePath, bytes)
        pdfs.push({
          nombre,
          filePath,
          bytes: bytes.length,
          filas: (html.split('aria-label="Detalle financiero"')[1].match(/<tr>/g) || []).length - 1
        })
        return { canceled: false, filePath }
      } finally {
        ventana.destroy()
      }
    })
    const preload = path.join(perfil, 'preload.cjs')
    await fs.writeFile(
      preload,
      `
      const {contextBridge,ipcRenderer}=require('electron');
      contextBridge.exposeInMainWorld('api',{
        datos:Object.fromEntries(${JSON.stringify(permitidos)}.map(n=>[n,(...a)=>ipcRenderer.invoke('fixture:datos',n,a)])),
        generarReportePDF:(html,nombre)=>ipcRenderer.invoke('fixture:pdf',html,nombre)
      });
    `
    )
    const bundle = await require('esbuild').build({
      stdin: {
        resolveDir: root,
        loader: 'tsx',
        contents: `
          import {StrictMode} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
          import {AppDataProvider} from './src/renderer/src/store/AppDataContext';
          import {NotificacionProvider} from './src/renderer/src/store/NotificacionContext';
          import Gastos from './src/renderer/src/pages/Gastos';
          import Consultas from './src/renderer/src/pages/Consultas';
          import Compras from './src/renderer/src/pages/Compras';
          const root=createRoot(document.getElementById('root'));
          window.montar=(pagina,inicial)=>{const Pagina={gastos:Gastos,consultas:Consultas,compras:Compras}[pagina];
            flushSync(()=>root.render(<StrictMode><AppDataProvider key={pagina} inicial={inicial} onSalir={()=>{}}><NotificacionProvider><Pagina/></NotificacionProvider></AppDataProvider></StrictMode>));};
          window.valor=(selector,valor)=>flushSync(()=>{const e=document.querySelector(selector);
            if(!e)throw Error('Control ausente: '+selector);
            const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto,'value').set.call(e,valor);
            e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
          window.boton=(texto)=>flushSync(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===texto);if(!b)throw Error('Botón ausente '+texto);b.click();});
          window.desmontar=()=>flushSync(()=>root.unmount());
        `
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"development"' }
    })
    await fs.writeFile(path.join(perfil, 'harness.js'), bundle.outputFiles[0].contents)
    await fs.writeFile(
      path.join(perfil, 'index.html'),
      '<meta charset="utf-8"><div id="root"></div><script src="harness.js"></script>'
    )
    await app.whenReady()
    w = new BrowserWindow({
      show: false,
      width: 1440,
      height: 960,
      webPreferences: {
        preload,
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false
      }
    })
    const js = (code) => w.webContents.executeJavaScript(code)
    // Espera acotada solo del arnés, sin cambios de timers en la aplicación.
    const esperar = async (fn, nombre) => {
      const fin = Date.now() + 15000
      while (Date.now() < fin) {
        if (await fn()) return
        await new Promise((r) => setTimeout(r, 50))
      }
      throw Error('Timeout ' + nombre + ': ' + (await js('document.body.innerText')))
    }
    const valor = (selector, v) =>
      js(`window.valor(${JSON.stringify(selector)},${JSON.stringify(v)})`)
    const boton = (t) => js(`window.boton(${JSON.stringify(t)})`)
    const montar = async (p) =>
      js(`window.montar(${JSON.stringify(p)},${JSON.stringify(await base.cargar())})`)
    const gastosSQL = async () =>
      (
        await base.pool.query(
          "SELECT id,fecha::text,fecha_hora_registro,monto,categoria,observacion FROM ruizcacao.gastos WHERE tipo='manual' ORDER BY monto,id"
        )
      ).rows
    await w.loadFile(path.join(perfil, 'index.html'))
    await montar('gastos')
    const inicio = Date.now()
    if (fase === 'crear') {
      const items = [
        ['Transporte', 10],
        ['Transporte', 60],
        ['Otros', 100],
        ['Otros', 20]
      ]
      for (const [categoria, monto] of items) {
        await boton('Nuevo gasto')
        await valor('form input[type=date]', '2026-10-19')
        await valor('form select', categoria)
        await valor('form input[type=number]', String(monto))
        await valor('form textarea', 'Fixture UI ' + monto)
        await js("document.querySelector('form').requestSubmit()")
        await esperar(
          async () => (await gastosSQL()).length === items.findIndex((i) => i[1] === monto) + 1,
          'persistir gasto ' + monto
        )
        await esperar(() => js("!document.querySelector('form')"), 'cerrar modal')
        await boton('Aceptar')
      }
      await boton('Nuevo gasto')
      await valor('form input[type=date]', '9999-01-01')
      await valor('form input[type=number]', '99')
      assert.equal(
        await js("document.querySelector('form input[type=date]').validity.rangeOverflow"),
        true
      )
      await js("document.querySelector('form').requestSubmit()")
      assert.equal((await gastosSQL()).length, 4)
      await js('document.querySelector(\'button[aria-label="Cerrar"]\').click()')
    }
    const registros = await gastosSQL()
    assert.equal(registros.length, 4)
    assert.ok(registros.every((g) => g.fecha === '2026-10-19'))
    if (fase === 'crear') {
      assert.ok(registros.every((g) => new Date(g.fecha_hora_registro).getTime() >= inicio))
      await guardar('gastos-antes-reinicio.json', registros)
    } else {
      assert.deepEqual(
        JSON.parse(JSON.stringify(registros)),
        JSON.parse(await fs.readFile(path.join(salida, 'gastos-antes-reinicio.json'), 'utf8'))
      )
    }
    await valor('input[aria-label="Desde"]', '2026-10-19')
    await valor('input[aria-label="Hasta"]', '2026-10-19')
    // Filtrar manuales para contrastar exactamente las cuatro filas de gastos.
    await js(
      `(()=>{const s=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='manual'));if(s){s.setAttribute('data-fixture','tipo');window.valor('[data-fixture=tipo]','manual')}})()`
    )
    await esperar(
      () =>
        js(
          "document.querySelectorAll('tbody tr').length===4 && document.body.innerText.includes('Fixture UI 100')"
        ),
      'gastos filtrados'
    )
    const textos = { gastos: await js('document.body.innerText') }
    await montar('compras')
    await valor('input[aria-label="Compras desde"]', '2026-10-19')
    await valor('input[aria-label="Compras hasta"]', '2026-10-19')
    await esperar(() => js("document.body.innerText.includes('20 registros')"), 'compras del día')
    await valor('select[aria-label="Registros por página"]', '25')
    await esperar(() => js("document.querySelectorAll('tbody tr').length===20"), '20 compras UI')
    textos.compras = await js('document.body.innerText')
    await montar('consultas')
    for (const [titulo, desde, hasta] of [
      ['Diario', '2026-10-19', '2026-10-19'],
      ['Semanal', '2026-10-19', '2026-10-25'],
      ['Mensual', '2026-10-01', '2026-10-31']
    ]) {
      await boton(titulo)
      await valor('input[type=date]:first-of-type', desde)
      // Los dos controles están en etiquetas distintas: asignación por índice explícita.
      await js(
        `document.querySelectorAll('input[type=date]')[1].setAttribute('data-fixture','hasta')`
      )
      await valor('[data-fixture=hasta]', hasta)
      await esperar(
        () =>
          js(
            "document.body.innerText.includes('28 registros') && !document.body.innerText.includes('Cargando reporte')"
          ),
        'reporte ' + titulo
      )
      const tarjetas = await js(
        "[...document.querySelectorAll('article strong')].slice(0,4).map(e=>e.textContent)"
      )
      assert.deepEqual(
        tarjetas.map((s) => Number(s.replace('$', '').replaceAll('.', '').replace(',', '.'))),
        [0, 6966.76, 190, -7156.76]
      )
      textos[titulo] = await js('document.body.innerText')
      const prev = pdfs.length
      await boton('Generar PDF')
      await esperar(async () => pdfs.length > prev, 'PDF ' + titulo)
      assert.equal(pdfs.at(-1).filas, 28)
      await esperar(
        () =>
          js("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Aceptar')"),
        'confirmación PDF'
      )
      await boton('Aceptar')
    }
    await guardar('ui-' + fase + '.json', {
      estado: 'PASS',
      pid: process.pid,
      fase,
      perfil,
      login: 'PASS',
      fechaManual: '2026-10-19',
      registros,
      pdfs,
      solicitudes,
      textos,
      limite:
        'Páginas y contexto reales; IPC de prueba hacia BaseLocal. No instalador ni shell completo.'
    })
    await js('window.desmontar()')
    console.log(
      'PASS UI ' + fase + ': Gastos PostgreSQL, Compras 20, Reportes/PDF 28 filas y totales exactos'
    )
  } finally {
    w?.destroy()
    ipcMain.removeHandler('fixture:datos')
    ipcMain.removeHandler('fixture:pdf')
    await base.cerrar()
  }
}
main()
  .then(() => app.exit(0))
  .catch((e) => {
    console.error(e.stack)
    app.exit(1)
  })
