const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pdfViewerDesktop', Object.freeze({
  hide: () => ipcRenderer.invoke('desktop:hide'),
  setLanguage: language => ipcRenderer.invoke('desktop:language', language)
}));
