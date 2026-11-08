# Ethernia Launcher

Launcher Windows custom pour le serveur **Ethernia (NeoForge 1.21.1)**.

- UI restreinte (onglets **Jouer** + **Paramètres**)
- Auth Microsoft officielle (OAuth)
- Auto-update via **GitHub Releases** (zéro infra)
- Sync mods/configs depuis un repo GitHub (raw URL ou Releases)
- Téléchargement auto Java 21 et installation de NeoForge 21.1.228 (installeur officiel, sans fenêtre)
- Serveur Ethernia pré-ajouté à la liste multijoueur

> **Tu démarres ?** Lis [BIENVENUE.md](BIENVENUE.md), c'est le pas-à-pas en 5 étapes.

---

## Architecture

```
[GitHub]                              [Joueur]
EthernicaLauncher/releases  ───────► Launcher .exe
   ├ EthernicaLauncher-Setup-X.Y.Z.exe   (auto-update via electron-updater)
   ├ latest.yml
   └ .blockmap

EthernicaClient/                     Launcher au démarrage :
  ├ manifest.json           ───────► 1. fetch manifest.json
  ├ mods/*.jar              ───────► 2. diff hash SHA-256 par fichier
  ├ config/                          3. DL ce qui manque, supprime obsolète
  ├ shaderpacks/                     4. install Java 21 + NeoForge, launch MC
  └ config/, options.txt (1er lancement seulement)

[Ton PC / VPS futur]
Serveur Minecraft (NeoForge)  ◄──── Joueur via servers.dat pré-rempli
```

**Aucun serveur HTTP à gérer.** Tout passe par 2 repos GitHub (gratuit, illimité, CDN mondial).

---

## Stack technique

| Composant | Rôle |
|-----------|------|
| Electron 31 | UI HTML/CSS/JS |
| electron-builder | Build de l'installeur NSIS Windows |
| electron-updater | Auto-update via GitHub Releases |
| msmc | OAuth Microsoft → token Minecraft |
| minecraft-launcher-core | Téléchargement + lancement de MC (profil NeoForge en version « custom ») |
| `neoforge.js` | Installeur NeoForge `--installClient` + arguments Java du profil (module path…) que MCLC ignore |
| axios, extract-zip | DL / unzip Java |

---

## Personnalisation

**SEUL FICHIER À ÉDITER :** [`launcher.config.json`](launcher.config.json)

```json
{
  "github": {
    "owner": "TonPseudo",
    "repoClient": "EthernicaClient",
    "token": ""
  },
  "server": {
    "host": "1.2.3.4-ou-playit.gg",
    "port": 25565
  }
}
```

Plus une ligne dans `electron-builder.yml` (section `publish.owner`).

### Visuels

- `build/icon.ico` — icône Windows 256x256 (remplace le placeholder `.txt`)
- `src/renderer/assets/bg.jpg` — image hero de l'onglet Jouer (1600x500+ recommandé)
- Palette : `:root` dans [`src/renderer/styles.css`](src/renderer/styles.css) — garde la cohérence avec le HUD in-game (gold + magic-cyan)

---

## Scripts

| Script | Rôle |
|--------|------|
| `server/init-repos.ps1` | Crée les 2 repos GitHub + sync initiale des mods (une seule fois) |
| `server/sync-mods.ps1` | Copie `Desktop\Ethernia\client-pack` dans le repo client, régénère le manifeste, push (`-NoPush` pour tester) |
| `server/publish.ps1` | Build + publish nouvelle version launcher sur GitHub Releases |
| `server/generate-manifest.py` | Régénère `manifest.json` avec les hashs (appelé par sync-mods.ps1) |

---

## Workflow

### Premier setup
Voir [BIENVENUE.md](BIENVENUE.md) — 5 étapes, ~30 min.

### Mettre à jour les mods
Mets le pack à jour dans `Desktop\Ethernia\client-pack` (mods, shaderpacks, config, `options-ethernia.txt`), puis :
```powershell
git clone https://github.com/KrAKlDeath/EthernicaClient ..\client-repo   # une seule fois
.\server\sync-mods.ps1
```
Les joueurs récupèrent la diff au prochain clic JOUER. Seul `mods/` est « géré » (un mod retiré du pack
est supprimé chez les joueurs) ; `config/` et `options.txt` ne sont fournis qu'au premier lancement.

