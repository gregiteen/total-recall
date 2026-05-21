---
type: skill
name: push
description: "Use this skill when deploying, git pushing, or pulling codebase changes to the remote Vast.ai brain VPS and restarting services. MANDATORY: Read this file before attempting any code pushes or remote restarts."
---

# Deploy and Push Skill (Total Recall OS)

This skill governs the exact, safe deployment workflow for pushing code changes to the remote Total Recall brain VPS, hot-fixing server environment issues, restarting background processes, and verifying connectivity.

---

## 🎯 WHEN TO USE THIS SKILL

You MUST trigger and use this skill whenever:
1. Pushing local git commits to the remote repository.
2. Connecting via SSH to pull code changes on the remote Vast.ai VPS (`git pull`).
3. Terminating or restarting remote processes (like the standalone REST server or background daemon).
4. Verifying server health, tunnel connectivity, and synchronizing local shims (`npx total-recall status` / `sync`).

---

## 🚀 STANDARDIZED DEPLOYMENT WORKFLOW

To prevent server crashes, stale processes, or broken tunnels, always follow this step-by-step checklist:

### Step 1: Pre-Push Syntax and Quality Checks
Before pushing any code, verify ES modules syntax:
```bash
node --check src/server/index.mjs
node --check src/server/keys.mjs
node --check src/core/daemon-loop.mjs
```
*Note: Never execute raw `tsc` or `eslint` checks. Always use `.agent/skills/code-quality/` scripts.*

### Step 2: Push Local Commits
Commit the changes cleanly and push to GitHub:
```bash
git commit -am "meaningful description"
git push origin main
```

### Step 3: Connect and Pull Remotely
SSH into the Vast.ai VPS instance to pull the changes:
```bash
ssh -p <PORT> root@<HOST> "git -C /root/total-recall pull origin main"
```

### Step 4: Clean Restart of Remote Processes
Always kill active Node processes cleanly first, then spawn the server and daemon using the **absolute path to Node** (since non-interactive shells do not load NVM paths correctly):
```bash
# 1. Cleanly terminate all active node processes
ssh -p <PORT> root@<HOST> "pkill -9 -f node"

# 2. Start the standalone server (redirect outputs to server.log)
ssh -p <PORT> root@<HOST> "nohup /root/.nvm/versions/node/v24.15.0/bin/node /root/total-recall/bin/total-recall.mjs start --port 3000 --host 127.0.0.1 > /root/.agent/logs/server.log 2>&1 &"

# 3. Start the background Active Intelligence Daemon using the official CLI:
ssh -p <PORT> root@<HOST> "/root/.nvm/versions/node/v24.15.0/bin/node /root/total-recall/bin/total-recall.mjs daemon start"
```

### Step 5: Verify Active Cloudflare Tunnel & Notify User
Because the Cloudflare quick tunnel is dynamically restarted, it generates a fresh domain.
1. Extract the new active URL from `/root/.agent/logs/cloudflared.log`:
   ```bash
   ssh -p <PORT> root@<HOST> "grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' /root/.agent/logs/cloudflared.log | tail -n 1"
   ```
2. Run `npx total-recall status` locally to verify connectivity and sync state.
3. **MANDATORY**: Explicitly print the new active URLs (Integrations page, Dashboard page, and Health API) directly to the user in your final response!

---

## 🛠️ TROUBLESHOOTING & COMMON ISSUES

*   **TypeError: crypto.createHash is not a function**
    *   *Cause*: Importing `crypto` dynamically on Node ES modules can fail if `import crypto from 'node:crypto';` is not explicitly declared at the top of the file (e.g. in `src/server/keys.mjs`).
    *   *Fix*: Add `import crypto from 'node:crypto';` and commit.
*   **Stale Daemon PID / Circuit Breaker alert**
    *   *Cause*: Daemon was manually started without updating `daemon.pid`.
    *   *Fix*: Use `node bin/total-recall.mjs daemon start` or make sure to let the CLI spawn it.
