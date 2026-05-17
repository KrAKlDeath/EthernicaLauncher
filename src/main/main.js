'use strict';

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const ipc = require('./ipc');
const { setupUpdater } = require('./updater');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 980,
    minHeight: 600,
    backgroundColor: '#0b0d12',
    title: 'Ethernia Launcher',
    autoHideMenuBar: true,
    frame: true,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Pas de menu — on est un launcher, pas un éditeur
  Menu.setApplicationMenu(null);

  // Tous les liens externes s'ouvrent dans le navigateur OS
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  let updater = null;
  if (app.isPackaged) {
    updater = setupUpdater(mainWindow);
    mainWindow.webContents.once('did-finish-load', () => {
      updater.check();
    });
  }

  ipc.register(mainWindow, updater);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
