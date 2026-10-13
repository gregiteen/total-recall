## Creating a repo-specific overlay skill

Only create an overlay when requested or when an explicitly authorized local difference needs a durable instruction. Use the `skill` format and include **only verified local differences** from this shared method:

- What "done"/"stable"/"ready" concretely means for this product, and the readiness walkthrough steps.
- The severity/blocker test in this repo's own terms.
- Architecture reminders a reviewer needs (stack, key modules, invariants).
- The repo's actual GitHub repo name and branch strategy if it differs from trunk-based default.
- Any prioritization or deployment/testing overrides.

Point to this global skill for everything else — don't re-paste the Kanban folder table, naming rules, or tracker convention into the overlay; that duplication is exactly how the previous version of this system drifted out of alignment across repos.

