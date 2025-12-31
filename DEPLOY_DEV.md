Dev Deployment Guide — tymeemusic

Purpose
- Safely deploy `feature/player-button-refactor` to a dev server/guild for manual QA.

Prerequisites
- Access to the dev server (SSH / RDP / etc.) where the bot runs.
- Node.js >= 18 installed.
- `.env` with appropriate dev credentials (DISCORD token, Lavalink, DB paths, etc.).
- Optional: `pm2` installed for process management (recommended).

High-level checklist
1. Create test branch (already pushed): `feature/player-button-refactor`.
2. On the dev server, fetch and checkout the branch.
3. Install dependencies and restart the bot process.
4. Perform manual QA (see steps below).
5. If issues, rollback to previous commit or branch and report details.

Commands (PowerShell / Windows)
- Change to app directory:
  cd C:\path\to\tymeemusic

- Pull branch and install:
  git fetch origin
  git checkout feature/player-button-refactor
  git pull origin feature/player-button-refactor
  npm ci

- Start/Restart (preferred: using pm2):
  # If using pm2 and process name is 'tymeemusic-dev'
  pm2 describe tymeemusic-dev >/dev/null 2>&1 && pm2 restart tymeemusic-dev || pm2 start --name tymeemusic-dev --node-args="--trace-warnings" src/shard.js

- Fallback (no pm2):
  # Stop existing process (manually), then run in background using PowerShell Start-Process
  Start-Process -FilePath "powershell" -ArgumentList "-NoProfile -WindowStyle Hidden -Command 'cd '""C:\path\to\tymeemusic""; node src/shard.js'" -PassThru

Post-deploy QA steps (manual)
- Invite the bot to the dev guild if not already present.
- Verify commands: `!play <song>`, `!pause`, `!skip` (or your prefix).
- Open the Now Playing embed and ensure:
  - Requester mention appears (if implemented)
  - Bot emoji and guild emoji resolution looks correct
  - Volume/loop controls update the embed correctly
- Test UI flows:
  - Effects: Open effects menu → apply & clear an effect
  - Filters: Apply a filter preset and then reset filters
  - Move: Open move select → move an item and verify queue order
  - Similar: Run similar search → add suggestion and confirm added to queue
- Check web dashboard (if running) updates player state.
- Inspect logs for exceptions: `logs/error.log` and console output.

Rollback
- If problems encountered that warrant rollback:
  git checkout main
  git pull origin main
  npm ci
  Restart the process (pm2 restart tymeemusic-dev)
  Open a ticket with logs and repro steps.

Notes
- Do not deploy to production from this branch until QA passes.
- If you want, I can prepare a one-click deploy action (GitHub Action) that will run the above steps on a specific runner; say so and I'll draft it.