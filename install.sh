#!/usr/bin/env bash
# Total Recall — One-Command Installer
# Assumes nothing. Installs everything. Opens the wizard.
#
# Usage:
#   curl -fsSL ${TR_INSTALL_SCRIPT_URL:-} | bash
#
set -e

# Ensure standard binary directories are in PATH (important for non-interactive shells)
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

REPO_URL="${TR_GIT_URL:-}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/total-recall}"
WIZARD_PORT=3001

# ── Colors ──────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${BLUE}▶${RESET} $*"; }
ok()   { echo -e "${GREEN}✓${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET}  $*"; }
die()  { echo -e "${RED}✗ ERROR:${RESET} $*" >&2; exit 1; }

echo -e ""
echo -e "${BOLD}  ⚡ Total Recall — Setup${RESET}"
echo -e "  Your private AI brain. Installing now...\n"

# ── 1. Detect OS ────────────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"
log "Detected: $OS / $ARCH"

# ── 2. Install system dependencies ──────────────────────────────────────────────

install_node() {
  log "Installing Node.js via nvm..."
  export NVM_DIR="$HOME/.nvm"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  # shellcheck disable=SC1090
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  nvm install --lts
  nvm use --lts
  ok "Node.js $(node --version) installed"
}

install_git_linux() {
  log "Installing git..."
  if command -v apt-get &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq git curl
  elif command -v yum &>/dev/null; then
    yum install -y -q git curl
  elif command -v dnf &>/dev/null; then
    dnf install -y -q git curl
  else
    die "Cannot install git — please install it manually then re-run this script."
  fi
  ok "git installed"
}

install_zstd_linux() {
  log "Checking for zstd..."
  if ! command -v zstd &>/dev/null; then
    log "zstd not found. Installing zstd..."
    if command -v apt-get &>/dev/null; then
      apt-get update -qq && apt-get install -y -qq zstd
    elif command -v yum &>/dev/null; then
      yum install -y -q zstd
    elif command -v dnf &>/dev/null; then
      dnf install -y -q zstd
    else
      warn "Could not install zstd automatically — please install it manually."
    fi
  else
    ok "zstd is already installed"
  fi
}

# Git
if ! command -v git &>/dev/null; then
  if [ "$OS" = "Darwin" ]; then
    warn "git not found. Triggering Xcode Command Line Tools install..."
    xcode-select --install 2>/dev/null || true
    echo ""
    echo -e "${YELLOW}  Please install Xcode Command Line Tools in the dialog that appeared,"
    echo -e "  then run this installer again.${RESET}"
    exit 0
  else
    install_git_linux
  fi
else
  ok "git $(git --version | awk '{print $3}')"
fi

# Node.js
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

if ! command -v node &>/dev/null; then
  install_node
elif node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>/dev/null; then
  ok "Node.js $(node --version)"
else
  warn "Node.js $(node --version) is too old (need v18+). Upgrading..."
  install_node
fi

# ── 3. Install Ollama ────────────────────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
  if [ "$OS" != "Darwin" ]; then
    install_zstd_linux
  fi
  log "Installing Ollama (local AI runtime)..."
  curl -fsSL https://ollama.com/install.sh | sh
  ok "Ollama installed"
else
  ok "Ollama $(ollama --version 2>/dev/null | head -1)"
fi

# Start Ollama in background if not running
if ! curl -s http://localhost:11434 &>/dev/null; then
  log "Starting Ollama..."
  nohup ollama serve > /tmp/ollama.log 2>&1 &
  sleep 3
fi

# ── 4. Install Total Recall package ─────────────────────────────────────────────
# Prefer npm package (open-source default). Optional TR_GIT_URL for git clone.
PKG_NAME="${TR_NPM_PACKAGE:-total-recall-brain}"
if [ -n "$REPO_URL" ]; then
  if [ -d "$INSTALL_DIR/.git" ]; then
    if [ "$SKIP_PULL" = "1" ]; then
      log "Skipping git pull (development/local test mode)..."
      cd "$INSTALL_DIR"
    else
      log "Updating install dir $INSTALL_DIR..."
      cd "$INSTALL_DIR" && git pull --ff-only
    fi
  else
    log "Cloning from TR_GIT_URL into $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi
  log "Installing dependencies..."
  npm install --quiet
  ok "Dependencies installed"
else
  log "Installing $PKG_NAME from npm (set TR_GIT_URL to install from a git remote instead)..."
  npm install -g "$PKG_NAME"
  ok "Installed $PKG_NAME"
  mkdir -p "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# ── 6. Launch the Setup Wizard ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  Everything is ready. Opening the setup wizard...${RESET}"
echo -e "  ${BOLD}→ http://localhost:${WIZARD_PORT}${RESET}\n"
echo -e "  The wizard will guide you through:"
echo -e "  • Choosing a model (or using one you already have)"
echo -e "  • Setting up your domain and HTTPS (optional)"
echo -e "  • Connecting Claude Code, Cursor, Obsidian, and more"
echo ""

# Open browser
open_browser() {
  local url="$1"
  if [ "$OS" = "Darwin" ]; then
    open "$url" &
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$url" &
  elif command -v google-chrome &>/dev/null; then
    google-chrome "$url" &
  fi
}

# Give the wizard a moment then open browser if not in headless mode
if [ "$AUTO_DEPLOY" != "1" ]; then
  (sleep 3 && open_browser "http://localhost:${WIZARD_PORT}") &
fi

# Run the wizard (blocks until install complete)
if [ "$AUTO_DEPLOY" = "1" ]; then
  log "Running in non-interactive remote deploy mode..."
  DEPLOY_FLAGS=""
  if [ "$HTTPS_METHOD" = "cloudflare-quick" ]; then
    DEPLOY_FLAGS="--cloudflare-quick"
  else
    DEPLOY_FLAGS="--allow-insecure-http"
  fi
  node "$INSTALL_DIR/bin/total-recall.mjs" deploy $DEPLOY_FLAGS
else
  node "$INSTALL_DIR/bin/total-recall.mjs" deploy --ui --ui-port "$WIZARD_PORT" --allow-insecure-http
fi
