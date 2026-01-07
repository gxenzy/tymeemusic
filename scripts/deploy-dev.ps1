# Helper script for deploying feature branch to a dev server (PowerShell)
# Usage: .\deploy-dev.ps1 -Branch feature/player-button-refactor -AppPath C:\path\to\tymeemusic
param(
  [string]$Branch = 'feature/player-button-refactor',
  [string]$AppPath = (Get-Location)
)

Write-Host "Deploying branch $Branch to $AppPath"
Set-Location $AppPath

# Fetch & checkout
git fetch origin
$localBranch = git rev-parse --abbrev-ref HEAD 2>$null
if ($localBranch -ne $Branch) {
  git checkout $Branch 2>$null || git checkout -b $Branch origin/$Branch
} else {
  git pull origin $Branch
}

# Install dependencies
Write-Host "Installing dependencies (npm ci)"
npm ci

# Restart using pm2 if available
$pm2Path = (Get-Command pm2 -ErrorAction SilentlyContinue)
if ($pm2Path) {
  Write-Host "pm2 detected. Restarting process 'tymeemusic-dev' or starting it."
  $exists = pm2 describe tymeemusic-dev 2>$null
  if ($LASTEXITCODE -eq 0) {
    pm2 restart tymeemusic-dev
  } else {
    pm2 start --name tymeemusic-dev --node-args="--trace-warnings" src/shard.js
  }
  Write-Host "pm2 status:"
  pm2 status tymeemusic-dev
} else {
  Write-Host "pm2 not found. Starting the process in the background."
  # Note: This starts a detached PowerShell process — improve as needed for your environment
  Start-Process -FilePath "powershell" -ArgumentList "-NoProfile -WindowStyle Hidden -Command 'cd '""$AppPath""; node src/shard.js'" -PassThru
}

Write-Host "Deployment script finished. Verify logs and perform QA steps from DEPLOY_DEV.md."