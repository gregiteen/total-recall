#!/usr/bin/env bash
# ============================================================
# Total Recall — Cloud Agent Auto-Pull & Self-Healing Restart
#
# Periodically executed on the Vast.ai VPS server to fetch
# new commits from GitHub, run local git pull, and hot-reload
# the server and watchdog daemon.
# ============================================================

set -euo pipefail

# Set standard paths to ensure all binaries are found in non-interactive shell/cron
export PATH="/root/.nvm/versions/node/v24.15.0/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

REPO_DIR="/root/total-recall"
LOG_FILE="/root/.agent/logs/auto-pull.log"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $1" | tee -a "$LOG_FILE"
}

# Ensure we are in the repo directory
if [ ! -d "$REPO_DIR" ]; then
  log "❌ Repository directory not found at $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"

# Find the node binary
NODE_BIN=$(which node || ls -1 /root/.nvm/versions/node/*/bin/node 2>/dev/null | tail -n 1 || echo "node")
log "Using Node binary: $NODE_BIN"

# Fetch remote changes
log "Fetching latest changes from GitHub..."
git fetch origin main

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  log "✅ Code is up to date (Commit: $LOCAL). No action needed."
  exit 0
fi

log "🔄 Update detected! Local: $LOCAL, Remote: $REMOTE"
log "Pulling latest commits from origin/main..."
git pull origin main

log "Stopping existing processes..."
# Cleanly kill standalone server and daemon processes
pkill -9 -f "total-recall.mjs start" || true
pkill -9 -f "total-recall.mjs daemon" || true
pkill -9 -f "node src/server/index.mjs" || true
pkill -9 -f "node.*total-recall.mjs" || true

log "Starting the standalone server..."
# Spawn server in background. The index.mjs watchdog will auto-start the daemon.
nohup "$NODE_BIN" "$REPO_DIR/bin/total-recall.mjs" start --port 3000 --host 127.0.0.1 > /root/.agent/logs/server.log 2>&1 &

log "🎉 Successfully updated and hot-reloaded the Total Recall Brain in the cloud!"
