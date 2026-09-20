---
name: push
description: "Use this skill when preparing, testing, version-bumping, and publishing a new release of the Total Recall package to npm and GitHub. Do NOT use for regular local feature commits."
version: 3.14.1
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
git fetch origin main && git pull origin main      # REPO_DIR=/root/total-recall
```

Install it on a host — it is idempotent and safe to re-run:

```bash
install -m 755 scripts/auto-pull.sh /root/auto-pull.sh
crontab -l | grep -q auto-pull || (crontab -l; echo "*/5 * * * * /root/auto-pull.sh") | crontab -
```

**Always verify it actually ran** — silence is not success:

```bash
tail -5 /root/.agent/logs/auto-pull.log   # no such file = it has never run
crontab -l | grep -i auto-pull || echo "no auto-pull cron — the host is not pulling"
```

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
Before any version is bumped or pushed, you must verify the code's integrity. We provide an interactive release verification script for this:
```bash
node .agent/skills/push/scripts/release.mjs
```
This script automatically executes:
1. The local Vitest suite (`npm test`)
2. The code-quality lint checks (the `/code-quality` skill)
3. The TypeScript compiler check (the `/code-quality` skill)

Ensure all checks pass cleanly before proceeding!

### Step 2: Document Release Changelog
Update [docs/developer/CHANGELOG.md](file:///Users/greg/Github/total-recall/docs/developer/CHANGELOG.md) to log all notable enhancements, bug fixes, or behavioral changes introduced in this release under a new version heading.

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
1. Loads your unencrypted `npm_token` from the workspace-local `.agent/secrets.enc` (falling back to your global `~/.agent/skills/total-recall/config/secrets.enc` if not present in the workspace).
2. Backs up your active `~/.npmrc` profile.
3. Automatically configures and authenticates your active terminal session with the loaded token.
4. Executes `git push origin main --tags` to push version tags/commits to the remote repository.
5. Executes `npm publish` to publish the package directly and locally to the npm registry.
6. Automatically restores your original `~/.npmrc` profile upon completion.

> [!NOTE]
> All GitHub Actions workflows for NPM publication have been completely removed from the repository. Publishing is executed strictly, securely, and locally from your terminal using the publish script.

---

## References
- For npm package composition rules and dry-run guidelines, see [references/npm-publishing.md](file:///Users/greg/Github/total-recall/.agent/skills/push/references/npm-publishing.md).
