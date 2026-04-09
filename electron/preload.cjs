const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('salesDirectorDesktop', {
  platform: process.platform
});
