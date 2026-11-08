'use strict';

const $ = (sel) => document.querySelector(sel);
const api = window.ethernia;

let isLaunching = false;
let updateReady = false;
let meta = null;

// ============== INIT ==============
async function init() {
  meta = await api.meta();
  $('#meta-launcher').textContent = meta.version;
  $('#meta-mc').textContent = meta.mcVersion;
  $('#meta-forge').textContent = meta.loaderVersion;
  $('#meta-server').textContent = `${meta.serverHost}:${meta.serverPort}`;
  $('#news-version').textContent = meta.version;
  document.title = `Ethernia Launcher v${meta.version}`;

  await refreshAccount();
  await loadSettings();
  wireSettings();
  wirePlay();
  wireUpdater();
  wireSettingsPanel();
  wireLinks();

  pollServerStatus();
  setInterval(pollServerStatus, 30000);
}

// ============== ACCOUNT (login card) ==============
async function refreshAccount() {
  const { profile } = await api.auth.status();
  const loggedOut = $('#account-logged-out');
  const loggedIn = $('#account-logged-in');
  const title = $('#account-card-title');

  if (profile) {
    loggedOut.classList.add('hidden');
    loggedIn.classList.remove('hidden');
    title.textContent = 'Compte';
    $('#account-name').textContent = profile.name;
    $('#account-avatar').style.backgroundImage =
      `url('https://mc-heads.net/avatar/${encodeURIComponent(profile.id)}/64')`;
  } else {
    loggedOut.classList.remove('hidden');
    loggedIn.classList.add('hidden');
    title.textContent = 'Se connecter';
    $('#account-avatar').style.backgroundImage = '';
  }
}

async function doLogin() {
  const btn = $('#login-btn');
  const originalContent = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>Connexion…</span>';
  try {
    await api.auth.login();
    await refreshAccount();
  } catch (e) {
    btn.innerHTML = originalContent;
    btn.disabled = false;
    setProgress('Échec login : ' + (e.message || e), 0, 'error');
  }
}

// ============== SETTINGS ==============
function updateRangeFill(input) {
  const min = parseFloat(input.min || 0);
  const max = parseFloat(input.max || 100);
  const val = parseFloat(input.value);
  const pct = ((val - min) / (max - min)) * 100;
  input.style.setProperty('--range-fill', pct + '%');
}

async function loadSettings() {
  const s = await api.settings.get();
  const slider = $('#ram-slider');
  slider.value = s.ramGb;
  updateRangeFill(slider);
  $('#ram-value').textContent = s.ramGb + ' Go';
  $('#gamedir-input').value = s.gameDir;
  $('#jvm-input').value = s.extraJvmArgs || '';
  $('#close-on-launch').checked = !!s.closeOnLaunch;
}

function wireSettings() {
  const slider = $('#ram-slider');
  slider.addEventListener('input', (e) => {
    $('#ram-value').textContent = e.target.value + ' Go';
    updateRangeFill(e.target);
  });
  slider.addEventListener('change', (e) =>
    api.settings.set({ ramGb: parseInt(e.target.value, 10) })
  );
  $('#jvm-input').addEventListener('change', (e) =>
    api.settings.set({ extraJvmArgs: e.target.value })
  );
  $('#close-on-launch').addEventListener('change', (e) =>
    api.settings.set({ closeOnLaunch: e.target.checked })
  );
  $('#gamedir-pick').addEventListener('click', async () => {
    const dir = await api.settings.pickGameDir();
    if (dir) $('#gamedir-input').value = dir;
  });
  $('#gamedir-open').addEventListener('click', () => api.shell.openGameDir());
  $('#check-updates').addEventListener('click', () => api.updater.check());
  $('#login-btn').addEventListener('click', doLogin);
  $('#logout-btn').addEventListener('click', async () => {
    await api.auth.logout();
    await refreshAccount();
  });
  $('#profile-btn').addEventListener('click', refreshAccount);
}

// ============== SETTINGS PANEL ==============
function wireSettingsPanel() {
  const panel = $('#settings-panel');
  const backdrop = $('#settings-backdrop');
  const open = () => { panel.classList.add('open'); backdrop.classList.add('open'); };
  const close = () => { panel.classList.remove('open'); backdrop.classList.remove('open'); };
  $('#open-settings').addEventListener('click', open);
  $('#close-settings').addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) close();
  });
}

// ============== LINKS (footer + news) ==============
function wireLinks() {
  document.querySelectorAll('.bottom-links a').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      // TODO: brancher sur de vraies URLs quand tu auras un site / Discord
      const link = a.dataset.link;
      const urls = {
        support: 'https://github.com/KrAKlDeath/EthernicaLauncher/issues',
        boutique: 'https://github.com/KrAKlDeath/EthernicaLauncher',
        site:     'https://github.com/KrAKlDeath/EthernicaLauncher',
      };
      if (urls[link]) api.shell.openExternal(urls[link]);
    });
  });
  $('#news-more').addEventListener('click', () => {
    api.shell.openExternal(`https://github.com/KrAKlDeath/EthernicaLauncher/releases/tag/v${meta.version}`);
  });
  $('#notif-btn').addEventListener('click', () => api.updater.check());
}

