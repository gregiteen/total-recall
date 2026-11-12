---
type: ui-chunk:chunk
title: Commit identity audit
description: Check whether a commit identity is configured and count machine addresses recorded in local history.
timestamp: "2026-11-08T09:20:00Z"
plugin: git-sentinel
id: commit-identity
intents: [check git author identity, verify commit email, audit machine addresses, git author history]
surfaces: [page]
operations: [identity]
data: ["identity:/ok", "identity:/machineCommits"]
---

<style>
  .sentinel-identity { padding:var(--spacing-md); border-inline-start:3px solid var(--color-accent); background:var(--color-surface); }
  .sentinel-identity h2 { margin-top:0; }
  .sentinel-identity p { color:var(--color-muted); }
</style>
<section class="sentinel-identity">
  <h2>Check the configured author</h2>
  <p>The identity audit checks Git’s current author configuration and counts commits with a machine-derived address. Review the count separately from the current configuration.</p>
</section>
