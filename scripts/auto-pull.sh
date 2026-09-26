#!/usr/bin/env bash
# ============================================================
# Total Recall — Auto-Pull & Verified Restart (any host)
#
# Runs on a timer on every host that serves a brain from a git checkout
# (install with `total-recall update --install-autopull`). It fast-forwards the
# checkout to origin/main, installs dependencies and rebuilds the dashboard when
# they changed, restarts the brain, and reports success only when /health shows
# the checked-out version.
#
# Environment (all optional):
#   TR_REPO_DIR            checkout to update (default: the repo holding this script)
#   TR_PORT                port the brain serves /health on (default 3000)
#   TR_HOST                host for a brain started here (default 127.0.0.1)
#   TR_AUTOPULL_NO_BUILD=1 never build the dashboard here (laptops — heavy builds
#                          belong on the test host); a changed frontend is logged
# ============================================================

set -euo pipefail

# git pull can rewrite this file while bash is still reading it, so run from a
# private copy of whichever version started.
if [ -z "${TR_AUTOPULL_REEXEC:-}" ]; then
  self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
  tmp="$(mktemp "${TMPDIR:-/tmp}/tr-auto-pull.XXXXXX")"
  cp "$0" "$tmp"
  TR_AUTOPULL_SELF="$self" TR_AUTOPULL_REEXEC="$tmp" exec bash "$tmp" "$@"
fi
trap 'rm -f "$TR_AUTOPULL_REEXEC"' EXIT

# Standard paths so every binary resolves under cron or launchd.
NVM_NODE_BIN="$(ls -1d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -n 1 || true)"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${NVM_NODE_BIN:+:$NVM_NODE_BIN}:${PATH:-}"

AGENT_HOME="$HOME/.agent"
LOG_FILE="$AGENT_HOME/logs/auto-pull.log"
SERVER_LOG="$AGENT_HOME/logs/server.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $1" | tee -a "$LOG_FILE"
}

# Host-local environment (TR_PORT and friends). The brain reads the secrets
# password from this file itself; sourcing it here keeps older installs working.
ENV_FILE="${TR_ENV_FILE:-$AGENT_HOME/tr.env}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$ENV_FILE"
fi

# The checkout: explicit, else the repo this script lives in, else the path
# the original droplet install used (/root/auto-pull.sh outside any repo).
if [ -n "${TR_REPO_DIR:-}" ]; then
  REPO_DIR="$TR_REPO_DIR"
elif [ -f "$(dirname "$TR_AUTOPULL_SELF")/../package.json" ]; then
  REPO_DIR="$(cd "$(dirname "$TR_AUTOPULL_SELF")/.." && pwd)"
else
  REPO_DIR="/root/total-recall"
fi
if [ ! -d "$REPO_DIR/.git" ]; then
  log "❌ $REPO_DIR is not a git checkout."
  exit 1
fi
cd "$REPO_DIR"

NODE_BIN="$(command -v node || echo node)"
SERVER_PORT="${TR_PORT:-3000}"
SERVER_HOST="${TR_HOST:-127.0.0.1}"

checkout_version() {
  "$NODE_BIN" -p "require('$REPO_DIR/package.json').version"
}

# The version the RUNNING server reports, or nothing when it is down. A pulled
# checkout proves nothing until the server serving it has restarted.
running_version() {
  curl -s -m 5 "http://127.0.0.1:$SERVER_PORT/health" 2>/dev/null \
    | "$NODE_BIN" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).version||"")}catch{}})' \
    || true
}

port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$SERVER_PORT" 2>/dev/null | grep -q LISTEN
  else
    lsof -nP -iTCP:"$SERVER_PORT" -sTCP:LISTEN >/dev/null 2>&1
  fi
}

# PIDs of this checkout's brain processes. On macOS they run with relative
# paths (cwd = checkout), so the working directory decides, not the args.
repo_pids() {
  local pid cwd
  for pid in $(pgrep -f "src/server/index.mjs|src/core/daemon-loop.mjs|src/core/dream.mjs|bin/total-recall.mjs start" || true); do
    if [ -d "/proc/$pid" ]; then
      cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    else
      cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
    fi
    if [ "$cwd" = "$REPO_DIR" ] || ps -o args= -p "$pid" 2>/dev/null | grep -qF "$REPO_DIR/"; then
      echo "$pid"
    fi
  done
  return 0
}

