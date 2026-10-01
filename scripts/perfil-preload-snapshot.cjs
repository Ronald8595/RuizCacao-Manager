const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('perfil', {
  estado: () => ipcRenderer.invoke('perfil:estado'),
  historial: (modulo, filtro) => ipcRenderer.invoke('perfil:historial', modulo, filtro),
  resultado: (r) => ipcRenderer.send('perfil:resultado', r)
})
