'use strict';

const { Auth } = require('msmc');
const store = require('./store');

/**
 * Authentification Microsoft (OAuth officiel via msmc).
 * Renvoie un objet minecraft-launcher-core-compatible que launcher.js consomme.
 */

const auth = new Auth('select_account');

async function login() {
  // Ouvre la fenêtre de login MS dans une BrowserWindow Electron native
  const xboxManager = await auth.launch('electron');
  const minecraft = await xboxManager.getMinecraft();

  // On stocke le refresh token pour relogin silencieux la prochaine fois
  const refresh = xboxManager.save();
  const profile = minecraft.profile; // { id, name }

  const session = {
    profile,
    mcToken: minecraft.mcToken,
    refresh,
    savedAt: Date.now(),
  };
  store.set('auth', session);
  return mclcAuthPayload(minecraft);
}

async function refreshSilent() {
  const saved = store.get('auth');
  if (!saved || !saved.refresh) return null;
  try {
    const xboxManager = await auth.refresh(saved.refresh);
    const minecraft = await xboxManager.getMinecraft();
    const session = {
      profile: minecraft.profile,
      mcToken: minecraft.mcToken,
      refresh: xboxManager.save(),
      savedAt: Date.now(),
    };
    store.set('auth', session);
    return mclcAuthPayload(minecraft);
  } catch (e) {
    console.warn('[auth] refresh failed, user must re-login:', e.message);
    store.set('auth', null);
    return null;
  }
}

function logout() {
  store.set('auth', null);
}

function currentProfile() {
  const saved = store.get('auth');
  return saved ? saved.profile : null;
}

/** Format attendu par minecraft-launcher-core en .authorization */
function mclcAuthPayload(minecraft) {
  return {
    access_token: minecraft.mcToken,
    client_token: minecraft.profile.id,
    uuid: minecraft.profile.id,
    name: minecraft.profile.name,
    user_properties: '{}',
    meta: { type: 'msa', demo: false },
  };
}

module.exports = { login, refreshSilent, logout, currentProfile };
