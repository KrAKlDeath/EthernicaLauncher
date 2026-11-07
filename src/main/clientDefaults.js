'use strict';

/**
 * Active automatiquement le resourcepack + shaderpack du serveur Ethernia
 * dans options.txt et config/oculus.properties.
 *
 * Strategie "first-run only" : on patche UNIQUEMENT la ligne concernee :
 *   - options.txt -> `resourcePacks:[...]` mis si absent ou vide
 *   - oculus.properties -> `shaderPack=...` mis si absent
 *
 * Les autres preferences utilisateur (FOV, mouse sensitivity, keybinds, etc)
 * sont conservees telles quelles. Si l'utilisateur a deja choisi un pack /
 * desactive les shaders manuellement, on ne touche pas (sauf forceResourcepack).
 */

const fs = require('fs');
const path = require('path');

function listZipFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.zip'));
}

function readFileOr(p, defaultValue) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return defaultValue; }
}

/** Patche une ligne `key:value` ou `key=value` dans le contenu d'un fichier. */
function patchLine(content, key, value, separator) {
  const sep = separator || ':';
  const lineRegex = new RegExp(`^${key}${sep === ':' ? ':' : '='}.*$`, 'm');
  const newLine = `${key}${sep}${value}`;
  if (lineRegex.test(content)) {
    return content.replace(lineRegex, newLine);
  }
  if (content && !content.endsWith('\n')) content += '\n';
  return content + newLine + '\n';
}

/** Verifie si une ligne `key:` existe et a une valeur "active" (pas vide ni []). */
function isLineActive(content, key, separator) {
  const sep = separator || ':';
  const m = new RegExp(`^${key}${sep === ':' ? ':' : '='}(.*)$`, 'm').exec(content);
  if (!m) return false;
  const val = m[1].trim();
  return val.length > 0 && val !== '[]';
}

function applyResourcePack(mcDir) {
  const rpDir = path.join(mcDir, 'resourcepacks');
  const rpFiles = listZipFiles(rpDir);
  if (rpFiles.length === 0) return false;

  const optionsPath = path.join(mcDir, 'options.txt');
  let options = readFileOr(optionsPath, '');

  // Si l'utilisateur a deja un pack actif, on respecte son choix
  if (isLineActive(options, 'resourcePacks')) return false;

  const list = rpFiles.map((f) => `"file/${f}"`).join(',');
  options = patchLine(options, 'resourcePacks', `[${list}]`);
  // Important : si vanilla est dans le pack, il faut aussi mettre incompatibleResourcePacks vide
  if (!isLineActive(options, 'incompatibleResourcePacks')) {
    options = patchLine(options, 'incompatibleResourcePacks', '[]');
  }
  fs.writeFileSync(optionsPath, options);
  console.log(`[defaults] options.txt : resourcePacks active (${rpFiles.length})`);
  return true;
}

function applyShaderPack(mcDir) {
  const spDir = path.join(mcDir, 'shaderpacks');
  const spFiles = listZipFiles(spDir);
  if (spFiles.length === 0) return false;

  // Oculus / Iris stockent leur config dans config/oculus.properties
  // (ou config/iris.properties si Iris mod, mais on est sur Forge donc Oculus)
  const candidates = [
    path.join(mcDir, 'config', 'oculus.properties'),
    path.join(mcDir, 'config', 'iris.properties'),
  ];

  let configPath = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { configPath = c; break; }
  }
  if (!configPath) configPath = candidates[0]; // creation par defaut sur Oculus

  let config = readFileOr(configPath, '');

  // Respecte choix utilisateur si deja set
  if (isLineActive(config, 'shaderPack', '=')) return false;

  const pack = spFiles[0]; // premier shaderpack trouve
  config = patchLine(config, 'shaderPack', pack, '=');
  // Disable l'update message qui spam au boot
  if (!isLineActive(config, 'disableUpdateMessage', '=')) {
    config = patchLine(config, 'disableUpdateMessage', 'true', '=');
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, config);
  console.log(`[defaults] ${path.basename(configPath)} : shaderPack=${pack}`);
  return true;
}

/**
 * Force les keybinds du serveur Ethernia.
 * Lit keybinds.txt (extrait par sync-mods.ps1 depuis le client de reference)
 * et REMPLACE toutes les lignes key_key.* dans options.txt par celles-ci.
 *
 * Conserve les autres prefs (FOV, sensibilite, langue, layout AZERTY/QWERTY
 * via la touche physique, audio, etc).
 *
 * Comportement OVERRIDE a chaque launch : si un joueur change un keybind dans
 * MC, ca repasse au standard du serveur au prochain JOUER. C'est voulu pour
 * garantir l'experience uniforme pendant la phase actuelle du projet.
 */
function applyKeybinds(mcDir) {
  const keybindsPath = path.join(mcDir, 'keybinds.txt');
  if (!fs.existsSync(keybindsPath)) return false;
  const kbRaw = fs.readFileSync(keybindsPath, 'utf8');
  // ^key_ : capture vanilla (key_key.*) ET mods (Oculus key_iris.keybind.*, etc.)
  const kbLines = kbRaw.split(/\r?\n/).filter((l) => /^key_/.test(l));
  if (kbLines.length === 0) return false;

  const optionsPath = path.join(mcDir, 'options.txt');
  let options = readFileOr(optionsPath, '');

  // Vire toutes les lignes de keybind existantes (key_*)
  const kept = options.split(/\r?\n/).filter((l) => !/^key_/.test(l));
  // Recolle les anciennes + nouvelles keybinds
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  const merged = kept.concat(kbLines).join('\n') + '\n';
  fs.writeFileSync(optionsPath, merged);
  console.log(`[defaults] keybinds : ${kbLines.length} bindings appliques`);
  return true;
}

/**
 * Point d'entree : active resourcepack + shader si pas deja choisis,
 * et force les keybinds depuis keybinds.txt.
 * gameDir = le root .ethernia (contient .minecraft/)
 */
function applyClientDefaults(gameDir) {
  const mcDir = path.join(gameDir, '.minecraft');
  if (!fs.existsSync(mcDir)) return { rp: false, sp: false, kb: false };
  try {
    const rp = applyResourcePack(mcDir);
    const sp = applyShaderPack(mcDir);
    // Keybinds applique APRES rp+sp pour que les ecritures de ces dernieres
    // soient bien presentes dans options.txt avant de merger les keybinds.
    const kb = applyKeybinds(mcDir);
    return { rp, sp, kb };
  } catch (e) {
    console.warn('[defaults] error:', e.message);
    return { rp: false, sp: false, kb: false };
  }
}

module.exports = { applyClientDefaults };
