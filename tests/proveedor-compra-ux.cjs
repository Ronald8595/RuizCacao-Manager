// UX real con respuesta IPC diferida/simulada. Sin base de datos ni aplicación habitual.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { root, load } = require('./loader.cjs')
const out = path.join(root, 'docs/evidencias-proveedor-compra-ux-1.3.2')
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
  const dir = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'rcm-proveedor-ux-'))
  app.setPath('userData', dir)
  app.on('window-all-closed', () => {})
  async function main() {
    await fs.mkdir(out, { recursive: true })
    const datos = load(root + '/src/shared/persistencia.ts').estadoInicial()
    datos.jornada = { estado: 'activa', fecha: '2026-10-21', horaInicio: '08:00', horaFin: null }
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
    const bundle = await require('esbuild').build({
      stdin: {
        resolveDir: root,
        loader: 'tsx',
        contents: `
        import {StrictMode} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
        import {AppDataProvider} from './src/renderer/src/store/AppDataContext';
        import {NotificacionProvider} from './src/renderer/src/store/NotificacionContext';
        import {CompraModal} from './src/renderer/src/pages/Compras';
        const inicial=${JSON.stringify(inicial)},root=createRoot(document.getElementById('root'));
        window.llamadas=[];window.api={datos:{ejecutar:(id,comando,args)=>new Promise(resolve=>{
          window.llamadas.push({id,comando,args});window.terminar=exito=>{
            const proveedor={...args[0],id:'prov-'+window.llamadas.length,fechaRegistro:new Date().toISOString()};
            if(exito)inicial.datos={...inicial.datos,proveedores:[proveedor,...inicial.datos.proveedores]};
            resolve(exito?{ok:true,valor:{estado:{...inicial},resultado:proveedor}}:{ok:false,error:'Fallo controlado. Intenta nuevamente.'});
          }
        }),listarNotificaciones:async()=>({ok:true,valor:{avisos:[],noLeidas:0}})}};
        flushSync(()=>root.render(<StrictMode><AppDataProvider inicial={inicial} onSalir={()=>{}}><NotificacionProvider><CompraModal onCerrar={()=>{}} onGuardado={()=>{}}/></NotificacionProvider></AppDataProvider></StrictMode>));
        window.boton=texto=>flushSync(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===texto);if(!b)throw Error('Botón ausente '+texto);b.click()});
        window.campos=valores=>flushSync(()=>{const controles=document.querySelectorAll('dialog[aria-labelledby="nuevo-proveedor-titulo"] input,dialog[aria-labelledby="nuevo-proveedor-titulo"] textarea');valores.forEach((v,i)=>{const e=controles[i];Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})});
        window.repetir=()=>flushSync(()=>{const form=document.querySelector('dialog[aria-labelledby="nuevo-proveedor-titulo"] form');for(let i=0;i<3;i++)form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
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
          name: 'exportar-modal-solo-test',
          setup(b) {
            b.onLoad({ filter: /pages[\\/]Compras\.tsx$/ }, async (a) => ({
              contents: (await fs.readFile(a.path, 'utf8')) + '\nexport { CompraModal };',
              loader: 'tsx',
              resolveDir: path.dirname(a.path)
            }))
          }
        }
      ]
    })
    const { compile } = require('@tailwindcss/node'),
      { Scanner } = require('@tailwindcss/oxide')
    const css = await compile(
      await fs.readFile(path.join(root, 'src/renderer/src/assets/main.css'), 'utf8'),
      { base: path.join(root, 'src/renderer/src/assets'), onDependency: () => {} }
    )
    await fs.writeFile(
      path.join(dir, 'test.css'),
      css.build(
        new Scanner({
          sources: [
            { base: path.join(root, 'src/renderer/src'), pattern: '**/*.{tsx,ts}', negated: false }
          ]
        }).scan()
      )
    )
    await fs.writeFile(path.join(dir, 'test.js'), bundle.outputFiles[0].contents)
    await fs.writeFile(
      path.join(dir, 'index.html'),
      '<meta charset="utf-8"><link rel="stylesheet" href="test.css"><div id="root"></div><script src="test.js"></script>'
    )
    await app.whenReady()
    const w = new BrowserWindow({
      show: false,
      width: 1100,
      height: 900,
      webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false }
    })
    const js = (c) => w.webContents.executeJavaScript(c)
    const esperar = async (fn) => {
      for (let i = 0; i < 100; i++) {
        if (await fn()) return
        await new Promise((r) => setTimeout(r, 20))
      }
      throw Error('Espera agotada: ' + (await js('document.body.innerText')))
    }
    const sel = 'dialog[aria-labelledby="nuevo-proveedor-titulo"]'
    const valores = [
      'Proveedor UX',
      '1234567890',
      '0999999999',
      'ux@example.test',
      '12345',
      'Dirección de prueba'
    ]
    try {
      await w.loadFile(path.join(dir, 'index.html'))
      await js("window.boton('+ Registrar nuevo proveedor')")
      await js('window.campos(' + JSON.stringify(valores) + ')')
      await js('window.repetir()')
      assert.equal(await js('window.llamadas.length'), 1, 'Bloqueo síncrono antes de repintar')
      assert.equal(await js(`document.querySelector('${sel} button[type=submit]').disabled`), true)
      assert.equal(
        await js(`document.querySelector('${sel} button[type=submit]').textContent.trim()`),
        'Guardando proveedor...'
      )
      assert.equal(
        await js(`document.querySelector('${sel} form').getAttribute('aria-busy')`),
        'true'
      )
      assert.ok(
        !(await js('document.body.innerText')).includes('Proveedor registrado correctamente')
      )
      await js("window.boton('Guardando proveedor...')")
      w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
      w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
      await js(
        `document.querySelector('${sel}').dispatchEvent(new Event('cancel',{cancelable:true}))`
      )
      await js('window.repetir()')
      assert.equal(await js('window.llamadas.length'), 1)
      assert.equal(
        await js(`document.querySelector('${sel}').open`),
        true,
        'No cierra durante escritura'
      )
      await js('window.terminar(true)')
      await esperar(() =>
        js(
          `!document.querySelector('${sel}') && document.body.innerText.includes('Proveedor seleccionado: Proveedor UX')`
        )
      )
      const visible = await js(
        `(()=>{const p=[...document.querySelectorAll('p')].find(p=>p.textContent==='Proveedor registrado correctamente');const b=p?.parentElement?.querySelector('button');if(!p||!b)return false;const r=b.getBoundingClientRect();return p.closest('dialog[open]')?.getAttribute('aria-labelledby')==='compra-titulo' && p.checkVisibility() && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b})()`
      )
      assert.equal(visible, true, 'Éxito visible y Aceptar accesible en la capa nativa de Compra')
      await js("window.boton('Aceptar')")
      assert.equal(await js('window.llamadas.length'), 1)
      await js("window.boton('+ Registrar nuevo proveedor')")
      const reintento = [
        'Proveedor reintento',
        '',
        '0988888888',
        'reintento@example.test',
        '98765',
        'Conservar dirección'
      ]
      await js('window.campos(' + JSON.stringify(reintento) + ')')
      await js('window.repetir()')
      await js('window.terminar(false)')
      await esperar(() =>
        js(
          `document.querySelector('${sel} [role=alert]')?.textContent.includes('Fallo controlado')`
        )
      )
      assert.deepEqual(
        await js(`[...document.querySelectorAll('${sel} input,${sel} textarea')].map(e=>e.value)`),
        reintento
      )
      assert.equal(await js(`document.querySelector('${sel} button[type=submit]').disabled`), false)
      assert.ok(
        !(await js('document.body.innerText')).includes('Proveedor registrado correctamente')
      )
      await js('window.repetir()')
      assert.equal(await js('window.llamadas.length'), 3)
      assert.equal(await js(`Boolean(document.querySelector('${sel} [role=alert]'))`), false)
      await js('window.terminar(true)')
      await esperar(() =>
        js(
          `!document.querySelector('${sel}') && document.body.innerText.includes('Proveedor seleccionado: Proveedor reintento')`
        )
      )
      assert.ok(
        (await js('document.body.innerText')).includes('Proveedor registrado correctamente')
      )
      const llamadas = await js('window.llamadas')
      assert.ok(
        llamadas.every((l) => l.comando === 'crearProveedor'),
        'No se envía una compra al pulsar Enter'
      )
      assert.equal(llamadas[1].id, llamadas[2].id, 'Idempotencia existente conservada en reintento')
      await fs.writeFile(
        path.join(out, 'ui.json'),
        JSON.stringify(
          {
            estado: 'PASS',
            guardando: true,
            botonDeshabilitado: true,
            enviosExito: 1,
            exitoVisibleTrasCerrar: visible,
            autoseleccion: true,
            errorConservaTodosLosCampos: true,
            reintento: true,
            comandos: llamadas.map((l) => l.comando),
            alcance:
              'CompraModal, ProveedorCompraModal y contextos reales; IPC diferido simulado, sin persistencia real.'
          },
          null,
          2
        )
      )
      await js('window.desmontar()')
      console.log(
        'PASS proveedor UX: guardando inmediato, doble envío/Enter bloqueados, éxito visible tras cierre, autoselección, error conserva campos y reintento idempotente'
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
