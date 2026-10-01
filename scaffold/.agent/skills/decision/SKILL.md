---
name: decision
description: Design and use typed decisions for routing, classification, ranking and verification; configure Jev through the existing decision capability.
repo_scoped: false
---

# Decision

Use one decision capability for closed choices, yes/no probabilities and ordered scores. Jev is a configurable engine; use a generative model when the task needs prose. Typed output still needs validation and domain evaluation.

Discover the current repository's decision plugin, configuration, credential resolver and local overlay. Confirm installed commands before invoking them. Resolve model, endpoint, timeout, budget and gates from config or flags; keep credentials in the existing secret store. Public skills contain portable methods, not repository or account instances.

Validate typed answers before branching. Choice/Score confidence differs from Noul's probability of yes; never default missing certainty to success. Calibrate outcome gates using representative cases. Missing config, invalid output, timeout or provider failure takes the deterministic fallback. Required instructions, scope and permissions stay enforced in code; model advice cannot override them.

Read only the reference needed now:

- [Integration and typed response contract](references/integration.md)
- [Skill routing and use cases](references/use-cases.md)

Keep shared state small; batch independent questions and compute arithmetic in code. Test synthetic success, abstention and failure cases before integration. Live provider evidence is separate from mocks. Record model/version, decision and measured outcome without secrets or unnecessary state. Preserve existing human approval requirements.
