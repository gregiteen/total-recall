# GITSENTINEL_CARD_BESPOKE — Audit

> **Project Prefix**: `GITSENTINEL_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Audit Status**: Complete
> **Audited commit**: `HEAD` (tr-plugin-git-sentinel)
> **Umbrella audit**: PLUGIN_CARDS_BESPOKE_AUDIT.md (Complete, `333dd30a`)

---

## 1. What this plugin is

`tr-plugin-git-sentinel` reports the hygiene of the git repository it runs in. Two commands, both `read`:

| Command | Returns |
| --- | --- |
| `audit` | branch, HEAD state, upstream sync, staged/unstaged/untracked/conflicted counts, stashes, last commit, errors |
| `diff` | a diffstat of unstaged changes (text, or `diffStat` under `--json`) |

Real `audit --json` output, captured on this checkout:

```json
{ "branch": "main", "headState": "branch", "isClean": false,
  "upstream": "origin/main", "upstreamStatus": "tracking",
  "unpushedCommits": 0, "behindCommits": 0,
  "stagedFiles": 0, "unstagedFiles": 2, "untrackedFiles": 0, "conflictedFiles": 0,
  "totalDirty": 2, "stashCount": 0,
  "lastCommit": "058cd05 — chore: synchronize ... (22 hours ago)",
  "errors": [], "timestamp": "..." }
```

Declared template: **`dashboard`**. Branding `#b45309` / accent `#f59e0b`, font `space-grotesk`, badge "Repository Hygiene". One card element. **No `DESIGN.md` exists.**

## 2. Findings

### GS-01 — The card reads fields the command does not return (P0, critical)

The card reads:

```js
const unstaged = data.worktree?.unstaged ?? 0;
const staged = data.worktree?.staged ?? 0;
const isClean = data.worktree?.clean ?? (data.clean ?? false);
const upstream = data.upstream?.status || (data.synced ? 'Synced' : 'Up to date');
```

The command returns **none** of `worktree`, `clean`, `synced`, or `upstream.status`. Every one of those paths is `undefined`, so every value falls through to its default. The card has never displayed a real reading.

### GS-02 — The defaults are a false all-clear (P0, critical)

Because of GS-01, the fallbacks are what actually render:

- `upstream: 'Up to date'` / `'Synced'`
- `worktree: 'Repository Active'` (a phrase that means nothing) when the payload is unreadable
- `branch: 'main'` seeded in the constructor, and again on the failure path

A repository with **nine unpushed commits** renders as "Up to date". This is the same class of defect the README warns about for the CLI — a missing comparison becoming a reassuring zero — but present in the card, where the CLI has already been fixed.

### GS-03 — The card hides the field the plugin exists for (P0, critical)

`unpushedCommits` is the reason this plugin exists, and the standing directive is *"Always push everything… never leave unpushed commits."* The card never reads it and never shows it. There is no unstaged/untracked/conflicted breakdown either — one "Dirty (n files)" string replaces four distinct counts that need four different responses.

### GS-04 — Upstream states collapse into one reassuring word (P1, high)

The command distinguishes `tracking`, `none`, `gone`, `detached`, `unborn`, `unknown` and `error`. The card renders all of them as "Up to date". `gone` (the remote branch was deleted) and `error` are both actionable and both invisible.

### GS-05 — Unparseable output is reported as a healthy repository (P1, high)

When `audit` returns something the card cannot parse, it sets `worktree: 'Repository Active'` and `upstream: 'Up to date'`. A plugin whose entire purpose is to detect repository problems reports success when it fails to read the repository.

### GS-06 — The README documents bugs that are already fixed (P2, medium)

The README opens with a September 30 review claiming two unfixed reporting bugs (porcelain column corruption; missing upstream becoming zero unpushed). **Both are fixed in the current source**, and verified under hostile input:

- a file named `" leading-space.txt"` parses correctly as `A   leading-space.txt`
- with no upstream configured, the command returns `upstreamStatus: "none"` and `unpushedCommits: null` — explicitly unknown, not a false zero

The stale warning misrepresents the plugin as broken and points at a correction tracker that no longer applies.

### GS-07 — No DESIGN.md, and the card ignores the brand tokens (P1, high)

The manifest declares a colour, accent and the `space-grotesk` font, but there is no `DESIGN.md` to follow and no consistent token use in the card.

### GS-08 — `diff` is available and unused as evidence (P2, medium)

The `diff` command returns a real diffstat. The card offers no way to see what is actually uncommitted, so an operator who learns the tree is dirty cannot find out what changed.

### GS-09 — Template `dashboard`, shared with ten other plugins (P0, root cause)

`git-sentinel` shared `dashboard > status > live > list > actions > activity` with `decision`, `maps`, `translator`, `okf`, `openwiki`, `tr-transcribe`, `user-automations` and others. Repository hygiene and translation pipelines presented identically.

## 3. What is correct and must be kept

- **The CLI is genuinely good now.** `audit --json` is well-shaped, porcelain parsing preserves leading columns, and upstream states are explicitly enumerated including `unknown` and `error`. The card should trust and consume it.
- **Both commands are `read`**, so nothing here can mutate a repository.
- **`errors: []`** gives the card a real, checkable failure channel it currently ignores.
- **`lastCommit` already carries the hash, subject and relative age** in one string, ready to display.

## 4. What the domain actually requires

This plugin answers one question with a deadline attached: **is this repository safe to walk away from?** The standing rule is that nothing is left unpushed and no worktree is left dirty. So the operator is not browsing statistics; they are checking a rule they have committed to.

That means the ordering is fixed by consequence, not by taste:

1. **Unpushed commits** — the direct violation of the rule, and the only thing that can lose work on another machine.
2. **Conflicts** — a repository mid-merge is not in a normal state at all.
3. **Dirty worktree** — split into staged, unstaged, untracked and conflicted, because each needs a different action.
4. **Stashes** — work parked and forgotten.
5. **Upstream state** — `gone` and `error` need action; `none` and `detached` are facts, not failures.

The three tasks: **check whether it is safe to leave** (the common one), **find out what is uncommitted**, and **confirm a cleanup worked**.

## 5. Root cause

The card was written against an imagined payload (`worktree`, `synced`, `upstream.status`) rather than the real one, and then given reassuring defaults so it would always render something. Under a template that demanded three status tiles, inventing the field names was easier than reading the command — and the defaults made the invention invisible. GS-01 through GS-05 are all one mistake: the face was designed before its data was known.

## 6. Remediation scope

Read the real payload. Delete every seeded value and every reassuring default; render `—` when a value is unknown and name which upstream state applies. Lead with unpushed commits, then conflicts, then the four-way worktree breakdown, then stashes, then upstream. Surface `errors[]` when it is non-empty. Add a changes view driven by `diff` so a dirty tree can be inspected. Write `DESIGN.md` with real tokens. Remove `card_layout`, and correct the stale README warning so it no longer describes fixed bugs as live.
