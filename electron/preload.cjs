const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('salesDirectorDesktop', {
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  imap: {
    syncInbox: (payload = {}) => ipcRenderer.invoke('imap:syncInbox', payload),
    updateMessageState: (payload = {}) => ipcRenderer.invoke('imap:updateMessageState', payload)
  },
  localDb: {
    status: () => ipcRenderer.invoke('localdb:status'),
    save: ({ passphrase, data }) => ipcRenderer.invoke('localdb:save', { passphrase, data }),
    load: ({ passphrase }) => ipcRenderer.invoke('localdb:load', { passphrase }),
    reset: () => ipcRenderer.invoke('localdb:reset')
  }
});
