# GITSENTINEL_CARD_BESPOKE — Architecture

> **Project Prefix**: `GITSENTINEL_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: GITSENTINEL_CARD_BESPOKE_AUDIT.md (Complete)

---

## 1. Shape

A wide surface. The operator's question has a deadline attached, so the answer is a verdict line followed by figures ordered by consequence.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ GIT HYGIENE   main → origin/main · tracking          [Re-read]   ● clean      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   UNPUSHED              CONFLICTS            DIRTY              STASHES      │
│   ┌──────────────┐      ┌──────────────┐     ┌──────────────┐   ┌─────────┐  │
│   │      0       │      │      0       │     │      2       │   │    0    │  │
│   │ pushed       │      │ none open    │     │ 0 0 2 0      │   │ parked  │  │
│   └──────────────┘      └──────────────┘     └──────────────┘   └─────────┘  │
│                                                                              │
│   SAFE TO LEAVE — everything is pushed and no conflict is open.              │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ WORKING TREE                                     LAST COMMIT                 │
│   staged       0   stage and commit              058cd05 · 22 hours ago      │
│   unstaged     2   review and commit             chore: synchronize ...      │
│   untracked    0   decide whether to track                                   │
│   conflicted   0   resolve before anything else                              │
└──────────────────────────────────────────────────────────────────────────────┘
Hygiene | Changes | Upstream | Provenance
```

## 2. Why this arrangement

- **A verdict line, because the operator came for a decision.** "Safe to leave" or the specific violations, derived only from returned values. Numbers alone leave the operator to do the reasoning the card was built to do.
- **Unpushed commits are first and largest.** They are the only figure here that can lose work on another machine, and the standing rule is that they are never left behind.
- **Conflicts sit beside them and outrank everything else when non-zero,** because a repository mid-merge is not in a normal state; `staged`/`unstaged` counts mean little until it is resolved.
- **Dirty is one figure showing the four-way split** (`2 = staged 0 / unstaged 2 / untracked 0 / conflicted 0`), with the full breakdown beneath. One number for "how dirty" and four for "what to do about it".
- **Stashes are fourth.** Parked work is easy to forget and cheap to check.
- **The worktree breakdown labels the action for each row** — "stage and commit", "resolve before anything else" — because the four categories exist precisely to tell the operator what to do next.
- **Unknown renders as an em dash with its reason.** `gone`, `none`, `detached`, `unborn`, `error` are named; only `tracking` yields a real ahead/behind count.

## 3. Screens

| Screen | Contents | Why it exists for this plugin |
| --- | --- | --- |
| **Hygiene** | Verdict, unpushed, conflicts, dirty split, stashes, last commit. | The one-second check before leaving. |
| **Changes** | The real `diff` diffstat of unstaged work, with raw output beneath. | Knowing the tree is dirty is useless without knowing what changed. |
| **Upstream** | Branch, HEAD state, upstream name and state, ahead/behind, last commit, and `errors[]` when non-empty. | The states that are facts rather than failures (`none`, `detached`) and the ones that need action (`gone`, `error`) belong together, away from the glance. |
| **Provenance** | The exact `audit --json` payload. | Every figure on the other screens is traceable to one command's output. |

## 4. Data flow

```
connectedCallback()
  ├─ render()        frames with em dashes; no branch, no counts, no verdict
  └─ read()          host.run('audit', ['--json']) → paint

[Re-read]            read() again
[Changes screen]     host.run('diff', ['--json']) → diffstat
```

- **`audit` is the only source of the counts.** Nothing is derived that the payload does not contain.
- **A parse failure or a rejected call clears every figure** and shows the error with the attempt time. It never leaves a previous reading in place as though current.
- **`errors[]` non-empty** renders a warning and marks the affected figures as unreliable rather than silently showing them.

## 5. State model

| State | Meaning | Rendering |
| --- | --- | --- |
| `loading` | first read in flight | figures show an em dash, verdict says "reading" |
| `ok` | payload parsed, `errors[]` empty | full render, verdict computed |
| `partial` | payload parsed, `errors[]` non-empty | figures render, warning names the failed checks |
| `error` | call rejected or payload unparseable | all figures em dash, error with attempt time, no verdict claim |

There is no state in which the card asserts a clean repository it has not verified.

## 6. Verdict rules

Computed only from returned values, in priority order:

1. `upstreamStatus === 'error'` or `errors[]` non-empty → **cannot verify**.
2. `conflictedFiles > 0` → **conflict open** (resolve first).
3. `unpushedCommits > 0` → **n unpushed** (violation of the rule).
4. `upstreamStatus === 'gone'` → **upstream gone** (needs re-pointing).
5. `totalDirty > 0` → **dirty worktree**.
6. `stashCount > 0` → **n stashed**, noted.
7. otherwise → **safe to leave**.

When `upstreamStatus` is `none`, `detached` or `unborn`, the unpushed count is unknowable; the verdict says so instead of implying the repository is pushed.

## 7. Styling

- Host tokens for surfaces and text; brand `#b45309` / accent `#f59e0b` / `space-grotesk` from the manifest.
- A single `:host` token block declares the consequence colours. **Unpushed and conflicts use the danger colour; staged/unstaged/untracked use neutral; stashes use warn.** Colour is always paired with a word.
- The four worktree rows are monospaced with tabular figures so counts align.
- Wide layout: a four-figure top row and a two-column lower section, collapsing to one column below 760 px.
- Motion limited to a value transition, removed under `prefers-reduced-motion`.

## 8. Manifest change

Remove `card_layout`. Keep the single existing element; add `design_tokens`:

```json
"ui": { "design_tokens": "ui/DESIGN.md",
  "elements": [ { "id": "card", "kind": "card", "tag": "tr-git-sentinel-card", "module": "ui/card.js" } ] }
```
