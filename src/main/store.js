'use strict';

const Store = require('electron-store');
const config = require('./config');

/**
 * Stockage persistant des préférences utilisateur + token MS chiffré.
 * Fichier dans %APPDATA%/Ethernia Launcher/config.json
 */
const store = new Store({
  name: 'config',
  defaults: {
    gameDir: config.DEFAULT_GAME_DIR,
    ramGb: 6,
    closeOnLaunch: false,
    auth: null, // { profile: { id, name }, mcToken, refresh }
    lastManifestEtag: null,
    extraJvmArgs: '',
  },
});

module.exports = store;
