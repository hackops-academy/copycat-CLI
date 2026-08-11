'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cc', {
  // window chrome
  winMinimize: () => ipcRenderer.send('win:minimize'),
  winMaximize: () => ipcRenderer.send('win:maximize'),
  winClose: () => ipcRenderer.send('win:close'),

  // workspace
  pickRoot: () => ipcRenderer.invoke('workspace:pick-root'),
  getRoot: () => ipcRenderer.invoke('workspace:get-root'),
  openPath: (dir) => ipcRenderer.invoke('workspace:open', dir),
  listRuns: () => ipcRenderer.invoke('workspace:list'),

  // actions
  runMirror: (url) => ipcRenderer.invoke('mirror:run', url),
  runRecon: (domain, portScan) => ipcRenderer.invoke('recon:run', { domain, portScan }),
  runExtractor: (mirrorDir) => ipcRenderer.invoke('extract:run', mirrorDir),
  buildMindmap: (domain, subdomainsFile, mirrorDir) =>
    ipcRenderer.invoke('mindmap:build', { domain, subdomainsFile, mirrorDir }),

  // log stream
  onLog: (cb) => {
    const handler = (evt, payload) => cb(payload);
    ipcRenderer.on('log', handler);
    return () => ipcRenderer.removeListener('log', handler);
  }
});
