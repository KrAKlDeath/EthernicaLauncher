'use strict';

const path = require('path');
const fs = require('fs');

/**
 * MCEF (navigateur Chromium de l'interface Ethernia) télécharge ~220 Mo dans
 * mods/mcef-libraries au premier lancement. Si ce téléchargement ou l'extraction
 * est interrompu (jeu fermé, mise à jour du launcher…), MCEF garde son fichier
 * .sha256, croit que tout est prêt et plante ensuite sur une DLL absente
 * (d3dcompiler_47.dll). On détecte ces états cassés avant chaque lancement et on
 * efface le dossier : MCEF refait alors un téléchargement complet et propre.
 */
const PLATFORM = 'windows_amd64';
const REQUIRED = ['libcef.dll', 'd3dcompiler_47.dll', 'chrome_elf.dll', 'jcef_helper.exe', 'icudtl.dat'];

function mcefState(minecraftDir) {
  const root = path.join(minecraftDir, 'mods', 'mcef-libraries');
  if (!fs.existsSync(root)) return { root, broken: false, reason: 'absent' };
  const extracted = path.join(root, PLATFORM);
  // L'archive est supprimée par MCEF après une extraction réussie : si elle est
  // encore là, le téléchargement ou l'extraction n'est pas allé au bout.
  if (fs.existsSync(path.join(root, `${PLATFORM}.tar.gz`))) {
    return { root, broken: true, reason: 'archive restante (téléchargement interrompu)' };
  }
  if (!fs.existsSync(extracted)) {
    return { root, broken: true, reason: 'bibliothèques non extraites' };
  }
  const missing = REQUIRED.filter((f) => !fs.existsSync(path.join(extracted, f)));
  if (missing.length) return { root, broken: true, reason: 'fichiers manquants : ' + missing.join(', ') };
  return { root, broken: false, reason: 'ok' };
}

/** Efface mods/mcef-libraries s'il est dans un état cassé. Renvoie la raison, ou null. */
function repairMcef(minecraftDir) {
  const s = mcefState(minecraftDir);
  if (!s.broken) return null;
  try {
    fs.rmSync(s.root, { recursive: true, force: true });
  } catch (e) {
    // Un jcef_helper.exe orphelin peut verrouiller des fichiers : on retire au
    // moins le .sha256 pour forcer MCEF à tout retélécharger.
    try { fs.rmSync(path.join(s.root, `${PLATFORM}.tar.gz.sha256`), { force: true }); } catch (_) {}
  }
  return s.reason;
}

module.exports = { mcefState, repairMcef };
