// Interfaz real y DTO SQL real; transporte IPC simulado, sin abrir la aplicación habitual.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os')
const assert = require('node:assert/strict')
const { root, load } = require('./loader.cjs')
const out = path.join(root, 'docs/evidencias-pagos-efectuados-1.3.2')
if (!process.versions.electron) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = require('node:child_process').spawn(
    require('electron'),
    [__filename, ...process.argv.slice(2)],
    {
      env,
      windowsHide: true,
      stdio: 'inherit'
    }
  )
  child.on('exit', (code) => {
    process.exitCode = code ?? 1
  })
} else {
  const { app, BrowserWindow } = require('electron')
  const dir = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'rcm-pagos-ui-'))
  app.setPath('userData', dir)
  app.on('window-all-closed', () => {})
  async function main() {
    const caso = JSON.parse(await fs.readFile(path.join(out, 'caso-150.json'), 'utf8'))
    const results = JSON.parse(await fs.readFile(path.join(out, 'resultados.json'), 'utf8'))
    const datos = load(root + '/src/shared/persistencia.ts').estadoInicial()
    datos.gastos = [...caso.lista19.filas, ...caso.lista20.filas]
    datos.cuentas = [caso.cuenta]
    datos.compras = [caso.compra]
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
    const { build } = require('esbuild')
    const bundle = await build({
      stdin: {
        resolveDir: root,
        loader: 'tsx',
        contents: `
      import {StrictMode} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
      import {AppDataProvider} from './src/renderer/src/store/AppDataContext';import {NotificacionProvider} from './src/renderer/src/store/NotificacionContext';
      import Gastos from './src/renderer/src/pages/Gastos';import Diario from './src/renderer/src/components/reportes/ReporteDiario';
      import Semanal from './src/renderer/src/components/reportes/ReporteSemanal';import Mensual from './src/renderer/src/components/reportes/ReporteMensual';
      const inicial=${JSON.stringify(inicial)},caso=${JSON.stringify(caso)},root=createRoot(document.getElementById('root'));
      window.consultas=[];window.api={datos:{
        listadoGastos:async f=>({ok:true,valor:f.desde==='2026-10-19'?caso.lista19:caso.lista20}),
        reportePeriodo:async f=>{window.consultas.push(f);return {ok:true,valor:caso.pagos}},
        listarNotificaciones:async()=>({ok:true,valor:{avisos:[],noLeidas:0}})
      }};
      window.montar=(tipo,datos)=>{const Comp={diario:Diario,semanal:Semanal,mensual:Mensual}[tipo];flushSync(()=>root.render(<StrictMode><AppDataProvider inicial={inicial} onSalir={()=>{}}><NotificacionProvider>{tipo==='gastos'?<Gastos/>:<Comp resumen={datos.resumen} filas={datos.filas} reinicio={tipo}/>}</NotificacionProvider></AppDataProvider></StrictMode>))};
      window.boton=t=>flushSync(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t);if(!b)throw Error('Botón ausente '+t);b.click()});
      window.valor=(selector,valor)=>flushSync(()=>{const e=document.querySelector(selector);Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,valor);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
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
    await fs.writeFile(path.join(dir, 'harness.js'), bundle.outputFiles[0].contents)
    const { compile } = require('@tailwindcss/node'),
      { Scanner } = require('@tailwindcss/oxide')
    const compiler = await compile(
      await fs.readFile(path.join(root, 'src/renderer/src/assets/main.css'), 'utf8'),
      { base: path.join(root, 'src/renderer/src/assets'), onDependency: () => {} }
    )
    const css = compiler.build(
      new Scanner({
        sources: [
          { base: path.join(root, 'src/renderer/src'), pattern: '**/*.{tsx,ts}', negated: false }
        ]
      }).scan()
    )
    await fs.writeFile(path.join(dir, 'harness.css'), css)
    await fs.writeFile(
      path.join(dir, 'index.html'),
      '<meta charset="utf-8"><link rel="stylesheet" href="harness.css"><div id="root"></div><script src="harness.js"></script>'
    )
    await app.whenReady()
    const w = new BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false }
    })
    const js = (c) => w.webContents.executeJavaScript(c)
    const esperar = async (f) => {
      for (let i = 0; i < 100; i++) {
        if (await f()) return
        await new Promise((r) => setTimeout(r, 30))
      }
      throw Error(
        'Espera agotada: ' + (await js('JSON.stringify(window.consultas)+document.body.innerText'))
      )
    }
    try {
      await w.loadFile(path.join(dir, 'index.html'))
      await js("window.montar('gastos')")
      assert.equal(
        await js('window.consultas.length'),
        0,
        'No consulta pagos al montar la vista original'
      )
      await js("window.boton('Pagos efectuados')")
      await esperar(() =>
        js('window.consultas.length===1 && document.body.innerText.includes("651,22")')
      )
      let texto = await js('document.body.innerText')
      assert.match(texto, /Abono a compra/)
      assert.match(texto, /Fecha de compra: 19\/10\/2026/)
      assert.match(texto, /150,00/)
      assert.match(texto, /501,22/)
      assert.match(texto, /20,00/)
      assert.equal(await js('document.querySelectorAll("tbody tr").length'), 3)
      assert.equal(await js('window.consultas[0].categoria'), 'pagos')
      await js('window.valor(\'[aria-label="Registros por página"]\',"100")')
      await esperar(() => js('window.consultas.length===2'))
      assert.equal(await js('window.consultas.at(-1).cursor'), null)
      assert.equal(await js('window.consultas.at(-1).limite'), 100)
      await js('window.valor(\'[aria-label="Pagos desde"]\',"2026-10-19")')
      await esperar(() => js('window.consultas.length===3'))
      assert.equal(await js('window.consultas.at(-1).desde'), '2026-10-19')
      assert.equal(await js('window.consultas.at(-1).cursor'), null)
      await js('window.valor(\'[aria-label="Pagos desde"]\',"2026-10-20")')
      await esperar(() =>
        js('window.consultas.length===4 && !document.body.innerText.includes("Cargando pagos")')
      )
      w.webContents.setZoomFactor(1.25)
      w.webContents.invalidate()
      await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
      await new Promise((r) => setTimeout(r, 150))
      await fs.writeFile(
        path.join(out, 'pagos-efectuados-125.png'),
        (await w.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()
      )
      assert.ok(
        await js('document.documentElement.scrollWidth<=window.innerWidth'),
        'Sin desborde horizontal de página a 125%'
      )
      const consultas = await js('window.consultas')
      await js("window.boton('Lista de gastos')")
      await new Promise((r) => setTimeout(r, 250))
      assert.equal(await js('window.consultas.length'), 4, 'Vista inactiva no consulta pagos')
      const renders = []
      for (const r of results.resultados) {
        await js('window.montar(' + JSON.stringify(r.tipo) + ',' + JSON.stringify(r) + ')')
        texto = await js('document.body.innerText')
        for (const f of r.filas) assert.ok(texto.includes(f.concepto ?? f.tipo))
        renders.push({ tipo: r.tipo, texto, filas: r.filas.length })
      }
      await js('window.desmontar()')
      const pdfs = process.argv.includes('--sin-pdf')
        ? JSON.parse(await fs.readFile(path.join(out, 'ui.json'), 'utf8')).pdfs
        : []
      for (const n of process.argv.includes('--sin-pdf')
        ? []
        : (await fs.readdir(out)).filter((n) => n.endsWith('.html'))) {
        await w.loadFile(path.join(out, n))
        const bytes = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
        await fs.writeFile(path.join(out, n.replace('.html', '.pdf')), bytes)
        pdfs.push({ archivo: n.replace('.html', '.pdf'), bytes: bytes.length })
      }
      await fs.writeFile(
        path.join(out, 'ui.json'),
        JSON.stringify(
          {
            estado: 'PASS',
            consultas,
            renders,
            pdfs,
            alcance:
              'Componentes reales, CSS real, DTO de PostgreSQL aislado; transporte de consulta simulado. Una captura a 125%.'
          },
          null,
          2
        )
      )
      console.log(
        'PASS UI: Pagos efectuados, fechas/100 reinician cursor, 150/501.22/20, sin consulta de pagos en vista original/inactiva; etiquetas y PDF completo'
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