// ============== PLAY ==============
function wirePlay() {
  $('#btn-play').addEventListener('click', async () => {
    if (isLaunching) return;
    const { profile } = await api.auth.status();
    if (!profile) {
      setProgress("Connecte-toi d'abord à ton compte Microsoft", 0, 'warn');
      doLogin();
      return;
    }
    isLaunching = true;
    setButton(true);
    showProgress(true);
    setProgress('Préparation…', 2);

    const r = await api.launch.play();
    if (!r.ok) {
      setProgress('Erreur : ' + (r.reason || 'inconnue'), 0, 'error');
      setButton(false);
      isLaunching = false;
      setTimeout(() => showProgress(false), 4000);
    }
  });

  api.launch.onProgress((p) => {
    const label = stepLabel(p.step);
    let pct = 0;
    let sub = '';
    if (p.current && p.total) {
      pct = (p.current / p.total) * 100;
      sub = p.file ? p.file : `${p.current}/${p.total}`;
    } else if (p.step === 'launching') {
      pct = 100;
    }
    setProgress(label, pct);
    $('#progress-sub').textContent = sub;
  });

  api.launch.onClosed((data) => {
    isLaunching = false;
    setButton(false);
    setProgress(`Minecraft fermé (code ${data.code})`, 0);
    setTimeout(() => showProgress(false), 3000);
  });
}

function stepLabel(step) {
  switch (step) {
    case 'fetching-manifest':       return 'Vérification du manifeste';
    case 'syncing-files':           return 'Synchronisation des fichiers';
    case 'cleaning-stale':          return 'Nettoyage';
    case 'downloading-java':        return 'Téléchargement de Java 21';
    case 'extracting-java':         return 'Extraction de Java';
    case 'downloading-neoforge-installer': return 'Téléchargement de NeoForge';
    case 'installing-neoforge':     return 'Installation de NeoForge (première fois, ~1 min)';
    case 'mc-assets':               return 'Téléchargement des assets';
    case 'mc-classes':              return 'Téléchargement des bibliothèques';
    case 'mc-classes-custom':       return 'Bibliothèques NeoForge';
    case 'mc-natives':              return 'Extraction des natives';
    case 'applying-defaults':       return 'Activation du resourcepack et des shaders';
    case 'launching':               return 'Lancement du jeu';
    case 'done':                    return 'Synchronisation terminée';
    default:                        return step.replace(/-/g, ' ');
  }
}

function showProgress(show) {
  $('#progress-overlay').classList.toggle('hidden', !show);
}
function setProgress(label, pct, kind) {
  $('#progress-label').textContent = label;
  $('#progress-pct').textContent = Math.round(Math.max(0, Math.min(100, pct))) + '%';
  $('#progress-fill').style.width = Math.max(0, Math.min(100, pct)) + '%';
  const lbl = $('#progress-label');
  lbl.style.color =
    kind === 'error' ? 'var(--offline)' :
    kind === 'warn'  ? 'var(--warning)' :
                       'var(--cream)';
}
function setButton(launching) {
  const b = $('#btn-play');
  b.disabled = launching;
  b.querySelector('.btn-play-text').textContent = launching ? 'EN COURS' : 'JOUER';
}

// ============== UPDATER ==============
function wireUpdater() {
  api.updater.onEvent((d) => {
    const banner = $('#updater-banner');
    const text = $('#updater-text');
    const notifBadge = $('#notif-count');
    switch (d.step) {
      case 'available':
        banner.classList.remove('hidden');
        notifBadge.classList.remove('hidden');
        text.textContent = `Mise à jour ${d.version} en cours de téléchargement…`;
        break;
      case 'downloading':
        banner.classList.remove('hidden');
        text.textContent = `Téléchargement mise à jour : ${Math.round(d.percent || 0)}%`;
        break;
      case 'ready':
        banner.classList.remove('hidden');
        notifBadge.classList.remove('hidden');
        text.textContent = `Mise à jour ${d.version} prête.`;
        updateReady = true;
        break;
      case 'error':
        banner.classList.remove('hidden');
        text.textContent = 'Erreur de mise à jour.';
        break;
      case 'none':
        banner.classList.add('hidden');
        notifBadge.classList.add('hidden');
        break;
    }
  });
  $('#updater-install').addEventListener('click', () => {
    if (updateReady) api.updater.install();
  });
}

// ============== SERVER STATUS ==============
async function pollServerStatus() {
  if (!api.server || !api.server.status) {
    // Le main process n'expose pas encore le ping — placeholder visuel
    setServerStatus(null, null);
    return;
  }
  try {
    const r = await api.server.status();
    setServerStatus(r.online, r.players);
  } catch (_) {
    setServerStatus(false, 0);
  }
}

function setServerStatus(online, players) {
  const dot = $('#status-dot');
  const text = $('#status-text');
  const count = $('#status-count');
  dot.classList.remove('online', 'offline');
  if (online === null) {
    text.textContent = 'Inconnu';
    count.textContent = '—';
  } else if (online) {
    dot.classList.add('online');
    text.textContent = 'En ligne';
    count.textContent = players != null ? players.toString() : '—';
  } else {
    dot.classList.add('offline');
    text.textContent = 'Hors ligne';
    count.textContent = '0';
  }
}

init().catch((e) => {
  console.error(e);
  setProgress("Erreur d'initialisation : " + e.message, 0, 'error');
  showProgress(true);
});
