---
name: push
description: "Use this skill when preparing, testing, version-bumping, and publishing a new release of the Total Recall package to npm and GitHub. Do NOT use for regular local feature commits."
version: 3.14.2
repo_scoped: true
---

# Push Skill — Package Release Automation

## Deploy model — read before pushing

> [!CAUTION]
> **Total Recall has no push-triggered deploy. The host pulls `main`.** No
> watcher reacts to a branch push for this repo, so pushing `production` deploys
> **nothing** here.

| action | effect |
|:---|:---|
| `git push origin main` | ships the source; a host that runs `auto-pull.sh` picks it up on its own schedule |
| `npm publish` (via `publish.mjs`) | ships the package to the registry |
| `git push origin production` | **no deploy** — nothing consumes that branch for this repo |

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

### Host prerequisites (Linux)

The vector index uses the `sqlite-vss` extension, which links BLAS/LAPACK. Without
them the brain still runs, but it logs `sqlite-vss unavailable; using JSON-only
store` and silently falls back to a slower path:

```bash
apt-get install -y libblas3 liblapack3        # Ubuntu/Debian
ldd node_modules/sqlite-vss-linux-x64/lib/vss0.so | grep 'not found'   # must be empty
```

A host also needs `TR_SECRETS_PASSWORD` in its environment to decrypt its own
secrets store — without it the embedding provider key is unreachable, no vectors
are built, and recall degrades to keyword-only while still reporting itself up.
`auto-pull.sh` sources `/root/.agent/tr.env` (0600, host-local) when present.


### What is NOT this repo's deploy path

`/root/auto-deploy.sh` on the droplet (invoked by `/root/deploy-watcher.sh` every
minute) belongs to **UltraChat**: it deploys `/root/ultrachat` with Docker Compose
and PM2, and it never mentions total-recall. Never reason about this repo's
releases from that watcher. The same applies to the `production` branch — here it
is only a leftover mirror of `main`.

**If nothing consumes a branch, pushing it is not a release.**


This skill coordinates the release lifecycle of the `total-recall` package to ensure zero-regression, fully tested, and correctly versioned releases on npm and GitHub.

---

## 🎯 Release Workflow Checklist

### Step 1: Pre-Release Quality Safeguards
Run the full `check.mjs --tier remote` gate on the Mac Mini through the Total
Recall mesh CLI. This includes the Vitest suite. Never run the full suite or
quality gates on the laptop, Chromebook, or droplet; a single spec may run on
any mesh node. Use the `code-quality` and `test` skills for the exact commands
and preserve the gate's exit code. This repo has no ESLint or TypeScript gate.

Before tagging, boot the server natively on the Mac Mini with an isolated home
and verify `/health` reports the release version. Then run `npm run check:dist`
and `npm publish --dry-run` on the publishing host.

### Step 2: Document Release Changelog
Update `docs/developer/CHANGELOG.md` to log notable enhancements, bug fixes,
and behavioral changes under the new version heading.

### Step 3: Package Version Bumping
Determine the release scope and run the version command:
```bash
# Bug fixes only (e.g. 3.0.0 -> 3.0.1)
npm version patch

# Backward-compatible feature addition (e.g. 3.0.0 -> 3.1.0)
npm version minor

# Breaking changes (e.g. 3.0.0 -> 4.0.0)
npm version major
```

### Step 4: Publish to git remote & NPM
Execute the automated local publish script to securely handle the NPM token swap, push release commits and tags to your git remote repository, and publish to the public npm registry locally with zero user-friction:
```bash
node .agent/skills/push/scripts/publish.mjs
```
This script automatically:
1. Loads `npm_token` from the encrypted secrets store — the workspace `.agent`, then the global brain — which needs the master password (see the security skill for how it is resolved).
2. Backs up your active `~/.npmrc` profile.
3. Automatically configures and authenticates your active terminal session with the loaded token.
4. Executes `git push origin main --tags` to push version tags/commits to the remote repository.
5. Executes `npm publish` to publish the package directly and locally to the npm registry.
6. Automatically restores your original `~/.npmrc` profile upon completion.

> [!NOTE]
> All GitHub Actions workflows for NPM publication have been completely removed from the repository. Publishing is executed strictly, securely, and locally from your terminal using the publish script.

---

### Where each step runs

`publish.mjs` needs three things on ONE machine: GitHub push access, the
`npm_token` in a secrets store it can unlock, and a fresh `frontend/dist`.
It runs `git push origin main --tags`, so it also pushes every local tag, and
it aborts the publish if that push fails. When no machine has all three:

1. Run the gates and the full suite on the Mac Mini (never a laptop or the droplet).
2. Bump, tag and `git push origin main v<version>` from the machine that has
   GitHub access.
3. On the machine logged in to npm (`npm whoami`), fast-forward to the tag,
   build `frontend/dist` there or copy the test host's verified build,
   then `npm run check:dist`, `npm publish --dry-run`, `npm publish`.
4. Confirm on the registry, not from npm's output — it can lag minutes:
   `curl -s https://registry.npmjs.org/total-recall-brain | jq '."dist-tags"'`.

Update `HANDOFF.md` and the affected project trackers in the same release.

## References
- For npm package composition rules and dry-run guidelines, see [references/npm-publishing.md](./references/npm-publishing.md).
