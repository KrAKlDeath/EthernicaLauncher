# Publie une nouvelle version du launcher sur GitHub Releases.
# electron-updater chez tes joueurs détectera la maj au prochain démarrage.
#
# Usage :
#   .\server\publish.ps1
#
# Pré-requis :
#   - Avoir bumpé la version dans package.json (ex: 1.0.0 → 1.0.1)
#   - GH_TOKEN défini dans l'environnement, ou être connecté via `gh auth login`
#     (electron-builder utilise gh auth automatiquement)

$ErrorActionPreference = "Stop"

# Set le token automatiquement depuis gh auth si pas déjà défini
if (-not $env:GH_TOKEN) {
    $token = gh auth token 2>$null
    if ($LASTEXITCODE -eq 0 -and $token) {
        $env:GH_TOKEN = $token.Trim()
        Write-Host "GH_TOKEN récupéré via gh CLI" -ForegroundColor Green
    } else {
        Write-Error "GH_TOKEN absent et 'gh auth token' a échoué. Lance : gh auth login"
        exit 1
    }
}

$pkg = Get-Content "package.json" | ConvertFrom-Json
Write-Host "==> Build + publish v$($pkg.version)..." -ForegroundColor Cyan

npm run dist -- --publish always

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==> Publié sur GitHub Releases." -ForegroundColor Green
    Write-Host "    Lien à donner aux joueurs (toujours le même) :"
    Write-Host "    https://github.com/$($env:GH_USER ?? 'TON_PSEUDO')/EthernicaLauncher/releases/latest/download/EthernicaLauncher-Setup-$($pkg.version).exe" -ForegroundColor Yellow
} else {
    Write-Error "Build/publish a échoué."
    exit 1
}
