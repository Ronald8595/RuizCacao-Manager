// Interacción focalizada del formulario real; datos en memoria, sin PostgreSQL ni capturas.
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { root } = require('./loader.cjs')
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
  app.setPath('userData', require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'rcm-gasto-ui-')))
  async function main() {
    await app.whenReady()
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-gasto-form-'))
    const { build } = require('esbuild')
    const output = await build({
      stdin: {
        resolveDir: root,
        loader: 'tsx',
        contents: `
        import {StrictMode} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
        import {GastoFormModal} from './src/renderer/src/pages/Gastos';
        const root=createRoot(document.getElementById('root')); window.guardados=[];
        window.montar=(gasto=null)=>flushSync(()=>root.render(<StrictMode><GastoFormModal key={gasto?'editar':'crear'} gastoEditando={gasto} onGuardar={(data,id)=>window.guardados.push({data,id})} onCancelar={()=>{}}/></StrictMode>));
        window.valor=(selector,valor)=>flushSync(()=>{const e=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,valor);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
        window.guardar=()=>flushSync(()=>document.querySelector('form').requestSubmit());
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
          name: 'fixture-formulario',
          setup(b) {
            b.onResolve({ filter: /store\/AppDataContext$/ }, () => ({
              path: 'contexto',
              namespace: 'fixture'
            }))
            b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
              contents: `export const useAppData=()=>({fechaJornadaActiva:'2026-09-26'});export const CATEGORIAS_GASTO=['Transporte','Otros'];export const CATEGORIAS_GASTO_MANUAL=CATEGORIAS_GASTO;`
            }))
            b.onLoad({ filter: /pages[\\/]Gastos\.tsx$/ }, async (args) => ({
              contents: (await fs.readFile(args.path, 'utf8')) + '\nexport { GastoFormModal };',
              loader: 'tsx',
              resolveDir: path.dirname(args.path)
            }))
          }
        }
      ]
    })
    await fs.writeFile(path.join(dir, 'harness.js'), output.outputFiles[0].contents)
    await fs.writeFile(
      path.join(dir, 'index.html'),
      '<meta charset="utf-8"><div id="root"></div><script src="harness.js"></script>'
    )
    const w = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false }
    })
    const js = (code) => w.webContents.executeJavaScript(code)
    try {
      await w.loadFile(path.join(dir, 'index.html'))
      await js('window.montar()')
      assert.equal(await js("document.querySelector('input[type=date]').disabled"), false)
      assert.equal(await js("document.querySelector('input[type=date]').value"), '2026-09-26')
      await js(
        `window.valor('input[type=date]','2026-09-25');window.valor('input[type=number]','12.34');window.guardar()`
      )
      assert.deepEqual(
        await js('window.guardados.map(g=>({fecha:g.data.fecha,monto:g.data.monto,id:g.id}))'),
        [{ fecha: '2026-09-25', monto: 12.34, id: null }]
      )
      await js(`window.valor('input[type=date]','9999-01-01');window.guardar()`)
      assert.equal(await js('window.guardados.length'), 1, 'Fecha futura rechazada por el control')
      await js(`window.montar({...window.guardados[0].data,id:'gasto-fixture',tipo:'manual'})`)
      assert.equal(await js("document.querySelector('input[type=date]').disabled"), true)
      assert.equal(await js("document.querySelector('input[type=date]').value"), '2026-09-25')
      await js('window.desmontar()')
      assert.equal(await js("document.querySelectorAll('dialog').length"), 0)
      console.log(
        'PASS UI real: fecha editable al crear, valor enviado intacto, fecha futura bloqueada, fecha histórica protegida, StrictMode y desmontaje'
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
