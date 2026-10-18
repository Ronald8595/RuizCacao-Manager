// Contratos de interacción en una ventana oculta, sin datos reales ni capturas visuales.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path')
const assert = require('node:assert/strict')
const { build } = require('esbuild')
const { root } = require('../tests/loader.cjs')
app.setPath(
  'userData',
  require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'rcm-stock-fecha-ui-'))
)
app.on('window-all-closed', () => {})
async function main() {
  await app.whenReady()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-stock-fecha-harness-'))
  const bundle = await build({
    stdin: {
      contents: `
    import {StrictMode} from 'react'; import {createRoot} from 'react-dom/client';
    import StockPorFecha from './src/renderer/src/pages/StockPorFecha';
    window.llamadas=[]; window.pendientes=[];
    window.api={datos:{stockPorFecha(f){window.llamadas.push(f);return new Promise(resolve=>window.pendientes.push(resolve));}}};
    const raiz=createRoot(document.getElementById('root'));
    window.abrir=()=>raiz.render(<StrictMode><StockPorFecha/></StrictMode>);
    window.cerrar=()=>raiz.render(null);
    window.resolver=(i,marca='dato',siguiente=null)=>window.pendientes[i]({ok:true,valor:{
      resumen:['Cacao en Baba','Cacao Seco','Maracuyá'].map(producto=>({producto,inicial:10,entradas:5,salidas:2,final:13})),
      filas:[{id:marca,horaRegistrada:'12:00:00',tipo:'Conversión',producto:'Cacao Seco',entrada:5,salida:15,detalle:marca}],
      total:160,siguiente}});
  `,
      resolveDir: root,
      loader: 'tsx',
      sourcefile: 'stock-fecha-harness.tsx'
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' }
  })
  await fs.writeFile(path.join(dir, 'harness.js'), bundle.outputFiles[0].contents)
  await fs.writeFile(
    path.join(dir, 'index.html'),
    '<meta charset="utf-8"><div id="root"></div><script src="harness.js"></script>'
  )
  const ventana = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false }
  })
  const js = (code) => ventana.webContents.executeJavaScript(code)
  const esperar = async (condicion) => {
    for (let i = 0; i < 100; i++) {
      if (await js(condicion)) return
      await new Promise((r) => setTimeout(r, 20))
    }
    throw Error('No se cumplió: ' + condicion)
  }
  const cambiarFecha = (fecha) =>
    js(
      `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(document.querySelector('input[type=date]'),'${fecha}');document.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('input').dispatchEvent(new Event('change',{bubbles:true}));`
    )
  const boton = (texto) =>
    js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='${texto}').click()`
    )
  try {
    await ventana.loadFile(path.join(dir, 'index.html'))
    assert.equal(await js('window.llamadas.length'), 0, 'Sin consultas antes de abrir')
    await js('window.abrir()')
    await esperar('window.llamadas.length===1')
    assert.equal((await js('window.llamadas[0]')).limite, 25)
    await js("window.resolver(0,'primera','cursor-1')")
    await esperar("document.body.textContent.includes('primera')")
    assert.equal(await js("document.querySelectorAll('table[aria-label] tbody tr').length"), 3)
    assert.equal(
      await js('document.querySelectorAll(\'[aria-label="Movimientos del día"] tbody tr\').length'),
      1,
      'Conversión en una fila'
    )
    assert.match(await js('document.body.textContent'), /Cacao en Baba → Cacao Seco/)
    await boton('Siguiente')
    await esperar('window.llamadas.length===2')
    assert.equal((await js('window.llamadas[1]')).cursor, 'cursor-1')
    await js("window.resolver(1,'segunda','cursor-2')")
    await esperar("document.body.textContent.includes('segunda')")
    await boton('Anterior')
    await esperar('window.llamadas.length===3')
    assert.equal((await js('window.llamadas[2]')).cursor, null)
    await js("window.resolver(2,'anterior','cursor-1')")
    await esperar("document.body.textContent.includes('anterior')")
    for (const n of [10, 50, 100, 25]) {
      const antes = await js('window.llamadas.length')
      await js(
        `document.querySelector('select').value='${n}';document.querySelector('select').dispatchEvent(new Event('change',{bubbles:true}))`
      )
      await esperar(`window.llamadas.length===${antes + 1}`)
      assert.deepEqual(
        await js(
          `({limite:window.llamadas[${antes}].limite,cursor:window.llamadas[${antes}].cursor})`
        ),
        { limite: n, cursor: null }
      )
      await js(`window.resolver(${antes},'limite-${n}','siguiente')`)
      await esperar(`document.body.textContent.includes('limite-${n}')`)
    }
    const inicio = await js('window.llamadas.length')
    await cambiarFecha('2025-01-02')
    await esperar(`window.llamadas.length===${inicio + 1}`)
    await cambiarFecha('2025-01-03')
    await esperar(`window.llamadas.length===${inicio + 2}`)
    await js(`window.resolver(${inicio + 1},'fecha-nueva')`)
    await esperar("document.body.textContent.includes('fecha-nueva')")
    await js(`window.resolver(${inicio},'fecha-obsoleta')`)
    assert.equal(await js("document.body.textContent.includes('fecha-obsoleta')"), false)
    assert.equal((await js('window.llamadas.at(-1)')).cursor, null)
    await cambiarFecha('2025-01-04')
    await esperar(`window.llamadas.length===${inicio + 3}`)
    await js(`window.pendientes[${inicio + 2}]({ok:false,error:'Fallo controlado'})`)
    await esperar("document.body.textContent.includes('Fallo controlado')")
    await boton('Reintentar')
    await esperar(`window.llamadas.length===${inicio + 4}`)
    await js(`window.resolver(${inicio + 3},'recuperado')`)
    await esperar("document.body.textContent.includes('recuperado')")
    await js('window.cerrar()')
    await esperar("document.getElementById('root').childElementCount===0")
    const numero = await js('window.llamadas.length')
    await new Promise((r) => setTimeout(r, 200))
    assert.equal(await js('window.llamadas.length'), numero)
    const hook = await fs.readFile(
      path.join(root, 'src/renderer/src/hooks/useStockPorFecha.ts'),
      'utf8'
    )
    assert.doesNotMatch(hook, /setTimeout|setInterval|useAppData|\.estado\(|\.cargar\(/)
    const resultado = {
      resultado: 'OK',
      consultas: numero,
      StrictMode: 'Una solicitud inicial',
      casos: [
        'sin consulta antes de abrir',
        '3 productos',
        'conversion en una fila',
        'cursor siguiente/anterior',
        '10/25/50/100',
        'reinicio fecha/tamaño',
        'respuesta obsoleta descartada',
        'error y reintento',
        'sin consultas desmontado'
      ],
      capturas: 0,
      datosReales: 0
    }
    await fs.mkdir(path.join(root, 'docs/evidencias-stock-fecha'), { recursive: true })
    await fs.writeFile(
      path.join(root, 'docs/evidencias-stock-fecha/interaccion.json'),
      JSON.stringify(resultado, null, 2) + '\n'
    )
    console.log(JSON.stringify(resultado))
  } finally {
    ventana.destroy()
  }
}
main()
  .then(() => app.exit(0))
  .catch((e) => {
    console.error(e.stack)
    app.exit(1)
  })
