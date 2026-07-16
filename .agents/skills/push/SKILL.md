---
repo_scoped: true
name: push
description: "Use this skill when verifying, committing, or pushing code to cloud and triggering auto-deploys. MANDATORY: You MUST read the full SKILL.md file before executing."
---

# Push Protocol

Use this skill to push local changes to the production environment. It enforces a strict **Fire-Verify-Commit-Push-Verify** lifecycle to ensure stability.

## Absolute Laws
1. **EXPLICIT APPROVAL REQUIRED**: If the user explicitly invokes `/push`, that invocation itself is approval to proceed. If push was not explicitly requested, you MUST ask "Ready to push?" before any `git push`. Never push silently.
2. **NEVER PUSH BROKEN CODE**: You MUST verify TS and lint results are clean BEFORE `git push`. Fix all blocking errors first. Zero tolerance.
3. **NO CHEATING TO UNBLOCK**: You MUST NOT clear, delete, fake, or alter lint/TS result files (`lint-status.txt`, `ts-status.txt`) to make a push appear clean. You MUST NOT suppress or ignore errors by modifying configs temporarily. Errors must be genuinely fixed. Cheating is a critical protocol violation.
4. **DEPLOY MONITORING IS MANDATORY**: After every push, you MUST run `monitor-deploy.mjs` and wait for a confirmed success or failure notification. Never declare a push "done" without a deploy confirmation. A push without monitoring is an incomplete push.
5. **NEVER IDLE — ZERO TOLERANCE**: You must NEVER sleep, poll, or wait passively during daemon runs (incremental) or deploy monitoring. There is ALWAYS parallel work. Pull from the Parallel Task Queue below and stay productive every second. `WaitDurationSeconds` MUST be 0 on all status checks when parallel work exists.
6. **TRUNK-BASED DEVELOPMENT (DARK LAUNCHING)**: We do NOT use staging servers. All code goes to production (`main`/`production` branches). Unfinished features MUST be hidden behind Feature Flags (`VITE_ENABLE_*` locally, or `FeatureFlagService` in production).
7. **ALWAYS SYNC MAIN**: The auto-deploy watcher syncs `production` -> `main` automatically. You must ensure `main` is synced: `git push origin production:main` followed by `git fetch origin main && git branch -f main origin/main`.
8. **STAGE EVERYTHING**: `git add -A` unless told otherwise.
9. **ATOMIC**: Add, commit, push in one sequence, never stop midway.
10. **GITHUB ACTIONS IS DISABLED**: Frontend auto-deploys via cron watcher instead.
11. **NEVER RUN MANUAL PRODUCTION BUILDS**: Pushing commits to the production branch automatically triggers the server's background cron deployment watcher `/root/auto-deploy.sh`. You must NEVER SSH into the droplet and manually run `docker compose build --no-cache` or execute raw restarts on active containers. Doing so bypasses the blue-green safety layer, starves CPU/RAM resources, and causes severe service downtime. Let the background deploy watcher safely build and swap in isolation.
12. **NEVER USE `nohup ssh` FOR TASKS**: If you need to run a remote background task, do not use `ssh root@... "nohup ... &"`. SSH will not disconnect if file descriptors remain open, causing your local task tool to hang indefinitely (re-confirmed 2026-06-10: a finished remote job left the local SSH wrapper hanging for 27 minutes). Use the official push pipeline (`git push origin production`) instead of manual SSH triggers. If a detached remote job is truly unavoidable in an emergency, redirect ALL descriptors so SSH can disconnect: `nohup cmd > /root/job.log 2>&1 < /dev/null &`.
13. **NEVER `git reset --hard` AWAY LOCAL COMMITS / NEVER FORCE-PUSH `production`**: The 2026-06-10 night outage was caused by a `git reset --hard origin/main` that silently wiped locally-committed fixes; a later partial re-commit shipped to production MISSING half of them, resurrecting boot-killing bugs. Before ANY history-altering command (`reset --hard`, `checkout -f`, force-push), run `git log origin/production..HEAD --oneline` and account for every commit that would be lost. After pushing a fix, verify it landed: `git fetch origin && git merge-base --is-ancestor <fix-sha> origin/production` (exit 0 = safe). If a previously-fixed bug ever reappears in production, IMMEDIATELY suspect dropped history — check the reflog for `reset:` entries before re-debugging from scratch.

## Parallel Task Queue (Pull from this while daemons run or deploy monitors)
> Never idle. Every `command_status` check MUST be paired with a productive task from this list.

**While daemons run (Step 0 → Step 2):**
- Update HANDOFF.md / project tracker with current session state
- Persist learnings: Write SSSS v2 nodes under `.agent/memory-vault/` and run `npx total-recall compile`
- Draft the commit message — review `git diff --stat` for scope
- Scan recently modified files for missing `try/catch` on dynamic imports
- Check for `TODO/FIXME/HACK` comments in changed files
- Update `repo-expert` skill if architecture changed
- Update TRTEST tracker or any in-progress project tracker

**While deploy monitors (Step 5):**
- Update HANDOFF.md with push details and deploy status
- Sync `main` branch prep (ready to run Step 6)
- Log session learnings if not already done
- Queue wiki entries: `node .agent/skills/identity/scripts/active-note.mjs --category wiki "..."`
- Review `auto-deploy.log` tail for early signals: `ssh root@138.197.199.217 "tail -20 /root/auto-deploy.log"`

