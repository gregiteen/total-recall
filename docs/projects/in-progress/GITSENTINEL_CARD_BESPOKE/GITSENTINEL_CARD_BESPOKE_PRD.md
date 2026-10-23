# GITSENTINEL_CARD_BESPOKE — Product Requirements

> **Project Prefix**: `GITSENTINEL_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: GITSENTINEL_CARD_BESPOKE_AUDIT.md (Complete)

---

## 1. Who uses this card, and what it is for

An operator or agent who has committed to a rule: **nothing is left unpushed, and no worktree is left dirty.** This card is how they check that they have kept it.

So it is not a statistics dashboard. It answers one question with a deadline attached — *is this repository safe to walk away from?* — and every element is ordered by the consequence of ignoring it.

## 2. What must be true the moment the card appears

- **Whether any commit is unpushed**, as a count. This is the only figure in the plugin that can lose work, and it stands alone at the top.
- **Whether the repository is mid-conflict**, because that is not a normal state at all.
- The four dirty categories separately: staged, unstaged, untracked, conflicted — each needs a different action.
- The branch and how it relates to its upstream, including when the upstream is **gone** or **errored**.
- A verdict the operator can act on: clean, or the specific violations.

## 3. Requirements

### GSR-1 — Read the real payload, and only the real payload (P0)
Use the actual field names the command returns: `branch`, `headState`, `isClean`, `upstream`, `upstreamStatus`, `unpushedCommits`, `behindCommits`, `stagedFiles`, `unstagedFiles`, `untrackedFiles`, `conflictedFiles`, `totalDirty`, `stashCount`, `lastCommit`, `errors`, `timestamp`. No invented paths. **Audit GS-01.**

### GSR-2 — No reassuring defaults, ever (P0)
Delete `'Up to date'`, `'Synced'`, `'Repository Active'`, `'Inspecting...'`, `'Checking Sync'` and the seeded `branch: 'main'`. An unknown value renders `—` with the reason. A repository with unpushed commits must never read as "Up to date". **Audit GS-02, GS-05.**

### GSR-3 — Unpushed commits lead (P0)
`unpushedCommits` is the primary figure: largest, first, and coloured by consequence — zero is normal, anything above zero is a violation of the standing rule. When `upstreamStatus` makes the count unknowable (`none`, `gone`, `detached`, `unborn`, `error`), the card says which state applies rather than showing a zero or a dash with no explanation. **Audit GS-03.**

### GSR-4 — The four dirty categories are separate counts (P0)
Staged, unstaged, untracked and conflicted each get their own figure, because the response differs: stage and commit, review and commit, decide whether to track, or resolve. A single "Dirty (n)" string is not acceptable. **Audit GS-03.**

### GSR-5 — Conflicts are called out as a distinct condition (P0)
A non-zero `conflictedFiles` outranks everything except unpushed commits and changes the card's verdict to a conflict state, because the repository is mid-operation. **Audit GS-03.**

### GSR-6 — Every upstream state is named (P1)
`tracking`, `none`, `gone`, `detached`, `unborn`, `unknown` and `error` are distinguishable, and the actionable ones (`gone`, `error`) are visually distinct from the merely factual ones (`none`, `detached`). **Audit GS-04.**

### GSR-7 — `errors[]` is surfaced (P1)
The command reports its own failures in `errors[]`. When it is non-empty the card says so, with the entries, rather than presenting the remaining figures as trustworthy. **Audit GS-05.**

### GSR-8 — A verdict, not just numbers (P1)
One line states the outcome against the standing rule: *safe to leave* when clean, pushed and unstashed; otherwise the specific violations in priority order. Derived only from returned values — never from a default.

### GSR-9 — Show what is uncommitted (P1)
A changes view driven by `diff` renders the real diffstat, so an operator who learns the tree is dirty can see what changed. Raw output available beneath it. **Audit GS-08.**

### GSR-10 — Stashes and last commit are context, and labelled as such (P2)
`stashCount` above zero is a prompt to look; `lastCommit` already carries hash, subject and relative age and is shown as returned.

### GSR-11 — Wide, with screens this plugin defines (P0)
A wide surface, never a narrow column. This plugin has two read commands and one job, so the screens follow its own work:

| Screen | Purpose |
| --- | --- |
| **Hygiene** | The verdict and the five consequence-ordered figures. The one-second check. |
| **Changes** | The real diffstat of unstaged work, with raw output. |
| **Upstream** | Branch, HEAD state, upstream state, ahead/behind, last commit, errors. |
| **Provenance** | The exact `audit --json` payload behind every figure. |

### GSR-12 — DESIGN.md with real tokens (P1)
Write `ui/DESIGN.md` with a `tokens:` block matching the manifest (`#b45309`, accent `#f59e0b`, `space-grotesk`), wire `ui.design_tokens`, and use the host's injected tokens for surfaces so the face works in light and dark. **Audit GS-07.**

### GSR-13 — Declare the face, drop the template (P0)
Remove `card_layout` from `plugin.json`. The existing single `card` element becomes the mounted face.

### GSR-14 — Correct the stale README (P2)
The README describes two bugs that are fixed and verified. Rewrite that section to state the current, tested behaviour: column-preserving porcelain parsing, and explicit unknown/no-upstream/error states. **Audit GS-06.**

### GSR-15 — Accessibility preserved (P2)
44 px targets, keyboard reachable, visible focus, `prefers-reduced-motion` respected. Severity carries a word as well as a colour.

## 4. Non-goals

- No git write operations of any kind. Every command is `read`; this card inspects, it never stages, commits, pushes or stashes.
- No repository history, blame or log browsing. Not returned.
- No multi-repository fleet view. This plugin reports the repository it runs in.
- No polling without the operator asking.

## 5. Success condition

An operator can tell at a glance whether this repository is safe to leave — whether any commit is unpushed, whether a conflict is open, and exactly which category of dirty file exists — with no invented value anywhere, and with `gone` or `error` upstream states never mistaken for a clean bill of health.
