const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('perfil', {
  estado: () => ipcRenderer.invoke('perfil:estado'),
  historial: (m, f) => ipcRenderer.invoke('perfil:historial', m, f),
  resultado: (r) => ipcRenderer.send('perfil:resultado', r)
})
contextBridge.exposeInMainWorld('visual', {
  captura: (nombre) => ipcRenderer.invoke('scroll:captura', nombre),
  entrada: (tipo) => ipcRenderer.invoke('scroll:entrada', tipo)
})
