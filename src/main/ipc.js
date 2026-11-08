'use strict';

const { ipcMain, shell, dialog, app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const java = require('./java');
const neoforge = require('./neoforge');
const manifestSync = require('./manifest');
const mcef = require('./mcef');
const { LauncherRunner } = require('./launcher');
const { pingMcServer } = require('./serverStatus');

/**
 * Tous les handlers IPC entre renderer (preload.js) et main process.
 */

let runner = null;

function register(win, updater) {
  const send = (channel, data) => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, data);
  };
  const progress = (data) => send('progress', data);

  ipcMain.handle('app:meta', () => ({
    version: app.getVersion(),
    mcVersion: config.MC_VERSION,
    loaderVersion: `NeoForge ${config.NEOFORGE_VERSION}`,
    serverHost: config.SERVER_HOST,
    serverPort: config.SERVER_PORT,
    serverName: config.SERVER_NAME,
  }));

  ipcMain.handle('settings:get', () => ({
    gameDir: store.get('gameDir'),
    ramGb: store.get('ramGb'),
    closeOnLaunch: store.get('closeOnLaunch'),
    extraJvmArgs: store.get('extraJvmArgs'),
  }));

  ipcMain.handle('settings:set', (_e, patch) => {
    for (const [k, v] of Object.entries(patch || {})) {
      store.set(k, v);
    }
    return store.store;
  });

  ipcMain.handle('settings:pickGameDir', async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: store.get('gameDir'),
    });
    if (r.canceled || !r.filePaths[0]) return null;
    store.set('gameDir', r.filePaths[0]);
    return r.filePaths[0];
  });

  ipcMain.handle('auth:status', () => ({
    profile: auth.currentProfile(),
  }));

  ipcMain.handle('auth:login', async () => {
    const session = await auth.login();
    return { profile: { id: session.uuid, name: session.name } };
  });

  ipcMain.handle('auth:logout', () => {
    auth.logout();
    return { ok: true };
  });

  ipcMain.handle('updater:check', () => {
    if (!updater) return { ok: false, reason: 'updater not initialized (dev mode?)' };
    updater.check();
    return { ok: true };
  });

  ipcMain.handle('updater:install', () => {
    if (!updater) return { ok: false };
    // Jamais pendant une partie : le launcher se fermerait sous le jeu.
    if (runner) return { ok: false, reason: 'game-running' };
    updater.quitAndInstall();
    return { ok: true };
  });

  ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url));
  ipcMain.handle('shell:openGameDir', () => shell.openPath(store.get('gameDir')));

  // Server status via Server List Ping natif (resout SRV + parse MC protocole)
  ipcMain.handle('server:status', async () => {
    try {
      return await pingMcServer(config.SERVER_HOST, config.SERVER_PORT, 5000);
    } catch (e) {
      return { online: false, players: 0, max: 0 };
    }
  });

  ipcMain.handle('launch:play', async () => {
    if (runner) return { ok: false, reason: 'already running' };
    if (updater && updater.blocksPlay && updater.blocksPlay()) {
      return { ok: false, reason: 'Mise à jour du launcher en cours, patiente quelques secondes.' };
    }

    let authPayload = await auth.refreshSilent();
    if (!authPayload) {
      return { ok: false, reason: 'not-logged-in' };
    }

    const gameDir = store.get('gameDir') || config.DEFAULT_GAME_DIR;
    await fs.promises.mkdir(gameDir, { recursive: true });

    try {
      progress({ step: 'syncing-files', current: 0, total: 0 });
      // syncAll telecharge mods + config + resourcepacks + shaderpacks + le
      // options.txt complet (GUI scale, FOV, keybinds, resourcePacks actifs).
      // Le shader actif vient de config/iris.properties (fourni au 1er lancement).
      // Donc plus rien a "appliquer" cote launcher : tout est mirrore.
      await manifestSync.syncAll(path.join(gameDir, '.minecraft'), progress);
      // Chromium de MCEF à moitié téléchargé/extrait → on l'efface pour un
      // retéléchargement propre (sinon crash d3dcompiler_47.dll au démarrage).
      const mcefFix = mcef.repairMcef(path.join(gameDir, '.minecraft'));
      if (mcefFix) console.log('[mcef] dossier réinitialisé :', mcefFix);

      const javaBin = await java.ensureJava21(gameDir, progress);
      const versionId = await neoforge.ensureNeoForge(gameDir, javaBin, progress);

      runner = new LauncherRunner();
      await runner.launch({
        gameDir,
        javaBin,
        versionId,
        auth: authPayload,
        onProgress: progress,
        onClose: (code) => {
          runner = null;
          send('launch:closed', { code });
          if (store.get('closeOnLaunch')) app.quit();
          else if (win && !win.isDestroyed()) win.show();
        },
      });

      progress({ step: 'launching' });
      if (store.get('closeOnLaunch') && win && !win.isDestroyed()) win.hide();
      return { ok: true };
    } catch (e) {
      runner = null;
      console.error('[launch] error:', e);
      return { ok: false, reason: e.message };
    }
  });
}

module.exports = { register };
