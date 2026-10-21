// Extrae fotogramas del original sin alterarlo; Electron oculto, sin red ni IPC.
const fs = require('node:fs/promises')
const path = require('node:path')
const destino = path.resolve(__dirname, '../docs/evidencias-conciliacion-1.3.2')
if (!process.versions.electron) {
  const { spawn } = require('node:child_process')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [__filename], {
    env,
    windowsHide: true,
    stdio: 'inherit'
  })
  child.on('exit', (code) => {
    process.exitCode = code
  })
} else {
  const { app, BrowserWindow } = require('electron')
  const { pathToFileURL } = require('node:url')
  app
    .whenReady()
    .then(async () => {
      const w = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      })
      const video = path.resolve(__dirname, '../..', 'evidencias/08_video_original.mp4')
      await fs.access(video)
      const html = path.join(destino, 'video-local.html')
      await fs.writeFile(
        html,
        '<video muted preload="auto" src="' + pathToFileURL(video).href + '"></video>'
      )
      await w.loadFile(html)
      const meta = await w.webContents.executeJavaScript(
        `new Promise((resolve,reject)=>{const v=document.querySelector('video'); const ready=()=>resolve({duration:v.duration,width:v.videoWidth,height:v.videoHeight}); if(v.error) reject(Error('Video no decodificable')); else if(v.readyState>=1) ready(); else {v.onloadedmetadata=ready;v.onerror=()=>reject(Error('Video no decodificable'));}})`
      )
      console.log(JSON.stringify(meta))
      for (const t of [
        0.1,
        meta.duration * 0.25,
        meta.duration * 0.5,
        meta.duration * 0.75,
        meta.duration - 0.2
      ]) {
        const data = await w.webContents.executeJavaScript(
          `new Promise(resolve=>{const v=document.querySelector('video');v.onseeked=()=>{const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);resolve(c.toDataURL('image/jpeg',.85).split(',')[1]);};v.currentTime=${t};})`
        )
        await fs.writeFile(
          path.join(destino, 'video-' + t.toFixed(1) + '.jpg'),
          Buffer.from(data, 'base64')
        )
      }
      await fs.writeFile(path.join(destino, 'video-metadata.json'), JSON.stringify(meta, null, 2))
      w.destroy()
      app.quit()
    })
    .catch((e) => {
      console.error(e.message)
      app.exit(1)
    })
}
