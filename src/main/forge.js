'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const config = require('./config');

/**
 * Install Forge 1.20.1 dans gameDir/.minecraft via le forge-installer officiel.
 *
 * Stratégie : on s'appuie sur le fait que minecraft-launcher-core sait gérer
 * un profil Forge si on lui donne `forge: <path to installer.jar>` au launch.
 * Donc on n'a qu'à TÉLÉCHARGER l'installer une fois et le passer à MCLC.
 * Pas besoin de tourner --installClient manuellement.
 */

async function ensureForgeInstaller(gameDir, onProgress) {
  const dest = path.join(gameDir, 'cache', `forge-${config.FORGE_FULL}-installer.jar`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;

  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  onProgress && onProgress({ step: 'downloading-forge-installer' });

  const res = await axios.get(config.FORGE_INSTALLER_URL, {
    responseType: 'stream',
    timeout: 120000,
  });
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(dest);
    res.data.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
  return dest;
}

module.exports = { ensureForgeInstaller };
