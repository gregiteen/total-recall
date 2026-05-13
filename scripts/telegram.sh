#!/usr/bin/env bash
# ============================================================
# Total Recall — Telegram Notifier
#
# Sends a message to the user via Telegram Bot API.
# Used by the agent to report cycle results, discoveries,
# and proactive updates without requiring the user to
# be in the chat interface.
#
# Usage:
#   bash scripts/telegram.sh "Your message here"
#   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=yyy bash scripts/telegram.sh "Hello"
#
# Config (stored by onboarding interview):
#   ~/.agent/config/notifications.yml
#   OR environment variables TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
# ============================================================

set -euo pipefail

AGENT_DIR="${AGENT_DIR:-$HOME/.agent}"
CONFIG_FILE="$AGENT_DIR/config/notifications.yml"
MESSAGE="${1:-}"

if [ -z "$MESSAGE" ]; then
  echo "Usage: telegram.sh <message>" >&2
  exit 1
fi

# Load config from YAML file if env vars not set
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] && [ -f "$CONFIG_FILE" ]; then
  TELEGRAM_BOT_TOKEN=$(grep "telegram_bot_token:" "$CONFIG_FILE" 2>/dev/null | awk '{print $2}' | tr -d '"' || true)
  TELEGRAM_CHAT_ID=$(grep "telegram_chat_id:" "$CONFIG_FILE" 2>/dev/null | awk '{print $2}' | tr -d '"' || true)
fi

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "[telegram] Not configured — skipping notification" >&2
  exit 0
fi

# Send the message
RESPONSE=$(curl -s -X POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
    --arg chat_id "$TELEGRAM_CHAT_ID" \
    --arg text "$MESSAGE" \
    '{chat_id: $chat_id, text: $text, parse_mode: "Markdown"}'
  )")

# Check for errors
if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "[telegram] Message sent" >&2
else
  echo "[telegram] Send failed: $RESPONSE" >&2
  exit 1
fi