> Full prioritized queue: `.agent/skills/project-management/SKILL.md` Mode 10.



## Step 0: Fire Code Quality Daemons (background — runs incrementally)
Fire IMMEDIATELY before anything else. Do commit prep in parallel while they run.

> [!IMPORTANT]
> Use the **code-quality** skill (`/code-quality`) for ALL error checking. Read `.agent/skills/code-quality/SKILL.md` for the full Operator Loop, view commands (`type`, `count`, `file <pattern>`, `worst`), and the lint autofix entrypoint.

```bash
node .agent/skills/code-quality/scripts/start-here-ts.mjs &
node .agent/skills/code-quality/scripts/start-here-lint.mjs &
```

> [!IMPORTANT]
> Do NOT wait. Move to Step 1 immediately. Results are read in Step 2 before git push.

## Step 1: Stage & Prepare Commit (while daemons run)
```bash
git add -A
git status  # review what's staged
```
Draft your commit message while waiting for daemon results.

## Step 2: Verify Code Quality (MUST PASS before git push)

> [!CAUTION]
> **You MUST use the full `/code-quality` skill toolbox.** Follow the Operator Loop exactly:
> 1. Run `start-here-ts.mjs` and `start-here-lint.mjs` to get the current error report.
> 2. Use `type`, `count`, `file <pattern>`, and `worst` views to identify and fix errors.
> 3. Use `lint-auto-fix.mjs` for safe mechanical lint fixes.
> 4. **STOP HERE if any errors or warnings exist.** Fix ALL TS errors and lint violations before proceeding. NEVER push broken code.
> 5. Trust your fixes — do not re-poll immediately. The daemon runs incrementally.

## Step 3: Commit & Push

- **If on a Feature Branch (Recommended, e.g. `feat/workspace-v2-blob-architecture`):**
  ```bash
  git commit -m "type(scope): description"
  git push origin HEAD              # Back up to remote feature branch
  git push origin HEAD:production   # Deploy feature branch directly to production droplet
  ```
- **If on `production` branch directly:**
  ```bash
  git commit -m "type(scope): description"
  git push origin production
  ```

## Step 4: Deploy (Auto-triggered vs Manual Tiers)
- **Automatic Deployment**: Pushing to the `production` branch automatically triggers the server's cron deployment watcher `/root/auto-deploy.sh` within 60 seconds. This script handles:
  - **Frontend changes**: Automatic Zero-Downtime Blue-Green Swap.
  - **API-only changes (no dependency edits)**: Automatic Zero-Downtime PM2 Hot-Reload.
  - **API dependency/Dockerfile changes**: Automatic Zero-Downtime API Blue-Green Container Swap.
    * *Note*: Automatic container compilation strictly pins **`esbuild@0.25.11`** and **`tsx@4.20.6`** inside Docker builds and uses a robust **120-second warmup health check timeout** to ensure stable swap-ins.
- **Manual API Deployment**: If manual action is required:
  - **Tier 1: API Hot-Reload (Code-only changes, no deps)**:
    ```bash
    .agent/skills/deploy/scripts/tier1-hot-reload.sh
    ```
  - **Tier 3: API Blue-Green Rebuild (Dependency/Dockerfile changes)**:
    ```bash
    .agent/skills/deploy/scripts/tier3-rebuild.sh
    ```

## Step 5: Verify & Monitor (MANDATORY — do not skip)
> [!CAUTION]
> **You are NOT done until deploy is confirmed.** Run monitor and wait for the success/failure notification. If deploy fails, fix it before declaring the push complete.

```bash
node .agent/skills/push/scripts/monitor-deploy.mjs
```

> [!CAUTION]
> **HOT RELOAD ≠ IMAGE UPDATE (2026-06-10 outage)**: an `api hot reload OK` deploy patches the running container only — `ultrachat-api:latest` keeps the OLD code until the next image rebuild. If your push contained a **boot-critical server fix** (anything that previously crashed boot or blocked port binding), make the image durable immediately or a later watchdog container recreate will resurrect the bug: `ssh root@138.197.199.217 "docker commit ultrachat-api-1 ultrachat-api:latest"` (stopgap) or trigger a pipeline image rebuild. See `/deploy` → "HOT-RELOAD FIXES ARE EPHEMERAL".

**If no deploy starts within ~2 min of pushing** (no new `=== DEPLOY STARTED ===` in the log): a previous deploy that was killed mid-run may have leaked the lock, which silently blocks all deploys for up to 30 min. Check:
```bash
ssh root@138.197.199.217 "ls -la /tmp/ultrachat-deploy.lock 2>/dev/null; tail -5 /root/auto-deploy.log; ps aux | grep -E 'auto-deploy|docker compose build' | grep -v grep"
```
If the lock exists but no deploy process is running, remove it: `rm -f /tmp/ultrachat-deploy.lock` (the next watcher tick retries within 60s).

## Step 6: Sync Main (MANDATORY LAST STEP)
> [!CAUTION]
> This step is NON-NEGOTIABLE. `main` must ALWAYS mirror `production` after every push. Skipping this step is a protocol violation.

```bash
git push origin production:main
git fetch origin main && git branch -f main origin/main
```

## Evolution
- Legacy `mcp_config.json` references have been purged.
- All operations must utilize `execute_api` when touching API primitives.
- Code Mode `search_api` must be used to discover endpoints.



<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-24T01:09:37.302Z -->

<!-- END INJECTED MEMORY -->
