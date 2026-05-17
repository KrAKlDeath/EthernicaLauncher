# Bootstrap des 2 repos GitHub : EthernicaLauncher (deja ici) + EthernicaClient (mods).
#
# Usage :
#   .\server\init-repos.ps1 -GhUser TonPseudoGitHub
#   .\server\init-repos.ps1 -GhUser TonPseudoGitHub -ClientRepoPrivate

param(
    [Parameter(Mandatory=$true)][string]$GhUser,
    [string]$LauncherRepo = "EthernicaLauncher",
    [string]$ClientRepo = "EthernicaClient",
    [switch]$ClientRepoPrivate,
    [string]$ServerModsDir = "$HOME\your-project\Serveur Ethernia Arclight 1.20.1\mods"
)

# On NE PAS utiliser ErrorActionPreference=Stop : les natifs (gh, git) retournent
# souvent un exit code non-zero comme info legitime (ex: repo n'existe pas).
$ErrorActionPreference = "Continue"

# Assure gh dans le PATH meme si la session n'a pas ete relancee
$env:Path = "$env:Path;$env:ProgramFiles\GitHub CLI"

function Need-Cmd($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Host "Commande introuvable : $name. Installe-la avant de continuer." -ForegroundColor Red
        exit 1
    }
}
Need-Cmd git
Need-Cmd gh

# === Verifie auth GitHub ===
Write-Host "==> Verification authentification GitHub CLI..." -ForegroundColor Cyan
$null = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Tu n'es pas connecte. Lance d'abord : gh auth login" -ForegroundColor Yellow
    exit 1
}

# === Configure identite git si jamais utilise ===
$gitName = git config --global user.name 2>$null
$gitEmail = git config --global user.email 2>$null
if (-not $gitName -or -not $gitEmail) {
    Write-Host "==> Configuration identite git (depuis ton profil GitHub)..." -ForegroundColor Cyan
    if (-not $gitName) {
        $ghName = gh api user --jq ".name // .login" 2>$null
        if (-not $ghName) { $ghName = $GhUser }
        git config --global user.name $ghName
        Write-Host "    user.name = $ghName"
    }
    if (-not $gitEmail) {
        $ghEmail = gh api user --jq ".email" 2>$null
        if (-not $ghEmail -or $ghEmail -eq "null") {
            # Email prive sur GitHub : on utilise le format noreply
            $ghId = gh api user --jq ".id" 2>$null
            $ghEmail = "$ghId+$GhUser@users.noreply.github.com"
        }
        git config --global user.email $ghEmail
        Write-Host "    user.email = $ghEmail"
    }
}

function Test-RepoExists($fullname) {
    $null = gh repo view $fullname --json name 2>$null
    return ($LASTEXITCODE -eq 0)
}

# ====== Repo 1 : EthernicaLauncher ======
$launcherRoot = (Resolve-Path "$PSScriptRoot\..\").Path
Write-Host "==> Init repo $LauncherRepo dans $launcherRoot" -ForegroundColor Cyan
Push-Location $launcherRoot
try {
    if (-not (Test-Path ".git")) {
        git init -b main | Out-Null
        Write-Host "    git init OK"
    }
    git add -A 2>$null
    git diff --cached --quiet 2>$null
    if ($LASTEXITCODE -ne 0) {
        git commit -m "initial launcher" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Host "    commit initial OK" }
        else { Write-Host "    !! commit a echoue" -ForegroundColor Red; exit 1 }
    }
    if (-not (Test-RepoExists "$GhUser/$LauncherRepo")) {
        Write-Host "    creating $LauncherRepo (public)..."
        gh repo create "$GhUser/$LauncherRepo" --public --source=. --remote=origin --push
        if ($LASTEXITCODE -ne 0) { Write-Host "    !! gh repo create a echoue" -ForegroundColor Red; exit 1 }
        Write-Host "    repo cree + push OK"
    } else {
        Write-Host "    repo existe deja"
        $remotes = git remote 2>$null
        if (-not ($remotes -match "^origin$")) {
            git remote add origin "https://github.com/$GhUser/$LauncherRepo.git"
        }
        git push -u origin main 2>$null
    }
} finally { Pop-Location }

