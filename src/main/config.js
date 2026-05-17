'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

/**
 * Toutes les valeurs personnalisables sont dans launcher.config.json à la
 * racine du projet (pas dans ce fichier). On les lit ici une fois au boot.
 *
 * Pourquoi un JSON externe :
 *  - L'utilisateur n'édite QU'UN seul fichier
 *  - Pas besoin de connaître JS pour rebrand
 *  - Plus facile à valider / documenter
 */

function loadUserConfig() {
  // En dev : fichier dans le repo. En prod packagé : copié dans app.asar via files: dans electron-builder.yml
  const candidates = [
    path.join(__dirname, '..', '..', 'launcher.config.json'),
    path.join(process.resourcesPath || '', 'app.asar', 'launcher.config.json'),
    path.join(process.resourcesPath || '', 'launcher.config.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (_) { /* try next */ }
  }
  throw new Error('launcher.config.json introuvable — assure-toi qu\'il est à la racine du projet.');
}

const uc = loadUserConfig();

// === Versions MC / Forge ===
const MC_VERSION = uc.minecraft || '1.20.1';
const FORGE_VERSION = uc.forge || '47.4.18';
const FORGE_FULL = `${MC_VERSION}-${FORGE_VERSION}`;
const FORGE_INSTALLER_URL =
  `https://maven.minecraftforge.net/net/minecraftforge/forge/${FORGE_FULL}/forge-${FORGE_FULL}-installer.jar`;

// === Java ===
const JAVA_VERSION = 21;
const JAVA_TEMURIN_WIN_X64 =
  'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse';

// === GitHub (client files = mods/config/resourcepacks/manifest) ===
const GH_OWNER = uc.github.owner;
const GH_REPO_CLIENT = uc.github.repoClient;
const GH_BRANCH = uc.github.clientBranch || 'main';
const GH_TOKEN = uc.github.token || '';

// raw.githubusercontent.com sert les fichiers bruts d'un repo Git.
// Format: https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>
const RAW_BASE = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO_CLIENT}/${GH_BRANCH}/`;

// === Serveur MC ===
const SERVER_HOST = uc.server.host;
const SERVER_PORT = uc.server.port || 25565;
const SERVER_NAME = uc.server.name || 'Ethernia';

// === Game dir ===
const DEFAULT_GAME_DIR = path.join(app.getPath('appData'), '.ethernia');

// Headers HTTP à utiliser pour les requêtes au repo client (token si privé)
function clientHttpHeaders() {
  return GH_TOKEN ? { Authorization: `token ${GH_TOKEN}` } : {};
}

module.exports = {
  MANIFEST_URL: RAW_BASE + 'manifest.json',
  FILES_BASE_URL: RAW_BASE,
  clientHttpHeaders,

  MC_VERSION,
  FORGE_VERSION,
  FORGE_FULL,
  FORGE_INSTALLER_URL,

  JAVA_VERSION,
  JAVA_TEMURIN_WIN_X64,

  DEFAULT_GAME_DIR,
  SERVER_HOST,
  SERVER_PORT,
  SERVER_NAME,

  IS_WIN: process.platform === 'win32',
  USER_HOME: os.homedir(),
};
