## Parallel work within authorized scope

While background work runs, progress on independent items already authorized by the active tracker. Do not initiate pushes, deployments, credential audits, new projects or unrelated maintenance merely to remain busy. Respect dependency ordering, shared-file ownership, host limits and the user's current scope. Log delegated work and join every owned process.

The following queue is a menu for explicitly scoped work, not automatic authorization:

> [!IMPORTANT]
> Choose an independent authorized task while background work runs; waiting is appropriate when no safe independent work remains.

**Tier 1 — Immediate value**
1. Review the active branch state; push/sync only when authorized under the repo's release rules
2. Update `HANDOFF.md` with current session state, if the repo uses one
3. Check and update project trackers with completed work
4. Commit any uncommitted local changes (only when asked to commit)

**Tier 2 — Code quality & maintenance**
5. Run the repo's own type-check / lint entrypoints (never raw `tsc`/`eslint` if the repo has wrapper scripts — check its `code-quality` skill)
6. Update skill documentation if any skill is out of date
7. Verify trackers match actual repo state
8. Scan recently modified files for stray `TODO`/`FIXME`/`HACK`

**Tier 3 — Documentation & planning**
9. Draft/update dev plans for backlog projects
10. Triage known blockers from the active tracker
11. Update the repo's `repo-expert`-style skill if architecture changed
12. Draft GitHub issues for discovered bugs

**Tier 4 — Hardening**
13. Audit for expired/rotated keys, hardcoded secrets
14. Check for critical dependency vulnerabilities
15. Verify feature flags are gating unreleased features correctly

**Tier 5 — Performance & UX debt**
16. Flag oversized files/functions for refactor
17. Audit accessibility (missing `aria-label`, keyboard nav) on recently touched UI
18. Check test coverage on recently modified files

**Rules:** never repeat the same queue item without new evidence; append actions to the tracker ledger; do not expand scope when authorized independent work is exhausted.

