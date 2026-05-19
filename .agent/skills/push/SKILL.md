---
name: push
aliases: [backup, sync, fork, github]
description: Git push, GitHub fork backup, multi-machine vault sync, and upstream update workflow for Total Recall
---

# Push / Backup Skill

## When to use this skill
Read this before any `git push`, `sync --push`, or question about backing up the vault, syncing between machines, or updating the upstream repo.

---

## The Two-Remote Model

Total Recall uses a **fork-as-backup** pattern. Every user has:

| Remote | URL | Purpose |
|--------|-----|---------|
| `origin` | `github.com/USERNAME/total-recall` | Personal fork — vault backup, private config |
| `upstream` | `github.com/gregiteen/total-recall` | Product repo — new features, bug fixes |

```bash
# Verify remotes are set up correctly
git remote -v

# Add upstream if missing
git remote add upstream https://github.com/gregiteen/total-recall.git
```

---

## Backing Up the Vault (sync --push)

The `.agent/memory-vault/` and related directories are in `.gitignore` on the upstream repo so personal memories never leak into the public codebase. In the user's fork these files are tracked via `git add -f` (force-add bypasses gitignore).

**CLI command:**
```bash
npx total-recall sync --push
```

**What it does internally:**
```bash
git add -f .agent/memory-vault/
git add -f .agent/config/brain.json    # brain URL + token reference (no secrets)
git add -f .agent/INSTRUCTIONS.md      # compiled memory surface
# NOTE: .agent/config/secrets.enc is NEVER committed — contains raw API keys
git commit -m "vault: backup $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push origin main
```

**NEVER force-add:**
- `.agent/config/secrets.enc` — contains raw API keys
- `.env` — contains provider tokens
- Any file matching `*.key`, `*.pem`, `*.token`

**Frequency:** Run after any meaningful vault change (new memory node, compile, dream cycle). The daemon can do this automatically if `github_token` is set in `secrets.enc`.

---

## Getting New Features from Upstream

```bash
git fetch upstream
git merge upstream/main
# Resolve any conflicts (unlikely — vault files not in upstream)
git push origin main
```

This is safe: upstream never tracks vault files, so merges rarely conflict.

---

## Pushing Code Changes to Upstream

When you've made improvements to Total Recall itself (new features, bug fixes):

```bash
# Option A: push directly (if you have write access)
git push upstream main

# Option B: PR from your fork (standard open-source workflow)
gh pr create --base main --head USERNAME:main --title "feat: ..." --body "..."
```

**Rule:** Code changes go to upstream. Vault/config changes go to origin (fork) only.

---

## Multi-Machine Sync

On a new machine:
```bash
# Clone your fork (not upstream)
git clone https://github.com/USERNAME/total-recall.git
cd total-recall
npm install

# Initialize local vault from cloned vault
npx total-recall init
npx total-recall compile

# Connect to your existing brain
npx total-recall connect claude-code --brain <brain-url> --token <pat>
```

Your vault, INSTRUCTIONS.md, and brain config all come with the clone. No manual migration needed.

---

## What Gets Committed Where

| Path | origin (fork) | upstream |
|------|--------------|----------|
| `src/`, `bin/`, `templates/` | ✅ code changes | ✅ code changes |
| `.agent/memory-vault/` | ✅ force-added | ❌ gitignored |
| `.agent/INSTRUCTIONS.md` | ✅ force-added | ❌ gitignored |
| `.agent/config/brain.json` | ✅ force-added | ❌ gitignored |
| `.agent/config/secrets.enc` | ❌ NEVER | ❌ NEVER |
| `.env` | ❌ NEVER | ❌ NEVER |
| `.agent/skills/` | ✅ tracked normally | ✅ tracked normally |

---

## Setup Wizard Integration

`npx total-recall setup` handles fork creation automatically:
1. Asks for a GitHub PAT (repo scope)
2. Calls `POST /repos/gregiteen/total-recall/forks` via GitHub API
3. Stores `github_token` in `secrets.enc` for future `sync --push`
4. Sets `origin` to the fork URL, adds `upstream`

To set up manually without the wizard:
```bash
# Fork on GitHub (web UI or gh CLI)
gh repo fork gregiteen/total-recall --clone=false

# Update your remotes
git remote rename origin upstream
git remote add origin https://github.com/USERNAME/total-recall.git
git push -u origin main
```

---

## Troubleshooting

**`sync --push` fails with "nothing to commit"**
The vault hasn't changed since the last push. Safe to ignore.

**Merge conflict after `git fetch upstream`**
Rare, but can happen if upstream changed a file you also modified locally (e.g., a skill file). Resolve normally — `git mergetool` or edit manually. Your vault files will never conflict since upstream doesn't track them.

**`secrets.enc` accidentally staged**
```bash
git reset HEAD .agent/config/secrets.enc
echo ".agent/config/secrets.enc" >> .git/info/exclude
```

**Fork is behind upstream by many commits**
```bash
git fetch upstream
git rebase upstream/main
git push origin main --force-with-lease
```


<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-19T08:31:47.800Z -->

- **sync-fabric-architecture** (confidence 0.9, importance 5):
  Sync Fabric: bi-directional knowledge distribution to workspaces, Google Drive, S3, git repos, webhooks

<!-- END INJECTED MEMORY -->
