#!/usr/bin/env bash
# ============================================================
# Total Recall — Cloud Agent Auto-Pull & Self-Healing Restart
#
# Periodically executed on a host that runs the brain to fetch new commits from
# GitHub, pull them, and hot-reload the server and watchdog daemon.
# ============================================================

set -euo pipefail

# Standard paths so every binary resolves in a non-interactive shell/cron.
# This used to pin /root/.nvm/versions/node/v24.15.0/bin, which does not exist
# on the deploy hosts (they run /usr/bin/node) — cron got a PATH missing the
# interpreter the line was named for.
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

# Host-local environment: TR_SECRETS_PASSWORD (and optionally TR_PORT). Optional
# — a host that does not run the brain will not have it. Without the password the
# brain cannot decrypt its own secrets store, so embeddings never build and
# recall silently degrades to keyword-only.
if [ -f /root/.agent/tr.env ]; then
  . /root/.agent/tr.env
fi

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

SERVER_PORT="${TR_PORT:-3000}"
SERVER_HOST="${TR_HOST:-127.0.0.1}"

checkout_version() {
  "$NODE_BIN" -p "require('$REPO_DIR/package.json').version"
}

# The version the RUNNING server reports, or nothing when it is down. The
# checkout alone proves nothing: pulled code is not served until a restart.
running_version() {
  curl -s -m 5 "http://127.0.0.1:$SERVER_PORT/health" 2>/dev/null \
    | "$NODE_BIN" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).version||"")}catch{}})' \
    || true
}

restart_brain() {
  log "Stopping existing processes..."
  # Match the processes as they really run (/usr/bin/node <abs path>). The old
  # patterns ("node src/server/index.mjs") never matched an absolute path, so
  # the old server kept the port, every new one died on EADDRINUSE, and the log
  # still said the reload succeeded.
  for pattern in "$REPO_DIR/bin/total-recall.mjs start" "$REPO_DIR/src/server/index.mjs" "$REPO_DIR/src/core/daemon-loop.mjs"; do
    pkill -f "$pattern" || true
  done
  for _ in $(seq 1 20); do
    ss -ltn "sport = :$SERVER_PORT" 2>/dev/null | grep -q LISTEN || break
    sleep 1
  done
  for pattern in "$REPO_DIR/bin/total-recall.mjs start" "$REPO_DIR/src/server/index.mjs" "$REPO_DIR/src/core/daemon-loop.mjs"; do
    pkill -9 -f "$pattern" || true
  done
  if ss -ltn "sport = :$SERVER_PORT" 2>/dev/null | grep -q LISTEN; then
    log "❌ Port $SERVER_PORT is still held by another process; not starting a second server."
    exit 1
  fi

  # The index.mjs watchdog starts the daemon. Port is configurable: the droplet
  # already serves ultrachat-frontend-1 on 3000.
  log "Starting the standalone server on $SERVER_HOST:$SERVER_PORT..."
  nohup "$NODE_BIN" "$REPO_DIR/bin/total-recall.mjs" start --port "$SERVER_PORT" --host "$SERVER_HOST" > /root/.agent/logs/server.log 2>&1 &

  local want got=""
  want=$(checkout_version)
  for _ in $(seq 1 60); do
    got=$(running_version)
    [ "$got" = "$want" ] && break
    sleep 2
  done
  if [ "$got" != "$want" ]; then
    log "❌ Restart failed: /health reports '${got:-nothing}', checkout is $want. Last server log:"
    tail -20 /root/.agent/logs/server.log | tee -a "$LOG_FILE"
    exit 1
  fi
  log "✅ Brain is serving $got on $SERVER_HOST:$SERVER_PORT."
}

build_frontend() {
  # Rebuild dashboard SPA (frontend/dist is gitignored — source ships; assets built on host).
  if [ -d "$REPO_DIR/frontend" ] && [ -f "$REPO_DIR/frontend/package.json" ]; then
    log "Building frontend (vite)..."
    (
      cd "$REPO_DIR/frontend"
      # Prefer vite-only build to avoid full-project tsc in CI-like auto-pull.
      if "$NODE_BIN" ./node_modules/vite/bin/vite.js build 2>/dev/null; then
        log "✅ Frontend vite build complete."
      elif command -v npx >/dev/null 2>&1 && npx --yes vite build; then
        log "✅ Frontend vite build complete (npx)."
      else
        log "⚠️ Frontend build skipped or failed — serving previous dist if present."
      fi
    ) || log "⚠️ Frontend build step errored (continuing restart)."
  fi
}

# Fetch remote changes
log "Fetching latest changes from GitHub..."
git fetch origin main

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  # Up to date — but only a running server on this version counts. A previous
  # failed restart would otherwise never be retried.
  RUNNING=$(running_version)
  WANT=$(checkout_version)
  if [ "$RUNNING" = "$WANT" ]; then
    log "✅ Code is up to date and serving $WANT (Commit: $LOCAL). No action needed."
    exit 0
  fi
  log "⚠️ Code is up to date but the server reports '${RUNNING:-nothing}', not $WANT. Reinstalling dependencies and restarting."
  npm ci --no-audit --no-fund >> "$LOG_FILE" 2>&1 || { log "❌ npm ci failed; not restarting."; exit 1; }
  build_frontend
  restart_brain
  exit 0
fi

log "🔄 Update detected! Local: $LOCAL, Remote: $REMOTE"
log "Pulling latest commits from origin/main..."
git pull origin main

# Dependencies changed with the pull: install them, or the new code starts
# against the old node_modules.
if ! git diff --quiet "$LOCAL" HEAD -- package.json package-lock.json; then
  log "Dependencies changed — running npm ci..."
  npm ci --no-audit --no-fund >> "$LOG_FILE" 2>&1 || { log "❌ npm ci failed; not restarting."; exit 1; }
fi

build_frontend
restart_brain

log "Updating OKF knowledge-catalog repo..."
if [ -d "$REPO_DIR/knowledge-catalog" ]; then
  (cd "$REPO_DIR/knowledge-catalog" && git pull origin main) || true
  log "✅ OKF repo updated."
fi

log "🎉 Updated and verified: the Total Recall Brain is serving $(checkout_version)."
