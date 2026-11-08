'use strict';

const { autoUpdater } = require('electron-updater');

/**
 * Auto-update du launcher. electron-updater consomme latest.yml + .exe +
 * .blockmap publiés par electron-builder dans dist/.
 *
 * Workflow utilisateur :
 *   1. Launcher démarre → autoUpdater.checkForUpdates()
 *   2. Update détecté → DL en background → 'update-downloaded'
 *   3. UI notifie l'user → quitAndInstall() relance avec la nouvelle version
 */

function setupUpdater(win) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // État courant : JOUER est bloqué tant qu'une vérification ou une mise à jour
  // est en cours (lancer le jeu pendant que le launcher se remplace casse tout).
  let state = 'idle';
  let checkTimer = null;
  const send = (event, data) => {
    state = data.step;
    if (win && !win.isDestroyed()) win.webContents.send(event, data);
  };

  autoUpdater.on('checking-for-update', () => {
    send('updater', { step: 'checking' });
    // Sécurité : une vérification qui ne répond pas ne bloque pas JOUER indéfiniment.
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      if (state === 'checking') send('updater', { step: 'none' });
    }, 20000);
  });
  autoUpdater.on('update-available', (info) =>
    send('updater', { step: 'available', version: info.version })
  );
  autoUpdater.on('update-not-available', () => send('updater', { step: 'none' }));
  autoUpdater.on('error', (err) => send('updater', { step: 'error', message: String(err) }));
  autoUpdater.on('download-progress', (p) =>
    send('updater', {
      step: 'downloading',
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
    })
  );
  autoUpdater.on('update-downloaded', (info) =>
    send('updater', { step: 'ready', version: info.version })
  );

  return {
    check: () => autoUpdater.checkForUpdates(),
    quitAndInstall: () => autoUpdater.quitAndInstall(true, true),
    blocksPlay: () => ['checking', 'available', 'downloading', 'ready'].includes(state),
    state: () => state,
  };
}

module.exports = { setupUpdater };
