# Prépare le repo EthernicaClient à partir du pack client Ethernia (NeoForge 1.21.1)
# puis le pousse sur GitHub. Les joueurs récupèrent la différence au prochain JOUER.
#
# Source de vérité = Desktop\Ethernia\client-pack :
#   mods\*.jar           -> mods\        (géré : les mods retirés sont supprimés chez les joueurs)
#   shaderpacks\*.zip    -> shaderpacks\
#   config\*             -> config\      (fourni au 1er lancement seulement)
#   options-ethernia.txt -> options.txt  (fourni au 1er lancement seulement)
#
# Usage :
#   .\server\sync-mods.ps1                 # prépare + commit + push
#   .\server\sync-mods.ps1 -NoPush         # prépare + manifest, sans rien envoyer
#   .\server\sync-mods.ps1 -ClientRepoPath "D:\EthernicaClient"
#
# Premier usage : clone le repo client à côté du projet :
#   git clone https://github.com/KrAKlDeath/EthernicaClient "$HOME\Desktop\Ethernia\client-repo"

param(
    [string]$PackDir = (Join-Path $PSScriptRoot "..\..\client-pack"),
    [string]$ClientRepoPath = (Join-Path $PSScriptRoot "..\..\client-repo"),
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"

$PackDir = (Resolve-Path $PackDir).Path
if (-not (Test-Path $ClientRepoPath)) {
    if ($NoPush) {
        New-Item -ItemType Directory -Path $ClientRepoPath -Force | Out-Null
    } else {
        Write-Host "Repo client introuvable : $ClientRepoPath" -ForegroundColor Red
        Write-Host "Clone-le d'abord : git clone https://github.com/KrAKlDeath/EthernicaClient `"$ClientRepoPath`"" -ForegroundColor Yellow
        exit 1
    }
}
$ClientRepoPath = (Resolve-Path $ClientRepoPath).Path

function Sync-Dir {
    param($SubDir, $Pattern)
    $src = Join-Path $PackDir $SubDir
    $dst = Join-Path $ClientRepoPath $SubDir
    if (Test-Path $dst) { Remove-Item (Join-Path $dst "*") -Recurse -Force }
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
    if (Test-Path $src) {
        Copy-Item (Join-Path $src $Pattern) $dst -Recurse -Force
    }
    $count = (Get-ChildItem $dst -Recurse -File).Count
    Write-Host "    $SubDir : $count fichiers" -ForegroundColor Green
}

Write-Host "==> $PackDir -> $ClientRepoPath" -ForegroundColor Cyan
Sync-Dir "mods" "*.jar"
Sync-Dir "shaderpacks" "*.zip"
Sync-Dir "config" "*"
# Ancien contenu Forge 1.20.1 à retirer du repo
foreach ($old in @("resourcepacks", "keybinds.txt")) {
    $p = Join-Path $ClientRepoPath $old
    if (Test-Path $p) { Remove-Item $p -Recurse -Force; Write-Host "    $old : retiré" -ForegroundColor Yellow }
}
$opts = Join-Path $PackDir "options-ethernia.txt"
if (Test-Path $opts) { Copy-Item $opts (Join-Path $ClientRepoPath "options.txt") -Force }

Write-Host "==> manifest.json" -ForegroundColor Cyan
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
if (-not $py) { Write-Host "    python introuvable" -ForegroundColor Red; exit 1 }
& $py.Source (Join-Path $PSScriptRoot "generate-manifest.py") $ClientRepoPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($NoPush) {
    Write-Host "==> -NoPush : rien n'a été envoyé." -ForegroundColor Yellow
    exit 0
}

Push-Location $ClientRepoPath
try {
    git add -A
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    Aucun changement à pousser." -ForegroundColor Yellow
    } else {
        git commit -m "Pack client NeoForge 1.21.1 ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))" | Out-Null
        git push
        Write-Host "==> Poussé. Les joueurs récupèrent la différence au prochain JOUER." -ForegroundColor Green
    }
} finally { Pop-Location }
