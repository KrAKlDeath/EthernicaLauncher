# Bienvenue — Setup du launcher Ethernia

Tout est pré-configuré. Tu n'as que **5 étapes** à faire, dans l'ordre.

---

## 1. Pré-requis (à installer une seule fois)

Installe ces 3 outils si tu ne les as pas. PowerShell admin :

```powershell
winget install GitHub.cli         # CLI GitHub (gh)
winget install Git.Git            # Git
winget install OpenJS.NodeJS.LTS  # Node.js 20+
# Python est utile mais optionnel — si pas installé, init-repos.ps1 t'avertit
```

Puis connecte-toi à GitHub (ouvre un navigateur, login) :

```powershell
gh auth login
```
→ choisis "GitHub.com", "HTTPS", "Login with a web browser", suis l'écran.

---

## 2. Créer les 2 repos GitHub automatiquement

Depuis le dossier `EthernicaLauncher` :

```powershell
.\server\init-repos.ps1 -GhUser TonPseudoGitHub
```

Si ton repo doit être **privé** (recommandé, parce que tu héberges des mods Premium MythicMobs/MMOCore) :

```powershell
.\server\init-repos.ps1 -GhUser TonPseudoGitHub -ClientRepoPrivate
```

Ce script :
- Crée le repo `EthernicaLauncher` (code source du launcher)
- Crée le repo `EthernicaClient` (mods + manifest pour sync joueurs)
- Copie le pack client `Desktop\Ethernia\client-pack` vers le repo client (`.\server\sync-mods.ps1`)
- Génère `manifest.json` et push tout sur GitHub

---

## 3. Personnaliser `launcher.config.json`

Ouvre le fichier `launcher.config.json` à la racine. Tu modifies **4 lignes** :

```json
{
  "github": {
    "owner": "TonPseudoGitHub",        ← ton pseudo
    "repoClient": "EthernicaClient",
    "token": ""                        ← UNIQUEMENT si repo privé (voir étape 3.b)
  },
  "server": {
    "host": "MON_IP_OU_PLAYIT",         ← voir étape 4
    "port": 25565
  }
}
```

Et dans `electron-builder.yml`, change aussi `owner: TON_PSEUDO_GITHUB` ligne `publish:`.

### 3.b — Token GitHub (uniquement si repo privé)

Va sur https://github.com/settings/tokens?type=beta
- **Fine-grained PAT**, expiration 1 an
- "Only select repositories" → `EthernicaClient`
- Permissions : Contents → **Read-only**
- Crée → copie le `github_pat_...` → colle-le dans `launcher.config.json` → `github.token`

---

## 4. Configurer l'accès au serveur MC pour tes amis

Ton serveur MC tourne sur ton PC. Tes amis doivent pouvoir le joindre.
**Choisis une des 2 options :**

### Option Easy — playit.gg (recommandé pour démarrer)

1. Crée un compte sur https://playit.gg
2. Télécharge l'app Windows → install → connexion
3. Dans le dashboard playit, "Add Tunnel" → Minecraft Java → port local 25565
4. Tu obtiens un URL du style `joinmc.la-grenouille.gl.joinmc.link`
5. Mets cet URL dans `launcher.config.json` → `server.host`
6. Mets le port donné par playit dans `server.port` (souvent pas 25565)

### Option Pro — Port forward routeur

1. Va dans l'admin de ton routeur (souvent http://192.168.1.1)
2. Section "Port forwarding" → ajoute règle : port externe **25565** → IP locale de ton PC, port **25565**, TCP
3. Trouve ton IP publique sur https://api.ipify.org
4. Mets cette IP dans `launcher.config.json` → `server.host`
5. Garde `server.port: 25565`

**Note** : avec une IP résidentielle dynamique, elle change tous les X jours et tu devras republier le launcher. Utilise un DDNS gratuit (DuckDNS, No-IP) pour avoir un nom stable.

---

## 5. Build + publier le launcher

```powershell
npm install                # une seule fois
.\server\publish.ps1       # build + push GitHub Releases
```

À la fin du script, le **lien à donner à tes amis** s'affiche :

```
https://github.com/TonPseudoGitHub/EthernicaLauncher/releases/latest/download/EthernicaLauncher-Setup-1.0.0.exe
```

Ce lien est **permanent** — `/latest/download/` redirige toujours vers la dernière version. Donc même quand tu mettras à jour, donne toujours le même lien.

---

## Workflow quotidien (après le setup initial)

### Tu veux mettre à jour les mods (les joueurs reçoivent la diff automatiquement) :

```powershell
.\server\sync-mods.ps1
```

Ce script :
- Mets à jour `Desktop\Ethernia\client-pack` puis lance `.\server\sync-mods.ps1` (repo `EthernicaClient`)
- Régénère `manifest.json` (hash SHA-256 par fichier)
- `git commit` + `git push`
- Les joueurs récupèrent la diff au prochain clic **JOUER**

### Tu veux mettre à jour le launcher lui-même (bug fix UI, nouvelle feature) :

1. Bump version dans `package.json` (ex: `"version": "1.0.0"` → `"1.0.1"`)
2. Modifie le code
3. `.\server\publish.ps1`

Les joueurs voient un bandeau "Mise à jour disponible" dès qu'ils ouvrent le launcher → clic → redémarre tout seul.

---

## En cas de problème

- **`gh auth status` dit "not logged in"** → relance `gh auth login`
- **Le script `init-repos.ps1` plante sur "repo exists"** → c'est ok, il fait juste push
- **Au lancement, "ENOENT launcher.config.json"** → vérifie que le fichier est bien à la racine du projet ET que `files:` dans `electron-builder.yml` contient `launcher.config.json`
- **Tes amis ne peuvent pas rejoindre le serveur MC** → teste avec `mcsrvstat.us` sur ton URL/IP+port. Si KO côté Internet, problème de port forward / playit.
- **SmartScreen Windows bloque l'installeur** → normal sans certificat. Dis à tes amis "Plus d'infos" → "Exécuter quand même".
- **`Hash mismatch pour mods/...`** → quelqu'un a modifié le mod entre le manifest et maintenant. Re-run `sync-mods.ps1`.

---

## Et après ?

Quand tu auras un VPS / hébergeur dédié, le passage est super simple :
- Garde le launcher tel quel (zero migration code)
- Change juste `RAW_BASE` dans `config.js` pour pointer vers ton VPS au lieu de `raw.githubusercontent.com`
- Republie une nouvelle version → les joueurs migrent tout seuls

Les liens GitHub restent une option de fallback pour toujours, si tu veux.
