const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('salesDirectorDesktop', {
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  imap: {
    syncInbox: (payload = {}) => ipcRenderer.invoke('imap:syncInbox', payload),
    updateMessageState: (payload = {}) => ipcRenderer.invoke('imap:updateMessageState', payload),
    testConnection: (payload = {}) => ipcRenderer.invoke('imap:testConnection', payload),
    oauth2Login: (payload = {}) => ipcRenderer.invoke('imap:oauth2Login', payload),
    oauth2Status: (payload = {}) => ipcRenderer.invoke('imap:oauth2Status', payload),
    oauth2Logout: (payload = {}) => ipcRenderer.invoke('imap:oauth2Logout', payload)
  },
  smtp: {
    sendEmail: (payload = {}) => ipcRenderer.invoke('smtp:sendEmail', payload),
    testConnection: (payload = {}) => ipcRenderer.invoke('smtp:testConnection', payload)
  },
  graph: {
    syncInbox: (payload = {}) => ipcRenderer.invoke('graph:syncInbox', payload),
    sendEmail: (payload = {}) => ipcRenderer.invoke('graph:sendEmail', payload),
    updateMessageState: (payload = {}) => ipcRenderer.invoke('graph:updateMessageState', payload)
  },
  localDb: {
    status: () => ipcRenderer.invoke('localdb:status'),
    save: ({ passphrase, data }) => ipcRenderer.invoke('localdb:save', { passphrase, data }),
    load: ({ passphrase }) => ipcRenderer.invoke('localdb:load', { passphrase }),
    reset: () => ipcRenderer.invoke('localdb:reset')
  }
});
