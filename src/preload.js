'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  getState: () => ipcRenderer.invoke('state:get'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('island:ignore', !!ignore),
  action: (name) => ipcRenderer.send('act', name),
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('cfg:save', cfg),
  testChannel: (channel, cfg) => ipcRenderer.invoke('test', channel, cfg),
  getLoginStatus: () => ipcRenderer.invoke('login:status'),
  platform: process.platform,
});