# macOS: the LaunchAgents that run this checkout (KeepAlive jobs whose program
# or working directory is the repo).
launch_agent_labels() {
  [ "$(uname)" = "Darwin" ] || return 0
  local plist
  for plist in "$HOME"/Library/LaunchAgents/*.plist; do
    [ -f "$plist" ] || continue
    [ "$(basename "$plist")" = "com.totalrecall.autopull.plist" ] && continue
    if /usr/libexec/PlistBuddy -c "Print :WorkingDirectory" "$plist" 2>/dev/null | grep -qx "$REPO_DIR" \
      || /usr/libexec/PlistBuddy -c "Print :ProgramArguments" "$plist" 2>/dev/null | grep -qF "$REPO_DIR/"; then
      /usr/libexec/PlistBuddy -c "Print :Label" "$plist" 2>/dev/null || true
    fi
  done
  return 0
}

build_frontend() {
  [ -f "$REPO_DIR/frontend/package.json" ] || return 0
  if [ "${TR_AUTOPULL_NO_BUILD:-}" = "1" ]; then
    log "⚠️ Dashboard not rebuilt here (TR_AUTOPULL_NO_BUILD=1); the served dist may be stale."
    return 0
  fi
  log "Building frontend (vite)..."
  (
    cd "$REPO_DIR/frontend"
    [ -d node_modules ] || npm ci --no-audit --no-fund >> "$LOG_FILE" 2>&1
    if "$NODE_BIN" ./node_modules/vite/bin/vite.js build >> "$LOG_FILE" 2>&1; then
      log "✅ Frontend vite build complete."
    else
      log "⚠️ Frontend build failed — serving the previous dist if present."
    fi
  ) || log "⚠️ Frontend build step errored (continuing restart)."
}

restart_brain() {
  local labels pid want got=""
  labels="$(launch_agent_labels)"

  log "Stopping existing processes..."
  # The daemon the server spawns is not a launchd job: kill it first or it
  # survives the restart as an orphan running old code.
  for pid in $(repo_pids); do kill "$pid" 2>/dev/null || true; done

  if [ -n "$labels" ]; then
    for label in $labels; do
      log "Restarting LaunchAgent $label"
      launchctl kickstart -k "gui/$(id -u)/$label" || log "⚠️ kickstart $label failed"
    done
  else
    for _ in $(seq 1 20); do port_in_use || break; sleep 1; done
    for pid in $(repo_pids); do kill -9 "$pid" 2>/dev/null || true; done
    if port_in_use; then
      log "❌ Port $SERVER_PORT is still held by another process; not starting a second server."
      exit 1
    fi
    # The index.mjs watchdog starts the daemon.
    log "Starting the standalone server on $SERVER_HOST:$SERVER_PORT..."
    nohup "$NODE_BIN" "$REPO_DIR/bin/total-recall.mjs" start --port "$SERVER_PORT" --host "$SERVER_HOST" > "$SERVER_LOG" 2>&1 &
  fi

  want="$(checkout_version)"
  for _ in $(seq 1 60); do
    got="$(running_version)"
    [ "$got" = "$want" ] && break
    sleep 2
  done
  if [ "$got" != "$want" ]; then
    log "❌ Restart failed: /health on port $SERVER_PORT reports '${got:-nothing}', checkout is $want."
    [ -f "$SERVER_LOG" ] && tail -20 "$SERVER_LOG" | tee -a "$LOG_FILE"
    exit 1
  fi
  log "✅ Brain is serving $got on port $SERVER_PORT."
}

install_deps() {
  log "Installing dependencies (npm ci)..."
  npm ci --no-audit --no-fund >> "$LOG_FILE" 2>&1 || { log "❌ npm ci failed; not restarting."; exit 1; }
}

log "Checking $REPO_DIR (node: $NODE_BIN)"

# Never touch a checkout someone is developing in: only a clean main with
# nothing unpushed is updated. Files the install step regenerates (the
# repo-expert file counts) are restored first so they do not block updates.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  log "⏭️ On branch '$BRANCH', not main — not updating."
  exit 0
fi
git checkout -- .agent/skills/repo-expert/SKILL.md 2>/dev/null || true
if ! git diff --quiet || ! git diff --cached --quiet; then
  log "⏭️ Uncommitted changes to tracked files — not updating: $(git diff --name-only HEAD | head -5 | tr '\n' ' ')"
  exit 0
fi

git fetch -q origin main
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
AHEAD="$(git rev-list --count origin/main..HEAD)"
if [ "$AHEAD" != "0" ]; then
  log "⏭️ $AHEAD local commit(s) not on origin/main — not updating."
  exit 0
fi

if [ "$LOCAL" = "$REMOTE" ]; then
  # Up to date — but only a running server on this version counts. A previous
  # failed restart would otherwise never be retried.
  RUNNING="$(running_version)"
  WANT="$(checkout_version)"
  if [ "$RUNNING" = "$WANT" ]; then
    log "✅ Up to date and serving $WANT."
    exit 0
  fi
  log "⚠️ Code is up to date but the server reports '${RUNNING:-nothing}', not $WANT. Reinstalling and restarting."
  install_deps
  build_frontend
  restart_brain
  exit 0
fi

log "🔄 Update: $LOCAL → $REMOTE"
git merge --ff-only -q origin/main

if ! git diff --quiet "$LOCAL" HEAD -- package.json package-lock.json; then
  install_deps
fi
if ! git diff --quiet "$LOCAL" HEAD -- frontend/; then
  build_frontend
fi

restart_brain

if [ -d "$REPO_DIR/knowledge-catalog/.git" ]; then
  (cd "$REPO_DIR/knowledge-catalog" && git pull -q origin main) || true
fi

log "🎉 Updated and verified: serving $(checkout_version)."
