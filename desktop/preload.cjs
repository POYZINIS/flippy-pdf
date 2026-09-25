const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getState: () => ipcRenderer.invoke('window:get-state'),
  command: command => ipcRenderer.invoke('window:command', command),
  setAppearance: appearance => ipcRenderer.invoke('window:appearance', appearance),
  pdfReady: () => ipcRenderer.invoke('pdf:ready'),
  readPdfRange: (id, begin, end) => ipcRenderer.invoke('pdf:read', id, begin, end),
  releasePdf: id => ipcRenderer.invoke('pdf:release', id),
  onPdf: callback => {
    const handler = (_event, file) => callback(file);
    ipcRenderer.on('pdf:open', handler);
    return () => ipcRenderer.removeListener('pdf:open', handler);
  },
  onState: callback => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('window:state', handler);
    return () => ipcRenderer.removeListener('window:state', handler);
  },
});