# ====== Repo 2 : EthernicaClient ======
$clientRoot = Join-Path (Split-Path $launcherRoot -Parent) $ClientRepo
Write-Host "==> Init repo $ClientRepo dans $clientRoot" -ForegroundColor Cyan
if (-not (Test-Path $clientRoot)) { New-Item -ItemType Directory -Path $clientRoot | Out-Null }
Push-Location $clientRoot
try {
    foreach ($d in @("mods", "config", "resourcepacks")) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
    if (-not (Test-Path ".gitignore")) {
        Set-Content ".gitignore" -Encoding utf8 -Value @"
*.log
.DS_Store
Thumbs.db
"@
    }
    if (-not (Test-Path "README.md")) {
        $readme = @'
# EthernicaClient

Mods et fichiers client du serveur Ethernia. Synchronise par le launcher.

## Mettre a jour les mods

    # Copie tes nouveaux .jar dans mods/
    python3 generate-manifest.py
    git add . ; git commit -m "update mods" ; git push
'@
        Set-Content "README.md" -Value $readme -Encoding utf8
    }
    Copy-Item "$launcherRoot\server\generate-manifest.py" "generate-manifest.py" -Force

    if (Test-Path $ServerModsDir) {
        Write-Host "    copie mods depuis $ServerModsDir..."
        Copy-Item "$ServerModsDir\*.jar" "mods\" -Force -ErrorAction SilentlyContinue
        $modCount = (Get-ChildItem "mods\*.jar" -ErrorAction SilentlyContinue).Count
        Write-Host "    $modCount mods copies"
    } else {
        Write-Host "    !! Dossier mods serveur introuvable : $ServerModsDir" -ForegroundColor Yellow
    }

    Write-Host "    Generation manifest.json..."
    $py = Get-Command python -ErrorAction SilentlyContinue
    if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
    if ($py) {
        & $py.Source generate-manifest.py
    } else {
        Set-Content "manifest.json" -Encoding utf8 -Value '{"version": 0, "files": [], "managedDirs": ["mods","config","resourcepacks"]}'
        Write-Host "    !! python introuvable - manifest vide pour l'instant" -ForegroundColor Yellow
    }

    if (-not (Test-Path ".git")) { git init -b main | Out-Null }
    git add -A 2>$null
    git diff --cached --quiet 2>$null
    if ($LASTEXITCODE -ne 0) {
        git commit -m "initial client files" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Host "    !! commit a echoue" -ForegroundColor Red; exit 1 }
    }

    if (-not (Test-RepoExists "$GhUser/$ClientRepo")) {
        $visibility = if ($ClientRepoPrivate) { "--private" } else { "--public" }
        Write-Host "    creating $ClientRepo ($visibility)..."
        gh repo create "$GhUser/$ClientRepo" $visibility --source=. --remote=origin --push
        if ($LASTEXITCODE -ne 0) { Write-Host "    !! gh repo create a echoue" -ForegroundColor Red; exit 1 }
        Write-Host "    repo cree + push OK"
    } else {
        Write-Host "    repo existe deja - push"
        $remotes = git remote 2>$null
        if (-not ($remotes -match "^origin$")) {
            git remote add origin "https://github.com/$GhUser/$ClientRepo.git"
        }
        git push -u origin main
    }
} finally { Pop-Location }

Write-Host ""
Write-Host "==> Tout est pret." -ForegroundColor Green
Write-Host "    1. Edite launcher.config.json -> server.host = ton IP ou playit.gg"
if ($ClientRepoPrivate) {
    Write-Host "    2. Genere un PAT (scope 'repo' read-only) -> launcher.config.json -> github.token"
}
Write-Host "    3. cd $launcherRoot ; npm install ; npm run dev (test local)"
Write-Host "    4. .\server\publish.ps1 quand pret a distribuer"
