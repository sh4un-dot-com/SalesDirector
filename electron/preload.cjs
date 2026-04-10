const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('salesDirectorDesktop', {
  platform: process.platform,
  localDb: {
    status: () => ipcRenderer.invoke('localdb:status'),
    save: ({ passphrase, data }) => ipcRenderer.invoke('localdb:save', { passphrase, data }),
    load: ({ passphrase }) => ipcRenderer.invoke('localdb:load', { passphrase }),
    reset: () => ipcRenderer.invoke('localdb:reset')
  }
});
