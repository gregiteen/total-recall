### The real mechanism: `scripts/auto-pull.sh`

A host running the brain updates itself by pulling `main`, rebuilding
`frontend/dist`, and restarting the server (the server starts the daemon):

```bash
git fetch origin main && git merge --ff-only origin/main   # TR_REPO_DIR, default: the checkout holding the script
```

**Every host that serves a brain from a checkout runs it** (macOS and Linux).
Install from that checkout — idempotent, safe to re-run:

```bash
node bin/total-recall.mjs update --install-autopull              # port from the brain's LaunchAgent, else TR_PORT, else 3000
node bin/total-recall.mjs update --install-autopull --no-build   # skip the dashboard rebuild on this host
node bin/total-recall.mjs update --install-autopull --port 3900  # a host with something else on 3000
node bin/total-recall.mjs update --install-autopull --dry-run    # show the plan
```

macOS gets LaunchAgent `com.totalrecall.autopull` (every 300 s); Linux gets a
crontab line that replaces any earlier auto-pull line. The timer runs the
checkout's own `scripts/auto-pull.sh` (it re-execs from a temp copy, so a pull
can rewrite it safely) — the updater updates itself. npm installs in registered
projects are a separate path: the daemon's package auto-update.

A checkout someone is developing in is never touched: the script updates only
`main` with no uncommitted tracked changes and nothing unpushed, and logs why
it skipped otherwise.

The script stops this checkout's brain processes (matched by working directory
or absolute path; on macOS it `launchctl kickstart -k`s every LaunchAgent that
runs the checkout, after killing the spawned daemon so no orphan keeps old
code), waits for the port, runs `npm ci` when the lockfile changed, rebuilds the
dashboard when `frontend/` changed,
starts the server, and **only logs success once `/health` reports the
checked-out version**. When the code is current but the running server is
not (a previous restart failed), it reinstalls and restarts instead of exiting.
Until 3.30.1 the kill patterns never matched (`node src/server/index.mjs` vs
the real `/usr/bin/node /root/total-recall/src/server/index.mjs`), so the
droplet served 3.28.1 for days while the log said "hot-reloaded".

A host that already serves something on 3000 installs with `--port`.

**Always verify it actually ran** — silence is not success, and a pulled
checkout is not a running server:

```bash
tail -5 /root/.agent/logs/auto-pull.log   # no such file = it has never run
crontab -l | grep -i auto-pull || echo "no auto-pull cron — the host is not pulling"
curl -s 127.0.0.1:${TR_PORT:-3000}/health | grep -o '"version":"[^"]*"'   # must match package.json
```