### Mettre à jour le launcher
1. Bump version dans `package.json`
2. `.\server\publish.ps1`

Les joueurs voient un bandeau "Mise à jour disponible".

---

## Fichiers livrés au joueur

```
%LOCALAPPDATA%\Programs\Ethernia Launcher\         ← installeur NSIS
%APPDATA%\Ethernia Launcher\config.json            ← electron-store
%APPDATA%\.ethernia\                               ← gameDir par défaut
  ├── .minecraft\
  │   ├── mods\          (sync depuis manifest.json)
  │   ├── config\        (sync)
  │   ├── resourcepacks\ (sync)
  │   ├── saves\         (sauvegardes solo, intacts)
  │   └── servers.dat    (pré-rempli avec ton serveur)
  ├── runtime\java21\    (~80 MB Temurin)
  └── cache\neoforge-*-installer.jar
```

---

## Pièges connus

### "L'installeur Windows est bloqué par SmartScreen"
Normal sans certificat de signature. Workaround utilisateur : "Plus d'infos" → "Exécuter quand même".
Solution propre : cert EV Code Signing (~200 €/an Sectigo) — voir BIENVENUE.md.

### Repo privé : le token est dans le launcher
Quiconque a accès à ton launcher peut extraire le token GitHub (asar n'est pas chiffré). Acceptable pour un serveur entre amis. Si tu rends ça public, **utilise un repo client public** (mais redistribuer des mods Premium = violation de licence).

### Le launcher se ferme tout seul après JOUER
Décoche "Fermer le launcher au démarrage du jeu" dans Paramètres.

### "Hash mismatch" pendant la sync
Un mod a été remplacé entre la génération du manifest et le DL. Relance `sync-mods.ps1` pour régénérer le manifest.

### IP résidentielle qui change
Utilise un DDNS gratuit (DuckDNS, No-IP) ou playit.gg pour avoir un host stable. Ne hardcode pas ton IP dans le launcher.

### Java 21 download bloqué
Si Adoptium est filtré par ton FAI / firewall, héberge le ZIP toi-même dans une release GitHub et change `JAVA_TEMURIN_WIN_X64` dans `src/main/config.js`.

---

## Migrer plus tard vers un VPS dédié

Quand tu auras ton hébergement permanent :

1. Garde le launcher tel quel
2. Dans `src/main/config.js`, change la const `RAW_BASE` pour pointer vers ton VPS :
   ```js
   const RAW_BASE = 'https://updates.ethernia.com/client/';
   ```
3. Republie une version du launcher (`publish.ps1`)
4. Les joueurs migrent automatiquement au prochain démarrage

Aucune action côté joueurs. Aucun risque de casse.

---

## Architecture des fichiers

```
EthernicaLauncher/
├── BIENVENUE.md            ← ⭐ commence ici
├── README.md               ← ce fichier
├── launcher.config.json    ← seul fichier à éditer pour personnaliser
├── package.json
├── electron-builder.yml
├── build/                  ← icon.ico, NSIS hooks
├── server/                 ← scripts PowerShell + Python
│   ├── init-repos.ps1
│   ├── sync-mods.ps1
│   ├── publish.ps1
│   └── generate-manifest.py
└── src/
    ├── main/               ← code Node.js (Electron main process)
    │   ├── main.js         ← entrypoint
    │   ├── config.js       ← lit launcher.config.json
    │   ├── auth.js         ← msmc OAuth Microsoft
    │   ├── manifest.js     ← sync depuis GitHub raw URLs
    │   ├── java.js         ← DL Temurin 21
    │   ├── neoforge.js     ← installe NeoForge + arguments Java du profil
    │   ├── launcher.js     ← MCLC + servers.dat
    │   ├── updater.js      ← electron-updater + GitHub Releases
    │   ├── ipc.js          ← handlers renderer ↔ main
    │   └── store.js        ← electron-store (settings)
    ├── preload/preload.js  ← bridge sécurisé (window.ethernia)
    └── renderer/           ← UI HTML/CSS/JS
        ├── index.html
        ├── styles.css
        ├── app.js
        └── assets/         ← bg.jpg, logos
```

Sécurité : pas d'`nodeIntegration`, pas d'`eval`, CSP stricte, liens externes via `shell.openExternal`.
