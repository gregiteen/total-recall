---
name: Git Copper Ledger
description: A copper and paper ledger for repository state and linked worktrees.
colors:
  background: "#fcf7ef"
  surface: "#f5e9d9"
  text: "#32241b"
  border: "#b29176"
  accent: "#85411c"
  muted: "#684b38"
  danger: "#9c2924"
typography:
  body:
    fontFamily: "system-ui, sans-serif"
  heading:
    fontFamily: "Georgia, serif"
  mono:
    fontFamily: "ui-monospace, monospace"
spacing:
  md: 16px
rounded:
  md: 6px
---

# Git Copper Ledger

Use a warm paper background, a serif title, and tabular monospace counts. The repository audit reads first. Present conflicts and unpushed commits beside separate staged, unstaged, and untracked counts. Reserve copper for navigation and focus, and use red with a written label for failures.

Below the audit, list the registered worktrees like ledger entries. Give each entry its own branch or commit, path, and state. Wrap long paths and stack the form and metrics at narrow widths. Use an inset confirmation with the exact target for worktree changes.

Treat a missing measurement as unknown. Label ahead and behind as local upstream comparisons. Announce read and action results in text, preserve a visible keyboard focus outline, and keep controls at least 44 pixels tall.
