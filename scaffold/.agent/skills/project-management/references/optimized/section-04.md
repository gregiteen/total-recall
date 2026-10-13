## Step 0 — Read this shared method and discover optional local differences

Before doing anything else, check whether the current repo has its own overlay skill at:

```
.agent/skills/<repo-slug>-project-management/SKILL.md
```

Repository-specific overlays may extend this generic method. Discover and read
the overlay in the current repository; do not infer another project's tracker.

- **If it exists**: read it. It defines the product/domain-specific layer — definition of done, severity/blocker test, architecture reminders, GitHub repo name and branch strategy, deployment and testing specifics, and any overrides to the prioritization order below. This global skill still governs the file mechanics (folder layout, naming, tracker syntax); the overlay never needs to redefine those.
- **If it does not exist**: use this shared method with verified repository facts. Do not force-create or recommend an overlay merely because one is absent. Create one only for a requested, useful local difference.

