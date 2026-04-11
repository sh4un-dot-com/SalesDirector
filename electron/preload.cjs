const { contextBridge, ipcRenderer } = require('electron');
const packageJson = require('../package.json');

const appInfo = {
  productName: packageJson.build?.productName || packageJson.productName || packageJson.name || 'SalesDirector',
  version: packageJson.version || '0.0.0',
  platform: process.platform,
  arch: process.arch,
  electronVersion: process.versions.electron,
  chromeVersion: process.versions.chrome,
  nodeVersion: process.versions.node
};

contextBridge.exposeInMainWorld('salesDirectorDesktop', {
  platform: process.platform,
  appInfo,
  localDb: {
    status: () => ipcRenderer.invoke('localdb:status'),
    save: ({ passphrase, data }) => ipcRenderer.invoke('localdb:save', { passphrase, data }),
    load: ({ passphrase }) => ipcRenderer.invoke('localdb:load', { passphrase }),
    reset: () => ipcRenderer.invoke('localdb:reset')
  }
});
