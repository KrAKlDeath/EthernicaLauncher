# Sync les mods du serveur Arclight vers le repo EthernicaClient + push GitHub.
#
# Utilise ça quand tu veux pousser une nouvelle version des mods aux joueurs.
# Aucune action requise côté joueurs : ils récupèrent la diff au prochain JOUER.
#
# Usage :
#   .\server\sync-mods.ps1
#   .\server\sync-mods.ps1 -ClientRepoPath C:\Users\Alexa\your-project\EthernicaClient

param(
    [string]$ServerModsDir = "$HOME\your-project\Serveur Ethernia Arclight 1.20.1\mods",
    [string]$ServerConfigDir = "$HOME\your-project\Serveur Ethernia Arclight 1.20.1\config",
    [string]$ClientRepoPath = "$HOME\your-project\EthernicaClient"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ClientRepoPath)) {
    Write-Error "Repo client introuvable : $ClientRepoPath. Lance init-repos.ps1 d'abord."
    exit 1
}
if (-not (Test-Path $ServerModsDir)) {
    Write-Error "Dossier mods serveur introuvable : $ServerModsDir"
    exit 1
}

Push-Location $ClientRepoPath
try {
    Write-Host "==> Sync mods $ServerModsDir → $ClientRepoPath\mods\" -ForegroundColor Cyan

    # Wipe le dossier mods/ avant copie pour éliminer les mods retirés côté serveur
    if (Test-Path "mods") { Remove-Item "mods\*.jar" -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path "mods" -Force | Out-Null
    Copy-Item "$ServerModsDir\*.jar" "mods\" -Force
    $count = (Get-ChildItem "mods\*.jar").Count
    Write-Host "    $count mods copiés"

    # On NE PAS sync config/ par défaut — les configs serveur diffèrent des configs client
    # Décommente si tu veux sync (attention aux config server-only)
    # Remove-Item "config\*" -Recurse -Force -ErrorAction SilentlyContinue
    # Copy-Item "$ServerConfigDir\*" "config\" -Recurse -Force

    Write-Host "==> Régénération manifest.json..." -ForegroundColor Cyan
    if (Get-Command python -ErrorAction SilentlyContinue) {
        python generate-manifest.py
    } else {
        python3 generate-manifest.py
    }

    Write-Host "==> Git commit + push..." -ForegroundColor Cyan
    git add -A
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    Aucun changement à pusher." -ForegroundColor Yellow
    } else {
        $msg = "sync mods ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
        git commit -m $msg
        git push
        Write-Host "==> Push terminé. Tes joueurs récupèrent la diff au prochain JOUER." -ForegroundColor Green
    }
} finally { Pop-Location }
