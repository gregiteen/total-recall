---
name: total-recall
description: Portable SSSS memory and task instructions.
---

# Total Recall

Before acting, run `total-recall context "task description" --action <actions>`.
Read the complete capsule and require `ready:true`. Overflow exits 2; raise the
explicit budget or curate applicability before continuing. Refresh when the
task, action, project, memory or skills change.

- `remember <category> "content" --project|--global` validates and saves memory.
- `recall "query" --local` retrieves local memory without a provider.
- `edit <slug>` and `forget <slug>` update the selected memory vault.
- `compile` rebuilds derived indexes and instruction surfaces.
- `plugin list|info|install|remove` manages explicitly selected capabilities.

Canonical memory is SSSS Markdown; use the CLI for vault reads and writes.
Indexes are disposable. Keep separate brains separate. Credentials belong in
the encrypted store, never in memory or generated instructions.
