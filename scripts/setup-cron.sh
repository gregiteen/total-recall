#!/usr/bin/env bash
# ============================================================
# Total Recall — Cloud Agent Cron Setup
#
# Installs the scheduler cron that wakes the Cloud AI Agent
# every 5 minutes to process pending SSSS task queue files.
#
# Usage (run once on the cloud server after deploy):
#   bash scripts/setup-cron.sh
# ============================================================

set -euo pipefail

AGENT_DIR="${AGENT_DIR:-$HOME/.agent}"
API_URL="http://localhost:3000"
PAT="${TOTAL_RECALL_PAT:-local}"
LOG_FILE="$AGENT_DIR/logs/cron.log"
TRIGGER_SCRIPT="$AGENT_DIR/scripts/agent-trigger.sh"

mkdir -p "$AGENT_DIR/logs" "$AGENT_DIR/scripts"

# Write the agent trigger script (avoids crontab quoting issues)
cat > "$TRIGGER_SCRIPT" << 'TRIGGER_EOF'
#!/usr/bin/env bash
# Total Recall Cloud Agent Trigger
# Fired every 5 minutes by cron to process the SSSS scheduler queue.

AGENT_DIR="${AGENT_DIR:-$HOME/.agent}"
API_URL="http://localhost:3000"
PAT="${TOTAL_RECALL_PAT:-local}"
LOG_FILE="$AGENT_DIR/logs/cron.log"
QUEUE_DIR="$AGENT_DIR/scheduler/queue"

# Build queue summary for context
QUEUE_SUMMARY=""
if [ -d "$QUEUE_DIR" ]; then
  for f in "$QUEUE_DIR"/*.md; do
    [ -f "$f" ] || continue
    QUEUE_SUMMARY="$QUEUE_SUMMARY\n--- $(basename $f) ---\n$(head -20 $f)\n"
  done
fi

if [ -z "$QUEUE_SUMMARY" ]; then
  QUEUE_SUMMARY="No pending tasks in queue."
fi

PROMPT="You are the Total Recall Cloud Hub Agent. You are autonomous and sovereign. Your architecture is the SSSS (Structured Semantic Syntax System) - all memory, rules, and tasks are Markdown files in .agent/. Read your Tier 1 instructions from .agent/INSTRUCTIONS.md first. Then process the scheduler queue below. For each pending task: execute all steps using your terminal tools (run shell commands, git, rsync, call MCP tools). Mark completed tasks done. Self-schedule recurring tasks by writing new .md files to .agent/scheduler/queue/. CURRENT QUEUE:\n$QUEUE_SUMMARY"

curl -s -X POST "$API_URL/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $PAT" \
  --data-binary "$(jq -n --arg p "$PROMPT" '{messages:[{role:"system",content:$p}]}')" \
  >> "$LOG_FILE" 2>&1
TRIGGER_EOF

chmod +x "$TRIGGER_SCRIPT"

# Install into crontab (idempotent)
(crontab -l 2>/dev/null | grep -v "agent-trigger"; echo "*/5 * * * * $TRIGGER_SCRIPT") | crontab -

echo "✅ Total Recall cron installed."
echo "   Trigger: $TRIGGER_SCRIPT"
echo "   Log: $LOG_FILE"
crontab -l | grep agent-trigger
