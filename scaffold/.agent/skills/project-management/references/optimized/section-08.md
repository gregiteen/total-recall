### Per-project document set

Every **new project or feature** gets its own dedicated set of **5 fresh documents** in its own sub-folder, created in the order below. Never append to another project's documents — if you're starting new work, create new documents; if you're continuing existing work, find and use that project's existing documents.

**Folder structure mandate:**

```
docs/projects/<kanban-state>/<PROJECT_PREFIX>/
```

| # | Document | Path (example, in-progress) | Naming Pattern | Written |
|---|----------|------------------------------|-----------------|---------|
| 1 | **AUDIT** | `docs/projects/in-progress/<PROJECT_PREFIX>/<PROJECT_PREFIX>_AUDIT.md` | `<PROJECT_PREFIX>_AUDIT` | **First. Must be `Complete` before 2–5 exist** |
| 2 | **PRD** | `.../<PROJECT_PREFIX>_PRD.md` | `<PROJECT_PREFIX>_PRD` | From the audit |
| 3 | **Architecture** | `.../<PROJECT_PREFIX>_ARCHITECTURE.md` | `<PROJECT_PREFIX>_ARCHITECTURE` | From the audit |
| 4 | **Dev Plan** | `.../<PROJECT_PREFIX>_DEVELOPMENT_PLAN.md` | `<PROJECT_PREFIX>_DEVELOPMENT_PLAN` | From PRD + architecture |
| 5 | **Tracker** | `.../<PROJECT_PREFIX>_PROJECT_TRACKER.md` | `<PROJECT_PREFIX>_PROJECT_TRACKER` | Last; every P0/P1 audit finding becomes a tracker item |

Agents MUST move the entire project **folder** (not just loose files) between Kanban directories as status changes.

Some repos also keep root-level **master/umbrella documents** (e.g. `<PRODUCT>_PRD.md` directly under `docs/projects/`) as a high-level reference for overall product vision — distinct from, and not a substitute for, per-project docs. Whether a repo uses this pattern is a repo-specific decision (see the overlay skill).

