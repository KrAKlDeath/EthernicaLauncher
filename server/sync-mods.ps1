# Sync ton client Minecraft (.minecraft\mods + config + resourcepacks) vers le
# repo EthernicaClient + push GitHub.
#
# Source de verite = ton dossier client. Strategie : sync AGRESSIF total.
# Chez tes amis, mods/ + config/ + resourcepacks/ sont remplaces a l'identique
# au prochain JOUER (le launcher delete ce qui n'est plus dans le manifest).
#
# Usage :
#   .\server\sync-mods.ps1
#   .\server\sync-mods.ps1 -ClientDir "C:\autre\.minecraft"

param(
    [string]$ClientDir = "$env:APPDATA\.minecraft",
    [string]$ClientRepoPath = "$HOME\your-project\EthernicaClient"
)

$ErrorActionPreference = "Continue"

if (-not (Test-Path $ClientRepoPath)) {
    Write-Host "Repo client introuvable : $ClientRepoPath. Lance init-repos.ps1 d'abord." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $ClientDir)) {
    Write-Host "Dossier client Minecraft introuvable : $ClientDir" -ForegroundColor Red
    exit 1
}

function Sync-Dir {
    param($SrcRoot, $DstRoot, $SubDir, $Pattern)
    $src = Join-Path $SrcRoot $SubDir
    $dst = Join-Path $DstRoot $SubDir
    if (-not (Test-Path $src)) {
        Write-Host "    $SubDir : source absente, skip" -ForegroundColor Yellow
        return
    }
    if (Test-Path $dst) { Remove-Item "$dst\*" -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
    if ($Pattern) {
        Copy-Item "$src\$Pattern" $dst -Force -ErrorAction SilentlyContinue
    } else {
        Copy-Item "$src\*" $dst -Recurse -Force -ErrorAction SilentlyContinue
    }
    $count = (Get-ChildItem $dst -Recurse -File -ErrorAction SilentlyContinue).Count
    Write-Host "    $SubDir : $count fichiers" -ForegroundColor Green
}

Push-Location $ClientRepoPath
try {
    Write-Host "==> Sync $ClientDir -> $ClientRepoPath" -ForegroundColor Cyan
    Sync-Dir $ClientDir $ClientRepoPath "mods" "*.jar"
    Sync-Dir $ClientDir $ClientRepoPath "config" $null
    Sync-Dir $ClientDir $ClientRepoPath "resourcepacks" $null

    Write-Host "==> Regeneration manifest.json..." -ForegroundColor Cyan
    $py = Get-Command python -ErrorAction SilentlyContinue
    if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
    if ($py) { & $py.Source generate-manifest.py } else { Write-Host "    python introuvable" -ForegroundColor Red; exit 1 }

    Write-Host "==> Git commit + push..." -ForegroundColor Cyan
    git add -A 2>$null
    git diff --cached --quiet 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    Aucun changement a pusher." -ForegroundColor Yellow
    } else {
        $msg = "sync client ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
        git commit -m $msg | Out-Null
        git push
        Write-Host "==> Push termine. Tes joueurs recuperent la diff au prochain JOUER." -ForegroundColor Green
    }
} finally { Pop-Location }
