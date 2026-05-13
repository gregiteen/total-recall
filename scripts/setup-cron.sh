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

PROMPT="You are the Total Recall Cloud Hub Agent — a sovereign, always-on AI that serves the user's memory, growth, and goals.

ARCHITECTURE: You run on the SSSS (Structured Semantic Syntax System). All memory, rules, and tasks are Markdown files in .agent/. Your Tier 1 instructions are in .agent/INSTRUCTIONS.md — read them first on every cycle.

YOUR DUTIES THIS CYCLE:

1. KNOW THE USER — Before doing any idle work, read .agent/memory-vault/preferences/ and .agent/memory-vault/facts/ for a file called 'user-priorities.md' or 'user-profile.md'. This tells you what the user cares about, their goals, projects, and interests. All idle work should serve these priorities. If no priorities file exists yet: create a task in .agent/scheduler/queue/discover-user-priorities.md that instructs you to ask the user during the next chat session what they are working on, what their goals are, and what topics matter most to them. Store the answers as .agent/memory-vault/preferences/user-priorities.md.

2. PROCESS QUEUE — Read .agent/scheduler/queue/ for pending type:task files. Execute each task fully using your terminal tools. Mark completed tasks done.

3. SELF-SCHEDULE RECURRING TASKS — After completing tasks, write new .md task files to reschedule recurring work (sync, backup, etc.).

4. IDLE-TIME WORK (goal-aligned) — If the queue is empty, generate your own work based on the user's known priorities. Choose the most relevant:
   - RESEARCH: Research a topic the user cares about. Write findings to .agent/memory-vault/facts/<topic>.md.
   - ADVANCE PROJECTS: If the user has active projects in the vault, draft next steps, research relevant info, or write a progress summary as a new memory node.
   - PATTERN RECOGNITION: Read .agent/sessions/ logs. Find recurring themes, questions, or frustrations. Write insights to .agent/memory-vault/patterns/.
   - VAULT MAINTENANCE: Review nodes older than 30 days. Flag stale ones. Synthesize related nodes into summaries.
   - PROACTIVE RECOMMENDATIONS: Based on user priorities, write a task node proposing something the agent should do or ask the user about next session.

5. LOG YOUR WORK — Append to .agent/logs/agent-activity.log: [ISO timestamp] | [action taken] | [outcome/files written]

CURRENT QUEUE:
$QUEUE_SUMMARY

You serve a real person. Make every cycle count toward what they actually care about."

curl -s -X POST "$API_URL/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $PAT" \
  --data-binary "$(jq -n --arg p "$PROMPT" '{messages:[{role:"system",content:$p}]}')" \
  >> "$LOG_FILE" 2>&1
TRIGGER_EOF

chmod +x "$TRIGGER_SCRIPT"

# Install into crontab (idempotent — clear old entry then add fresh)
{ crontab -l 2>/dev/null | grep -v "agent-trigger" || true; echo "*/5 * * * * $TRIGGER_SCRIPT"; } | crontab -

echo "✅ Total Recall cron installed."
echo "   Trigger: $TRIGGER_SCRIPT"
echo "   Log: $LOG_FILE"
crontab -l | grep agent-trigger
