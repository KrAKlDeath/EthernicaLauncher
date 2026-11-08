'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const config = require('./config');

/**
 * Installe NeoForge dans gameDir/.minecraft avec l'installeur officiel
 * (`--installClient`, sans interface), puis prépare les arguments Java
 * qu'il déclare dans son profil de version.
 *
 * minecraft-launcher-core ne sait lancer que l'ancien Forge (via ForgeWrapper)
 * et ignore la section `arguments.jvm` des profils modernes, indispensable à
 * NeoForge 1.21 (module path, --add-opens…). On installe donc NeoForge
 * nous-mêmes et on lui passe le profil comme version « custom ».
 */

function versionJsonPath(minecraftDir) {
  return path.join(minecraftDir, 'versions', config.NEOFORGE_ID, `${config.NEOFORGE_ID}.json`);
}

/** Fichier produit par les « processors » de l'installeur : s'il manque, l'installation est incomplète. */
function clientJarPath(minecraftDir) {
  const v = config.NEOFORGE_VERSION;
  return path.join(minecraftDir, 'libraries', 'net', 'neoforged', 'neoforge', v, `neoforge-${v}-client.jar`);
}

function isInstalled(minecraftDir) {
  return fs.existsSync(versionJsonPath(minecraftDir)) && fs.existsSync(clientJarPath(minecraftDir));
}

async function download(url, dest) {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  const res = await axios.get(url, { responseType: 'stream', timeout: 120000, maxRedirects: 10 });
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(tmp);
    res.data.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
    res.data.on('error', reject);
  });
  await fs.promises.rename(tmp, dest);
}

/** java.exe (console) plutôt que javaw.exe : on veut lire la sortie de l'installeur. */
function consoleJava(javaBin) {
  const alt = path.join(path.dirname(javaBin), process.platform === 'win32' ? 'java.exe' : 'java');
  return fs.existsSync(alt) ? alt : javaBin;
}

function runInstaller(javaBin, installer, minecraftDir, onProgress) {
  return new Promise((resolve, reject) => {
    const proc = spawn(consoleJava(javaBin), ['-jar', installer, '--installClient', minecraftDir], {
      cwd: path.dirname(installer),
      windowsHide: true,
    });
    let tail = '';
    const onData = (b) => {
      const text = b.toString('utf8');
      tail = (tail + text).slice(-4000);
      process.stdout.write(`[neoforge] ${text}`);
      const line = text.trim().split(/\r?\n/).pop();
      if (line && onProgress) onProgress({ step: 'installing-neoforge', file: line.slice(0, 120) });
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Installation de NeoForge échouée (code ${code}) : ${tail.split(/\r?\n/).slice(-5).join(' | ')}`));
    });
  });
}

/**
 * Installe NeoForge si nécessaire. Retourne l'id de version à lancer (ex. "neoforge-21.1.228").
 */
async function ensureNeoForge(gameDir, javaBin, onProgress) {
  const minecraftDir = path.join(gameDir, '.minecraft');
  await fs.promises.mkdir(minecraftDir, { recursive: true });
  if (isInstalled(minecraftDir)) return config.NEOFORGE_ID;

  const installer = path.join(gameDir, 'cache', `neoforge-${config.NEOFORGE_VERSION}-installer.jar`);
  if (!fs.existsSync(installer) || fs.statSync(installer).size === 0) {
    onProgress && onProgress({ step: 'downloading-neoforge-installer' });
    await download(config.NEOFORGE_INSTALLER_URL, installer);
  }

  // L'installeur refuse un dossier sans profil de launcher Mojang : on en crée un minimal.
  const profiles = path.join(minecraftDir, 'launcher_profiles.json');
  if (!fs.existsSync(profiles)) {
    fs.writeFileSync(profiles, JSON.stringify({ profiles: {}, settings: {}, version: 3 }, null, 2));
  }

  onProgress && onProgress({ step: 'installing-neoforge' });
  await runInstaller(javaBin, installer, minecraftDir, onProgress);
  if (!isInstalled(minecraftDir)) {
    throw new Error('Installation de NeoForge incomplète (profil ou client introuvable).');
  }
  return config.NEOFORGE_ID;
}

/**
 * Arguments Java déclarés par le profil NeoForge (module path, --add-opens, etc.),
 * avec les variables remplacées. Seules les chaînes simples sont gardées
 * (les entrées à règles concernent d'autres systèmes que Windows/Linux x64).
 */
function jvmArgs(minecraftDir, versionId) {
  const json = JSON.parse(fs.readFileSync(versionJsonPath(minecraftDir), 'utf8'));
  const raw = (json.arguments && json.arguments.jvm) || [];
  const libDir = path.resolve(minecraftDir, 'libraries');
  const sep = process.platform === 'win32' ? ';' : ':';
  return raw
    .filter((a) => typeof a === 'string')
    .map((a) => a
      .split('${library_directory}').join(libDir)
      .split('${classpath_separator}').join(sep)
      .split('${version_name}').join(versionId));
}

module.exports = { ensureNeoForge, jvmArgs, isInstalled, versionJsonPath };
