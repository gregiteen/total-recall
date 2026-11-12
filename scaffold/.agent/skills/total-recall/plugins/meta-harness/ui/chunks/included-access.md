---
type: ui-chunk:chunk
plugin: meta-harness
id: included-access
title: Inspect included access
description: Review the saved usage policy and the separate approval paths for provider bindings.
timestamp: "2026-11-08T09:34:00Z"
intents: [check included usage policy, inspect harness billing bindings, verify approved connector access]
surfaces: [page, right]
operations: [included-status, included-enforce, included-bind-claude, included-bind-claude-plan, openrouter-bind]
data: ["included-status:/enabled", "included-status:/policyVersion"]
---

<section>
  <h2>Inspect included access</h2>
  <p>Read <code>included-status</code> to check the saved policy. The policy distinguishes included subscription access from approved provider bindings.</p>
  <p>Use the owning CLI for an explicit enforcement or binding change. Validate billing evidence and use the Auth store for credential references.</p>
</section>
