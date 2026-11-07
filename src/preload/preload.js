'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Pont sécurisé entre le renderer (UI HTML) et le main process.
 * Le renderer n'a PAS accès à node — seulement à ces fonctions.
 */
contextBridge.exposeInMainWorld('ethernia', {
  meta: () => ipcRenderer.invoke('app:meta'),

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    pickGameDir: () => ipcRenderer.invoke('settings:pickGameDir'),
  },

  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },

  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onEvent: (cb) => ipcRenderer.on('updater', (_e, d) => cb(d)),
  },

  launch: {
    play: () => ipcRenderer.invoke('launch:play'),
    onProgress: (cb) => ipcRenderer.on('progress', (_e, d) => cb(d)),
    onClosed: (cb) => ipcRenderer.on('launch:closed', (_e, d) => cb(d)),
  },

  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    openGameDir: () => ipcRenderer.invoke('shell:openGameDir'),
  },

  server: {
    status: () => ipcRenderer.invoke('server:status'),
  },
});
