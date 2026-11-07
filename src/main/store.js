'use strict';

const Store = require('electron-store');
const config = require('./config');

/**
 * Stockage persistant des préférences utilisateur + token MS chiffré.
 * Fichier dans %APPDATA%/Ethernia Launcher/config.json
 */
/**
 * encryptionKey active AES-256-CBC sur le fichier config.json.
 * Les tokens Microsoft/Minecraft stockes deviennent illisibles a l'oeil nu
 * et resistent au grep des malwares basiques cherchant des patterns connus.
 * La cle est dans le binaire donc pas une protection contre un attaquant
 * determine, mais defeat le scan automatise (qui est le risque principal).
 */
const store = new Store({
  name: 'config',
  encryptionKey: 'ethernia-arclight-launcher-aes-2026',
  defaults: {
    gameDir: config.DEFAULT_GAME_DIR,
    ramGb: 6,
    closeOnLaunch: false,
    auth: null, // { profile: { id, name }, mcToken, refresh }
    lastManifestEtag: null,
    extraJvmArgs: '',
  },
  // Si le fichier existant n'est pas dechiffrable (anciens utilisateurs
  // v1.0.x sans chiffrement), on reset au lieu de crash. Ils se re-loguent.
  clearInvalidConfig: true,
});

module.exports = store;
