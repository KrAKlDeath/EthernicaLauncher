'use strict';

const $ = (sel) => document.querySelector(sel);
const api = window.ethernia;

let isLaunching = false;
let updateReady = false;

// ============== TABS ==============
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.querySelector(`.panel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
  });
});

// ============== INIT ==============
async function init() {
  const meta = await api.meta();
  $('#meta-launcher').textContent = `v${meta.version}`;
  $('#meta-mc').textContent = meta.mcVersion;
  $('#meta-forge').textContent = meta.forgeVersion;
  $('#server-name').textContent = meta.serverName;
  $('#server-host').textContent = `${meta.serverHost}:${meta.serverPort}`;
  $('#server-version').textContent = `MC ${meta.mcVersion} / Forge ${meta.forgeVersion.split('-')[1]}`;
  document.title = `Ethernia Launcher v${meta.version}`;

  await refreshAccount();
  await loadSettings();
  wireSettings();
  wirePlay();
  wireUpdater();
}

async function refreshAccount() {
  const { profile } = await api.auth.status();
  if (profile) {
    $('#account-name').textContent = profile.name;
    $('#account-action').textContent = 'Déconnexion';
    $('#account-avatar').style.backgroundImage =
      `url('https://mc-heads.net/avatar/${encodeURIComponent(profile.id)}/64')`;
    $('#account-action').onclick = async () => {
      await api.auth.logout();
      refreshAccount();
    };
  } else {
    $('#account-name').textContent = 'Non connecté';
    $('#account-action').textContent = 'Se connecter';
    $('#account-avatar').style.backgroundImage = '';
    $('#account-action').onclick = doLogin;
  }
}

async function doLogin() {
  $('#account-action').textContent = 'Connexion…';
  try {
    await api.auth.login();
    await refreshAccount();
  } catch (e) {
    $('#account-action').textContent = 'Se connecter';
    setStatus('Échec login : ' + (e.message || e), 'error');
  }
}

// ============== SETTINGS ==============
async function loadSettings() {
  const s = await api.settings.get();
  $('#ram-slider').value = s.ramGb;
  $('#ram-value').textContent = s.ramGb + ' Go';
  $('#gamedir-input').value = s.gameDir;
  $('#jvm-input').value = s.extraJvmArgs || '';
  $('#close-on-launch').checked = !!s.closeOnLaunch;
}

function wireSettings() {
  $('#ram-slider').addEventListener('input', (e) => {
    $('#ram-value').textContent = e.target.value + ' Go';
  });
  $('#ram-slider').addEventListener('change', (e) =>
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
  $('#logout-btn').addEventListener('click', async () => {
    await api.auth.logout();
    await refreshAccount();
  });
}

// ============== PLAY ==============
function wirePlay() {
  $('#btn-play').addEventListener('click', async () => {
    if (isLaunching) return;
    const { profile } = await api.auth.status();
    if (!profile) {
      setStatus('Connecte-toi d\'abord à ton compte Microsoft', 'warn');
      doLogin();
      return;
    }
    isLaunching = true;
    setButton(true);
    setStatus('Préparation…', 'info');
    setProgress(2);

    const r = await api.launch.play();
    if (!r.ok) {
      setStatus('Erreur : ' + (r.reason || 'inconnue'), 'error');
      setProgress(0);
      setButton(false);
      isLaunching = false;
    }
  });

  api.launch.onProgress((p) => {
    const label = stepLabel(p.step);
    setStatus(label, 'info');
    if (p.current && p.total) {
      setProgress((p.current / p.total) * 100);
      $('#status-sub').textContent = p.file ? p.file : `${p.current}/${p.total}`;
    } else if (p.step === 'launching') {
      setProgress(100);
      $('#status-sub').textContent = '';
    } else {
      $('#status-sub').textContent = '';
    }
  });

  api.launch.onClosed((data) => {
    isLaunching = false;
    setButton(false);
    setProgress(0);
    setStatus(`Minecraft fermé (code ${data.code})`, 'info');
  });
}

function stepLabel(step) {
  switch (step) {
    case 'fetching-manifest':       return 'Vérification du manifeste serveur…';
    case 'syncing-files':           return 'Synchronisation des fichiers…';
    case 'cleaning-stale':          return 'Nettoyage des anciens fichiers…';
    case 'downloading-java':        return 'Téléchargement de Java 21…';
    case 'extracting-java':         return 'Extraction de Java 21…';
    case 'downloading-forge-installer': return 'Téléchargement de Forge…';
    case 'mc-assets':               return 'Téléchargement des assets Minecraft…';
    case 'mc-classes':              return 'Téléchargement des classes Forge…';
    case 'mc-natives':              return 'Extraction des natives…';
    case 'launching':               return 'Lancement du jeu…';
    case 'done':                    return 'Synchronisation terminée';
    default:                        return step.replace(/-/g, ' ');
  }
}

function setStatus(text, kind) {
  const el = $('#status-label');
  el.textContent = text;
  el.style.color =
    kind === 'error' ? 'var(--danger)' :
    kind === 'warn'  ? 'var(--gold-light)' :
                       'var(--text-0)';
}

function setProgress(pct) {
  $('#progress-fill').style.width = Math.max(0, Math.min(100, pct)) + '%';
}

function setButton(launching) {
  const b = $('#btn-play');
  b.disabled = launching;
  b.querySelector('.btn-play-text').textContent = launching ? 'EN COURS…' : 'JOUER';
}

// ============== UPDATER ==============
function wireUpdater() {
  api.updater.onEvent((d) => {
    const banner = $('#updater-banner');
    const text = $('#updater-text');
    switch (d.step) {
      case 'available':
        banner.classList.remove('hidden');
        text.textContent = `Mise à jour ${d.version} disponible — téléchargement…`;
        break;
      case 'downloading':
        banner.classList.remove('hidden');
        text.textContent = `Téléchargement mise à jour : ${Math.round(d.percent || 0)}%`;
        break;
      case 'ready':
        banner.classList.remove('hidden');
        text.textContent = `Mise à jour ${d.version} prête. Redémarre pour appliquer.`;
        updateReady = true;
        break;
      case 'error':
        banner.classList.remove('hidden');
        text.textContent = 'Erreur de mise à jour — réessaie plus tard.';
        break;
      case 'none':
        banner.classList.add('hidden');
        break;
    }
  });

  $('#updater-install').addEventListener('click', () => {
    if (updateReady) api.updater.install();
  });
}

init().catch((e) => {
  console.error(e);
  setStatus('Erreur d\'initialisation : ' + e.message, 'error');
});
