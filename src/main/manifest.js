'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const config = require('./config');

/**
 * Sync mods / config / resourcepacks contre le manifest.json hébergé sur GitHub.
 *
 * Format du manifest.json (voir server/generate-manifest.py) :
 * {
 *   "version": 17,
 *   "minecraft": "1.21.1",
 *   "neoforge": "21.1.228",
 *   "files": [
 *     { "path": "mods/ethernicaui-0.2.0.jar", "sha256": "abc...", "size": 123456 },
 *     { "path": "config/iris.properties", "sha256": "...", "size": 120, "once": true },
 *     ...
 *   ],
 *   "managedDirs": ["mods", "shaderpacks"]
 * }
 *
 * "once" : fichier de réglages fourni au premier lancement seulement (le joueur peut
 * ensuite le modifier sans qu'il soit écrasé).
 *
 * Les fichiers sont téléchargés depuis FILES_BASE_URL + entry.path.
 * Les fichiers locaux qui ne sont pas dans le manifeste mais qui sont dans
 * un managedDir sont SUPPRIMÉS (sinon les anciens mods restent à jamais).
 */

async function fetchManifest() {
  const { data } = await axios.get(config.MANIFEST_URL, {
    timeout: 15000,
    decompress: false,
    headers: {
      'Cache-Control': 'no-cache',
      'Accept-Encoding': 'identity',
      ...config.clientHttpHeaders(),
    },
  });
  return data;
}

function sha256OfFile(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(p);
    s.on('error', reject);
    s.on('data', (b) => h.update(b));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

async function ensureFile(gameDir, entry, progress) {
  const dest = path.join(gameDir, entry.path);
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });

  if (fs.existsSync(dest)) {
    if (entry.once) return { downloaded: false };
    const localHash = await sha256OfFile(dest);
    if (localHash.toLowerCase() === entry.sha256.toLowerCase()) {
      return { downloaded: false };
    }
  }

  // Chemins avec espaces, apostrophes ou « + » (ex. "L_Ender's Cataclysm…") : on encode chaque segment
  const url = config.FILES_BASE_URL + entry.path.split('/').map(encodeURIComponent).join('/');
  const res = await axios.get(url, {
    responseType: 'stream',
    timeout: 60000,
    // Identity encoding : raw.githubusercontent.com sert en gzip par defaut,
    // axios decompresse mal le stream + le hash SHA-256 doit etre calcule
    // sur les bytes IDENTIQUES a ceux du manifest. On force pas de compression.
    decompress: false,
    headers: {
      'Accept-Encoding': 'identity',
      ...config.clientHttpHeaders(),
    },
    onDownloadProgress: (pe) => {
      if (progress) progress({ file: entry.path, loaded: pe.loaded, total: entry.size });
    },
  });
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(dest);
    res.data.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
  });

  const dlHash = await sha256OfFile(dest);
  if (dlHash.toLowerCase() !== entry.sha256.toLowerCase()) {
    fs.unlinkSync(dest);
    throw new Error(`Hash mismatch pour ${entry.path}`);
  }
  return { downloaded: true };
}

function cleanStaleFiles(gameDir, manifest) {
  const wanted = new Set(manifest.files.map((f) => f.path.replace(/\\/g, '/')));
  for (const dir of manifest.managedDirs || []) {
    const root = path.join(gameDir, dir);
    if (!fs.existsSync(root)) continue;
    // Seuls les fichiers posés directement dans le dossier géré sont nettoyés.
    // Les sous-dossiers appartiennent aux mods (ex. mods/mcef-libraries : Chromium
    // extrait par MCEF, ~220 Mo) : les vider forçait une réextraction à chaque
    // lancement et faisait planter le jeu si un ancien jcef_helper.exe les verrouillait.
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const rel = path.posix.join(dir.replace(/\\/g, '/'), entry.name);
      if (!wanted.has(rel)) {
        try { fs.unlinkSync(path.join(root, entry.name)); } catch (_) {}
      }
    }
  }
}

async function syncAll(gameDir, onProgress) {
  onProgress && onProgress({ step: 'fetching-manifest' });
  const manifest = await fetchManifest();

  await fs.promises.mkdir(gameDir, { recursive: true });

  const total = manifest.files.length;
  let downloaded = 0;
  for (let i = 0; i < total; i++) {
    const entry = manifest.files[i];
    onProgress && onProgress({
      step: 'syncing-files',
      current: i + 1,
      total,
      file: entry.path,
    });
    const r = await ensureFile(gameDir, entry, () => {});
    if (r.downloaded) downloaded++;
  }

  onProgress && onProgress({ step: 'cleaning-stale' });
  cleanStaleFiles(gameDir, manifest);

  onProgress && onProgress({ step: 'done', downloaded, total });
  return manifest;
}

module.exports = { syncAll, fetchManifest };
