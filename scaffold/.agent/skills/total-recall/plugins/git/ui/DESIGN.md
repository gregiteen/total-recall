# DESIGN.md — Git Hygiene

```yaml
tokens:
  brand-name: "Git Hygiene"
  wordmark: "REPO HYGIENE"
  color-primary: "#b45309"
  color-accent: "#f59e0b"
  color-ok: "#047857"
  color-warn: "#b45309"
  color-danger: "#b91c1c"
  badge: "Repository Hygiene"
  font-body: "Space Grotesk, system-ui, sans-serif"
  font-mono: "'JetBrains Mono', ui-monospace, monospace"
  border-radius: "6px"
  density: "compact"
  motion: "140ms ease-out"
```

## Who this card is for

An operator or agent who has committed to a rule: **nothing is left unpushed, and no worktree is left dirty.** This card is how they check that they kept it.

So it is not a statistics dashboard. It answers one question with a deadline attached — *is this repository safe to walk away from?* — and its elements are ordered by the consequence of ignoring them.

## The three tasks

1. **Check whether it is safe to leave** — the common one, answered in about a second.
2. **Find out what is uncommitted** — and what changed.
3. **Confirm a cleanup worked.**

## What must be visible without a click

- Whether any commit is **unpushed**, as a count. It is the only figure that can lose work on another machine, so it stands alone at the top.
- Whether the repository is **mid-conflict**, because that is not a normal state at all.
- The four dirty categories **separately**: staged, unstaged, untracked, conflicted — each needs a different action.
- The branch and its upstream relationship, including when the upstream is **gone** or **errored**.
- **A verdict** the operator can act on.

## Why the layout is this layout

A **wide surface**, never a narrow column, with figures ordered by consequence rather than by category.

- **A verdict line, because the operator came for a decision.** "Safe to leave", or the specific violations. Numbers alone leave them to do the reasoning the card exists to do.
- **Unpushed first and largest.** The standing rule is that commits are never left behind.
- **Conflicts beside it, outranking everything when non-zero.** A repository mid-merge is not in a normal state; `staged`/`unstaged` counts mean little until it is resolved.
- **Dirty as one figure with the four-way split shown** — one number for "how dirty", four for "what to do about it".
- **Each worktree row carries its action** ("stage and commit", "resolve before anything else"), because that is why the four categories exist.
- **Stashes fourth.** Parked work is easy to forget and cheap to check.
- **Unknown is an em dash with a reason.** `gone`, `none`, `detached`, `unborn`, `error` are named; only `tracking` yields a real ahead/behind count.

## Screens

| Screen | Contents | Why it exists for this plugin |
| --- | --- | --- |
| **Hygiene** | Verdict, unpushed, conflicts, dirty split, stashes, last commit. | The one-second check before leaving. |
| **Changes** | The real diffstat of unstaged work. | Knowing the tree is dirty is useless without knowing what changed. |
| **Upstream** | Branch, HEAD state, upstream name and state, ahead/behind, last commit, errors. | Facts (`none`, `detached`) and problems (`gone`, `error`) belong together, off the glance screen. |
| **Provenance** | The exact `audit --json` payload. | Every figure is traceable to one command. |

## Brand and colour

A first-party hygiene plugin, so it uses a plain descriptive name and its own mark: `#b45309` primary, `#f59e0b` accent, Space Grotesk for prose and JetBrains Mono for counts. The previous invented "Blame Game" / `[BLAME//GAME]` wordmark is removed, and the token values now match the manifest.

Colour comes from two places:

1. **Host tokens** injected into the frame — `--text-primary`, `--text-secondary`, `--bg-primary`, `--bg-secondary`, `--border`, `--accent` — so the face works in light and dark.
2. **A single `:host` token block** declaring consequence colours.

Consequence drives colour, and colour is never the only channel:

| Figure | Colour | Why |
| --- | --- | --- |
| Unpushed commits above zero | danger | violates the standing rule, can lose work |
| Conflicts above zero | danger | repository is mid-operation |
| Stashes above zero | warn | parked work, easily forgotten |
| Dirty counts | neutral | expected during work |
| Clean and pushed | ok | the goal state |

Counts are tabular monospace so digits do not shift between reads.

## Motion

Functional only, at `140ms ease-out`: a value transition when a reading changes. No ambient animation, no pulsing, no spinner as decoration. Removed — not slowed — under `prefers-reduced-motion: reduce`.

## States

`loading` (first read in flight, figures show an em dash), `ok`, `partial` (`errors[]` non-empty; figures render with a warning naming the failed checks), `error` (call rejected or payload unparseable — every figure clears and the error is shown with its attempt time).

There is no state in which the card asserts a clean repository it has not verified.

## What this face must never do

- Never seed a branch name, a count, or a status word.
- Never render "Up to date", "Synced" or "Repository Active" as a stand-in for an unknown value.
- Never read a field the command does not return.
- Never present a repository with unpushed commits as safe to leave.
- Never collapse `gone` or `error` upstream states into a reassuring word.
- Never perform a git write operation. Every command is `read`.
- Never render as a narrow column when width is available.
