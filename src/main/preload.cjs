const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pdfViewerDesktop', Object.freeze({
  hide: () => ipcRenderer.invoke('desktop:hide')
}));
