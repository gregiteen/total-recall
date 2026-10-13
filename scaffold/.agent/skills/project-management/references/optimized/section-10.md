### Naming the project prefix

`PROJECT_PREFIX` MUST be:

- **ALL CAPS WITH UNDERSCORES** (screaming snake case)
- **Descriptive of the specific project/feature** — not a generic label
- **Unique** — never reuse another project's prefix

> **NEVER use generic filenames** like `PRD.md`, `ARCHITECTURE.md`, `DEV_PLAN.md`, or `PROJECT_TRACKER.md`. Always prefix with the project name, e.g. `STRIPE_BILLING_INTEGRATION_PRD.md`. This is a protocol violation, not a style preference — it prevents namespace collisions across projects and repos.

> **ABSOLUTE INVARIANT: NO EPHEMERAL PLANNING ARTIFACTS.** Never create an `implementation_plan.md`, `task.md`, or `walkthrough.md` scratch file. All planning is redirected to these canonical project documents.

